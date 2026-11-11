"""Hàm dùng chung cho các bộ kiểm tra M4, không gọi AI hay sửa dữ liệu."""

from math import isfinite

from pydantic import ValidationError

from app.schemas.candidate_plan import CandidatePlan
from app.schemas.travel_request import TravelRequest


def add_check(checks, status, code, path, message):
    """Thêm một kết quả có mã và vị trí để UI/M6 giải thích được lỗi."""
    checks.append({"status": status, "code": code, "path": path, "message": message})


def result_from_checks(checks):
    """Tổng hợp: có lỗi xác nhận > có dữ liệu chưa rõ > tất cả đạt."""
    statuses = [check["status"] for check in checks]
    if "INFEASIBLE" in statuses:
        status = "INFEASIBLE"
    elif "UNVERIFIED" in statuses:
        status = "UNVERIFIED"
    else:
        status = "FEASIBLE"
    return {
        "status": status,
        "checks": checks,
        "reasons": [check for check in checks if check["status"] != "FEASIBLE"],
    }


def validated_inputs(request, plan, checks):
    """Kiểm tra schema; trả hai dict chuẩn hóa hoặc None khi đầu vào sai."""
    try:
        request = TravelRequest.model_validate(request).model_dump(mode="json", by_alias=True)
        plan = CandidatePlan.model_validate(plan).model_dump(mode="json")
    except ValidationError as error:
        for detail in error.errors():
            path = ".".join(str(part) for part in detail["loc"])
            add_check(checks, "UNVERIFIED", "INVALID_INPUT", path, detail["msg"])
        return None
    return request, plan


def known_number(value):
    """Chỉ chấp nhận số hữu hạn >= 0; không coi bool/chuỗi số là số đo."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value < 0 or (isinstance(value, float) and not isfinite(value)):
        return None
    return value


def places_by_id(dataset):
    """Tạo bảng tra (loại, id) -> địa điểm từ attractions và dining."""
    places = {}
    for key, kind in (("attractions", "sightseeing"), ("dining", "dining")):
        for place in dataset.get(key, []):
            if isinstance(place, dict) and isinstance(place.get("id"), str):
                places[(kind, place["id"])] = place
    return places


def route_reference(dataset, origin, destination, transport_mode=None):
    """Lấy chặng có hướng from/to; không suy ngược hoặc cộng khoảng cách từ tâm.

    Chỉ dùng bảng chuẩn dạng list. Bảng lồng 'destinations' hiện tại trong repo
    chưa có chặng giữa các cặp id, vì vậy hàm trả None cho dạng bảng đó.
    Nhiều dòng trùng cặp cũng chưa đủ rõ để chọn một dòng làm sự thật.
    """
    rows = dataset.get("travelMatrix", dataset.get("travel_matrix", []))
    if not isinstance(rows, list):
        return None
    matches = [row for row in rows if isinstance(row, dict)
               and row.get("from") == origin and row.get("to") == destination]
    if len(matches) != 1:
        return None
    reference = matches[0]
    source = str(reference.get("source", "")).casefold()
    if any(marker in source for marker in ("unverified", "provisional", "estimated")):
        return None
    verification = reference.get("verificationStatus")
    if verification is not None and str(verification).casefold() != "verified":
        return None
    evidence = reference.get("evidenceStatus")
    if evidence is not None and str(evidence).casefold() != "verified":
        return None
    route_status = str(reference.get("status", "")).casefold()
    if any(marker in route_status for marker in (
        "unverified", "provisional", "review", "estimated", "unknown", "no_data",
    )):
        return None
    if ("originReviewed" in reference or "destinationReviewed" in reference) and (
        reference.get("originReviewed") is not True
        or reference.get("destinationReviewed") is not True
    ):
        return None

    profile = reference.get("profile")
    profiles = {
        "car": "driving", "driving": "driving",
        "walk": "walking", "walking": "walking",
        "bicycle": "cycling", "cycling": "cycling",
    }
    requested_profile = (
        profiles.get(transport_mode.strip().casefold())
        if isinstance(transport_mode, str) else None
    )
    if profile is not None:
        if not isinstance(profile, str) or profile.casefold() not in set(profiles.values()):
            return None
        if requested_profile is not None and profile.casefold() != requested_profile:
            return None

    provider = str(reference.get("provider", "")).casefold()
    if "osrm" in source or "osrm" in provider:
        if (str(evidence).casefold() != "verified"
                or reference.get("originReviewed") is not True
                or reference.get("destinationReviewed") is not True
                or not isinstance(profile, str)):
            return None
    return reference
