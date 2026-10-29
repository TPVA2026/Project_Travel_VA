"""Validate a raw request body against the TravelRequest contract."""

from src.schemas.travel_request import TravelRequest


def validate_travel_request(payload: dict) -> TravelRequest:
    """Parse payload into TravelRequest. Raises pydantic.ValidationError."""
    return TravelRequest.model_validate(payload)
