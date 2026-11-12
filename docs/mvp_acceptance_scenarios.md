# MVP acceptance scenarios — Huế (TPVA-54 / FIX-12)

- Owner: M1 (QA run). Shared with ZT for TPVA-36.
- Run: 2026-11-11 22:16 (UTC+7), `main` @ `0035176`, local FastAPI on the box.
- Dataset: `backend/app/data` as on `main` (Huế = `H`, 10 attractions, 10 restaurants,
  180 travel-matrix rows, all with `verificationStatus: unverified`).
- Gemini: **not configured** (`GEMINI_API_KEY` unset). OSRM: disabled on the default
  server; a second server with OSRM enabled points at a local socket that never answers.

## Files

| What | Where |
| --- | --- |
| Scenarios, TravelRequest + CandidatePlan fixtures, expected status / check codes | `backend/tests/fixtures/acceptance/hue_scenarios.json` |
| Live runner (calls existing endpoints, saves JSON, judges pass/fail) | `backend/scripts/run_acceptance_scenarios.py` |
| In-process regression (pytest, same judge) | `backend/tests/test_acceptance_scenarios.py` |
| Frontend API client run against the live backend | `frontend/scripts/acceptance-client.mjs` |
| Evidence: one JSON per scenario (request, response, verdict) + `summary.json` + `frontend_client.json` | `docs/evidence/tpva-54/` |

Expected results come from `docs/api_contract.md`, `docs/feasibility_rules.md`,
`docs/m3-gemini.md` and `backend/docs/osrm-routing.md`, not from the observed output.

## Results

Verdicts: **PASS** = matches expected; **FAIL** = differs (owner listed);
**BLOCKED** = could not run here (reason listed). No scenario was expected or
reported as `FEASIBLE`: no Huế leg or trip cost (transport, lodging) is verified.

