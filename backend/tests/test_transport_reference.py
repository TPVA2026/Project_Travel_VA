from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.algorithms.cost_validator import evaluate_candidate_costs
from app.schemas.transport_reference import TransportReference
from app.services.data_service import load_dataset
from app.services.hue_cost_projection import project_hue_costs


@pytest.mark.parametrize("modes,unit", [(["flight"], 949781), (["train"], 455000), ([], 400000)])
def test_fixed_adult_one_way_fare_is_projected_once_for_group(modes, unit):
    dataset = load_dataset("H")
    request = {"departureLocation": "Ha Noi", "travelers": {"count": 2}, "durationDays": 3,
               "preferences": {"transportation": modes}, "travelPeriod": {"month": "2027-07"}}
    plan = {"destinationId": "H", "days": []}
    cost = {"known_total": 100, "missing_costs": ["transport"], "breakdown": {"transport": None, "accommodation": 0}}
    before = deepcopy((request, plan, dataset, cost))
    projection = project_hue_costs(request, plan, dataset, cost)
    item = next(i for i in projection["items"] if i["category"] == "transport")
    assert item["amountVnd"] == unit * 2
    assert item["tripType"] == "oneWay"
    assert item["sourceUrl"] is None
    assert item["status"] == "ESTIMATED"
    assert item["excludedCosts"] == ["terminalTransfers"]
    assert projection["totalVnd"] == 100 + unit * 2
    assert (request, plan, dataset, cost) == before
    cost.update(missing_costs=[], breakdown={"transport": unit * 2, "accommodation": 0})
    assert project_hue_costs(request, plan, dataset, cost)["items"] == []


def test_unsupported_mode_has_no_fabricated_fare():
    dataset = load_dataset("H")
    request = {"departureLocation": "Ha Noi", "travelers": {"count": 2}, "durationDays": 1,
               "preferences": {"transportation": ["car"]}}
    projection = project_hue_costs(request, {"destinationId": "H", "days": []}, dataset,
                                   {"known_total": 0, "missing_costs": ["transport"], "breakdown": {"accommodation": 0}})
    assert projection["items"] == []
    assert projection["uncovered"] == ["transport"]


def test_reference_transport_is_not_a_verified_budget_total(m4_case):
    request, plan, _, _ = m4_case
    request["departureLocation"] = "Ha Noi"
    request["preferences"] = {"destination": "H", "transportation": ["flight"]}
    plan["destinationId"] = "H"
    result = evaluate_candidate_costs(request, plan, load_dataset("H"))
    assert result["breakdown"]["transport"] is None
    assert result["total_cost"] is None
    item = next(i for i in result["projection"]["items"] if i["category"] == "transport")
    assert item["amountVnd"] == 949781 * request["travelers"]["count"]


@pytest.mark.parametrize("field,value", [("price", -1), ("price", "400000"),
                                         ("currency", "USD"), ("tripType", "roundTrip"),
                                         ("priceStatus", "VERIFIED")])
def test_transport_schema_rejects_invalid_or_promoted_reference(field, value):
    row = deepcopy(load_dataset("H")["transport"][0])
    row[field] = value
    with pytest.raises(ValidationError):
        TransportReference.model_validate(row)
