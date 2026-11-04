from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.algorithms.cost_validator import (
    evaluate_candidate_costs,
    validate_cost_budget as check,
)


def costs(**kwargs):
    return {"costs": {"transport": 100, "accommodation": 200,
                      "dining": 50, "activities": 50, **kwargs}}


def test_under_budget():
    result = check({"budget": 500}, costs())
    assert result["status"] == "FEASIBLE"
    assert result["total_cost"] == 400
    assert result["remaining_budget"] == 100


def test_exact_budget():
    assert check({"budget": 400}, costs())["status"] == "FEASIBLE"


def test_over_budget():
    assert check({"budget": 399}, costs())["status"] == "INFEASIBLE"


def test_missing_essential_cost():
    result = check({"budget": 500}, costs(dining=None))
    assert result["status"] == "UNVERIFIED"
    assert result["total_cost"] is None
    assert "dining" in result["missing_costs"]


def test_known_costs_exceed_budget_even_when_other_cost_missing():
    assert check({"budget": 100}, costs(dining=None))["status"] == "INFEASIBLE"


def test_missing_budget():
    assert check({}, costs())["status"] == "UNVERIFIED"


@pytest.mark.parametrize("budget", [-1, "abc", True, float("inf")])
def test_invalid_budget(budget):
    assert check({"budget": budget}, costs())["status"] == "UNVERIFIED"


def test_zero_is_valid_cost():
    assert check({"budget": 0}, {"costs": {k: 0 for k in
           ("transport", "accommodation", "dining", "activities")}})["status"] == "FEASIBLE"


def test_missing_category_is_not_zero():
    assert check({"budget": 1000}, {"costs": {"transport": 100}})["status"] == "UNVERIFIED"


def test_itemized_costs_and_missing_item():
    result = check({"budget": 1000}, costs(transport=[
        {"name": "bus", "amount": 100}, {"name": "taxi", "amount": None}]))
    assert result["status"] == "UNVERIFIED"
    assert result["known_total"] == 400
    assert "taxi" in result["missing_costs"]


def test_itemized_costs_complete():
    result = check({"budget": 500}, costs(transport=[
        {"name": "bus", "amount": 60}, {"name": "taxi", "amount": 40}]))
    assert result["status"] == "FEASIBLE"


def test_invalid_negative_cost_never_accepted():
    assert check({"budget": 1000}, costs(transport=-10))["status"] == "UNVERIFIED"


@pytest.mark.parametrize("amount", [True, -1, "abc", float("nan"), float("inf"), {}, [1]])
def test_invalid_cost_is_unknown(amount):
    assert check({"budget": 500}, costs(transport=amount))["status"] == "UNVERIFIED"


def test_numeric_strings_and_empty_item_list():
    result = check({"budget": "300"}, costs(transport=[], accommodation="200"))
    assert result["status"] == "FEASIBLE"
    assert result["total_cost"] == 300


def test_malformed_item_is_reported():
    result = check({"budget": 500}, costs(transport=[100]))
    assert result["status"] == "UNVERIFIED"
    assert "transport[0]" in result["missing_costs"]


def test_sum_overflow_does_not_return_infinity():
    result = check({"budget": 1e308}, costs(transport=1e308, accommodation=1e308))
    assert result["status"] == "UNVERIFIED"
    assert result["total_cost"] is None


@pytest.fixture
def candidate_inputs():
    """Tạo TravelRequest/CandidatePlan đúng schema, không cần gọi AI."""
    request = {
        "travelPeriod": {"startDate": "2026-11-12"},
        "durationDays": 1, "departureLocation": "Hue",
        "travelers": {"count": 2},
        "budget": {"amount": 500, "currency": "VND", "scope": "group"},
    }
    plan = {
        "planId": "p1", "title": "Trip", "destinationId": "HUE",
        "missingData": [], "assumptions": [],
        "days": [{"dayNumber": 1, "date": "2026-11-12", "travelLegs": [],
                  "activities": [
                      {"activityId": "a1", "placeId": "s1", "type": "sightseeing",
                       "startTime": "08:00", "endTime": "09:00", "estimatedCostVnd": 100,
                       "costStatus": "KNOWN", "reason": "Visit"},
                      {"activityId": "a2", "placeId": "r1", "type": "dining",
                       "startTime": "12:00", "endTime": "13:00", "estimatedCostVnd": 50,
                       "costStatus": "KNOWN", "reason": "Lunch"},
                  ]}],
    }
    dataset = {
        "attractions": [{"id": "s1", "priceVnd": 100, "priceScope": "perPerson"}],
        "dining": [{"id": "r1", "avgPricePerPersonVnd": 50}],
    }
    supplemental = {"transport": 100, "accommodation": 0}
    return request, plan, dataset, supplemental


