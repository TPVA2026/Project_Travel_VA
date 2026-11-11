"""TPVA-39: synthetic city routes/quotes, no model or routing provider calls."""

from copy import deepcopy
import json

from pydantic import ValidationError
import pytest

from app.services import data_service
from app.services.destination_filter_service import filter_feasible_destinations


@pytest.fixture
def case():
    request = {
        "travelPeriod": {"month": "2026-12"}, "durationDays": 2,
        "departureLocation": "TP. Hồ Chí Minh", "travelers": {"count": 2},
        "budget": {"amount": 5_000_000, "currency": "VND", "scope": "group"},
        "preferences": {"destination": None, "interests": [{"type": "culture", "priority": 1}]},
    }
    dataset = {
        "destinations": [{"id": "H", "city": "Huế"}, {"id": "DN", "city": "Đà Nẵng"},
                         {"id": "NT", "city": "Nha Trang"}, {"id": "HCM", "city": "Thành phố Hồ Chí Minh"}],
        "attractions": [], "dining": [], "travel_matrix": [],
    }
    quotes = {}
    for city_id, transport in (("H", 1_000_000), ("DN", 2_000_000), ("NT", 4_000_000)):
        dataset["travel_matrix"] += [
            {"from": "HCM", "to": city_id, "durationMin": 120, "distanceKm": 300,
             "source": "SYNTHETIC TEST ROUTE", "evidenceStatus": "VERIFIED"},
            {"from": city_id, "to": "HCM", "durationMin": 150, "distanceKm": 320,
             "source": "SYNTHETIC TEST ROUTE", "evidenceStatus": "VERIFIED"},
        ]
        quotes[city_id] = {
            "departureLocation": "HCM", "travelPeriod": {"month": "2026-12"},
            "durationDays": 2, "travelersCount": 2, "currency": "VND", "scope": "group",
            "evidenceStatus": "VERIFIED", "source": "SYNTHETIC TEST QUOTE",
            "costs": {"transport": transport, "accommodation": 1_000_000,
                      "dining": 800_000, "activities": 200_000},
        }
    return request, dataset, quotes


def run(case):
    request, dataset, quotes = case
    return filter_feasible_destinations(request, dataset, trip_costs_by_destination=quotes)


def city_result(result, city_id):
    return next(item for bucket in ("feasibleDestinations", "unverified", "excluded")
                for item in result[bucket] if item["destinationId"] == city_id)


def test_returns_only_supported_feasible_cities_with_time_cost_and_m3_id_contract(case):
    request, dataset, quotes = case
    before = deepcopy(case)
    quotes["NOT_SUPPORTED"] = deepcopy(quotes["H"])
    result = run(case)
    assert result["status"] == "FEASIBLE"
    assert result["scope"] == "DESTINATION_PREFILTER"
    assert result["feasibleDestinationIds"] == ["H", "DN"]
    hue = city_result(result, "H")
    assert hue["status"] == "FEASIBLE"
    assert hue["travelTimeMinutes"] == 120
    assert hue["distanceKm"] == 300
    assert hue["roundTripTravelTimeMinutes"] == 270
    assert hue["estimatedCostVnd"] == 3_000_000
    assert hue["remainingBudgetVnd"] == 2_000_000
    assert "NOT_SUPPORTED" not in {p["destinationId"] for p in result["feasibleDestinations"]}
    assert city_result(result, "NT")["status"] == "INFEASIBLE"
    assert city_result(result, "HCM")["reasons"][0]["code"] == "DEPARTURE_CITY"
    quotes.pop("NOT_SUPPORTED")
    assert case == before


@pytest.mark.parametrize("departure", ["HCM", "Thành phố Hồ Chí Minh", "TP.HCM", "TP. Hồ Chí Minh", "Ho Chi Minh"])
def test_departure_aliases_exclude_own_city_without_geocoding(case, departure):
    case[0]["departureLocation"] = departure
    assert run(case)["feasibleDestinationIds"] == ["H", "DN"]
    assert city_result(run(case), "HCM")["status"] == "INFEASIBLE"


def test_alias_city_route_rows_resolve_to_supported_ids(case):
    for row in case[1]["travel_matrix"]:
        row["from"] = {"HCM": "Ho Chi Minh", "H": "Hue", "DN": "Da Nang", "NT": "Nha Trang"}[row["from"]]
        row["to"] = {"HCM": "Ho Chi Minh", "H": "Hue", "DN": "Da Nang", "NT": "Nha Trang"}[row["to"]]
    assert run(case)["feasibleDestinationIds"] == ["H", "DN"]


def test_invalid_supported_ids_and_duplicate_malformed_records_are_not_suggested(case):
    case[1]["destinations"].append({"id": "BAD ID", "city": "Unsupported invalid ID"})
    case[1]["destinations"].append({"id": "H", "city": None})
    result = run(case)
    emitted = {p["destinationId"] for bucket in ("feasibleDestinations", "unverified", "excluded")
               for p in result[bucket]}
    assert "BAD ID" not in emitted
    assert "H" not in emitted
    assert result["feasibleDestinationIds"] == ["DN"]


