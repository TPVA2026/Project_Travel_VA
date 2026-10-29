# Travel Planning VA

Course prototype (Computational Thinking, Group 1). A user submits a trip request for selected areas of Vietnam. The backend asks Gemini for candidate itineraries, then checks cost, time, and distance with deterministic code. The React client compares, revises, and selects a plan.

Read `README.md` for setup. Design lives in `docs/` (`architecture.md`, `api-contract.md`, `feasibility-rules.md`, `data-dictionary.md`). Shared request/response shapes live in `shared/schemas/` and `shared/examples/`.

## Layout

| Path | Role |
|---|---|
| `client/` | React + Vite (JavaScript). Dev: `npm run dev:client` → http://localhost:5173 |
| `server/` | FastAPI. App: `server/src/app.py`. Dev: `npm run dev:server` → http://localhost:3001 (`/health`, `/docs`) |
| `server/src/modules/input` | Validate and normalize the request |
| `server/src/modules/data` | Curated JSON (attractions, restaurants, destinations, travel times) |
| `server/src/modules/ai` | Gemini client, context, prompts, candidate generation |
| `server/src/modules/validation`, `ranking` | Feasibility, cost, ranking |
| `server/src/routes`, `controllers`, `services` | HTTP API |
| `server/tests` | pytest. From repo root: `npm test` |

Pipeline: form → input validation → dataset + context → LLM candidates → deterministic feasibility/cost/ranking → UI.

## Rules

- Python 3.11+ on the server, Node 20+ on the client. Do not add a second framework.
- LLM output is only a candidate. A plan is FEASIBLE only after the checks in `server/src/modules/validation`. After a revision, run those checks again.
- Unknown prices, hours, or travel times stay `null` ("No data available"). Never treat missing data as 0.
- The Gemini key lives only in `server/.env`. Never commit `.env` or put the key in the client.
- Match existing JSON field names in `shared/schemas/`. Change a schema only together with the examples and both sides that read it.
- Keep edits inside the module that owns the behavior. Do not duplicate validation in the client when the server already owns it.
