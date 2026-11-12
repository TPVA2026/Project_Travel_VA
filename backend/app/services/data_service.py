"""Load the repository dataset through a conservative canonical adapter.

The JSON files remain the source of truth and are never modified. Legacy
display strings are retained; canonical numeric fields are only added when the
conversion is exact. Ambiguous ranges stay ``None``.
"""

from copy import deepcopy
from pathlib import Path
import json
import re
import unicodedata


DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as file:
        return json.load(file)


def _key(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    folded = unicodedata.normalize("NFKD", value.strip()).casefold()
    return "".join(char for char in folded if not unicodedata.combining(char))


def _exact_number(text: object, unit: str) -> int | float | None:
    """Parse one scalar with a known unit; reject ranges and extra numbers."""
    if isinstance(text, bool):
        return None
    if isinstance(text, (int, float)):
        return text if text >= 0 else None
    if not isinstance(text, str):
        return None
    normalized = text.strip().casefold()
    if unit == "vnd" and re.search(r"\b(from|tu|khoang|uoc tinh)\b", _key(normalized) or ""):
        return None
    if unit == "vnd" and normalized in {"mien phi", "miễn phí", "free"}:
        return 0
    if "-" in normalized or "–" in normalized:
        return None
    number_text = normalized.replace(",", ".")
    matches = re.findall(r"\d+(?:\.\d+)?", number_text)
    if len(matches) != 1:
        return None
    token = matches[0]
    if unit == "vnd" and re.fullmatch(r"\d{1,3}(?:\.\d{3})+", token):
        value = float(token.replace(".", ""))
    else:
        value = float(token)
    if unit == "vnd":
        key = _key(normalized) or ""
        multiplier = 1000 if re.search(r"(?:\bk\b|nghin)", key) else 1
        value *= multiplier
    return int(value) if value.is_integer() else value


def _destination_index(destinations: list[dict]) -> dict[str, str]:
    index: dict[str, str] = {}
    duplicates: set[str] = set()
    for destination in destinations:
        destination_id = destination.get("id")
        if not isinstance(destination_id, str) or not destination_id:
            continue
        for field in ("id", "city", "name", "city_name"):
            key = _key(destination.get(field))
            if not key:
                continue
            if key in index and index[key] != destination_id:
                duplicates.add(key)
            else:
                index[key] = destination_id
    for key in duplicates:
        index.pop(key, None)
    return index


def _normalize_place(raw: dict, destination_ids: dict[str, str], dining: bool) -> dict:
    item = deepcopy(raw)
    destination_id = item.get("destinationId")
    if not isinstance(destination_id, str) or destination_id not in destination_ids.values():
        destination_id = destination_ids.get(_key(item.get("city")))
    item["destinationId"] = destination_id
    item["openingHours"] = item.get("openingHours", item.get("opening_hours"))
    item["durationMin"] = _exact_number(
        item.get("durationMin", item.get("travel_time")), "minutes"
    )
    item["distanceKm"] = _exact_number(
        item.get("distanceKm", item.get("distance_from_center")), "km"
    )
    price_field = "avgPricePerPersonVnd" if dining else "priceVnd"
    item[price_field] = _exact_number(item.get(price_field, item.get("cost")), "vnd")
    if dining and item.get("priceScope", "perPerson") != "perPerson":
        item["avgPricePerPersonVnd"] = None
    return item


def _flatten_matrix(raw: object) -> list[dict]:
    if isinstance(raw, list):
        flattened: list[dict] = []
        for leg in raw:
            if not isinstance(leg, dict):
                continue
            item = deepcopy(leg)
            item["from"] = item.get("from", item.get("from_id"))
            item["to"] = item.get("to", item.get("to_id"))
            item["durationMin"] = item.get(
                "durationMin", item.get("duration_minutes")
            )
            item["distanceKm"] = item.get(
                "distanceKm", item.get("distance_km")
            )
            flattened.append(item)
        return flattened
    if not isinstance(raw, dict) or not isinstance(raw.get("destinations"), dict):
        return []
    flattened: list[dict] = []
    for destination in raw["destinations"].values():
        if not isinstance(destination, dict):
            continue
        for leg in destination.get("between_locations", []):
            if not isinstance(leg, dict):
                continue
            flattened.append({
                "from": leg.get("from_id"),
                "to": leg.get("to_id"),
                "durationMin": leg.get("duration_minutes"),
                "distanceKm": leg.get("distance_km"),
                "status": leg.get("status"),
                "sourceUrl": leg.get("map_directions_url"),
            })
    return flattened


def normalize_dataset(raw: dict) -> dict:
    """Return a new canonical dataset without mutating ``raw``."""
    destinations = deepcopy(raw.get("destinations", []))
    destination_ids = _destination_index(destinations)
    return {
        "destinations": destinations,
        "attractions": [
            _normalize_place(item, destination_ids, False)
            for item in raw.get("attractions", []) if isinstance(item, dict)
        ],
        "dining": [
            _normalize_place(item, destination_ids, True)
            for item in raw.get("dining", raw.get("restaurants", [])) if isinstance(item, dict)
        ],
        "travel_matrix": _flatten_matrix(
            raw.get("travel_matrix", raw.get("travelMatrix", []))
        ),
    }


def _apply_routing_points(dataset: dict, raw: object) -> dict:
    """Attach reviewed routing points to the normalized copy, never snapshots."""
    if not isinstance(raw, dict) or not isinstance(raw.get("points"), list):
        raise ValueError("Invalid reviewed routing point overlay")
    points: dict[str, dict] = {}
    for item in raw["points"]:
        if (not isinstance(item, dict) or not isinstance(item.get("placeId"), str)
                or item.get("reviewed") is not True):
            raise ValueError("Invalid reviewed routing point")
        place_id = item["placeId"]
        if place_id in points:
            raise ValueError("Duplicate reviewed routing point")
        points[place_id] = {
            key: deepcopy(value) for key, value in item.items() if key != "placeId"
        }
    found: set[str] = set()
    for collection in ("attractions", "dining"):
        for place in dataset.get(collection, []):
            if isinstance(place, dict) and place.get("id") in points:
                place["routingPoint"] = deepcopy(points[place["id"]])
                found.add(place["id"])
    if found != set(points):
        raise ValueError("Reviewed routing point references an unknown place")
    return dataset


def load_dataset() -> dict:
    raw = {
        "destinations": _load("destinations.json"),
        "attractions": _load("attractions.json"),
        "dining": _load("restaurants.json"),
        "travel_matrix": _load("travel_matrix.json"),
    }
    imported = DATA_DIR / "opentripmap_attractions.json"
    if imported.exists():
        with imported.open(encoding="utf-8") as file:
            extra = json.load(file)
        if not isinstance(extra, list) or not all(isinstance(place, dict) for place in extra):
            raise ValueError("Invalid OpenTripMap attraction snapshot")
        existing_ids = {place.get("id") for place in raw["attractions"]}
        raw["attractions"].extend(place for place in extra if place.get("id") not in existing_ids)
    national = DATA_DIR / "opentripmap_vietnam.json"
    national_enabled = national.exists()
    if national_enabled:
        with national.open(encoding="utf-8") as file:
            nationwide = json.load(file)
        if (not isinstance(nationwide, dict)
                or not isinstance(nationwide.get("destinations"), list)
                or not isinstance(nationwide.get("attractions"), list)):
            raise ValueError("Invalid nationwide OpenTripMap snapshot")
        destination_ids = {item.get("id") for item in raw["destinations"]}
        raw["destinations"].extend(
            item for item in nationwide["destinations"]
            if isinstance(item, dict) and item.get("id") not in destination_ids
        )
        attraction_ids = {item.get("id") for item in raw["attractions"]}
        raw["attractions"].extend(
            item for item in nationwide["attractions"]
            if isinstance(item, dict) and item.get("id") not in attraction_ids
        )
    normalized = normalize_dataset(raw)
    routing_points = DATA_DIR / "routing_points.json"
    if routing_points.exists():
        with routing_points.open(encoding="utf-8") as file:
            normalized = _apply_routing_points(normalized, json.load(file))
    return normalized


def get_destinations() -> list[dict]:
    destinations = load_dataset()["destinations"]
    if not all(isinstance(item, dict) for item in destinations):
        raise ValueError("Each destination must be an object")
    return destinations