| # | Scenario | Endpoint | Expected | Actual | Verdict | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | Valid 3-day Huế request | `POST /api/v1/requests/validate` | 200 `valid: true` | 200 `valid: true` | PASS | M1/M6 |
| S02 | Valid 3-day Huế generation | `POST /itineraries/generate` | 200 `UNVERIFIED` + plan | 500 `CONFIG` | **BLOCKED** — no `GEMINI_API_KEY` on the box | M3 |
| S03 | Valid 3-day Huế plan (dataset-grounded fixture) | `POST /itineraries/evaluate` | 200 `UNVERIFIED`, `BUDGET`, `UNSUPPORTED_LEG`; never `FEASIBLE` | 200 `UNVERIFIED`, `BUDGET`, `UNSUPPORTED_LEG`, `TRAVEL_DATA`, `TRANSFER_GAP` | PASS | M4 |
| S04 | Rank the same plan | `POST /itineraries/rank` | 200, `ranked: []`, plan in `excluded` | as expected | PASS | M4 |
| S05 | ATTR_H_08 at 08:30 (opens 09:00) | `/itineraries/evaluate` | 200 `INFEASIBLE`, `OUTSIDE_OPENING_HOURS` | as expected | PASS | M4 |
| S06 | No travel legs | `/itineraries/evaluate` | 200 `UNVERIFIED`, `MISSING_LEG` | as expected | PASS | M4 |
| S07 | Over budget, group 300,000 VND | `/itineraries/evaluate` | 200 `INFEASIBLE`, `BUDGET` | as expected | PASS | M4 |
| S08 | Over budget, perPerson 300,000 × 2 | `/itineraries/evaluate` | 200 `INFEASIBLE`, `BUDGET` | as expected | PASS | M4 |
| S09 | Dining stop REST_H_01 without price | `/itineraries/evaluate` | 200 `UNVERIFIED`, `BUDGET` (cost stays null) | as expected | PASS | M4 |
| S10 | Overlapping activities | `/itineraries/evaluate` | 422 `INVALID_PLAN` or 200 `INFEASIBLE` | 422 `INVALID_PLAN` (grounding) | PASS | M3/M4 |
| S11 | Leg 22 min > 10 min `betweenActivities` | `/itineraries/evaluate` | 200 `UNVERIFIED`, `LIMIT_DATA` (route unverified) | as expected | PASS | M4/M2 |
| S12 | Same place twice in a row (A → A) | `/itineraries/evaluate` | repeated stop flagged | 200 `UNVERIFIED`, only generic data checks; nothing flags the repeat | **FAIL** | M4 (rule), M3 (grounding accepts A → A leg) |
| S13 | Malformed JSON | `/itineraries/evaluate` | 422 `{detail: [...]}` | as expected | PASS | M6 |
| S14 | Malformed JSON | `/api/v1/requests/validate` | 422 `{detail: [...]}` | as expected | PASS | M6 |
| S15 | No destination | `/api/v1/requests/validate` | 200, no destination filled in | as expected | PASS | M1/M6 |
| S16 | No destination | `/itineraries/generate` | AI suggests a destination (product decision) → 200 `UNVERIFIED` | 422 `NO_DATA` "The selected destination is not supported by the current dataset." (Gemini not reached) | **FAIL** | M3/M6 (TPVA-39/40; PR #50 `suggest_destinations` is not wired to any endpoint) |
| S17 | Unsupported destination "Atlantis" | `/api/v1/requests/validate` | 422, not replaced by another city | 422 with a 35-city "Choose one of" list | PASS | M6 |
| S18 | OSRM provider timeout | `/itineraries/evaluate` (OSRM on) | 200, not `FEASIBLE`, route not `VERIFIED` | 200 `UNVERIFIED`, route `ROUTING_UNAVAILABLE` / `NO_DATA` after the 2 s timeout | PASS | M2/M4 |
| S19 | `transportation: [42]` | `/api/v1/requests/validate` | 422 | 200, value silently dropped (`transportation: []`) | **FAIL** | M1 (`input_service._clean_list`; fix in TPVA-53) |

Totals: **15 PASS, 3 FAIL, 1 BLOCKED** (19 scenarios).

### 3-day Huế workflow, end to end

1. Form payload → `POST /api/v1/requests/validate`: PASS (S01).
2. `POST /itineraries/generate`: **UNVERIFIED / BLOCKED** — Gemini key not available,
   so the candidate plan was not produced by the AI. A hand-written, dataset-grounded
   CandidatePlan (same IDs, prices and matrix values as the dataset) was used instead.
3. `POST /itineraries/evaluate` → `UNVERIFIED` (S03), `POST /itineraries/rank` → excluded (S04).
4. Frontend client (`src/services/api.js`, Node 24) against the live backend
   (`frontend_client.json`): `validateTravelRequest` OK; `runItineraryPipeline` stops at
   generate with 500 "GEMINI_API_KEY is not set on the server"; `evaluateItinerary` +
   `rankItineraries` + `getCandidatePresentation` give `UNVERIFIED`, not recommended.
   With no destination the Results page would show "The selected destination is not
   supported by the current dataset." (owner M3 message / UI copy).
5. Not done: a browser/visual run of the Results page; a live Gemini run; a live OSRM run.

### Other observations (not scored)

- S03: `BUDGET` lists `dining` as a missing cost even though the plan has no dining
  activity (M4 to confirm whether meals are always required).
- All 180 Huế travel-matrix rows are `unverified`; until M2 supplies verified rows no
  Huế plan can become `FEASIBLE`, and travel-limit violations can only be `UNVERIFIED`.

## How to re-run (regression after merge)

```bash
cd backend
python -m pytest tests/test_acceptance_scenarios.py      # in-process, no network
python -m uvicorn app.main:app --port 3001 &             # default profile
# optional OSRM-timeout profile: OSRM_ROUTING_ENABLED=true OSRM_BASE_URL=<unreachable>
#   OSRM_MVP_PLACE_IDS=OTM_H_N669249200,OTM_H_W161714451 OSRM_TIMEOUT_SECONDS=2 uvicorn ... --port 3002
python -m scripts.run_acceptance_scenarios --base-url http://localhost:3001 \
  --osrm-timeout-base-url http://localhost:3002 --out ../docs/evidence/tpva-54
cd ../frontend && node scripts/acceptance-client.mjs http://localhost:3001 ../docs/evidence/tpva-54/frontend_client.json
```

With `GEMINI_API_KEY` set, S02 and S16 call Gemini and become PASS/FAIL instead of BLOCKED.
