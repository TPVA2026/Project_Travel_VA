from app.schemas.travel_request import TravelRequest

# TODO(Khánh): normalize TravelRequest and report missing fields


def validate_travel_request(payload: dict) -> TravelRequest:
    """Parse payload into TravelRequest. Raises pydantic.ValidationError."""
    return TravelRequest.model_validate(payload)
