# TPVA-23 — Python Cost & Budget Validator

Standalone module for M4. It checks **only the budget constraint**; whole-plan status needs aggregation with schedule/travel validators in TPVA-24.

## Quick start

```bash
python cost_validator.py
python -m pip install pytest
python -m pytest -q tests
```

## Integration

```python
from cost_validator import validate_cost_budget

result = validate_cost_budget(
    {"budget": 3_000_000},
    {"costs": {
        "transport": 500_000,
        "accommodation": 1_200_000,
        "dining": [{"name": "day 1", "amount": 200_000},
                   {"name": "day 2", "amount": 250_000}],
        "activities": 300_000,
    }},
)
print(result)
```

**Contract:** `budget` and all cost entries are **total trip VND**, not per-person. Required keys are `transport`, `accommodation`, `dining`, `activities`. Each cost accepts a nonnegative number, numeric string, or an array of items `{name, amount}`. `None` or an omitted category indicates unknown cost, **never zero**. To represent a confirmed free category use explicit `0`. For itemized categories, use an empty list only when confirmed to have no charges.

**Result:** `status` (`FEASIBLE`, `INFEASIBLE`, `UNVERIFIED`), `budget`, `known_total`, `total_cost` (null if missing), `remaining_budget` (null if missing), `breakdown`, `missing_costs`, `reasons`.

**Priority:** known subtotal > valid budget = `INFEASIBLE`; otherwise missing essential data = `UNVERIFIED`; otherwise all categories known and total <= budget = `FEASIBLE`.

Note: if group size is involved, callers must compute whole-group trip costs *before* calling the validator; this module does not silently multiply per-person costs. Invalid negative/nonfinite values are not accepted as known costs. `FEASIBLE` here means budget-only feasible, not an approved itinerary.

## Coordination

- M1 supplies validated total-trip budget.
- M2/M3 supply cost categories from verified sources; unknown => null.
- M4 uses this output as a budget-check result and combines it with TPVA-24, then performs TPVA-25 ranking on verified feasible itineraries.
- M6 integrates at `POST /itineraries/evaluate` once JSON schema is agreed.

Project-specific import paths and field names must be adapted to the actual repository structure; no repository directory tree was attached in this chat.
