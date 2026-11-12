"""Shared destination matching for disk loading and model context selection."""

import re
import unicodedata


def name_key(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    folded = unicodedata.normalize("NFKD", value.strip()).casefold()
    plain = "".join(c for c in folded if not unicodedata.combining(c)).replace("đ", "d")
    words = re.sub(r"[^a-z0-9]+", " ", plain).split()
    if words[:2] == ["thanh", "pho"]:
        words = words[2:]
    elif words[:1] == ["tp"]:
        words = words[1:]
    if words[-1:] == ["city"]:
        words = words[:-1]
    return " ".join(words) or None


def request_destination(request: dict) -> object:
    preferences = request.get("preferences")
    if isinstance(preferences, dict) and "destination" in preferences:
        return preferences["destination"]
    return request.get("preferredDestination")


def resolve_destination_id(selection: object, destinations: list[dict]) -> str | None:
    key = name_key(selection)
    if key is None:
        return None
    matches = {d["id"] for d in destinations if key == name_key(d.get("id"))}
    if not matches:
        matches = {
            d["id"] for d in destinations
            if any(key == name_key(d.get(field)) for field in ("name", "city", "city_name"))
            or any(key == name_key(alias) for alias in (d.get("aliases") or []))
        }
    return next(iter(matches)) if len(matches) == 1 else None
