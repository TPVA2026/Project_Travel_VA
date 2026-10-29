from fastapi import APIRouter
from pydantic import BaseModel, Field

# TODO(ZT): POST /validate (calls input_service)
router = APIRouter(
    prefix="/api/v1/requests",
    tags=["Requests"],
)


class TravelRequest(BaseModel):
    destination: str
    duration: int = Field(gt=0, le=3)
    budget: int = Field(gt=0)


@router.post("/validate")
def validate_request(request: TravelRequest):
    return {
        "destination": request.destination,
        "duration": request.duration,
        "budget": request.budget,
        "valid": True,
        "message": "Travel request accepted",
    }
