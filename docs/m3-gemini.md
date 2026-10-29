# M3 - Gemini candidate itinerary generation (Day 1 prototype)

Owner: M3 | Date: 2026-10-29

## What was delivered
| Deliverable | Where |
|---|---|
| Prototype Gemini request (structured JSON output, retry, timeout) | `backend/app/services/ai/gemini_client.py` |
| Prompt + dataset context | `prompt_templates.py`, `context_builder.py` (same folder) |
| Generate + schema/grounding validation | `backend/app/services/ai/itinerary_generator.py` |
| Endpoint `POST /itineraries/generate` | `backend/app/api/itineraries.py` |
| CandidatePlan JSON Schema (shared with M4/M5/M6) | `backend/app/schemas/candidate_plan.schema.json` |
| Valid sample response | `backend/tests/fixtures/sample_response.json` |
| Real-Gemini output (schema + grounding checked by a test) | `backend/tests/fixtures/live_demo_output.json` |
| Tests (Gemini mocked) | `backend/tests/test_ai.py` - output in `docs/m3-test-output.txt` |

## Run
```bash
cd backend && source .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env                    # fill GEMINI_API_KEY (server only, never commit)
python -m pytest                        # offline, Gemini mocked
python -m scripts.gemini_demo           # real Gemini call using tests/fixtures
python -m uvicorn app.main:app --reload --port 3001   # POST /itineraries/generate
```

## Security (no client-side secret)
- Key is read from `GEMINI_API_KEY` on the server only and sent in the `x-goog-api-key` header, not the URL.
- The browser only calls `/itineraries/generate`; CORS is limited to `ALLOWED_ORIGIN`.
- `.env` is git-ignored; CI scans for `AIza...` strings and a test checks no secret in the repo and no key reference under `frontend/`.
- Errors never include the key or the raw upstream body.

## Contract
- In: validated `TravelRequest` (M1). Out: `{ "status": "UNVERIFIED", "plan": CandidatePlan }`.
- The plan is never "feasible" until M4 `/itineraries/evaluate` verifies it. Costs are references only; unknown = `null` + `NO_DATA`, never 0.
- Guards: JSON-schema check, then grounding (placeId in dataset, no overlap, cost status agrees with dataset source).
- Error codes: `CONFIG` (500), `TIMEOUT` (504), `INVALID_PLAN` (422), `NO_DATA` (422), `NETWORK` / `API_ERROR` / `EMPTY` / `MALFORMED` (502).

## Context retrieval (`context_builder.py`)
Only supported data reaches the LLM:
- Records need a well-formed, unique string `id`; others are dropped (logged). Ids are never generated or repaired.
- `preferredDestination` keeps only that destination's places (via `destinationId`, else the id prefix, e.g. `DN-ATT-001` -> `DN`). An unsupported destination gives an empty context, and `/itineraries/generate` returns `NO_DATA` (422) without calling Gemini.
- Prices, durations and distances are copied as-is; missing/invalid values become `null`, never 0 or an estimate.
- Travel legs are kept only between retrieved places; none are invented. The plan checker also rejects legs whose ids, durations or distances differ from the dataset.

## Open items
- `backend/tests/fixtures/sample_dataset.json` is an M2 placeholder; `generate_candidate` already reads `data_service.load_dataset()` by default, so it works once M2 fills the data files.
- `/itineraries/generate` does not call M1 `validate_request` yet (TODO M6/M1).
- `live_demo_output.json` was produced by the earlier Node prototype with the same request/schema; re-run `python -m scripts.gemini_demo` with a key to refresh it from the Python client.
- Default model `gemini-3.6-flash`; confirm with ListModels before the demo.

---
## PR description
**Title:** feat(m3): Gemini structured-output generation (Python), server-side key, CandidatePlan schema + sample

- Adds Gemini client (timeout, retries, error codes), prompt/context builders, schema + grounding validation, `POST /itineraries/generate`.
- Fills `backend/app/schemas/candidate_plan.schema.json` and `backend/tests/fixtures/sample_response.json`.
- No client-side secret: key only via server env, header auth, `.env` ignored, tests + CI scan.
- Evidence: `python -m pytest` -> 17 passed, 3 skipped (other members' TODO tests); see `docs/m3-test-output.txt`.
- Reviewers: M4 (schema/evaluate contract), M6 (endpoint integration), M1 (TravelRequest shape), M2 (dataset ids).

## Jira comment (before moving to Done)
Delivered Day 1: Gemini request prototype, server-side key handling, CandidatePlan schema, valid sample plan, integrated in `backend/app/services/ai` + `/itineraries/generate`.
Evidence: PR <link>, test output `docs/m3-test-output.txt` (17 passed), `backend/tests/fixtures/sample_response.json`, `backend/tests/fixtures/live_demo_output.json`.
Move to Done only after M4 and M6 approve the PR.
