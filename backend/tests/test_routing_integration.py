"""Offline routing enrichment and Huế M4 integration tests."""

from copy import deepcopy

import httpx

from app.algorithms.feasibility import evaluate_feasibility
from app.services.planning_service import evaluate_plan
from app.services.routing_enrichment import enrich_routes
from app.services.routing_service import (
    ROUTE_AVAILABLE,
    ROUTE_REVIEW_REQUIRED,
    ROUTING_UNAVAILABLE,
    RoutingConfig,
    RoutingService,
)


def osrm_payload(distance=2500, duration=900):
    return {
        "code": "Ok",
        "routes": [{"distance": distance, "duration": duration}],
        "waypoints": [
            {"location": [107.5909, 16.4637]},
            {"location": [107.6000, 16.4700]},
        ],
    }


def router(handler, ids=("hue-a", "hue-b")):
    config = RoutingConfig(
        enabled=True,
        base_url="https://router.test",
        allowed_place_ids=frozenset(ids),
        max_snap_distance_meters=100,
        cache_size=8,
    )
    return RoutingService(config, httpx.Client(transport=httpx.MockTransport(handler)))


def small_case(reviewed=True):
    request = {
        "travelPeriod": {"startDate": "2026-11-12"},
        "durationDays": 1,
        "departureLocation": "Huế",
        "travelers": {"count": 1},
        "budget": {"amount": 1_000_000, "currency": "VND", "scope": "group"},
        "preferences": {"destination": "HUE", "transportation": ["car"]},
    }
    plan = {
        "planId": "hue-route", "title": "Huế deterministic", "destinationId": "HUE",
        "missingData": ["prices", "opening hours"], "assumptions": [],
        "days": [{
            "dayNumber": 1, "date": "2026-11-12",
            "activities": [
                {"activityId": "a1", "placeId": "hue-a", "type": "sightseeing",
                 "startTime": "08:00", "endTime": "09:00", "estimatedCostVnd": None,
                 "costStatus": "NO_DATA", "reason": "Visit"},
                {"activityId": "a2", "placeId": "hue-b", "type": "sightseeing",
                 "startTime": "09:30", "endTime": "10:30", "estimatedCostVnd": None,
                 "costStatus": "NO_DATA", "reason": "Visit"},
            ],
            "travelLegs": [{"fromPlaceId": "hue-a", "toPlaceId": "hue-b",
                            "durationMin": None, "distanceKm": None}],
        }],
    }
    points = [
        ("hue-a", 16.4637, 107.5909),
        ("hue-b", 16.4700, 107.6000),
    ]
    attractions = []
    for place_id, latitude, longitude in points:
        place = {
            "id": place_id, "destinationId": "HUE", "name": place_id,
            "source": "OpenTripMap", "latitude": latitude, "longitude": longitude,
            "priceVnd": None, "durationMin": None, "openingHours": None,
        }
        if reviewed:
            place["routingPoint"] = {
                "latitude": latitude, "longitude": longitude,
                "reviewed": True, "profile": "driving",
                "source": "manual_mvp_review",
            }
        attractions.append(place)
    dataset = {
        "destinations": [{"id": "HUE", "city": "Huế"}],
        "attractions": attractions,
        "dining": [],
        "travel_matrix": [],
    }
    return request, plan, dataset


def test_verified_existing_route_is_reused_and_not_overwritten():
    request, plan, dataset = small_case()
    dataset["travel_matrix"] = [{
        "from": "hue-a", "to": "hue-b", "durationMin": 12, "distanceKm": 3,
        "source": "reviewed fixture",
    }]
    service = router(lambda request: (_ for _ in ()).throw(AssertionError("no provider call")))
    enriched, routes = enrich_routes(request, plan, dataset, service)
    assert enriched is dataset
    assert routes[0]["reused"] is True
    assert routes[0]["durationMin"] == 12


def test_partial_verified_values_are_preserved_when_osrm_fills_gap():
    request, plan, dataset = small_case()
    dataset["travel_matrix"] = [{
        "from": "hue-a", "to": "hue-b", "durationMin": 12, "distanceKm": None,
    }]
    service = router(lambda request: httpx.Response(200, json=osrm_payload()))
    enriched, routes = enrich_routes(request, plan, dataset, service)
    assert routes[0]["status"] == ROUTE_AVAILABLE
    assert enriched["travel_matrix"][0]["durationMin"] == 12
    assert enriched["travel_matrix"][0]["distanceKm"] == 2.5
    assert dataset["travel_matrix"][0]["distanceKm"] is None


def test_unverified_existing_values_are_replaced_not_promoted():
    request, plan, dataset = small_case()
    dataset["travel_matrix"] = [{
        "from": "hue-a", "to": "hue-b", "durationMin": 999, "distanceKm": 999,
        "source": "unverified import", "evidenceStatus": "PROVISIONAL",
    }]
    service = router(lambda request: httpx.Response(200, json=osrm_payload()))
    enriched, _ = enrich_routes(request, plan, dataset, service)
    row = enriched["travel_matrix"][0]
    assert (row["durationMin"], row["distanceKm"]) == (15, 2.5)
    assert row["source"] == "OSRM"
    assert row["evidenceStatus"] == "VERIFIED"
    assert dataset["travel_matrix"][0]["durationMin"] == 999


def test_provider_failure_does_not_become_infeasible_or_mutate_inputs():
    request, plan, dataset = small_case()
    before = deepcopy((request, plan, dataset))
    service = router(lambda request: httpx.Response(503))
    enriched, routes = enrich_routes(request, plan, dataset, service)
    result = evaluate_feasibility(request, plan, enriched)
    assert routes[0]["status"] == ROUTING_UNAVAILABLE
    assert result["status"] == "UNVERIFIED"
    assert (request, plan, dataset) == before


def test_raw_opentripmap_route_is_visible_but_not_m4_evidence():
    request, plan, dataset = small_case(reviewed=False)
    service = router(lambda request: httpx.Response(200, json=osrm_payload()))
    enriched, routes = enrich_routes(request, plan, dataset, service)
    result = evaluate_feasibility(request, plan, enriched)
    assert routes[0]["status"] == ROUTE_REVIEW_REQUIRED
    assert routes[0]["distanceKm"] == 2.5
    assert enriched is dataset
    assert result["status"] == "UNVERIFIED"
    assert any(reason["code"] == "UNSUPPORTED_LEG" for reason in result["reasons"])


def test_hue_evaluate_workflow_consumes_verified_route_without_gemini(monkeypatch):
    request, plan, dataset = small_case(reviewed=True)
    before = deepcopy((request, plan, dataset))
    service = router(lambda request: httpx.Response(200, json=osrm_payload()))
    monkeypatch.setattr("app.services.planning_service.load_dataset", lambda: dataset)

    result = evaluate_plan(request, plan, routing_service=service)

    assert result["components"]["routing"]["routes"][0]["status"] == ROUTE_AVAILABLE
    assert result["components"]["travel"]["dailyTotals"][0]["durationMin"] == 15
    assert result["components"]["travel"]["dailyTotals"][0]["distanceKm"] == 2.5
    assert not any(check["code"] == "TRANSFER_GAP" and check["status"] == "INFEASIBLE"
                   for check in result["checks"])
    assert result["status"] == "UNVERIFIED"
    assert (request, plan, dataset) == before
