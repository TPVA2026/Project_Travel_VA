"""TPVA-39: deterministic destination eligibility before M3 ranks cities.

Only trusted city-to-city routes and trip-scoped costs can qualify a city.
FEASIBLE here is a destination precheck, not approval of a CandidatePlan.
"""

from collections import Counter, defaultdict
from copy import deepcopy
import json
import math
import re
import unicodedata

from app.algorithms.cost_validator import validate_cost_budget
from app.algorithms.validation_common import add_check, known_number, result_from_checks
from app.schemas.travel_request import TravelRequest
from app.services import data_service
from app.services.input_service import validate_travel_request


def _key(value):
    if not isinstance(value, str):
        return ""
    value = unicodedata.normalize("NFKD", value).casefold().replace("đ", "d")
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = " ".join("".join(c if c.isalnum() else " " for c in value).split())
    return re.sub(r"^(?:thanh pho|tp)\s+", "", value)


def _supported(dataset):
    rows = dataset.get("destinations", [])
    if not isinstance(rows, list):
        raise ValueError("destinations must be a list")
    valid = [r for r in rows if isinstance(r, dict)
             and isinstance(r.get("id"), str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", r["id"])
             and isinstance(r.get("city", r.get("name")), str)
             and r.get("city", r.get("name")).strip()]
    counts = Counter(r["id"] for r in rows if isinstance(r, dict) and isinstance(r.get("id"), str))
    # Duplicate supported IDs have no unambiguous source record.
    supported = [r for r in valid if counts[r["id"]] == 1]
    aliases = defaultdict(set)
    for row in supported:
        names = [row.get(k) for k in ("id", "city", "name", "city_name")]
        names += row.get("aliases", []) if isinstance(row.get("aliases"), list) else []
        for name in names:
            if _key(name):
                aliases[_key(name)].add(row["id"])
    return supported, aliases


def _identity(value, aliases):
    matches = aliases.get(_key(value), set())
    if len(matches) == 1:
        return next(iter(matches))
    if matches:
        return None
    # Departures outside supported destinations can still have explicit routes.
    return _key(value) or None


def _trusted(row):
    if not isinstance(row, dict):
        return False
    if "unverified" in str(row.get("source", "")).casefold():
        return False
    for field in ("evidenceStatus", "verificationStatus", "status"):
        marker = row.get(field)
        if marker is not None and str(marker).casefold() not in ("verified", "known", "route_available"):
            return False
    return True


def _route(rows, origin, destination, aliases, modes):
    matches = [row for row in rows if isinstance(row, dict)
               and _identity(row.get("from"), aliases) == origin
               and _identity(row.get("to"), aliases) == destination]
    if len(matches) != 1 or not _trusted(matches[0]):
        return None
    row = matches[0]
    if modes and _key(row.get("transportMode")) not in modes:
        return None
    return row


def _load_trip_costs():
    path = data_service.DATA_DIR / "destination_trip_costs.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as file:
        records = json.load(file)
    if not isinstance(records, dict):
        raise ValueError("destination_trip_costs.json must contain a destination-ID mapping")
    return records


def _cost_evidence(record, request, aliases):
    if not _trusted(record) or record.get("evidenceStatus") != "VERIFIED":
        return None
    if not isinstance(record.get("source"), str) or not record["source"].strip():
        return None
    for key, expected in (("durationDays", request["durationDays"]),
                          ("travelersCount", request["travelers"]["count"])):
        if type(record.get(key)) is not int or record[key] != expected:
            return None
    if (record.get("currency") != "VND" or record.get("scope") != "group"
            or record.get("travelPeriod") != request["travelPeriod"]
            or _identity(record.get("departureLocation"), aliases) != _identity(request["departureLocation"], aliases)):
        return None
    modes = (request.get("preferences") or {}).get("transportation", [])
    supplied_modes = record.get("transportation", [])
    if not isinstance(supplied_modes, list) or {_key(m) for m in supplied_modes} != {_key(m) for m in modes}:
        return None
    return record.get("costs") if isinstance(record.get("costs"), dict) else None


def filter_feasible_destinations(request, dataset=None, *, trip_costs_by_destination=None):
    """Return all eligible supported cities plus diagnostic exclusions.

M3 receives result['feasibleDestinationIds']; all measurements are server data.
trip_costs_by_destination maps destination IDs to VERIFIED whole-group trip
costs, scoped to this departure, date/month, duration, party and transport.
No endpoint, route provider, model, external API or source-file write is used.
"""
    if isinstance(request, TravelRequest):
        request = request.model_dump(mode="json", by_alias=True, exclude_none=True)
    request = validate_travel_request(request).model_dump(mode="json", by_alias=True, exclude_none=True)
    if (request.get("preferences") or {}).get("destination"):
        raise ValueError("Destination filtering requires an empty preferences.destination")
    if dataset is None:
        dataset = data_service.load_dataset()
        if trip_costs_by_destination is None:
            trip_costs_by_destination = _load_trip_costs()
    if not isinstance(dataset, dict):
        raise ValueError("dataset must be a dictionary")
    if trip_costs_by_destination is None:
        trip_costs_by_destination = dataset.get("destination_trip_costs", {})
    if not isinstance(trip_costs_by_destination, dict):
        raise ValueError("trip_costs_by_destination must be a dictionary")
    destinations, aliases = _supported(dataset)
    rows = dataset.get("travel_matrix", dataset.get("travelMatrix", []))
    if not isinstance(rows, list):
        rows = []  # Nested/POI matrices cannot establish intercity evidence.
    departure = _identity(request["departureLocation"], aliases)
    preferences = request.get("preferences") or {}
    modes = {_key(mode) for mode in preferences.get("transportation", [])}
    budget = request["budget"]["amount"]
    if request["budget"]["scope"] == "perPerson":
        budget *= request["travelers"]["count"]
    available_minutes = request["durationDays"] * 24 * 60
    result = {"scope": "DESTINATION_PREFILTER", "feasibleDestinations": [],
              "feasibleDestinationIds": [], "unverified": [], "excluded": []}
    for city in destinations:
        city_id = city["id"]
        checks = []
        item = {"destinationId": city_id, "city": city.get("city", city.get("name")),
                "travelTimeMinutes": None, "distanceKm": None,
                "roundTripTravelTimeMinutes": None, "estimatedCostVnd": None,
                "budgetVnd": budget, "remainingBudgetVnd": None}
        if departure == city_id:
            add_check(checks, "INFEASIBLE", "DEPARTURE_CITY", "departureLocation", "Không gợi ý lại thành phố xuất phát.")
        elif departure is None:
            add_check(checks, "UNVERIFIED", "AMBIGUOUS_DEPARTURE", "departureLocation", "Tên nơi xuất phát khớp nhiều thành phố.")
        else:
            outbound = _route(rows, departure, city_id, aliases, modes)
            inbound = _route(rows, city_id, departure, aliases, modes)
            durations = [known_number(row.get("durationMin")) if row else None for row in (outbound, inbound)]
            item["travelTimeMinutes"] = durations[0]
            item["distanceKm"] = known_number(outbound.get("distanceKm")) if outbound else None
            known_travel = sum(value for value in durations if value is not None)
            if known_travel > available_minutes:
                add_check(checks, "INFEASIBLE", "TRIP_DURATION", "durationDays", "Thời gian di chuyển đã biết vượt tổng thời gian chuyến đi.")
            if any(value is None for value in durations) or not math.isfinite(known_travel):
                add_check(checks, "UNVERIFIED", "INTERCITY_TRAVEL_DATA", "travel_matrix", "Thiếu thời gian tuyến đi/về đã xác minh cho thành phố này.")
            else:
                item["roundTripTravelTimeMinutes"] = known_travel
                if known_travel <= available_minutes:
                    add_check(checks, "FEASIBLE", "TRIP_DURATION", "durationDays", "Thời gian di chuyển đi/về không vượt số ngày yêu cầu.")
            limits = request.get("limits") or {}
            if limits and limits["appliesTo"] != "fromDeparture":
                add_check(checks, "UNVERIFIED", "ITINERARY_LIMIT_PENDING", "limits.appliesTo", "Giới hạn theo ngày/giữa hoạt động cần lịch trình cụ thể để kiểm tra.")
            elif limits:
                for field, value in (("maxTravelTimeMinutes", durations[0]), ("maxDistanceKm", item["distanceKm"])):
                    maximum = limits.get(field)
                    if maximum is None:
                        continue
                    status = "UNVERIFIED" if value is None else "INFEASIBLE" if value > maximum else "FEASIBLE"
                    add_check(checks, status, "DEPARTURE_LIMIT", "limits." + field,
                              "Đối chiếu tuyến xuất phát với giới hạn người dùng; thiếu số đo giữ chưa xác minh.")
            costs = _cost_evidence(trip_costs_by_destination.get(city_id), request, aliases)
            if costs is None:
                add_check(checks, "UNVERIFIED", "TRIP_COST_DATA", "destination_trip_costs", "Thiếu chi phí đã xác minh đúng phạm vi chuyến đi/nhóm/ngày/phương tiện.")
            else:
                cost_result = validate_cost_budget({"budget": budget}, {"costs": deepcopy(costs)})
                item["estimatedCostVnd"] = cost_result["total_cost"]
                item["remainingBudgetVnd"] = cost_result["remaining_budget"]
                add_check(checks, cost_result["status"], "TRIP_BUDGET", "budget", "; ".join(cost_result["reasons"]) or "Tổng chi phí cả nhóm/cả chuyến không vượt ngân sách.")
        item.update(result_from_checks(checks))
        bucket = "feasibleDestinations" if item["status"] == "FEASIBLE" else "unverified" if item["status"] == "UNVERIFIED" else "excluded"
        result[bucket].append(item)
    result["feasibleDestinationIds"] = [item["destinationId"] for item in result["feasibleDestinations"]]
    result["status"] = "FEASIBLE" if result["feasibleDestinations"] else "UNVERIFIED" if result["unverified"] else "INFEASIBLE"
    return result
