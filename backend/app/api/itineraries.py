from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import generate_candidate
from app.services.ai.repair_service import generate_with_repair
from app.services.input_service import request_problems, validate_travel_request

from app.services.planning_service import (
    PlanningError,
    evaluate_plan,
    rank_candidate_plans,
    revise_and_evaluate,
)

router = APIRouter()


@router.post("/generate")  # candidate generation (Thiện / M3)
def generate(body: dict):
    auto_repair = body.get("autoRepair", False)

    if not isinstance(auto_repair, bool):
        return JSONResponse(
            status_code=422,
            content={"detail": "autoRepair must be a boolean"},
        )

    request_body = {
        key: value
        for key, value in body.items()
        if key != "autoRepair"
    }

    try:
        validated_request = validate_travel_request(request_body)
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={"detail": request_problems(request_body, exc)},
        )

    normalized_body = validated_request.model_dump(
        mode="json",
        by_alias=True,
    )

    try:
        if auto_repair:
            result = generate_with_repair(normalized_body)
        else:
            plan = generate_candidate(normalized_body)

    except GeminiError as exc:
        if exc.code == "TIMEOUT":
            http = 504
        elif exc.code == "CONFIG":
            http = 500
        elif exc.status == 422:
            http = 422
        else:
            http = 502

        return JSONResponse(
            {
                "error": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
            status_code=http,
        )

    except PlanningError as exc:
        return JSONResponse(
            {
                "error": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
            status_code=exc.status_code,
        )

    except Exception:
        return JSONResponse(
            {"error": "INTERNAL"},
            status_code=500,
        )

    if auto_repair:
        return result

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


class RankBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: dict
    plans: list[dict] = Field(min_length=1, max_length=20)


@router.post("/rank")
def rank(body: RankBody):
    try:
        return rank_candidate_plans(body.request, body.plans)
    except PlanningError as exc:
        return JSONResponse(
            {"error": exc.code, "message": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)


class ReviseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: dict
    plan: dict
    revision: dict


@router.post("/revise")
def revise(body: ReviseBody):
    try:
        return revise_and_evaluate(body.request, body.plan, body.revision)
    except PlanningError as exc:
        return JSONResponse(
            {"error": exc.code, "message": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)


# Selection remains browser-local for the no-account MVP.
