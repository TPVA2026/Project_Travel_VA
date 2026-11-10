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
    return item


def _flatten_matrix(raw: object) -> list[dict]:
    if isinstance(raw, list):
        return deepcopy(raw)
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
    return normalize_dataset(raw)


def get_destinations() -> list[dict]:
    destinations = load_dataset()["destinations"]
    if not all(isinstance(item, dict) for item in destinations):
        raise ValueError("Each destination must be an object")
    return destinations
