"""Offline routing enrichment and Huế M4 integration tests."""

from copy import deepcopy

import httpx
import pytest

from app.algorithms.feasibility import evaluate_feasibility
from app.algorithms.validation_common import route_reference
from app.services.ai.context_builder import build_context
from app.services.ai.itinerary_generator import check_grounding
from app.services.planning_service import evaluate_plan, rank_candidate_plans
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
    before = deepcopy(dataset)
    service = router(lambda request: httpx.Response(200, json=osrm_payload()))
    enriched, _ = enrich_routes(request, plan, dataset, service)
    row = enriched["travel_matrix"][0]
    assert (row["durationMin"], row["distanceKm"]) == (15, 2.5)
    assert row["source"] == "OSRM"
    assert row["evidenceStatus"] == "VERIFIED"
    assert dataset == before


def test_seed_route_remains_unverified_when_osrm_is_unavailable():
    request, plan, dataset = small_case()
    dataset["travel_matrix"] = [{
        "from": "hue-a", "to": "hue-b", "durationMin": 999, "distanceKm": 999,
        "source": "UNVERIFIED: copied from current seed; routing evidence required",
    }]
    service = router(lambda request: httpx.Response(503))
    enriched, routes = enrich_routes(request, plan, dataset, service)
    result = evaluate_feasibility(request, plan, enriched)
    assert enriched is dataset
    assert routes[0]["status"] == ROUTING_UNAVAILABLE
    assert result["status"] == "UNVERIFIED"
    assert any(reason["code"] == "UNSUPPORTED_LEG" for reason in result["reasons"])


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
    monkeypatch.setattr("app.services.planning_service.load_dataset", lambda **kwargs: dataset)

    result = evaluate_plan(request, plan, routing_service=service)

    assert result["components"]["routing"]["routes"][0]["status"] == ROUTE_AVAILABLE
    assert result["components"]["travel"]["dailyTotals"][0]["durationMin"] == 15
    assert result["components"]["travel"]["dailyTotals"][0]["distanceKm"] == 2.5
    assert not any(check["code"] == "TRANSFER_GAP" and check["status"] == "INFEASIBLE"
                   for check in result["checks"])
    assert result["status"] == "UNVERIFIED"
    assert (request, plan, dataset) == before


def _reason_codes(result):
    return {reason["code"] for reason in result["reasons"]}


def test_evaluate_and_rank_share_verified_route_policy(monkeypatch):
    request, plan, dataset = small_case(reviewed=True)
    before = deepcopy((request, plan, dataset))
    monkeypatch.setattr("app.services.planning_service.load_dataset", lambda **kwargs: dataset)

    evaluated = evaluate_plan(
        request, plan,
        routing_service=router(lambda request: httpx.Response(200, json=osrm_payload())),
    )
    ranked = rank_candidate_plans(
        request, [plan],
        routing_service=router(lambda request: httpx.Response(200, json=osrm_payload())),
    )

    rank_result = ranked["excluded"][0]
    assert evaluated["status"] == rank_result["status"] == "UNVERIFIED"
    assert "UNSUPPORTED_LEG" not in _reason_codes(evaluated)
    assert "UNSUPPORTED_LEG" not in _reason_codes(rank_result)
    assert evaluated["components"]["travel"]["dailyTotals"][0] == {
        "dayNumber": 1,
        "durationMin": 15.0,
        "known_durationMin": 15.0,
        "distanceKm": 2.5,
        "known_distanceKm": 2.5,
    }
    assert (request, plan, dataset) == before


def test_evaluate_and_rank_share_missing_route_policy(monkeypatch):
    request, plan, dataset = small_case(reviewed=False)
    monkeypatch.setattr("app.services.planning_service.load_dataset", lambda **kwargs: dataset)
    make_router = lambda: router(
        lambda request: httpx.Response(200, json=osrm_payload())
    )

    evaluated = evaluate_plan(request, plan, routing_service=make_router())
    ranked = rank_candidate_plans(request, [plan], routing_service=make_router())

    assert evaluated["status"] == ranked["excluded"][0]["status"] == "UNVERIFIED"
    assert "UNSUPPORTED_LEG" in _reason_codes(evaluated)
    assert "UNSUPPORTED_LEG" in _reason_codes(ranked["excluded"][0])


def test_evaluate_and_rank_are_safe_during_osrm_outage(monkeypatch):
    request, plan, dataset = small_case(reviewed=True)
    monkeypatch.setattr("app.services.planning_service.load_dataset", lambda **kwargs: dataset)
    make_router = lambda: router(lambda request: httpx.Response(503))

    evaluated = evaluate_plan(request, plan, routing_service=make_router())
    ranked = rank_candidate_plans(request, [plan], routing_service=make_router())

    assert evaluated["status"] == ranked["excluded"][0]["status"] == "UNVERIFIED"
    assert "UNSUPPORTED_LEG" in _reason_codes(evaluated)
    assert "UNSUPPORTED_LEG" in _reason_codes(ranked["excluded"][0])
    assert evaluated["components"]["routing"]["routes"][0]["status"] == ROUTING_UNAVAILABLE


def test_verification_status_rejects_numeric_provisional_route():
    dataset = {
        "travel_matrix": [{
            "from": "hue-a", "to": "hue-b", "durationMin": 15,
            "distanceKm": 2.5, "verificationStatus": "unverified",
        }]
    }
    assert route_reference(dataset, "hue-a", "hue-b", "car") is None


