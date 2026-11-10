"""Import named attractions from OpenTripMap into a local planning snapshot."""

import os
import re

import httpx


BASE_URL = "https://api.opentripmap.com/0.1"


class OpenTripMapError(Exception):
    pass


def _get(client: httpx.Client, path: str, params: dict) -> object:
    try:
        response = client.get(path, params=params)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Request URLs contain the API key; never include exception text.
        raise OpenTripMapError("OpenTripMap request failed") from None


def fetch_attractions(destinations: list[dict], *, api_key: str | None = None,
                      radius: int = 10000, limit: int = 50,
                      language: str = "en", client: httpx.Client | None = None) -> list[dict]:
    """Fetch one page per destination; unknown costs/hours/durations remain unset."""
    api_key = api_key or os.getenv("OPENTRIPMAP_API_KEY")
    if not api_key:
        raise OpenTripMapError("OPENTRIPMAP_API_KEY is required")
    if not 1 <= radius <= 50000 or not 1 <= limit <= 500:
        raise ValueError("radius or limit is out of range")
    if not re.fullmatch(r"[a-z]{2}", language):
        raise ValueError("language must be a two-letter code")

    def collect(http: httpx.Client) -> list[dict]:
        places, seen = [], set()
        for destination in destinations:
            city, destination_id = destination["city"], destination["id"]
            geo = _get(http, f"/{language}/places/geoname", {"name": city, "apikey": api_key})
            if not isinstance(geo, dict) or geo.get("status") != "OK":
                raise OpenTripMapError(f"OpenTripMap could not locate destination {destination_id}")
            try:
                lat, lon = float(geo["lat"]), float(geo["lon"])
            except (KeyError, TypeError, ValueError):
                raise OpenTripMapError(f"Invalid coordinates for destination {destination_id}") from None
            results = _get(http, f"/{language}/places/radius", {
                "radius": radius, "limit": limit, "lon": lon, "lat": lat,
                "rate": 2, "format": "json", "kinds": "interesting_places",
                "apikey": api_key,
            })
            if not isinstance(results, list):
                raise OpenTripMapError(f"Invalid place list for destination {destination_id}")
            for item in results:
                if not isinstance(item, dict):
                    continue
                xid, name = item.get("xid"), item.get("name")
                if not isinstance(xid, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", xid):
                    continue
                if not isinstance(name, str) or not name.strip():
                    continue
                place_id = f"OTM_{destination_id}_{xid}"
                if place_id in seen:
                    continue
                seen.add(place_id)
                point = item.get("point") if isinstance(item.get("point"), dict) else {}
                places.append({
                    "id": place_id, "destinationId": destination_id, "city": city,
                    "name": name.strip(), "source": "OpenTripMap", "sourceId": xid,
                    "sourceUrl": f"https://opentripmap.com/en/card/{xid}",
                    "kinds": item.get("kinds"),
                    "latitude": point.get("lat"), "longitude": point.get("lon"),
                    "distanceKm": round(item["dist"] / 1000, 3)
                    if isinstance(item.get("dist"), (int, float)) and item["dist"] >= 0 else None,
                    "priceVnd": None, "durationMin": None, "openingHours": None,
                })
        return places

    if client is not None:
        return collect(client)
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as http:
        return collect(http)
