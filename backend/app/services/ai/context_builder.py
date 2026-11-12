"""Retrieve the dataset context sent to the LLM (M3).

Input : the curated dataset as returned by data_service.load_dataset()
        ({destinations, attractions, dining, travel_matrix}; a camelCase `travelMatrix` is also accepted).
Output: the prompt shape {destinations, attractions, dining, travelMatrix}.

Rules (so the LLM can only reference real, supported data):
- Only records with a well-formed, unique string `id` are kept. Others are dropped (and logged).
  Ids are never generated, repaired or guessed.
- Read `preferences.destination`; legacy `preferredDestination` is a fallback only.
  Resolve exact IDs or unambiguous dataset name/city/city_name values.
  Filter places using explicit destinationId only; never infer membership from ID prefixes.
  Missing destination IDs or unsupported/ambiguous selections yield an EMPTY context.
- Each place type keeps only its own price field (attractions: priceVnd, dining: avgPricePerPersonVnd);
  the other type's price key is dropped so an unvalidated value can never be read as a price.
- Costs, durations and distances are copied as-is. Missing, non-numeric, negative or non-finite
  values become None (= "No data available"); they are never defaulted to 0 or estimated.
- Travel legs are kept only between retrieved places; no leg is ever invented.
"""
import logging
import math
import re
import unicodedata
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StrictStr, ValidationError, field_validator, model_validator

from app.services.ai.opening_hours import normalize_opening_hours
from app.algorithms.validation_common import route_reference

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


def _without(data: Any, key: str) -> Any:
    """Copy of a raw record minus `key` (input is never mutated); non-dicts fail validation later."""
    return {k: v for k, v in data.items() if k != key} if isinstance(data, dict) else data


class _Attraction(_Place):
    priceVnd: int | float | None = None

    @model_validator(mode="before")
    @classmethod
    def _no_dining_price(cls, data):
        return _without(data, "avgPricePerPersonVnd")

    @field_validator("priceVnd", mode="before")
    @classmethod
    def _price(cls, v):
        return _num_or_none(v)


class _Dining(_Place):
    avgPricePerPersonVnd: int | float | None = None

    @model_validator(mode="before")
    @classmethod
    def _no_attraction_price(cls, data):
        return _without(data, "priceVnd")

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


def valid_destination_ids(dataset: dict) -> set[str]:
    """Only explicit, well-formed dataset IDs can establish a destination."""
    return {
        d["id"] for d in dataset.get("destinations", [])
        if isinstance(d, dict) and isinstance(d.get("id"), str)
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", d["id"])
    }


def _destination_of(record: _Record) -> str | None:
    dest = (record.model_extra or {}).get("destinationId")
    return dest if isinstance(dest, str) and dest else None


def _empty() -> dict:
    return {"destinations": [], "attractions": [], "dining": [], "travelMatrix": []}


