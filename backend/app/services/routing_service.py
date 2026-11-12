"""Small, opt-in OSRM client for reviewed MVP routing points.

OpenTripMap coordinates describe points of interest.  They are not assumed to
be accessible entrances.  A route using those coordinates is therefore
provisional even when OSRM successfully returns distance and duration.
"""

from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
from dataclasses import dataclass
import math
import os
from typing import Any
from urllib.parse import urlsplit

import httpx


ROUTE_AVAILABLE = "ROUTE_AVAILABLE"
NO_ROUTE = "NO_ROUTE"
INVALID_COORDINATES = "INVALID_COORDINATES"
UNSUPPORTED_MODE = "UNSUPPORTED_MODE"
ROUTING_UNAVAILABLE = "ROUTING_UNAVAILABLE"
ROUTE_REVIEW_REQUIRED = "ROUTE_REVIEW_REQUIRED"

MODE_PROFILES = {
    "car": "driving",
    "driving": "driving",
    "walk": "walking",
    "walking": "walking",
    "bicycle": "cycling",
    "cycling": "cycling",
}


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float, minimum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return value if math.isfinite(value) and value >= minimum else default


def _env_int(name: str, default: int, minimum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return value if value >= minimum else default


@dataclass(frozen=True)
class RoutingConfig:
    """Server-side routing configuration; routing is disabled by default."""

    enabled: bool = False
    base_url: str | None = None
    timeout_seconds: float = 3.0
    allowed_place_ids: frozenset[str] = frozenset()
    enabled_profiles: frozenset[str] = frozenset({"driving"})
    max_snap_distance_meters: float = 100.0
    cache_size: int = 256

    @classmethod
    def from_env(cls) -> "RoutingConfig":
        base_url = os.getenv("OSRM_BASE_URL", "").strip().rstrip("/") or None
        if base_url:
            try:
                parsed = urlsplit(base_url)
            except ValueError:
                base_url = None
            else:
                if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                    base_url = None
        place_ids = frozenset(
            item.strip()
            for item in os.getenv("OSRM_MVP_PLACE_IDS", "").split(",")
            if item.strip()
        )
        enabled_profiles = frozenset(
            item.strip().casefold()
            for item in os.getenv("OSRM_ENABLED_PROFILES", "driving").split(",")
            if item.strip().casefold() in {"driving", "walking", "cycling"}
        )
        return cls(
            enabled=_env_bool("OSRM_ROUTING_ENABLED"),
            base_url=base_url,
            timeout_seconds=_env_float("OSRM_TIMEOUT_SECONDS", 3.0, 0.1),
            allowed_place_ids=place_ids,
            enabled_profiles=enabled_profiles,
            max_snap_distance_meters=_env_float(
                "OSRM_MAX_SNAP_DISTANCE_METERS", 100.0, 0.0
            ),
            cache_size=_env_int("OSRM_CACHE_SIZE", 256, 1),
        )


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def _coordinates(point: dict | None) -> tuple[float, float] | None:
    """Return latitude/longitude after strict geographic validation."""
    if not isinstance(point, dict):
        return None
    latitude = _number(point.get("latitude"))
    longitude = _number(point.get("longitude"))
    if latitude is None or longitude is None:
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return latitude, longitude


def routing_point(place: dict | None, transport_mode: str | None = None) -> dict:
    """Select a reviewed point when present, otherwise retain source provenance."""
    place = place if isinstance(place, dict) else {}
    reviewed = place.get("routingPoint")
    mode = transport_mode.strip().casefold() if isinstance(transport_mode, str) else ""
    profile = MODE_PROFILES.get(mode)
    if (isinstance(reviewed, dict) and reviewed.get("reviewed") is True
            and reviewed.get("profile") == profile):
        return {
            "placeId": place.get("id"),
            "latitude": reviewed.get("latitude"),
            "longitude": reviewed.get("longitude"),
            "reviewed": True,
            "coordinateSource": reviewed.get("source", "reviewed_routing_point"),
            "reviewReason": None,
        }
    if not isinstance(reviewed, dict) or reviewed.get("reviewed") is not True:
        review_reason = "REVIEWED_POINT_MISSING"
    elif reviewed.get("profile") != profile:
        review_reason = "REVIEWED_POINT_PROFILE_MISMATCH"
    else:
        review_reason = "REVIEWED_POINT_UNAVAILABLE"
    return {
        "placeId": place.get("id"),
        "latitude": place.get("latitude"),
        "longitude": place.get("longitude"),
        "reviewed": False,
        "coordinateSource": place.get("source", "source_poi_coordinate"),
        "reviewReason": review_reason,
    }


def _haversine_meters(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0.0, 1 - value)))


