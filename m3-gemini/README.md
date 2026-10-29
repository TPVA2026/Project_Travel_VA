# M3 – Gemini Itinerary Generation (Day 1 prototype)

Owner: M3 · Date: 2026-10-29

## Run
```bash
npm install
cp .env.example .env     # fill GEMINI_API_KEY (server only, never commit)
npm test                 # offline, mocked Gemini, 6 tests
npm run demo             # real Gemini call using sample/travel-request.json
npm start                # POST http://localhost:3001/itineraries/generate
```

## Security
- Key is read from `process.env.GEMINI_API_KEY` on the server only; sent in the `x-goog-api-key` header (not the URL).
- Browser calls only `/itineraries/generate`; CORS restricted to `ALLOWED_ORIGIN`.
- `.env` is git-ignored; a test scans the repo for key-like strings and for key references in client files.
- Errors never echo the key or raw upstream bodies.

## Contract
- In: validated `TravelRequest` (M1). Out: `{ status: "UNVERIFIED", plan }` (`src/itinerary.schema.js`).
- Plan is never "feasible" until M4 `/itineraries/evaluate` verifies it. Costs in the plan are references only; unknown = `null` + `NO_DATA`.
- Guards: schema check, then grounding (placeId in dataset, no overlap, null cost not KNOWN). Errors: CONFIG, TIMEOUT, NETWORK, API_ERROR, EMPTY, MALFORMED, INVALID_PLAN.

## Open items
- Default model `gemini-3.6-flash` (listed as stable on Google's model page, 2026-10-29); confirm with ListModels before the demo run.
- `data/sample-dataset.json` is an M2 fixture placeholder; swap in the real dataset/lookup module.
- Real-API demo run output still to be attached (needs key).
