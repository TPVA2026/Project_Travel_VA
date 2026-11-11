"""Offline OSRM client tests; no test contacts a real routing server."""

import math

import httpx
import pytest

from app.services.routing_service import (
    INVALID_COORDINATES,
    NO_ROUTE,
    ROUTE_AVAILABLE,
    ROUTE_REVIEW_REQUIRED,
    ROUTING_UNAVAILABLE,
    UNSUPPORTED_MODE,
    RoutingConfig,
    RoutingService,
    routing_point,
)


def point(place_id, latitude=16.4637, longitude=107.5909, reviewed=True):
    return {
        "placeId": place_id,
        "latitude": latitude,
        "longitude": longitude,
        "reviewed": reviewed,
    }


def payload(distance=2500, duration=900, first=(107.5909, 16.4637),
            second=(107.6000, 16.4700)):
    return {
        "code": "Ok",
        "routes": [{"distance": distance, "duration": duration}],
        "waypoints": [{"location": list(first)}, {"location": list(second)}],
    }


def service(handler, **changes):
    defaults = dict(
        enabled=True,
        base_url="https://router.test",
        allowed_place_ids=frozenset({"a", "b"}),
        max_snap_distance_meters=100,
        cache_size=8,
    )
    defaults.update(changes)
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return RoutingService(RoutingConfig(**defaults), client)


def test_valid_route_uses_lon_lat_and_converts_units():
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json=payload())

    router = service(respond)
    result = router.get_route(point("a"), point("b", 16.4700, 107.6000), "car")
    assert result["status"] == ROUTE_AVAILABLE
    assert result["distanceKm"] == 2.5
    assert result["durationMin"] == 15
    assert result["profile"] == "driving"
    assert result["diagnostic"]["code"] == "VERIFIED_ROUTE"
    assert "/107.5909,16.4637;107.6,16.47" in str(requests[0].url)


@pytest.mark.parametrize("bad", [
    {},
    {"latitude": None, "longitude": 107},
    {"latitude": 91, "longitude": 107},
    {"latitude": 16, "longitude": 181},
    {"latitude": math.nan, "longitude": 107},
    {"latitude": 16, "longitude": math.inf},
    {"latitude": "16", "longitude": 107},
])
def test_invalid_coordinates_never_call_provider(bad):
    router = service(lambda request: pytest.fail("provider must not be called"))
    assert router.get_route(bad, point("b"), "driving")["status"] == INVALID_COORDINATES


def test_unsupported_mode_never_calls_provider():
    router = service(lambda request: pytest.fail("provider must not be called"))
    assert router.get_route(point("a"), point("b"), "motorbike")["status"] == UNSUPPORTED_MODE


def test_disabled_routing_never_calls_provider():
    router = service(
        lambda request: pytest.fail("provider must not be called"), enabled=False
    )
    result = router.get_route(point("a"), point("b"), "car")
    assert result["status"] == ROUTING_UNAVAILABLE
    assert result["diagnostic"]["code"] == "ROUTING_DISABLED"


@pytest.mark.parametrize(
    "value", ["router.internal", "ftp://router.internal", "http://", "http://["]
)
def test_invalid_base_url_from_env_is_rejected(monkeypatch, value):
    monkeypatch.setenv("OSRM_BASE_URL", value)
    assert RoutingConfig.from_env().base_url is None


def test_self_hosted_base_url_from_env_is_accepted(monkeypatch):
    monkeypatch.setenv("OSRM_BASE_URL", "http://osrm:5000/")
    assert RoutingConfig.from_env().base_url == "http://osrm:5000"


@pytest.mark.parametrize("mode", ["walk", "walking", "bicycle", "cycling"])
def test_unverified_profiles_are_disabled_by_default(mode):
    router = service(lambda request: pytest.fail("provider must not be called"))
    assert router.get_route(point("a"), point("b"), mode)["status"] == UNSUPPORTED_MODE


def test_verified_custom_profile_can_be_enabled_explicitly():
    router = service(
        lambda request: httpx.Response(200, json=payload()),
        enabled_profiles=frozenset({"walking"}),
    )
    result = router.get_route(point("a"), point("b", 16.4700, 107.6000), "walking")
    assert result["status"] == ROUTE_AVAILABLE
    assert result["profile"] == "walking"


def test_no_route_is_distinct_from_provider_failure():
    router = service(lambda request: httpx.Response(200, json={"code": "NoRoute", "routes": []}))
    result = router.get_route(point("a"), point("b"), "car")
    assert result["status"] == NO_ROUTE
    assert result["distanceKm"] is None
    assert result["diagnostic"]["code"] == "NO_ROUTE_RETURNED"


