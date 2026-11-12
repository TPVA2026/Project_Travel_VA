from typing import Any

from fastapi import APIRouter, Body, HTTPException
from pydantic import ValidationError

from app.services.input_service import (
    validate_travel_request,
    request_problems,
)
from app.services.destination_resolution import resolve_destination_id
from app.services.data_service import get_destinations
router = APIRouter(
    prefix="/api/v1/requests",
    tags=["Requests"],
)




@router.post("/validate")
def validate_request(payload: dict[str, Any] = Body(...)):
    try:
        travel_request = validate_travel_request(payload)
    except ValidationError as exc:
        problems = request_problems(payload, exc)

        raise HTTPException(
            status_code=422,
            detail=problems,
        ) from exc

    normalized = travel_request.model_dump(mode="json", by_alias=True)
    preferences = normalized.get("preferences") or {}
    if preferences.get("destination"):
        try:
            destinations = get_destinations()
            destination_id = resolve_destination_id(preferences["destination"], destinations)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail={"code": "DATASET_ERROR", "message": "Unable to validate destination data."},
            ) from exc
        if destination_id is None:
            labels = [
                item.get("city") or item.get("city_name") or item.get("name") or item.get("id")
                for item in destinations if isinstance(item, dict)
            ]
            labels = [label for label in labels if isinstance(label, str) and label]
            message = "Destination is not supported by the current dataset."
            if labels:
                message += f" Choose one of: {', '.join(labels)}."
            raise HTTPException(
                status_code=422,
                detail={
                    "errors": [{
                        "loc": ["preferences", "destination"],
                        "msg": message,
                        "type": "value_error.destination_not_supported",
                    }],
                    "missing": [],
                    "conflicts": [],
                    "messages": [message],
                },
            )

    return {"valid": True, "data": normalized}