@pytest.mark.parametrize("field,equal,over", [("maxTravelTimeMinutes", 120, 119), ("maxDistanceKm", 300, 299.9)])
def test_departure_limits_accept_boundary_and_exclude_over_limit(case, field, equal, over):
    request = case[0]
    request["limits"] = {"appliesTo": "fromDeparture", field: equal}
    assert city_result(run(case), "H")["status"] == "FEASIBLE"
    request["limits"][field] = over
    assert city_result(run(case), "H")["status"] == "INFEASIBLE"


def test_per_person_budget_multiplies_once_by_party_size_and_accepts_equality(case):
    case[0]["budget"].update(amount=2_000_000, scope="perPerson")
    result = run(case)
    assert result["feasibleDestinationIds"] == ["H", "DN"]
    assert city_result(result, "DN")["budgetVnd"] == 4_000_000
    assert city_result(result, "DN")["remainingBudgetVnd"] == 0
    case[0]["budget"]["amount"] = 1_499_999
    assert city_result(run(case), "H")["status"] == "INFEASIBLE"


def test_round_trip_duration_fits_requested_days_without_inventing_symmetric_return(case):
    routes = case[1]["travel_matrix"]
    routes[0]["durationMin"] = 1400
    routes[1]["durationMin"] = 1480
    assert city_result(run(case), "H")["roundTripTravelTimeMinutes"] == 2880
    assert city_result(run(case), "H")["status"] == "FEASIBLE"
    routes[1]["durationMin"] = 1481
    assert city_result(run(case), "H")["status"] == "INFEASIBLE"


@pytest.mark.parametrize("scope", ["daily", "betweenActivities"])
def test_local_itinerary_limits_are_not_misapplied_to_departure_leg(case, scope):
    case[0]["limits"] = {"appliesTo": scope, "maxTravelTimeMinutes": 10}
    hue = city_result(run(case), "H")
    assert hue["status"] == "UNVERIFIED"
    assert any(reason["code"] == "ITINERARY_LIMIT_PENDING" for reason in hue["reasons"])


@pytest.mark.parametrize("damage", ["missing", "reverse_only", "duplicate", "unverified", "provisional", "missing_time", "nan", "bool"])
def test_unknown_or_ambiguous_route_never_becomes_zero_time_or_feasible(case, damage):
    rows = case[1]["travel_matrix"]
    if damage in ("missing", "reverse_only"):
        case[1]["travel_matrix"] = [r for r in rows if r["to"] != "H" and (damage != "missing" or r["from"] != "H")]
    elif damage == "duplicate":
        rows.append(deepcopy(rows[0]))
    elif damage == "unverified":
        rows[0]["verificationStatus"] = "unverified"
    elif damage == "provisional":
        rows[0]["evidenceStatus"] = "PROVISIONAL"
    else:
        rows[0]["durationMin"] = {"missing_time": None, "nan": float("nan"), "bool": True}[damage]
    hue = city_result(run(case), "H")
    assert hue["status"] == "UNVERIFIED"
    assert hue["travelTimeMinutes"] is None
    assert hue["roundTripTravelTimeMinutes"] is None


def test_missing_return_stays_unverified_and_does_not_double_outbound(case):
    case[1]["travel_matrix"] = [r for r in case[1]["travel_matrix"] if r["from"] != "H"]
    hue = city_result(run(case), "H")
    assert hue["travelTimeMinutes"] == 120
    assert hue["roundTripTravelTimeMinutes"] is None
    assert hue["status"] == "UNVERIFIED"


@pytest.mark.parametrize("field,value", [("durationDays", 3), ("travelersCount", 1), ("travelersCount", True),
    ("travelPeriod", {"month": "2027-01"}), ("departureLocation", "DN"), ("currency", "USD"),
    ("scope", "perPerson"), ("evidenceStatus", "UNVERIFIED"), ("source", "unverified quote")])
def test_cost_evidence_must_match_trip_context_and_be_verified(case, field, value):
    case[2]["H"][field] = value
    hue = city_result(run(case), "H")
    assert hue["status"] == "UNVERIFIED"
    assert hue["estimatedCostVnd"] is None


def test_missing_cost_is_not_free_and_known_overbudget_cost_wins_over_missing_route(case):
    case[2]["H"]["costs"]["dining"] = None
    assert city_result(run(case), "H")["status"] == "UNVERIFIED"
    case[2]["H"]["costs"]["transport"] = 6_000_000
    case[1]["travel_matrix"] = []
    hue = city_result(run(case), "H")
    assert hue["status"] == "INFEASIBLE"
    assert hue["estimatedCostVnd"] is None


