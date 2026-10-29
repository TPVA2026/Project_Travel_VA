#!/usr/bin/env python3
"""Restructure the repo into frontend/ + backend/ (FastAPI) as agreed by the team.

Run from the repo ROOT, on the branch that contains the Python backend + M3 code
(feat/m3-gemini-python), with a clean working tree:

    python3 restructure.py

It creates branch `refactor/new-structure`, moves files with `git mv` (history kept),
fixes imports/paths, and makes ONE commit. Nothing is pushed.
"""
import shutil
import subprocess
import sys
from pathlib import Path


def run(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"FAILED: {' '.join(cmd)}\n{r.stderr or r.stdout}")
    return r.stdout.strip()


def git(*a):
    return run("git", *a)


def mv(src, dst):
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    git("mv", src, dst)


def rm(path):
    git("rm", "-q", "-f", path)


def write(path, text):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.lstrip("\n"), encoding="utf-8")


def edit(path, pairs, strict=True):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    for old, new in pairs:
        if old not in text:
            if strict:
                sys.exit(f"FAILED: expected text not found in {path}:\n  {old}")
            print(f"  note: '{old[:50]}' not found in {path} (skipped)")
            continue
        text = text.replace(old, new)
    p.write_text(text, encoding="utf-8")


def rm_if_stub(path, limit=200):
    p = Path(path)
    if not p.exists():
        return
    if p.stat().st_size > limit:
        print(f"  KEPT {path} ({p.stat().st_size} bytes): has real content, move it by hand")
        return
    rm(path)


# ---------------------------------------------------------------- preflight
if not (Path("server/src/app.py").exists() and Path("client/src").exists()):
    sys.exit("Run this from the repo root, on the branch with the Python backend "
             "(feat/m3-gemini-python). Expected server/src/app.py and client/src.")
if git("status", "--porcelain", "--untracked-files=no"):
    sys.exit("Working tree not clean. Commit or stash your changes first.")
print("Current branch:", git("rev-parse", "--abbrev-ref", "HEAD"))
git("checkout", "-b", "refactor/new-structure")

# ------------------------------------------------------- top-level renames
git("mv", "client", "frontend")
git("mv", "server", "backend")
B = "backend"
A = f"{B}/app"
mv(f"{B}/src", A)

# ------------------------------------------------------------- app/main.py
rm(f"{A}/main.py")                      # old uvicorn runner
mv(f"{A}/app.py", f"{A}/main.py")

# --------------------------------------------------------------------- api
mv(f"{A}/routes/__init__.py", f"{A}/api/__init__.py")
mv(f"{A}/routes/request_routes.py", f"{A}/api/requests.py")
mv(f"{A}/routes/destination_routes.py", f"{A}/api/destinations.py")
mv(f"{A}/routes/itinerary_routes.py", f"{A}/api/itineraries.py")
rm(f"{A}/controllers/itinerary_controller.py")   # logic merged into api/itineraries.py
rm(f"{A}/controllers/__init__.py")

# ---------------------------------------------------------------- services
mv(f"{A}/modules/ai", f"{A}/services/ai")
mv(f"{A}/modules/data/travel_repository.py", f"{A}/services/data_service.py")
for name in ("destinations", "attractions", "restaurants", "travel_matrix"):
    mv(f"{A}/modules/data/{name}.json", f"{A}/data/{name}.json")
rm(f"{A}/modules/data/__init__.py")
mv(f"{A}/modules/input/validate_request.py", f"{A}/services/input_service.py")
rm(f"{A}/modules/input/normalize_request.py")
rm(f"{A}/modules/input/__init__.py")

# -------------------------------------------------------------- algorithms
for name in ("feasibility", "cost_calculator", "schedule_validator", "travel_validator"):
    mv(f"{A}/modules/validation/{name}.py", f"{A}/algorithms/{name}.py")
rm(f"{A}/modules/validation/__init__.py")
mv(f"{A}/modules/ranking/rank_plans.py", f"{A}/algorithms/ranking.py")
rm(f"{A}/modules/ranking/preference_score.py")
rm(f"{A}/modules/ranking/__init__.py")
rm(f"{A}/modules/__init__.py")
for d in ("modules", "controllers", "routes"):
    shutil.rmtree(f"{A}/{d}", ignore_errors=True)   # leftover __pycache__

