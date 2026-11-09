from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, ValidationError

from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import generate_candidate
from app.services.input_service import request_problems, validate_travel_request

from app.services.planning_service import PlanningError, evaluate_plan

router = APIRouter()


@router.post("/generate")  # candidate generation (Thiện / M3)
def generate(body: dict):
    # Validate before generation; a candidate remains UNVERIFIED.
    try:
        validated_request = validate_travel_request(body)
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={"detail": request_problems(body, exc)},
        )
    normalized_body = validated_request.model_dump(mode="json", by_alias=True)
    try:
        plan = generate_candidate(normalized_body)
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


class EvaluateBody(BaseModel):
    """Endpoint envelope; shared TravelRequest/CandidatePlan schemas are unchanged."""

    model_config = ConfigDict(extra="forbid")
    request: dict
    plan: dict


@router.post("/evaluate")
def evaluate(body: EvaluateBody):
    try:
        return evaluate_plan(body.request, body.plan)
    except PlanningError as exc:
        return JSONResponse(
            {"error": exc.code, "message": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)


@router.post("/rank", status_code=501)
def rank():
    # No ranking callable or agreed payload contract exists yet.
    return {
        "error": "RANKING_UNAVAILABLE",
        "message": "Ranking is not implemented; algorithm and contract are pending.",
    }


# TODO(ZT): POST /revise, /select
