"""Retrieve the dataset context sent to the LLM (M3).

Input : the curated dataset as returned by data_service.load_dataset()
        ({destinations, attractions, dining, travel_matrix}; a camelCase `travelMatrix` is also accepted).
Output: the prompt shape {destinations, attractions, dining, travelMatrix}.

Rules (so the LLM can only reference real, supported data):
- Only records with a well-formed, unique string `id` are kept. Others are dropped (and logged).
  Ids are never generated, repaired or guessed.
- If the request names a `preferredDestination`, only that destination and its places are kept.
  A place belongs to a destination via its `destinationId` field, or else the prefix of its id
  ("DN-ATT-001" -> "DN"). An unknown/unsupported destination yields an EMPTY context.
- Costs, durations and distances are copied as-is. Missing, non-numeric, negative or non-finite
  values become None (= "No data available"); they are never defaulted to 0 or estimated.
- Travel legs are kept only between retrieved places; no leg is ever invented.
"""
import logging
import math
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StrictStr, ValidationError, field_validator

log = logging.getLogger(__name__)

PlaceId = Annotated[StrictStr, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")]


def _num_or_none(value: Any):
    """Keep a valid non-negative finite number (0 is a real value); anything else is unknown."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return value


class _Record(BaseModel):
    # extra="allow": curated fields we do not know about (name, category, source, ...) pass through untouched.
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: PlaceId


class _Destination(_Record):
    pass


class _Place(_Record):
    durationMin: int | float | None = None
    openHours: Any = None  # structure not fixed yet: pass through, never invent

    @field_validator("durationMin", mode="before")
    @classmethod
    def _duration(cls, v):
        return _num_or_none(v)


class _Attraction(_Place):
    priceVnd: int | float | None = None

    @field_validator("priceVnd", mode="before")
    @classmethod
    def _price(cls, v):
        return _num_or_none(v)


class _Dining(_Place):
    avgPricePerPersonVnd: int | float | None = None

    @field_validator("avgPricePerPersonVnd", mode="before")
    @classmethod
    def _price(cls, v):
        return _num_or_none(v)


class _Leg(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    from_: PlaceId = Field(alias="from")
    to: PlaceId
    durationMin: int | float | None = None
    distanceKm: int | float | None = None

    @field_validator("durationMin", "distanceKm", mode="before")
    @classmethod
    def _num(cls, v):
        return _num_or_none(v)


def _parse(model, raw_items, kind: str) -> list:
    out = []
    for raw in raw_items or []:
        try:
            out.append(model.model_validate(raw))
        except ValidationError:
            label = raw.get("id") if isinstance(raw, dict) else raw
            log.warning("context_builder: dropped %s record with invalid id/shape: %r", kind, label)
    return out


def _unique(records: list, seen: set, kind: str) -> list:
    out = []
    for r in records:
        if r.id in seen:
            log.warning("context_builder: dropped duplicate %s id %s", kind, r.id)
            continue
        seen.add(r.id)
        out.append(r)
    return out


def _destination_of(record: _Record) -> str:
    dest = (record.model_extra or {}).get("destinationId")
    return dest if isinstance(dest, str) and dest else record.id.split("-", 1)[0]


def _empty() -> dict:
    return {"destinations": [], "attractions": [], "dining": [], "travelMatrix": []}


def build_context(request: dict, dataset: dict) -> dict:
    wanted = request.get("preferredDestination") if isinstance(request, dict) else None

    destinations = _unique(_parse(_Destination, dataset.get("destinations"), "destination"), set(), "destination")
    if wanted is not None:
        if not isinstance(wanted, str) or wanted not in {d.id for d in destinations}:
            return _empty()  # unsupported destination: retrieve nothing rather than guess
        destinations = [d for d in destinations if d.id == wanted]

    seen: set[str] = set()  # place ids must be unique across attractions AND dining
    attractions = _unique(_parse(_Attraction, dataset.get("attractions"), "attraction"), seen, "place")
    dining = _unique(_parse(_Dining, dataset.get("dining"), "dining"), seen, "place")
    if wanted is not None:
        attractions = [p for p in attractions if _destination_of(p) == wanted]
        dining = [p for p in dining if _destination_of(p) == wanted]

    ids = {p.id for p in attractions} | {p.id for p in dining}
    matrix_raw = dataset.get("travel_matrix", dataset.get("travelMatrix"))
    legs, pairs = [], set()
    for leg in _parse(_Leg, matrix_raw, "travel leg"):
        pair = (leg.from_, leg.to)
        if leg.from_ == leg.to or leg.from_ not in ids or leg.to not in ids or pair in pairs:
            continue  # only legs between retrieved places; never invent or repeat one
        pairs.add(pair)
        legs.append(leg)

    return {
        "destinations": [d.model_dump(by_alias=True) for d in destinations],
        "attractions": [p.model_dump(by_alias=True) for p in attractions],
        "dining": [p.model_dump(by_alias=True) for p in dining],
        "travelMatrix": [leg.model_dump(by_alias=True) for leg in legs],
    }


def supported_place_ids(context: dict) -> set[str]:
    """Ids of every place the LLM is allowed to reference."""
    return {p["id"] for p in [*context.get("attractions", []), *context.get("dining", [])]}
