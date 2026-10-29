# Travel Planning VA

Course prototype. See `README.md` for setup and which folder each member owns.

TravelRequest contract: `backend/app/schemas/travel_request.py` and `backend/app/schemas/travelRequest.schema.json`. Examples used by the input tests: `backend/tests/fixtures/sampleRequest.json`, `sampleRequestMonth.json`, `invalidRequests.json`.

## Rules

- LLM output is only a candidate. A plan is FEASIBLE only after the checks in `backend/app/algorithms/`. After a revision, run those checks again.
- Unknown prices, hours, or travel times stay `null`. Never treat missing data as 0.
- The Gemini key lives only in `backend/.env`. Never commit `.env` or put the key in the frontend.
- Change a TravelRequest field in the Pydantic model and the JSON schema together.
- Keep edits inside the module that owns the behavior. Do not duplicate validation in the frontend when `input_service.py` already owns it.
