# TPVA-73: feasibility after activity edits

`backend/tests/test_activity_revision_feasibility.py` submits edited CandidatePlans
to `revalidate_plan`, using the existing schedule, travel, cost and ranking rules.
The generated candidate is fixed in the tests; no AI, network or production data
is required. This verifies validation after edits, not a replacement/regeneration UI.

Covered cases:

- Replace the middle stop and supply both incoming and outgoing legs. Recalculate
  travel totals and the whole-trip budget without changing the input objects.
- Missing evidence for either new leg returns UNVERIFIED with a reason code,
  path and message. Old legs cannot validate the changed day.
- A regenerated day's higher prices can exceed the whole-trip budget. Missing
  current transport/accommodation costs remain UNVERIFIED.
- Insufficient transfer time and daily distance/time violations are rejected even
  when the request omits transportation preferences. Hiding a transportation form
  field therefore does not disable the internal CandidatePlan travel checks.
- Repeated places across days remain an independent REPEATED_PLACE quality warning,
  consistent with TPVA-51. They do not become a new hard feasibility constraint.

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider backend/tests/test_activity_revision_feasibility.py backend/tests/test_revalidation.py backend/tests/test_ranking_quality.py
```