# ----------------------------------------------------------------- schemas
mv("shared/schemas/candidatePlan.schema.json", f"{A}/schemas/candidate_plan.schema.json")
mv("shared/examples/sampleResponse.json", f"{B}/tests/fixtures/sample_response.json")
for stub in ("shared/examples/sampleRequest.json",
             "shared/schemas/travelRequest.schema.json",
             "shared/schemas/revisionRequest.schema.json"):
    rm_if_stub(stub)
shutil.rmtree("shared", ignore_errors=True)

# ------------------------------------------------------------------- tests
mv(f"{B}/tests/test_gemini.py", f"{B}/tests/test_ai.py")
mv(f"{B}/tests/test_integration.py", f"{B}/tests/test_api.py")

# ------------------------------------------------------------ docs / root
for old, new in (("problem-formulation", "problem_formulation"), ("api-contract", "api_contract"),
                 ("feasibility-rules", "feasibility_rules"), ("test-scenarios", "test_scenarios")):
    mv(f"docs/{old}.md", f"docs/{new}.md")
rm_if_stub("docs/data-dictionary.md")
rm("package.json")                       # root npm scripts: replaced by README commands

# ---------------------------------------------------------------- frontend
rm_if_stub("frontend/src/components/itinerary/RevisionForm.jsx")
rm_if_stub("frontend/src/utils/normalizeInput.js")
for path, comp, note in (
    ("input/PromptInput", "PromptInput", "free-text prompt input"),
    ("itinerary/ActivityCard", "ActivityCard", "single activity card"),
    ("common/Navbar", "Navbar", "top navigation bar"),
):
    write(f"frontend/src/components/{path}.jsx",
          f"// TODO(Thư Lê / Khánh): {note}\nexport default function {comp}() {{\n  return null;\n}}\n")
write("frontend/src/index.css", "body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n")
edit("frontend/src/main.jsx", [('import App from "./App.jsx";', 'import App from "./App.jsx";\nimport "./index.css";')])

# ------------------------------------------------- backend: rewritten files
write(f"{A}/main.py", '''
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.destinations import router as destinations_router
from app.api.itineraries import router as itineraries_router
from app.api.requests import router as requests_router

load_dotenv()

MAX_BODY_BYTES = 100 * 1024  # 100kb request limit

app = FastAPI(title="Travel Planning Assistant")

# Minimal CORS: only the known frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and int(length) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "Request body too large"}, status_code=413)
    return await call_next(request)


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(requests_router, prefix="/requests")
app.include_router(destinations_router, prefix="/destinations")
app.include_router(itineraries_router, prefix="/itineraries")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "3001"))
    print(f"Server listening on port {port}")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
''')

write(f"{A}/api/requests.py", '''
from fastapi import APIRouter

# TODO(ZT): POST /validate (calls input_service)
router = APIRouter()
''')
write(f"{A}/api/destinations.py", '''
from fastapi import APIRouter

# TODO(ZT): GET / (calls data_service)
router = APIRouter()
''')
write(f"{A}/api/itineraries.py", '''
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import generate_candidate

router = APIRouter()


@router.post("/generate")  # candidate generation (Thiện / M3)
def generate(body: dict):
    # Body = validated TravelRequest. Response = candidate plan, status UNVERIFIED.
    # TODO(ZT): call input_service.validate before generating.
    try:
        plan = generate_candidate(body)
    except GeminiError as e:
        if e.code == "TIMEOUT":
            http = 504
        elif e.code == "CONFIG":
            http = 500
        elif e.status == 422:
            http = 422
        else:
            http = 502
        return JSONResponse({"error": e.code, "message": e.message, "details": e.details}, status_code=http)
    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)  # never echo internals / key
    return {"status": "UNVERIFIED", "plan": plan}


# TODO(ZT): POST /evaluate, /rank, /revise, /select
''')

write(f"{A}/services/input_service.py",
      "# TODO(Khánh): validate TravelRequest fields\n# TODO(Khánh): normalize TravelRequest and report missing fields\n")
write(f"{A}/algorithms/ranking.py",
      "# TODO(Sand): normalized preference score\n# TODO(Sand): rank verified feasible plans only\n")
write(f"{A}/services/data_service.py", '''
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Shape consumed by ai/algorithms: { destinations, attractions, dining, travel_matrix }.
# Unknown prices/hours/travel times must stay None (JSON null), never 0.
# TODO(Thư Anh): add retrieval filters, provenance and update-date metadata.


def _load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def load_dataset() -> dict:
    return {
        "destinations": _load("destinations.json"),
        "attractions": _load("attractions.json"),
        "dining": _load("restaurants.json"),
        "travel_matrix": _load("travel_matrix.json"),
    }
''')