def _name_key(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    folded = unicodedata.normalize("NFKD", value.strip()).casefold()
    plain = "".join(char for char in folded if not unicodedata.combining(char))
    words = re.sub(r"[^a-z0-9]+", " ", plain).split()
    if words[:2] == ["thanh", "pho"]:
        words = words[2:]
    elif words[:1] == ["tp"]:
        words = words[1:]
    if words[-1:] == ["city"]:
        words = words[:-1]
    return " ".join(words) or None



def _rank_places(places: list, request: dict) -> list:
    """Rank supported places by preference match, evidence and data completeness."""
    preferences = request.get("preferences") or {}
    if not isinstance(preferences, dict):
        preferences = {}

    interests = preferences.get("interests", request.get("interests", []))
    if not isinstance(interests, list):
        interests = []

    terms = [value.casefold().strip() for value in interests
             if isinstance(value, str) and value.strip()]

    dining_preferences = request.get("dining") or {}
    if isinstance(dining_preferences, dict):
        likes = dining_preferences.get("likes") or []
        if isinstance(likes, list):
            terms.extend(
                value.casefold().strip()
                for value in likes
                if isinstance(value, str) and value.strip()
            )


    def score(place):
        data = place.model_dump(by_alias=True)
        searchable = " ".join(
            str(data.get(key) or "")
            for key in ("name", "category", "description", "tags")
        ).casefold()

        matches = sum(term in searchable for term in terms)
        source = str(data.get("source") or "")
        curated = source != "OpenTripMap"
        completeness = sum(
            data.get(key) is not None
            for key in ("durationMin", "priceVnd", "avgPricePerPersonVnd")
        )

        return (-matches, -int(curated), -completeness, place.id)

    return sorted(places, key=score)

def build_context(request: dict, dataset: dict) -> dict:
    preferences = request.get("preferences") if isinstance(request, dict) else None
    if isinstance(preferences, dict) and "destination" in preferences:
        wanted = preferences["destination"]
    else:
        wanted = request.get("preferredDestination") if isinstance(request, dict) else None

    destinations = _unique(_parse(_Destination, dataset.get("destinations"), "destination"), set(), "destination")
    if not destinations:
        return _empty()
    nationwide = any(destination.id.startswith("VN_") for destination in destinations)
    if nationwide and wanted is None:
        return _empty()  # a country-wide snapshot cannot fit in one model prompt
    if wanted is not None:
        if not isinstance(wanted, str) or not wanted.strip():
            return _empty()
        wanted = wanted.strip()
        wanted_key = _name_key(wanted)
        matches = {d.id for d in destinations if wanted_key == _name_key(d.id)}
        if not matches:
            matches = {
                d.id for d in destinations
                if any(wanted_key == _name_key((d.model_extra or {}).get(key))
                       for key in ("name", "city", "city_name"))
            }
        if len(matches) != 1:
            return _empty()  # never guess a destination or broaden the search
        wanted = matches.pop()
        destinations = [d for d in destinations if d.id == wanted]

    seen: set[str] = set()  # place ids must be unique across attractions AND dining
    attractions = _unique(_parse(_Attraction, dataset.get("attractions"), "attraction"), seen, "place")
    dining = _unique(_parse(_Dining, dataset.get("dining"), "dining"), seen, "place")
    if wanted is not None:
        attractions = [p for p in attractions if _destination_of(p) == wanted]
        dining = [p for p in dining if _destination_of(p) == wanted]
    if attractions:
        curated = [
            p for p in attractions
            if (p.model_extra or {}).get("source") != "OpenTripMap"
        ]
        imported = [
            p for p in attractions
            if (p.model_extra or {}).get("source") == "OpenTripMap"
        ]

        curated = _rank_places(curated, request)
        imported = _rank_places(imported, request)

        imported_limit = max(0, 30 - len(curated))
        attractions = curated + imported[:imported_limit]

    dining = _rank_places(dining, request)

    ids = {p.id for p in attractions} | {p.id for p in dining}
    matrix_raw = dataset.get("travel_matrix", dataset.get("travelMatrix"))
    modes = (request.get("preferences") or {}).get("transportation") or []
    transport_mode = modes[0] if modes and isinstance(modes[0], str) else None
    legs, pairs = [], set()
    for leg in _parse(_Leg, matrix_raw, "travel leg"):
        pair = (leg.from_, leg.to)
        if leg.from_ == leg.to or leg.from_ not in ids or leg.to not in ids or pair in pairs:
            continue  # only legs between retrieved places; never invent or repeat one
        pairs.add(pair)
        if route_reference(dataset, leg.from_, leg.to, transport_mode) is None:
            leg = leg.model_copy(update={"durationMin": None, "distanceKm": None})
        legs.append(leg)

    return {
        "destinations": [d.model_dump(by_alias=True) for d in destinations],
        "attractions": [
            {**p.model_dump(by_alias=True),
             "openingHours": normalize_opening_hours(p.model_dump(by_alias=True))}
            for p in attractions
        ],
        "dining": [
            {**p.model_dump(by_alias=True),
             "openingHours": normalize_opening_hours(p.model_dump(by_alias=True))}
            for p in dining
        ],
        "travelMatrix": [leg.model_dump(by_alias=True) for leg in legs],
    }


def supported_place_ids(context: dict) -> set[str]:
    """Ids of every place the LLM is allowed to reference."""
    return {p["id"] for p in [*context.get("attractions", []), *context.get("dining", [])]}
