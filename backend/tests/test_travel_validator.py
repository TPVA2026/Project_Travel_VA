"""Kiểm tra chặng có hướng, số đo từ dataset và ba phạm vi giới hạn."""

from copy import deepcopy

import pytest

from app.algorithms.travel_validator import validate_travel


def test_valid_travel_preserves_inputs(m4_case):
    before = deepcopy(m4_case)
    result = validate_travel(*m4_case[:3])
    assert result["status"] == "FEASIBLE"
    assert result["dailyTotals"][0]["durationMin"] == 20
    assert result["dailyTotals"][0]["distanceKm"] == 5
    assert m4_case == before


@pytest.mark.parametrize("case, expected", [
    ("missing_leg", "UNVERIFIED"), ("reverse", "INFEASIBLE"),
    ("duplicate", "INFEASIBLE"), ("duration", "INFEASIBLE"),
    ("distance", "INFEASIBLE"), ("no_reference", "UNVERIFIED"),
    ("reverse_reference", "UNVERIFIED"), ("duplicate_reference", "UNVERIFIED"),
    ("nested_matrix", "UNVERIFIED"), ("unverified_source", "UNVERIFIED"),
    ("unknown_duration", "UNVERIFIED"), ("unknown_distance", "UNVERIFIED"),
])
def test_travel_data_cases(m4_case, case, expected):
    request, plan, dataset, _ = m4_case
    legs = plan["days"][0]["travelLegs"]
    reference = dataset["travel_matrix"][0]
    if case == "missing_leg":
        legs.clear()
    elif case == "reverse":
        legs[0].update(fromPlaceId="r1", toPlaceId="s1")
    elif case == "duplicate":
        legs.append(deepcopy(legs[0]))
    elif case in ("duration", "distance"):
        legs[0]["durationMin" if case == "duration" else "distanceKm"] = 0
    elif case == "no_reference":
        dataset["travel_matrix"] = []
    elif case == "reverse_reference":
        reference.update({"from": "r1", "to": "s1"})
    elif case == "duplicate_reference":
        dataset["travel_matrix"].append(deepcopy(reference))
    elif case == "nested_matrix":
        dataset["travel_matrix"] = {"destinations": {"Hue": {"travel_matrix": []}}}
    elif case == "unverified_source":
        reference["source"] = "UNVERIFIED"
    else:
        reference["durationMin" if case == "unknown_duration" else "distanceKm"] = None
    assert validate_travel(request, plan, dataset)["status"] == expected


@pytest.mark.parametrize("scope", ["betweenActivities", "daily", "fromDeparture"])
@pytest.mark.parametrize("field, boundary", [("maxDistanceKm", 5), ("maxTravelTimeMinutes", 20)])
@pytest.mark.parametrize("offset, expected", [(0, "FEASIBLE"), (-1, "INFEASIBLE")])
def test_limit_boundaries(m4_case, scope, field, boundary, offset, expected):
    request, plan, dataset, _ = m4_case
    request["limits"] = {"appliesTo": scope, field: boundary + offset}
    if scope == "fromDeparture":
        dataset["travel_matrix"].append({"from": "Hue", "to": "HUE", "durationMin": 20, "distanceKm": 5})
    assert validate_travel(request, plan, dataset)["status"] == expected


def test_missing_departure_not_replaced_by_city_center_distance(m4_case):
    request, plan, dataset, _ = m4_case
    request["limits"] = {"appliesTo": "fromDeparture", "maxDistanceKm": 100}
    result = validate_travel(request, plan, dataset)
    assert result["status"] == "UNVERIFIED"
    assert any(item["path"] == "departureLocation" for item in result["reasons"])


def test_daily_known_subtotal_exceeding_limit_beats_unknown_leg(m4_case):
    request, plan, dataset, _ = m4_case
    request["limits"] = {"appliesTo": "daily", "maxDistanceKm": 4}
    day = plan["days"][0]
    last = deepcopy(day["activities"][-1])
    last.update(activityId="a3", placeId="s2", startTime="12:00", endTime="13:00")
    day["activities"].append(last)
    day["travelLegs"].append({"fromPlaceId": "r1", "toPlaceId": "s2", "durationMin": None, "distanceKm": None})
    result = validate_travel(request, plan, dataset)
    assert result["status"] == "INFEASIBLE"
    assert result["dailyTotals"][0]["distanceKm"] is None
    assert result["dailyTotals"][0]["known_distanceKm"] == 5


def test_invalid_reference_value_does_not_crash_limit_check(m4_case):
    request, plan, dataset, _ = m4_case
    request["limits"] = {"appliesTo": "betweenActivities", "maxDistanceKm": 10}
    dataset["travel_matrix"][0]["distanceKm"] = "5 km"
    assert validate_travel(request, plan, dataset)["status"] == "UNVERIFIED"
