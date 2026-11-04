"""TPVA-24: đối chiếu chặng có hướng và giới hạn di chuyển bắt buộc."""

from collections import Counter
from math import isfinite

from app.algorithms.validation_common import (
    add_check, known_number, result_from_checks, route_reference, validated_inputs,
)


def _check_limits(values, limits, checks, path):
    """So sánh từng số đo với giới hạn; thiếu số đo không được coi là 0."""
    for field, limit_field in (("durationMin", "maxTravelTimeMinutes"),
                               ("distanceKm", "maxDistanceKm")):
        maximum = limits.get(limit_field)
        if maximum is None:
            continue
        value = known_number(values.get(field))
        if value is None:
            add_check(checks, "UNVERIFIED", "LIMIT_DATA", path, f"Chưa đủ {field} để kiểm tra {limit_field}.")
        elif value > maximum:
            add_check(checks, "INFEASIBLE", "TRAVEL_LIMIT", path, f"{field}={value} vượt giới hạn {maximum}.")


def _sum_measurements(references, field):
    """Trả tổng đã biết và cờ đủ dữ liệu, giúp phát hiện vượt mức dù còn thiếu."""
    total = 0
    complete = True
    for reference in references:
        value = known_number(reference.get(field)) if reference else None
        if value is None:
            complete = False
        else:
            total += value
    if isinstance(total, float) and not isfinite(total):
        return None, False
    return total, complete


def validate_travel(request: dict, plan: dict, dataset: dict | None = None) -> dict:
    """Kiểm tra chặng CandidatePlan bằng dataset, rồi kiểm tra limits.

    betweenActivities: từng chặng giữa hai hoạt động.
    daily: tổng các chặng giữa hoạt động trong mỗi ngày của CandidatePlan.
    fromDeparture: chặng từ departureLocation tới destinationId trong bảng chuẩn.
    Không có chặng phù hợp -> UNVERIFIED; không suy ra chặng ngược chiều.
    """
    checks = []
    inputs = validated_inputs(request, plan, checks)
    if inputs is None:
        return result_from_checks(checks)
    request, plan = inputs
    dataset = dataset or {}
    limits = request.get("limits") or {}
    totals = []

    for index, day in enumerate(plan["days"]):
        path = f"days.{index}.travelLegs"
        activities = day["activities"]
        expected = [(a["placeId"], b["placeId"]) for a, b in zip(activities, activities[1:])]
        actual = [(leg["fromPlaceId"], leg["toPlaceId"]) for leg in day["travelLegs"]]
        # Counter giữ số lần xuất hiện, không bỏ sót chặng lặp như khi dùng set.
        if Counter(actual) - Counter(expected):
            add_check(checks, "INFEASIBLE", "LEG_ENDPOINTS", path, "Có chặng thừa, lặp hoặc nối sai hoạt động.")
        if Counter(expected) - Counter(actual):
            add_check(checks, "UNVERIFIED", "MISSING_LEG", path, "Thiếu chặng giữa các hoạt động liên tiếp.")
        if Counter(actual) == Counter(expected) and actual != expected:
            add_check(checks, "INFEASIBLE", "LEG_ORDER", path, "Các chặng không được liệt kê theo thứ tự hoạt động.")

        references = []
        for origin, destination in expected:
            reference = route_reference(dataset, origin, destination)
            references.append(reference)
            if reference is None:
                add_check(checks, "UNVERIFIED", "UNSUPPORTED_LEG", path, f"Chưa có chặng đã xác minh {origin} -> {destination}.")
            for field in ("durationMin", "distanceKm"):
                value = known_number(reference.get(field)) if reference else None
                if value is None:
                    add_check(checks, "UNVERIFIED", "TRAVEL_DATA", path, f"Thiếu {field} cho {origin} -> {destination}.")
            if limits.get("appliesTo") == "betweenActivities":
                _check_limits(reference or {}, limits, checks, path)

        for position, leg in enumerate(day["travelLegs"]):
            reference = route_reference(dataset, leg["fromPlaceId"], leg["toPlaceId"])
            if reference is None:
                continue
            for field in ("durationMin", "distanceKm"):
                expected_value = known_number(reference.get(field))
                if expected_value is not None and leg[field] is not None and leg[field] != expected_value:
                    add_check(checks, "INFEASIBLE", "TRAVEL_MISMATCH", f"{path}.{position}.{field}", "Số liệu kế hoạch không khớp dataset.")

        day_totals = {"dayNumber": day["dayNumber"]}
        for field, limit_field in (("durationMin", "maxTravelTimeMinutes"),
                                   ("distanceKm", "maxDistanceKm")):
            subtotal, complete = _sum_measurements(references, field)
            day_totals[field] = subtotal if complete else None
            day_totals["known_" + field] = subtotal
            if limits.get("appliesTo") == "daily" and limits.get(limit_field) is not None:
                # Tổng đã biết vượt mức đủ để kết luận, dù chặng khác chưa biết.
                if subtotal is not None and subtotal > limits[limit_field]:
                    _check_limits({field: subtotal}, {limit_field: limits[limit_field]}, checks, path)
                elif not complete:
                    add_check(checks, "UNVERIFIED", "DAILY_LIMIT_DATA", path, f"Chưa đủ {field} của cả ngày.")
        totals.append(day_totals)

    if limits.get("appliesTo") == "fromDeparture":
        origin = request["departureLocation"]
        destination = plan["destinationId"]
        reference = route_reference(dataset, origin, destination)
        values = {field: known_number(reference.get(field)) if reference else None
                  for field in ("durationMin", "distanceKm")}
        _check_limits(values, limits, checks, "departureLocation")

    result = result_from_checks(checks)
    result["dailyTotals"] = totals
    return result