@pytest.mark.parametrize("metadata", [
    {"source": "estimated seed"},
    {"evidenceStatus": "PROVISIONAL"},
    {"status": "ROUTE_REVIEW_REQUIRED"},
    {"originReviewed": False, "destinationReviewed": True},
    {"profile": "walking"},
    {"source": "OSRM", "evidenceStatus": "VERIFIED", "profile": "driving"},
])
def test_route_evidence_gate_rejects_inconsistent_metadata(metadata):
    row = {
        "from": "hue-a", "to": "hue-b", "durationMin": 15,
        "distanceKm": 2.5, **metadata,
    }
    assert route_reference({"travel_matrix": [row]}, "hue-a", "hue-b", "car") is None


def test_grounding_hides_unverified_seed_measurements():
    request, plan, dataset = small_case()
    dataset["travel_matrix"] = [{
        "from": "hue-a", "to": "hue-b", "durationMin": 99,
        "distanceKm": 99, "verificationStatus": "unverified",
    }]
    context = build_context(request, dataset)
    assert context["travelMatrix"][0]["durationMin"] is None
    assert context["travelMatrix"][0]["distanceKm"] is None
    invented = deepcopy(plan)
    invented["days"][0]["travelLegs"][0].update(durationMin=99, distanceKm=99)
    assert check_grounding(invented, context)


def _multiple_candidate_case():
    request, _, _ = small_case()
    request["preferences"] = {
        "destination": "HUE", "transportation": ["car"],
        "interests": [{"type": "culture", "priority": 1}],
    }
    coordinates = {
        "s1": (16.460, 107.590), "r1": (16.461, 107.591),
        "s2": (16.462, 107.592), "r2": (16.463, 107.593),
        "s3": (16.464, 107.594), "r3": (16.465, 107.595),
    }
    attractions, dining = [], []
    for place_id, (latitude, longitude) in coordinates.items():
        place = {
            "id": place_id, "destinationId": "HUE", "name": place_id,
            "source": "verified test fixture", "latitude": latitude,
            "longitude": longitude, "openingHours": "24/7",
            "routingPoint": {
                "latitude": latitude, "longitude": longitude, "reviewed": True,
                "profile": "driving", "source": "test-only manual review fixture",
            },
        }
        if place_id.startswith("s"):
            place.update(priceVnd=0, priceScope="perPerson", interestTags=["culture"])
            attractions.append(place)
        else:
            place["avgPricePerPersonVnd"] = 0
            dining.append(place)
    plans = []
    for index, (origin, destination) in enumerate(
        [("s1", "r1"), ("s2", "r2"), ("s3", "r3")], start=1
    ):
        plans.append({
            "planId": f"plan-{index}", "title": f"Plan {index}",
            "destinationId": "HUE", "missingData": [], "assumptions": [],
            "days": [{
                "dayNumber": 1, "date": "2026-11-12",
                "activities": [
                    {"activityId": f"a{index}-1", "placeId": origin,
                     "type": "sightseeing", "startTime": "08:00", "endTime": "09:00",
                     "estimatedCostVnd": 0, "costStatus": "KNOWN", "reason": "Visit"},
                    {"activityId": f"a{index}-2", "placeId": destination,
                     "type": "dining", "startTime": "09:30", "endTime": "10:30",
                     "estimatedCostVnd": 0, "costStatus": "KNOWN", "reason": "Visit"},
                ],
                "travelLegs": [{"fromPlaceId": origin, "toPlaceId": destination,
                                "durationMin": None, "distanceKm": None}],
            }],
        })
    dataset = {
        "destinations": [{"id": "HUE", "city": "Huế"}],
        "attractions": attractions, "dining": dining, "travel_matrix": [],
    }
    costs = {plan["planId"]: {"transport": 0, "accommodation": 0} for plan in plans}
    return request, plans, dataset, costs, coordinates


def test_rank_multiple_candidates_keeps_route_evidence_by_plan(monkeypatch):
    request, plans, dataset, costs, coordinates = _multiple_candidate_case()
    before = deepcopy((request, plans, dataset, costs))
    calls = 0

    def respond(http_request):
        nonlocal calls
        calls += 1
        pair = str(http_request.url).split("/driving/")[1].split("?")[0]
        first, second = pair.split(";")
        first_lon, first_lat = map(float, first.split(","))
        second_lon, second_lat = map(float, second.split(","))
        return httpx.Response(200, json=osrm_payload(
            distance=calls * 1000, duration=calls * 600,
        ) | {"waypoints": [
            {"location": [first_lon, first_lat]},
            {"location": [second_lon, second_lat]},
        ]})

    monkeypatch.setattr("app.services.planning_service.load_dataset", lambda **kwargs: dataset)
    service = router(respond, ids=tuple(coordinates))
    result = rank_candidate_plans(
        request, plans, routing_service=service,
        supplemental_costs_by_plan=costs,
    )

    assert [item["planId"] for item in result["ranked"]] == [
        "plan-1", "plan-2", "plan-3",
    ], result
    assert result["excluded"] == [] and result["unscored"] == []
    assert calls == 3
    assert (request, plans, dataset, costs) == before
