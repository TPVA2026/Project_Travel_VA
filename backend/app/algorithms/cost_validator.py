# TODO(M4): itemized known costs, missing costs
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from cost_validator import validate_cost_budget as check


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