write(f"{A}/algorithms/__init__.py", "")
write(f"{A}/schemas/__init__.py", "")
write(f"{A}/schemas/travel_request.py", "# TODO(Khánh): Pydantic TravelRequest model\n")
write(f"{A}/schemas/itinerary.py",
      "# TODO(Khánh): Pydantic itinerary models.\n"
      "# The CandidatePlan JSON schema sent to Gemini lives in candidate_plan.schema.json (same folder).\n")
write(f"{A}/schemas/revision.py", "# TODO(Khánh): Pydantic RevisionRequest model\n")

write(f"{B}/tests/test_api.py", '''
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


# TODO(ZT): add end-to-end tests for /requests, /destinations, /itineraries
''')
write(f"{B}/tests/test_data.py", '''
from app.services.data_service import load_dataset


def test_dataset_has_expected_keys():
    assert set(load_dataset()) == {"destinations", "attractions", "dining", "travel_matrix"}


# TODO(Thư Anh): test dataset content (null prices stay null, ids unique)
''')

# ------------------------------------------------- backend: import/path fixes
edit(f"{A}/services/ai/gemini_client.py", [("src.modules.ai", "app.services.ai")])
edit(f"{A}/services/ai/itinerary_generator.py", [
    ("src.modules.ai", "app.services.ai"),
    ("src.modules.data.travel_repository", "app.services.data_service"),
    ('Path(__file__).resolve().parents[4] / "shared" / "schemas" / "candidatePlan.schema.json"',
     'Path(__file__).resolve().parents[2] / "schemas" / "candidate_plan.schema.json"'),
])
edit(f"{B}/scripts/gemini_demo.py", [("src.modules.ai", "app.services.ai"),
                                      ("server/.env", "backend/.env"), ("cd server", "cd backend")])
edit(f"{B}/tests/test_ai.py", [
    ("from src.app import app", "from app.main import app"),
    ("from src.controllers import itinerary_controller", "from app.api import itineraries"),
    ("src.modules.ai", "app.services.ai"),
    ('load(ROOT / "shared" / "examples" / "sampleResponse.json")["plan"]',
     'load(FIX / "sample_response.json")["plan"]'),
    ("monkeypatch.setattr(itinerary_controller,", "monkeypatch.setattr(itineraries,"),
    ('if "client" in f.relative_to(ROOT).parts[:1]:', 'if "frontend" in f.relative_to(ROOT).parts[:1]:'),
    ("client file references the key", "frontend file references the key"),
])
edit(".github/workflows/ci.yml", [
    ("working-directory: server", "working-directory: backend"),
    ("server/requirements.txt", "backend/requirements.txt"),
])
edit("docs/m3-gemini.md", [
    ("`server/src/routes/itinerary_routes.py` -> `controllers/itinerary_controller.py`", "`backend/app/api/itineraries.py`"),
    ("server/src/modules/ai", "backend/app/services/ai"),
    ("shared/schemas/candidatePlan.schema.json", "backend/app/schemas/candidate_plan.schema.json"),
    ("shared/examples/sampleResponse.json", "backend/tests/fixtures/sample_response.json"),
    ("server/tests", "backend/tests"),
    ("server/.env", "backend/.env"),
    ("cd server", "cd backend"),
    ("src.app:app", "app.main:app"),
    ("test_gemini.py", "test_ai.py"),
    ("travel_repository", "data_service"),
    ("under `client/`", "under `frontend/`"),
], strict=False)

# ------------------------------------------------------------------ README
write("README.md", '''
# Personalized Travel Planning Virtual Assistant
Course: Computational Thinking - Group 1. Prototype that collects travel requirements, generates candidate
itineraries for selected areas of Vietnam with an LLM, then verifies cost/time/distance constraints deterministically.

## Structure
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
''')

# ------------------------------------------------------------------ commit
git("add", "-A")
git("commit", "-m", "refactor: restructure into frontend/ + backend/app (FastAPI) layout")
print("\nDONE. One commit created on branch refactor/new-structure (nothing pushed).")
print("NEXT STEPS:")
print("  deactivate                      # leave the old venv (it was moved with the folder)")
print("  cd backend && rm -rf .venv && python3 -m venv .venv && source .venv/bin/activate")
print("  pip install -r requirements.txt && python -m pytest   # expect 17 passed, 3 skipped")
print("  git push -u origin refactor/new-structure")