def test_shared_contract_and_input_not_mutated(candidate_inputs):
    before = deepcopy(candidate_inputs)
    result = evaluate_candidate_costs(*candidate_inputs)
    assert result["status"] == "FEASIBLE"
    assert result["total_cost"] == 400  # 100 transport + 2 * (100 + 50).
    assert result["remaining_budget"] == 100
    assert candidate_inputs == before


def test_per_person_budget(candidate_inputs):
    request, plan, dataset, supplemental = candidate_inputs
    request["budget"].update(amount=200, scope="perPerson")
    result = evaluate_candidate_costs(request, plan, dataset, supplemental)
    assert result["budget"] == 400
    assert result["status"] == "FEASIBLE"


def test_group_price_not_multiplied(candidate_inputs):
    request, plan, dataset, supplemental = candidate_inputs
    dataset["attractions"][0]["priceScope"] = "group"
    assert evaluate_candidate_costs(*candidate_inputs)["total_cost"] == 300


@pytest.mark.parametrize("change", ["price", "scope", "source", "id", "type", "text"])
def test_dataset_uncertainty_never_verified(candidate_inputs, change):
    request, plan, dataset, supplemental = candidate_inputs
    place = dataset["attractions"][0]
    if change == "price":
        place["priceVnd"] = 99  # AI đưa giá khác dataset.
    elif change == "scope":
        del place["priceScope"]  # Chưa biết giá tính theo người hay nhóm.
    elif change == "source":
        place["source"] = "UNVERIFIED reference"
    elif change == "id":
        place["id"] = "unknown"
    elif change == "type":
        dataset["attractions"] = []
        dataset["dining"].append(place)
    else:
        place["priceVnd"] = "100k - 200k"
    result = evaluate_candidate_costs(*candidate_inputs)
    assert result["status"] == "UNVERIFIED"
    assert "a1" in result["missing_costs"]


@pytest.mark.parametrize("status", ["UNVERIFIED", "NO_DATA"])
def test_unknown_candidate_price(candidate_inputs, status):
    request, plan, dataset, supplemental = candidate_inputs
    activity = plan["days"][0]["activities"][0]
    activity["costStatus"] = status
    if status == "NO_DATA":
        activity["estimatedCostVnd"] = None
    assert evaluate_candidate_costs(*candidate_inputs)["status"] == "UNVERIFIED"


def test_transport_and_accommodation_not_invented(candidate_inputs):
    request, plan, dataset, _ = candidate_inputs
    result = evaluate_candidate_costs(request, plan, dataset)
    assert result["status"] == "UNVERIFIED"
    assert set(result["missing_costs"]) == {"transport", "accommodation"}
    assert result["known_total"] == 300


def test_supplement_cannot_override_activity_costs(candidate_inputs):
    request, plan, dataset, supplemental = candidate_inputs
    supplemental.update(dining=0, activities=0)
    assert evaluate_candidate_costs(*candidate_inputs)["total_cost"] == 400


def test_known_excess_with_unknown_activity(candidate_inputs):
    request, plan, dataset, supplemental = candidate_inputs
    supplemental["transport"] = 501
    dataset["attractions"] = []
    result = evaluate_candidate_costs(*candidate_inputs)
    assert result["status"] == "INFEASIBLE"
    assert result["total_cost"] is None


def test_empty_activity_category_not_assumed_free(candidate_inputs):
    request, plan, dataset, supplemental = candidate_inputs
    plan["days"][0]["activities"].pop()
    assert "dining" in evaluate_candidate_costs(*candidate_inputs)["missing_costs"]


@pytest.mark.parametrize("bad_field", ["currency", "travelers", "duplicate_id"])
def test_invalid_shared_contract_rejected(candidate_inputs, bad_field):
    request, plan, dataset, supplemental = candidate_inputs
    if bad_field == "currency":
        request["budget"]["currency"] = "USD"
    elif bad_field == "travelers":
        request["travelers"]["count"] = 0
    else:
        plan["days"][0]["activities"][1]["activityId"] = "a1"
    with pytest.raises(ValidationError):
        evaluate_candidate_costs(*candidate_inputs)
