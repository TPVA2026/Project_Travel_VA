from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.services.input_service import request_problems, validate_travel_request

router = APIRouter()


@router.post("/validate")
def validate_request(payload: dict):
    try:
        request = validate_travel_request(payload)
    except ValidationError as exc:
        body = request_problems(payload, exc)
        body["errors"] = [{"loc": err["loc"], "msg": err["msg"]} for err in exc.errors()]
        return JSONResponse(body, status_code=422)
    return request.model_dump(mode="json", by_alias=True)
