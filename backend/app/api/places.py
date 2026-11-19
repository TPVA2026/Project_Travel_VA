"""Display metadata for the exact places referenced by a client itinerary."""

from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query

from app.services.data_service import load_dataset

router = APIRouter(prefix="/api/v1/places", tags=["Places"])


def _http_url(value) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value:
        return None
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return value


def _source_metadata(place: dict) -> dict:
    """Pick the source a traveler can open, preferring the curated source."""
    entries = place.get("sources") if isinstance(place.get("sources"), list) else []
    source_url = None
    for candidate in (
        place.get("sourceUrl"),
        place.get("preferredSourceUrl"),
        place.get("source"),
    ):
        source_url = _http_url(candidate)
        if source_url:
            break
    if source_url is None:
        for entry in entries:
            if isinstance(entry, dict):
                source_url = _http_url(entry.get("url"))
                if source_url:
                    break

    publisher = None
    if source_url:
        for entry in entries:
            if isinstance(entry, dict) and entry.get("url") == source_url:
                candidate = entry.get("publisher")
                if isinstance(candidate, str) and candidate.strip():
                    publisher = candidate.strip()
                    break
        if publisher is None:
            publisher = urlparse(source_url).netloc.removeprefix("www.") or None

    return {"source": publisher, "sourceUrl": source_url}


@router.get("")
def list_places(ids: list[str] = Query(default=[], max_length=500), destination: str | None = None):
    if not ids:
        return {"places": []}
    try:
        dataset = load_dataset(destination=destination)
    except (OSError, ValueError):
        raise HTTPException(status_code=500, detail="Unable to load place metadata.") from None
    wanted = set(ids)
    fields = ("id", "name", "destinationId", "city", "address", "openingHours", "priceDisplay")
    places = []
    for collection, kind in (("attractions", "sightseeing"), ("dining", "dining"), ("hotels", "accommodation")):
        for place in dataset.get(collection, []):
            if place["id"] in wanted:
                places.append(
                    {
                        **{key: place.get(key) for key in fields},
                        **_source_metadata(place),
                        "type": kind,
                    }
                )
    return {"places": places}
