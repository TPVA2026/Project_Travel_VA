"""Validate total-trip costs against a total-trip budget (TPVA-23)."""

from math import isfinite


REQUIRED_COSTS = ("transport", "accommodation", "dining", "activities")


def _amount(value):
    """Return a nonnegative finite amount, or None for unknown/invalid data."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        amount = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return amount if isfinite(amount) and amount >= 0 else None


def validate_cost_budget(request: dict, plan: dict) -> dict:
    """Check required cost groups without treating missing costs as zero.

    Inputs are total-trip VND. A known subtotal over budget is already
    infeasible, even if another cost is unknown. This checks budget only.
    """
    request = request if isinstance(request, dict) else {}
    plan = plan if isinstance(plan, dict) else {}
    budget = _amount(request.get("budget"))
    costs = plan.get("costs")
    costs = costs if isinstance(costs, dict) else {}

    known_total = 0.0
    breakdown = {}
    missing_costs = []

    for category in REQUIRED_COSTS:
        value = costs.get(category)
        if isinstance(value, list):
            category_total = 0.0
            complete = True
            for index, item in enumerate(value):
                if not isinstance(item, dict):
                    missing_costs.append(f"{category}[{index}]")
                    complete = False
                    continue
                amount = _amount(item.get("amount"))
                if amount is None:
                    name = item.get("name")
                    missing_costs.append(name if isinstance(name, str) and name else f"{category}[{index}]")
                    complete = False
                else:
                    category_total += amount
            breakdown[category] = category_total if complete else None
            known_total += category_total
        else:
            amount = _amount(value)
            breakdown[category] = amount
            if amount is None:
                missing_costs.append(category)
            else:
                known_total += amount

    if budget is not None and known_total > budget:
        status = "INFEASIBLE"
        reasons = ["Known costs exceed budget."]
    elif budget is None or missing_costs:
        status = "UNVERIFIED"
        reasons = []
        if budget is None:
            reasons.append("Budget is missing or invalid.")
        if missing_costs:
            reasons.append("Required costs are missing or invalid: " + ", ".join(missing_costs))
    else:
        status = "FEASIBLE"
        reasons = []

    total_cost = known_total if not missing_costs else None
    return {
        "status": status,
        "budget": budget,
        "known_total": known_total,
        "total_cost": total_cost,
        "remaining_budget": budget - total_cost if budget is not None and total_cost is not None else None,
        "breakdown": breakdown,
        "missing_costs": missing_costs,
        "reasons": reasons,
    }