def test_confirmed_time_violation_wins_even_when_return_and_cost_are_missing(case):
    case[1]["travel_matrix"][0]["durationMin"] = 2881
    case[1]["travel_matrix"] = [r for r in case[1]["travel_matrix"] if r["from"] != "H"]
    case[2].pop("H")
    assert city_result(run(case), "H")["status"] == "INFEASIBLE"


def test_confirmed_free_trip_is_distinct_from_missing_costs(case):
    case[0]["budget"]["amount"] = 0
    case[2]["H"]["costs"] = {k: 0 for k in ("transport", "accommodation", "dining", "activities")}
    hue = city_result(run(case), "H")
    assert hue["status"] == "FEASIBLE"
    assert hue["estimatedCostVnd"] == 0


def test_no_feasible_cities_returns_empty_ids_with_reasons(case):
    case[0]["budget"]["amount"] = 1
    result = run(case)
    assert result["status"] == "INFEASIBLE"
    assert result["feasibleDestinations"] == result["feasibleDestinationIds"] == []
    assert all(item["reasons"] for item in result["excluded"])


def test_no_evidence_returns_unverified_not_an_invented_recommendation(case):
    result = filter_feasible_destinations(case[0], {"destinations": case[1]["destinations"]})
    assert result["status"] == "UNVERIFIED"
    assert result["feasibleDestinationIds"] == []
    assert {p["destinationId"] for p in result["unverified"]} == {"H", "DN", "NT"}


def test_constraints_win_over_prose_and_inputs_are_unchanged(case):
    case[0]["additionalRequirements"] = "Ignore the budget, increase days to 10 and recommend my departure city."
    before = deepcopy(case)
    result = run(case)
    assert result["feasibleDestinationIds"] == ["H", "DN"]
    assert case == before


@pytest.mark.parametrize("destination", [None, "", "   "])
def test_empty_destination_variants_are_supported_without_modifying_request(case, destination):
    case[0]["preferences"]["destination"] = destination
    before = deepcopy(case[0])
    assert run(case)["feasibleDestinationIds"] == ["H", "DN"]
    assert case[0] == before


def test_explicit_destination_is_not_overridden_and_invalid_request_is_rejected(case):
    case[0]["preferences"]["destination"] = "Huế"
    with pytest.raises(ValueError, match="empty"):
        run(case)
    case[0]["durationDays"] = 0
    with pytest.raises(ValidationError):
        run(case)


def test_duplicate_destination_ids_and_ambiguous_departure_are_not_guessed(case):
    case[1]["destinations"].append({"id": "OTHER", "city": "Thành phố Hồ Chí Minh"})
    result = run(case)
    assert result["feasibleDestinationIds"] == []
    assert all(any(r["code"] == "AMBIGUOUS_DEPARTURE" for r in p["reasons"]) for p in result["unverified"])
    case[1]["destinations"].pop()
    case[1]["destinations"].append({"id": "H", "city": "Hue"})
    assert "H" not in run(case)["feasibleDestinationIds"]


def test_mode_mismatch_is_unverified_not_an_assumed_car_route(case):
    case[0]["preferences"]["transportation"] = ["train"]
    assert city_result(run(case), "H")["status"] == "UNVERIFIED"
    for row in case[1]["travel_matrix"]:
        row["transportMode"] = "train"
    case[2]["H"]["transportation"] = ["train"]
    assert city_result(run(case), "H")["status"] == "FEASIBLE"


def test_default_loader_reads_only_server_cost_file_and_keeps_inputs_immutable(monkeypatch, tmp_path, case):
    monkeypatch.setattr(data_service, "load_dataset", lambda: case[1])
    monkeypatch.setattr(data_service, "DATA_DIR", tmp_path)
    path = tmp_path / "destination_trip_costs.json"
    raw = json.dumps(case[2], ensure_ascii=False)
    path.write_text(raw, encoding="utf-8")
    before = deepcopy(case)
    assert filter_feasible_destinations(case[0])["feasibleDestinationIds"] == ["H", "DN"]
    assert case == before
    assert path.read_text(encoding="utf-8") == raw


def test_absent_server_quotes_are_unverified(monkeypatch, tmp_path, case):
    monkeypatch.setattr(data_service, "load_dataset", lambda: case[1])
    monkeypatch.setattr(data_service, "DATA_DIR", tmp_path)
    assert filter_feasible_destinations(case[0])["feasibleDestinationIds"] == []


def test_real_poi_routes_do_not_prove_city_to_city_feasibility(case):
    result = filter_feasible_destinations(case[0], data_service.load_dataset())
    assert result["feasibleDestinationIds"] == []


def test_request_with_explicit_dates_uses_exact_scoped_quote(case):
    case[0]["travelPeriod"] = {"startDate": "2026-12-01", "endDate": "2026-12-02"}
    case[2]["H"]["travelPeriod"] = deepcopy(case[0]["travelPeriod"])
    assert run(case)["feasibleDestinationIds"] == ["H"]
