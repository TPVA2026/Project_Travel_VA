from copy import deepcopy

from app.algorithms.cost_validator import evaluate_candidate_costs, trusted_supplemental_costs
from app.services.data_service import _exact_number


def test_range_and_serving_are_not_known_group_cost(m4_case):
    request, plan, dataset, supplements = m4_case
    place = dataset["dining"][0]
    place.pop("avgPricePerPersonVnd")
    place.update(priceScope="perServing", priceRangeVnd={"min": 30000, "max": 70000,
                 "scope": "perServing", "source": "Reviewed menu"})
    result = evaluate_candidate_costs(request, plan, dataset, supplements)
    assert result["status"] == "UNVERIFIED"
    assert result["breakdown"]["dining"] is None
    assert result["estimatedRanges"][0]["scope"] == "perServing"
    assert result["estimatedRanges"][0]["minVnd"] == 30000


def test_known_ticket_violation_wins_over_missing_accommodation(m4_case):
    request, plan, dataset, _ = m4_case
    request["budget"]["amount"] = 100
    result = evaluate_candidate_costs(request, plan, dataset)
    assert result["status"] == "INFEASIBLE"
    assert "accommodation" in result["missing_costs"]


def test_quote_bound_to_plan_revision_and_request(m4_case):
    request, plan, dataset, _ = m4_case
    dataset["supplementalCostQuotes"] = [{"request": deepcopy(request), "plan": deepcopy(plan),
        "costs": {"transport": {"amount": 100, "scope": "group", "currency": "VND",
                                "source": "Verified booking", "evidenceStatus": "VERIFIED"}}}]
    assert trusted_supplemental_costs(request, plan, dataset) == {"transport": 100}
    plan["title"] = "Revised"
    assert trusted_supplemental_costs(request, plan, dataset) == {}


def test_price_from_is_not_exact():
    assert _exact_number("Từ 35.000 VND", "vnd") is None
    assert _exact_number("Khoảng 35.000 VND", "vnd") is None