def test_empty_route_list_is_no_route():
    router = service(
        lambda request: httpx.Response(
            200, json={"code": "Ok", "routes": [], "waypoints": []}
        )
    )
    assert router.get_route(point("a"), point("b"), "car")["status"] == NO_ROUTE


@pytest.mark.parametrize("status", [429, 500, 503])
def test_http_failures_are_safe(status):
    router = service(lambda request: httpx.Response(status, text="private provider failure"))
    assert router.get_route(point("a"), point("b"), "car")["status"] == ROUTING_UNAVAILABLE


def test_timeout_is_safe():
    def timeout(request):
        raise httpx.ReadTimeout("private network detail", request=request)

    router = service(timeout)
    result = router.get_route(point("a"), point("b"), "car")
    assert result["status"] == ROUTING_UNAVAILABLE
    assert result["diagnostic"]["code"] == "PROVIDER_TIMEOUT"
    assert "private" not in str(result)


@pytest.mark.parametrize("body", [
    None,
    {},
    {"code": "Ok"},
    {"code": "Ok", "routes": [{}], "waypoints": [{"location": [0, 0]}, {"location": [0, 0]}]},
    {"code": "Ok", "routes": [{"distance": 1, "duration": 1}], "waypoints": []},
])
def test_invalid_or_incomplete_json_is_unavailable(body):
    def respond(request):
        if body is None:
            return httpx.Response(200, content=b"not-json")
        return httpx.Response(200, json=body)

    assert service(respond).get_route(point("a"), point("b"), "car")["status"] == ROUTING_UNAVAILABLE


def test_source_poi_coordinates_remain_provisional():
    router = service(lambda request: httpx.Response(200, json=payload()))
    result = router.get_route(point("a", reviewed=False), point("b", 16.4700, 107.6000, False), "car")
    assert result["status"] == ROUTE_REVIEW_REQUIRED
    assert result["evidenceStatus"] == "PROVISIONAL"
    assert result["diagnostic"]["code"] == "ENDPOINT_REVIEW_REQUIRED"


@pytest.mark.parametrize(
    ("origin_reviewed", "destination_reviewed"), [(False, True), (True, False)]
)
def test_each_unreviewed_endpoint_prevents_verification(
    origin_reviewed, destination_reviewed
):
    router = service(lambda request: httpx.Response(200, json=payload()))
    result = router.get_route(
        point("a", reviewed=origin_reviewed),
        point("b", 16.4700, 107.6000, destination_reviewed),
        "car",
    )
    assert result["status"] == ROUTE_REVIEW_REQUIRED
    assert result["originReviewed"] is origin_reviewed
    assert result["destinationReviewed"] is destination_reviewed


def test_routing_point_requires_matching_reviewed_profile():
    place = {
        "id": "ATTR_H_03",
        "latitude": 16.0,
        "longitude": 107.0,
        "source": "curated POI",
        "routingPoint": {
            "latitude": 16.1,
            "longitude": 107.1,
            "reviewed": True,
            "profile": "walking",
            "source": "manual review",
        },
    }
    result = routing_point(place, "car")
    assert result["reviewed"] is False
    assert (result["latitude"], result["longitude"]) == (16.0, 107.0)
    assert result["reviewReason"] == "REVIEWED_POINT_PROFILE_MISMATCH"


def test_curated_hue_id_uses_supplied_reviewed_point_for_matching_profile():
    place = {
        "id": "ATTR_H_03",
        "latitude": 1.0,
        "longitude": 2.0,
        "routingPoint": {
            "latitude": 16.1,
            "longitude": 107.1,
            "reviewed": True,
            "profile": "driving",
            "source": "test-only manual review fixture",
        },
    }
    result = routing_point(place, "car")
    assert result["placeId"] == "ATTR_H_03"
    assert result["reviewed"] is True
    assert (result["latitude"], result["longitude"]) == (16.1, 107.1)


def test_excessive_snapping_requires_review():
    far = payload(first=(107.7, 16.6))
    router = service(lambda request: httpx.Response(200, json=far), max_snap_distance_meters=50)
    result = router.get_route(point("a"), point("b", 16.4700, 107.6000), "car")
    assert result["status"] == ROUTE_REVIEW_REQUIRED
    assert result["originSnappedDistanceMeters"] > 50
    assert result["diagnostic"]["code"] == "SNAP_DISTANCE_EXCEEDED"


def test_cache_hit_avoids_second_provider_call():
    calls = 0

    def respond(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=payload())

    router = service(respond)
    for _ in range(2):
        router.get_route(point("a"), point("b", 16.4700, 107.6000), "car")
    assert calls == 1


def test_reverse_route_has_a_distinct_cache_key():
    calls = 0

    def respond(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=payload())

    router = service(respond)
    a, b = point("a"), point("b", 16.4700, 107.6000)
    router.get_route(a, b, "car")
    router.get_route(b, a, "car")
    assert calls == 2
