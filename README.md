# Personalized Travel Planning Virtual Assistant
Course: Computational Thinking - Group 1. Prototype that collects travel requirements, generates candidate
itineraries for selected areas of Vietnam with an LLM, then verifies cost/time/distance constraints deterministically.

## Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── app/
│   │   ├── algorithms/               # Feasibility, costs, schedule/travel checks, ranking
│   │   │   ├── cost_calculator.py
│   │   │   ├── feasibility.py
│   │   │   ├── ranking.py
│   │   │   ├── schedule_validator.py
│   │   │   └── travel_validator.py
│   │   ├── api/                      # FastAPI route endpoints
│   │   │   ├── destinations.py
│   │   │   ├── itineraries.py
│   │   │   └── requests.py
│   │   ├── data/                     # Curated dataset & distance matrix
│   │   │   ├── attractions.json
│   │   │   ├── destinations.json
│   │   │   ├── restaurants.json
│   │   │   └── travel_matrix.json
│   │   ├── schemas/                  # Pydantic schemas & JSON validation schemas
│   │   │   ├── candidate_plan.py
│   │   │   ├── candidate_plan.schema.json
│   │   │   ├── itinerary.py
│   │   │   ├── revision.py
│   │   │   ├── travelRequest.fields.md
│   │   │   ├── travelRequest.schema.json
│   │   │   └── travel_request.py
│   │   ├── services/                 # Business logic & LLM services
│   │   │   ├── ai/
│   │   │   │   ├── context_builder.py
│   │   │   │   ├── gemini_client.py
│   │   │   │   ├── itinerary_generator.py
│   │   │   │   └── prompt_templates.py
│   │   │   ├── data_service.py
│   │   │   ├── input_service.py
│   │   │   └── planning_service.py
│   │   └── main.py                   # FastAPI application entrypoint
│   ├── scripts/
│   │   └── gemini_demo.py
│   ├── tests/                        # Unit and integration test suite
│   │   ├── fixtures/
│   │   ├── m3_fakes.py
│   │   ├── test_ai.py
│   │   ├── test_api.py
│   │   ├── test_candidate_plan.py
│   │   ├── test_data.py
│   │   ├── test_feasibility.py
│   │   ├── test_input.py
│   │   └── test_ranking.py
│   ├── .env.example
│   ├── pytest.ini
│   └── requirements.txt
├── docs/                             # Design, specifications & test documentation
│   ├── api_contract.md
│   ├── architecture.md
│   ├── feasibility_rules.md
│   ├── m3-gemini.md
│   ├── m3-llm-comparison.md
│   ├── m3-test-output.txt
│   ├── problem_formulation.md
│   └── test_scenarios.md
├── frontend/                         # React + Vite web frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── ErrorMessage.jsx
│   │   │   │   ├── Loading.jsx
│   │   │   │   └── Navbar.jsx
│   │   │   ├── comparison/
│   │   │   │   └── PlanComparison.jsx
│   │   │   ├── input/
│   │   │   │   ├── PromptInput.jsx
│   │   │   │   └── TravelForm.jsx
│   │   │   └── itinerary/
│   │   │       ├── ActivityCard.jsx
│   │   │       ├── CostSummary.jsx
│   │   │       └── ItineraryTimeline.jsx
│   │   ├── pages/
│   │   │   ├── HomePage.jsx
│   │   │   ├── ResultsPage.jsx
│   │   │   └── SelectedPlanPage.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

### Module Responsibilities
| Folder | Purpose | Owner |
|---|---|---|
| `frontend/` | React + Vite UI | Thư Lê, Khánh |
| `backend/app/main.py`, `api/`, `services/planning_service.py` | FastAPI app, endpoints, orchestration | ZT |
| `backend/app/schemas/` | Pydantic schemas + CandidatePlan JSON schema | Khánh |
| `backend/app/services/input_service.py` | Request validation/normalization | Khánh |
| `backend/app/services/data_service.py`, `backend/app/data/` | Curated dataset + repository | Thư Anh |
| `backend/app/services/ai/` | Gemini client, context, prompts, candidate generation | Thiện |
| `backend/app/algorithms/` | Feasibility, costs, schedule/travel checks, ranking | Sand |
| `backend/tests/` | Each member tests their own module | all |
| `docs/` | Design and test documentation | all |

## Setup
Requires Python 3.11+ (backend) and Node 20+ (frontend only).
```bash
# backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m pytest
python -m uvicorn app.main:app --reload --port 3001
```
Then fill `GEMINI_API_KEY` in `backend/.env` (server only, never commit). Health check: http://localhost:3001/health, API docs: http://localhost:3001/docs

```bash
# frontend (new terminal)
cd frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

## Rules
- Branch per task: `feat/<member>-<topic>`; merge through a reviewed pull request; one GitHub issue per task.
- Never commit `.env` or any API key. The Gemini key lives only in `backend/.env`; the frontend never sees it.
- LLM output is a *candidate*: only the deterministic checks in `algorithms/` can mark a plan FEASIBLE.
- Unknown prices/hours/travel times stay `null` ("No data available"); never treat them as 0.
