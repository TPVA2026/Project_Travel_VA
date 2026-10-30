from typing import Any

from fastapi import APIRouter, Body, HTTPException
from pydantic import ValidationError

from app.services.input_service import (
    validate_travel_request,
    request_problems,
)
# TODO(ZT): POST /validate (calls input_service)
router = APIRouter(
    prefix="/api/v1/requests",
    tags=["Requests"],
)




@router.post("/validate")
def validate_request(payload: dict[str, Any] = Body(...)):
    try:
        travel_request = validate_travel_request(payload)

        return {
            "valid": True,
            "data": travel_request.model_dump(mode="json", by_alias=True),
        }

    except ValidationError as exc:
        problems = request_problems(payload, exc)

        raise HTTPException(
            status_code=422,
            detail=problems,
        ) from exc