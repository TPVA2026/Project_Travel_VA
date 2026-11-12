"""Normalize dataset opening hours without inventing missing information."""

import re


def normalize_opening_hours(place: dict) -> dict:
    raw = place.get("openingHours", place.get("openHours"))

    if isinstance(raw, dict):
        if raw.get("scheduleType") == "DAILY":
            return raw
        if raw.get("scheduleType") == "ALWAYS":
            return raw
        return {"status": "UNKNOWN", "raw": raw.get("raw")}

    unverified = place.get("unverifiedFields") or []
    is_unverified = (
        "openingHours" in unverified
        or "openHours" in unverified
    )

    if raw is None or not isinstance(raw, str) or not raw.strip():
        return {"status": "UNKNOWN"}

    raw = raw.strip()
    status = "UNVERIFIED" if is_unverified else "REPORTED"

    if raw == "24/7":
        return {
            "status": status,
            "scheduleType": "ALWAYS",
            "raw": raw,
        }

    match = re.fullmatch(
        r"((?:[01]\d|2[0-3]):[0-5]\d)\s*-\s*((?:[01]\d|2[0-3]):[0-5]\d)",
        raw,
    )

    if match:
        return {
            "status": status,
            "scheduleType": "DAILY",
            "open": match.group(1),
            "close": match.group(2),
            "raw": raw,
        }

    return {
        "status": "UNKNOWN",
        "raw": raw,
    }


def check_activity_hours(activity: dict, place: dict) -> str | None:
    hours = normalize_opening_hours(place)

    if hours.get("scheduleType") != "DAILY":
        return None

    start = activity.get("startTime")
    end = activity.get("endTime")

    if not isinstance(start, str) or not isinstance(end, str):
        return None

    if not (hours["open"] <= start < end <= hours["close"]):
        return (
            f"{activity.get('placeId')}: activity {start}-{end} "
            f"outside dataset opening hours "
            f"{hours['open']}-{hours['close']}"
        )

    return None
