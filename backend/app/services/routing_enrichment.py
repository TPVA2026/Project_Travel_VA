"""Prepare only required CandidatePlan legs for M4 using routing evidence."""

from __future__ import annotations

from copy import deepcopy

from app.algorithms.validation_common import known_number, route_reference
from app.services.routing_service import (
    ROUTE_AVAILABLE,
    RoutingService,
    routing_point,
)


def _place_index(dataset: dict) -> dict[str, dict]:
    return {
        place["id"]: place
        for collection in ("attractions", "dining")
        for place in dataset.get(collection, [])
        if isinstance(place, dict) and isinstance(place.get("id"), str)
    }


def _required_legs(plan: dict) -> list[tuple[str, str]]:
    legs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for day in plan.get("days", []):
        activities = day.get("activities", []) if isinstance(day, dict) else []
        for first, second in zip(activities, activities[1:]):
            pair = (first.get("placeId"), second.get("placeId"))
            if all(isinstance(item, str) for item in pair) and pair not in seen:
                seen.add(pair)
                legs.append(pair)
    return legs


def _existing_result(reference: dict, origin: str, destination: str, mode: str) -> dict:
    return {
        "status": ROUTE_AVAILABLE,
        "originPlaceId": origin,
        "destinationPlaceId": destination,
        "distanceKm": reference.get("distanceKm"),
        "durationMin": reference.get("durationMin"),
        "transportMode": mode,
        "provider": reference.get("provider", reference.get("source", "dataset")),
        "profile": reference.get("profile"),
        "evidenceStatus": "VERIFIED",
        "originReviewed": reference.get("originReviewed", True),
        "destinationReviewed": reference.get("destinationReviewed", True),
        "diagnostic": {
            "code": "EXISTING_VERIFIED_ROUTE",
            "message": "Reused existing verified routing evidence.",
        },
        "reused": True,
    }


def _merge_verified_route(dataset: dict, route: dict) -> None:
    rows = dataset.setdefault("travel_matrix", [])
    origin, destination = route["originPlaceId"], route["destinationPlaceId"]
    existing = next((row for row in rows if isinstance(row, dict)
                     and row.get("from") == origin and row.get("to") == destination), None)
    if existing is None:
        existing = {"from": origin, "to": destination}
        rows.append(existing)
    trusted_existing = route_reference(
        dataset, origin, destination, route.get("transportMode")
    ) is existing
    # Only a trusted repository value has priority. A number explicitly marked
    # provisional/unverified must not silently survive as authoritative data.
    if not trusted_existing or known_number(existing.get("distanceKm")) is None:
        existing["distanceKm"] = route["distanceKm"]
    if not trusted_existing or known_number(existing.get("durationMin")) is None:
        existing["durationMin"] = route["durationMin"]
    if not trusted_existing:
        existing.pop("status", None)
        existing["source"] = "OSRM"
        existing["provider"] = route["provider"]
        existing["profile"] = route["profile"]
        existing["evidenceStatus"] = "VERIFIED"
        existing["originReviewed"] = True
        existing["destinationReviewed"] = True
    else:
        existing.setdefault("provider", route["provider"])
        existing.setdefault("profile", route["profile"])
        existing.setdefault("evidenceStatus", "VERIFIED")
        existing.setdefault("originReviewed", True)
        existing.setdefault("destinationReviewed", True)


def enrich_routes(request: dict, plan: dict, dataset: dict,
                  service: RoutingService) -> tuple[dict, list[dict]]:
    """Return an enriched dataset copy plus public routing provenance.

    Disabled routing and legs outside the configured subset cause no provider
    call.  Provisional routes are reported but never inserted into the matrix
    consumed by M4.
    """
    config = service.config
    if not config.enabled:
        return dataset, []
    places = _place_index(dataset)
    preferences = request.get("preferences") or {}
    modes = preferences.get("transportation") or []
    mode = modes[0] if modes and isinstance(modes[0], str) else ""
    output_dataset = dataset
    results: list[dict] = []

    for origin, destination in _required_legs(plan):
        if origin not in config.allowed_place_ids or destination not in config.allowed_place_ids:
            continue
        reference = route_reference(dataset, origin, destination, mode)
        if (reference is not None
                and known_number(reference.get("distanceKm")) is not None
                and known_number(reference.get("durationMin")) is not None):
            results.append(_existing_result(reference, origin, destination, mode))
            continue
        origin_point = routing_point(places.get(origin), mode)
        destination_point = routing_point(places.get(destination), mode)
        route = service.get_route(origin_point, destination_point, mode)
        results.append(route)
        if route["status"] == ROUTE_AVAILABLE and route["evidenceStatus"] == "VERIFIED":
            if output_dataset is dataset:
                output_dataset = deepcopy(dataset)
            _merge_verified_route(output_dataset, route)
    return output_dataset, results
