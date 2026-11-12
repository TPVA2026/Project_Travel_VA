"""Conservative status for a place's planning price."""


def price_evidence_status(place: dict, *, dining: bool) -> str:
    field = "avgPricePerPersonVnd" if dining else "priceVnd"
    if place.get(field) is None:
        return "NO_DATA"
    status = place.get("priceStatus")
    if status == "ESTIMATED":
        return "UNVERIFIED"
    if status not in (None, "KNOWN", "VERIFIED"):
        return "UNVERIFIED"
    fields = place.get("unverifiedFields") or []
    if field in fields or "priceScope" in fields:
        return "UNVERIFIED"
    if "UNVERIFIED" in str(place.get("source", "")).upper():
        return "UNVERIFIED"
    return "KNOWN"
