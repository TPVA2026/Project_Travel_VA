"""HTTP handlers for itinerary endpoints (M6 owns the rest; generate is M3)."""
from fastapi.responses import JSONResponse

from src.modules.ai.gemini_client import GeminiError
from src.modules.ai.itinerary_generator import generate_candidate


def generate(request_body: dict):
    """Body = validated TravelRequest from M1. Response = candidate plan, status UNVERIFIED."""
    # TODO(M6): call M1 validate_request before generating.
    try:
        plan = generate_candidate(request_body)
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
