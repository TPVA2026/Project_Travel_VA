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
