"""Extract travel preferences from account-owned saved trips."""

from app.services.trip_store import list_trips, get_trip


def get_trip_history(owner_id, destination_id, limit=3):
    if not owner_id or not destination_id:
        return []

    history = []

    for item in list_trips(owner_id):
        saved = get_trip(owner_id, item["id"])

        if not saved:
            continue

        itinerary = saved.get("itinerary", {})

        if itinerary.get("destinationId") != destination_id:
            continue

        days = []

        for day in itinerary.get("days", []):
            places = []

            for activity in day.get("activities", []):
                place_id = activity.get("placeId")

                if isinstance(place_id, str) and place_id not in places:
                    places.append(place_id)

            if places:
                days.append({
                    "placeIds": places
                })

        if days:
            history.append({"days": days})

        if len(history) >= limit:
            break

    return history
