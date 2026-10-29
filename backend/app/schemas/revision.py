"""One change to an existing plan. Feasibility must be checked again after it is applied."""

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.schemas.travel_request import (
    ApiModel,
    Budget,
    DatePeriod,
    MonthPeriod,
    Preferences,
    TravelLimits,
    Travelers,
)

RevisionType = Literal[
    "budget",
    "travelPeriod",
    "durationDays",
    "departureLocation",
    "travelers",
    "limits",
    "preferences",
]

_FIELD = {
    "budget": "budget",
    "travelPeriod": "travel_period",
    "durationDays": "duration_days",
    "departureLocation": "departure_location",
    "travelers": "travelers",
    "limits": "limits",
    "preferences": "preferences",
}


class RevisionRequest(ApiModel):
    plan_id: Annotated[str, Field(min_length=1, alias="planId")]
    change_type: RevisionType = Field(alias="changeType")
    budget: Budget | None = None
    travel_period: DatePeriod | MonthPeriod | None = Field(default=None, alias="travelPeriod")
    duration_days: Annotated[int, Field(ge=1)] | None = Field(default=None, alias="durationDays")
    departure_location: Annotated[str, Field(min_length=1, max_length=200)] | None = Field(
        default=None, alias="departureLocation"
    )
    travelers: Travelers | None = None
    limits: TravelLimits | None = None
    preferences: Preferences | None = None

    @model_validator(mode="after")
    def only_the_named_change(self) -> Self:
        expected = _FIELD[self.change_type]
        present = [name for name in _FIELD.values() if getattr(self, name) is not None]
        if present != [expected]:
            raise ValueError(f"changeType {self.change_type} requires only that field")
        return self
