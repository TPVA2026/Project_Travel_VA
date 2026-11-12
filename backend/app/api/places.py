"""Display metadata for the exact places referenced by a client itinerary."""

from fastapi import APIRouter, HTTPException, Query

from app.services.data_service import load_dataset

router = APIRouter(prefix="/api/v1/places", tags=["Places"])


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
                places.append({**{key: place.get(key) for key in fields}, "type": kind})
    return {"places": places}
