"""Pydantic models for the CandidatePlan contract (M3).

Mirrors `candidate_plan.schema.json` (the contract shared with M4/M5/M6) and is the gate every
LLM answer must pass before anything else looks at it. It is deliberately STRICTER than the JSON schema:

- `extra="forbid"`: the model cannot smuggle in fields such as `score`, `verified` or `status`
  (AI scores/flags are never part of the contract, so they can never be read as verified).
- numbers must be real, finite, non-negative JSON numbers (no bool, no string, no NaN).
- `NO_DATA` <=> null cost: an unknown cost is null, never 0; a `KNOWN` cost is never null.
- dates must exist on the calendar; `activityId` must be unique inside a plan.

Rules that need the curated dataset (placeId exists, cost equals the dataset price, ...) live in
`itinerary_generator.check_grounding`; rules about feasibility (budget, opening hours, ...) belong to M4.
"""
import datetime as _dt
import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr, field_validator, model_validator

Id = Annotated[StrictStr, Field(min_length=1)]
HHMM = Annotated[StrictStr, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
ISODate = Annotated[StrictStr, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Number = StrictInt | StrictFloat  # JSON number only (StrictInt also rejects bool)


def _non_negative(value):
    """Unknown stays None; a number must be finite and >= 0."""
    if value is not None and (not math.isfinite(value) or value < 0):
        raise ValueError("must be a finite number >= 0 (use null when unknown)")
    return value


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Activity(_Strict):
    activityId: Id
    placeId: Id
    type: Literal["sightseeing", "dining"]
    startTime: HHMM
    endTime: HHMM
    estimatedCostVnd: Number | None
    costStatus: Literal["KNOWN", "UNVERIFIED", "NO_DATA"]
    reason: StrictStr

    @field_validator("estimatedCostVnd")
    @classmethod
    def _cost_non_negative(cls, v):
        return _non_negative(v)

    @model_validator(mode="after")
    def _cost_agrees_with_status(self):
        if self.costStatus == "KNOWN" and self.estimatedCostVnd is None:
            raise ValueError("costStatus KNOWN needs a number; an unknown cost must be null with NO_DATA")
        if self.costStatus == "NO_DATA" and self.estimatedCostVnd is not None:
            raise ValueError("costStatus NO_DATA requires estimatedCostVnd null (never 0 for unknown)")
        return self


class TravelLeg(_Strict):
    fromPlaceId: Id
    toPlaceId: Id
    durationMin: Number | None
    distanceKm: Number | None

    @field_validator("durationMin", "distanceKm")
    @classmethod
    def _non_negative_or_unknown(cls, v):
        return _non_negative(v)


class Day(_Strict):
    dayNumber: Annotated[StrictInt, Field(ge=1)]
    date: ISODate
    activities: list[Activity]
    travelLegs: list[TravelLeg]

    @field_validator("date")
    @classmethod
    def _real_date(cls, v):
        try:
            _dt.date.fromisoformat(v)
        except ValueError:
            raise ValueError("not a real calendar date") from None
        return v


class CandidatePlan(_Strict):
    planId: Id
    title: StrictStr
    destinationId: Id
    days: Annotated[list[Day], Field(min_length=1)]
    missingData: list[StrictStr]
    assumptions: list[StrictStr]

    @model_validator(mode="after")
    def _unique_activity_ids(self):
        ids = [a.activityId for d in self.days for a in d.activities]
        dup = sorted({i for i in ids if ids.count(i) > 1})
        if dup:
            raise ValueError(f"duplicate activityId: {', '.join(dup)}")
        return self
