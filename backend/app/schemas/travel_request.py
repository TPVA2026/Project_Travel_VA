"""Pydantic TravelRequest. Field names on the wire are camelCase.

The shared contract is backend/app/schemas/travelRequest.schema.json.
Keep both in step when a field changes. M3 reads this object as prompt
context. M4 treats budget, durationDays, travelers.count, and any
present limits as mandatory constraints.
"""

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

InterestType = Literal["sightseeing", "culture", "nature", "relaxation"]
BudgetScope = Literal["perPerson", "group"]
LimitScope = Literal["fromDeparture", "betweenActivities", "daily"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class DatePeriod(ApiModel):
    start_date: date = Field(alias="startDate")
    end_date: date | None = Field(default=None, alias="endDate")

    @model_validator(mode="after")
    def end_on_or_after_start(self) -> Self:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("endDate must be on or after startDate")
        return self


class MonthPeriod(ApiModel):
    month: Annotated[str, Field(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$")]


class Travelers(ApiModel):
    count: Annotated[int, Field(ge=1)]
    characteristics: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(
        default_factory=list
    )


class Budget(ApiModel):
    amount: Annotated[int, Field(ge=0)]
    currency: Literal["VND"]
    scope: BudgetScope


class TravelLimits(ApiModel):
    max_distance_km: float | None = Field(default=None, alias="maxDistanceKm", gt=0)
    max_travel_time_minutes: int | None = Field(
        default=None, alias="maxTravelTimeMinutes", gt=0
    )
    applies_to: LimitScope = Field(alias="appliesTo")

    @model_validator(mode="after")
    def require_a_numeric_limit(self) -> Self:
        if self.max_distance_km is None and self.max_travel_time_minutes is None:
            raise ValueError("limits need maxDistanceKm or maxTravelTimeMinutes")
        return self


class Interest(ApiModel):
    type: InterestType
    priority: Annotated[int, Field(ge=1, le=4)] | None = None


class DiningPreferences(ApiModel):
    preferred: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(
        default_factory=list
    )
    avoid: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(
        default_factory=list
    )


class Preferences(ApiModel):
    destination: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    transportation: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(
        default_factory=list
    )
    interests: list[Interest] = Field(default_factory=list)
    dining: DiningPreferences | None = None


class TravelRequest(ApiModel):
    travel_period: DatePeriod | MonthPeriod = Field(alias="travelPeriod")
    duration_days: Annotated[int, Field(ge=1, alias="durationDays")]
    departure_location: Annotated[str, Field(min_length=1, max_length=200)] = Field(
        alias="departureLocation"
    )
    travelers: Travelers
    budget: Budget
    limits: TravelLimits | None = None
    preferences: Preferences | None = None

    @model_validator(mode="after")
    def duration_matches_dates(self) -> Self:
        period = self.travel_period
        if isinstance(period, DatePeriod) and period.end_date is not None:
            span = (period.end_date - period.start_date).days + 1
            if self.duration_days != span:
                raise ValueError(
                    "durationDays must equal the inclusive number of days "
                    "from startDate to endDate"
                )
        return self