class RoutingService:
    """Synchronous OSRM Route API client with a bounded, directed cache."""

    def __init__(self, config: RoutingConfig, client: httpx.Client | None = None):
        self.config = config
        self._client = client
        self._cache: OrderedDict[tuple, dict] = OrderedDict()

    def _result(self, status: str, origin: dict, destination: dict, mode: str,
                profile: str | None, reason_code: str, reason: str,
                **values: Any) -> dict:
        result = {
            "status": status,
            "originPlaceId": origin.get("placeId"),
            "destinationPlaceId": destination.get("placeId"),
            "distanceKm": None,
            "durationMin": None,
            "transportMode": mode,
            "provider": "OSRM",
            "profile": profile,
            "evidenceStatus": "NO_DATA",
            "originReviewed": origin.get("reviewed") is True,
            "destinationReviewed": destination.get("reviewed") is True,
            "diagnostic": {"code": reason_code, "message": reason},
        }
        result.update(values)
        return result

    def _remember(self, key: tuple, value: dict) -> dict:
        self._cache[key] = deepcopy(value)
        self._cache.move_to_end(key)
        while len(self._cache) > self.config.cache_size:
            self._cache.popitem(last=False)
        return deepcopy(value)

    def get_route(self, origin: dict, destination: dict, transport_mode: str) -> dict:
        """Get one directed route without leaking provider/network exceptions."""
        origin = origin if isinstance(origin, dict) else {}
        destination = destination if isinstance(destination, dict) else {}
        normalized_mode = transport_mode.strip().casefold() if isinstance(transport_mode, str) else ""
        profile = MODE_PROFILES.get(normalized_mode)
        if profile is None or profile not in self.config.enabled_profiles:
            return self._result(
                UNSUPPORTED_MODE, origin, destination, normalized_mode, profile,
                "UNSUPPORTED_PROFILE", "The requested transport profile is not enabled.",
            )

        if not self.config.enabled:
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "ROUTING_DISABLED", "OSRM routing is disabled.",
            )

        origin_coordinates = _coordinates(origin)
        destination_coordinates = _coordinates(destination)
        if origin_coordinates is None or destination_coordinates is None:
            invalid = []
            if origin_coordinates is None:
                invalid.append("origin")
            if destination_coordinates is None:
                invalid.append("destination")
            return self._result(
                INVALID_COORDINATES, origin, destination, normalized_mode, profile,
                "INVALID_ENDPOINT_COORDINATES",
                f"Invalid or missing coordinates for: {', '.join(invalid)}.",
            )

        key = (
            profile, origin.get("placeId"), origin_coordinates, origin.get("reviewed") is True,
            destination.get("placeId"), destination_coordinates,
            destination.get("reviewed") is True,
        )
        if key in self._cache:
            self._cache.move_to_end(key)
            return deepcopy(self._cache[key])

        if not self.config.base_url:
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "ROUTING_NOT_CONFIGURED", "No valid OSRM base URL is configured.",
            )

        origin_text = f"{origin_coordinates[1]},{origin_coordinates[0]}"
        destination_text = f"{destination_coordinates[1]},{destination_coordinates[0]}"
        url = f"{self.config.base_url}/route/v1/{profile}/{origin_text};{destination_text}"
        try:
            client = self._client or httpx.Client()
            response = client.get(
                url,
                params={"overview": "false", "steps": "false"},
                timeout=self.config.timeout_seconds,
            )
            if response.status_code >= 400:
                return self._result(
                    ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                    "PROVIDER_UNAVAILABLE", "The routing provider is unavailable.",
                )
            payload = response.json()
        except httpx.TimeoutException:
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "PROVIDER_TIMEOUT", "The routing provider timed out.",
            )
        except (httpx.HTTPError, ValueError, TypeError):
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "PROVIDER_UNAVAILABLE", "The routing provider is unavailable.",
            )
        finally:
            if self._client is None and "client" in locals():
                client.close()

        if not isinstance(payload, dict):
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "INVALID_PROVIDER_RESPONSE", "The routing provider returned an invalid response.",
            )
        if payload.get("code") == "NoRoute":
            return self._remember(
                key, self._result(
                    NO_ROUTE, origin, destination, normalized_mode, profile,
                    "NO_ROUTE_RETURNED", "The provider returned no route for this profile.",
                )
            )
        if payload.get("code") != "Ok":
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "INVALID_PROVIDER_RESPONSE", "The routing provider returned an invalid response.",
            )

        routes = payload.get("routes")
        waypoints = payload.get("waypoints")
        if isinstance(routes, list) and not routes:
            return self._remember(key, self._result(
                NO_ROUTE, origin, destination, normalized_mode, profile,
                "NO_ROUTE_RETURNED", "The provider returned no route for this profile.",
            ))
        if not isinstance(routes, list) or not isinstance(routes[0], dict):
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "INVALID_PROVIDER_RESPONSE", "The routing provider returned an invalid response.",
            )
        distance = _number(routes[0].get("distance"))
        duration = _number(routes[0].get("duration"))
        if distance is None or duration is None or distance < 0 or duration < 0:
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "INVALID_PROVIDER_RESPONSE", "The routing provider returned an invalid response.",
            )
        if not isinstance(waypoints, list) or len(waypoints) < 2:
            return self._result(
                ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                "INVALID_PROVIDER_RESPONSE", "The routing provider returned an invalid response.",
            )

        snapped: list[tuple[float, float]] = []
        for waypoint in (waypoints[0], waypoints[-1]):
            location = waypoint.get("location") if isinstance(waypoint, dict) else None
            if (not isinstance(location, list) or len(location) != 2
                    or _number(location[0]) is None or _number(location[1]) is None):
                return self._result(
                    ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                    "INVALID_PROVIDER_RESPONSE", "The routing provider returned an invalid response.",
                )
            coordinate = (_number(location[1]), _number(location[0]))
            if coordinate is None or not -90 <= coordinate[0] <= 90 or not -180 <= coordinate[1] <= 180:
                return self._result(
                    ROUTING_UNAVAILABLE, origin, destination, normalized_mode, profile,
                    "INVALID_PROVIDER_RESPONSE", "The routing provider returned an invalid response.",
                )
            snapped.append(coordinate)

        origin_snap = _haversine_meters(origin_coordinates, snapped[0])
        destination_snap = _haversine_meters(destination_coordinates, snapped[1])
        reviewed = origin.get("reviewed") is True and destination.get("reviewed") is True
        acceptable_snap = max(origin_snap, destination_snap) <= self.config.max_snap_distance_meters
        verified = reviewed and acceptable_snap
        status = ROUTE_AVAILABLE if verified else ROUTE_REVIEW_REQUIRED
        evidence = "VERIFIED" if verified else "PROVISIONAL"
        if verified:
            reason_code = "VERIFIED_ROUTE"
            reason = "Both endpoints are reviewed and OSRM snap distances are acceptable."
        elif not reviewed:
            reasons = sorted({
                point.get("reviewReason", "REVIEWED_POINT_MISSING")
                for point in (origin, destination) if point.get("reviewed") is not True
            })
            reason_code = "ENDPOINT_REVIEW_REQUIRED"
            reason = f"Endpoint review required ({', '.join(reasons)})."
        else:
            reason_code = "SNAP_DISTANCE_EXCEEDED"
            reason = "At least one OSRM snap distance exceeds the configured threshold."
        return self._remember(key, self._result(
            status, origin, destination, normalized_mode, profile, reason_code, reason,
            distanceKm=distance / 1000,
            durationMin=duration / 60,
            evidenceStatus=evidence,
            originSnappedDistanceMeters=origin_snap,
            destinationSnappedDistanceMeters=destination_snap,
        ))


_default_service: RoutingService | None = None
_default_config: RoutingConfig | None = None


def get_default_routing_service() -> RoutingService:
    """Create lazily so importing the module never performs network activity."""
    global _default_service, _default_config
    config = RoutingConfig.from_env()
    if _default_service is None or config != _default_config:
        _default_config = config
        _default_service = RoutingService(config)
    return _default_service
