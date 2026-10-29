# Personalized Travel Planning Virtual Assistant

Course: Computational Thinking · Group 1. Prototype that collects travel requirements, generates candidate itineraries
for selected areas of Vietnam with an LLM, then verifies cost/time/distance constraints deterministically.

## Structure
| Folder | Purpose | Owner(s) |
|---|---|---|
| `client/` | React + Vite frontend (JavaScript) | M5 (form: M1, API client: M6) |
| `server/` | Python (FastAPI) backend | M1–M6 |
| `server/src/modules/input` | Request validation/normalization | M1 |
| `server/src/modules/data` | Curated dataset + repository | M2 |
| `server/src/modules/ai` | Gemini client, context, prompts, candidate generation | M3 |
| `server/src/modules/validation`, `ranking` | Feasibility, costs, ranking | M4 |
| `server/src/routes`, `controllers`, `services`, `tests` | API + integration + QA | M6 |
| `shared/` | JSON schemas and examples shared by client and server | all (schemas agreed early) |
| `docs/` | Design and test documentation | all |

## Setup
Requires Python 3.11+ (backend) and Node 20+ (frontend only).
```bash
# backend
cd server
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # fill GEMINI_API_KEY (server only, never commit)
python -m pytest
python -m uvicorn src.app:app --reload --port 3001   # http://localhost:3001/health (docs: /docs)

# frontend (new terminal, from repo root)
npm run install:client
npm run dev:client                   # http://localhost:5173
```
## Rules
- Branch per task: `feat/<member>-<topic>`; merge through a reviewed pull request; one GitHub issue per task.
- Never commit `.env` or any API key. The Gemini key lives only in `server/.env`; the client never sees it.
- LLM output is a *candidate*: only M4's deterministic checks can mark a plan FEASIBLE.
- Unknown prices/hours/travel times stay `null` ("No data available"); never treat them as 0.
