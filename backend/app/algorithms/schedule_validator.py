"""TPVA-24: kiểm tra ngày, giờ, giờ mở cửa và thời gian giữa các hoạt động."""

import re
from datetime import date, timedelta

from app.algorithms.feasibility import check_transfer, time_to_minutes, validate_day
from app.algorithms.validation_common import (
    add_check, known_number, places_by_id, result_from_checks,
    route_reference, validated_inputs,
)


def _minutes(value):
    """Đọc giờ dataset H:MM/HH:MM; 24:00 chỉ dùng làm mốc đóng cửa cuối ngày."""
    if not isinstance(value, str):
        return None
    if value == "24:00":
        return 1440
    if not re.fullmatch(r"[0-9]{1,2}:[0-9]{2}", value):
        return None
    return time_to_minutes(value.zfill(5))


def _window(value):
    """Đọc giờ mở thành list khoảng phút; trả None nếu chưa hiểu dữ liệu.

    Hỗ trợ chuỗi '7:00 - 17:30', nhiều ca cách nhau bởi ';', list các cặp giờ,
    dict {open, close}, và '24/7'. Khoảng qua đêm được tách thành hai phần.
    Không diễn giải 'tự do' hay 'không cố định' thành mở cả ngày.
    """
    if isinstance(value, str):
        value = value.strip()
        if value == "24/7":
            return [(0, 1440)]
        pieces = value.split(";")
        pairs = []
        for piece in pieces:
            match = re.fullmatch(r"\s*([0-9]{1,2}:[0-9]{2})\s*[-–—]\s*([0-9]{1,2}:[0-9]{2})\s*", piece)
            if match is None:
                return None
            pairs.append(match.groups())
    elif isinstance(value, dict):
        pairs = [(value.get("open"), value.get("close"))]
    elif isinstance(value, list):
        pairs = value
    else:
        return None

    windows = []
    for pair in pairs:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            return None
        start, end = _minutes(pair[0]), _minutes(pair[1])
        if start is None or end is None or start == 1440 or start == end:
            return None
        if start < end:
            windows.append((start, end))
        else:
            windows.extend([(start, 1440), (0, end)])
    return windows or None


def _check_dates(request, days, checks):
    """Đối chiếu số ngày, số thứ tự và ngày liên tiếp với ngày/tháng yêu cầu."""
    if len(days) != request["durationDays"]:
        add_check(checks, "INFEASIBLE", "DAY_COUNT", "days", "Số ngày không khớp durationDays.")
    first_date = date.fromisoformat(days[0]["date"])
    period = request["travelPeriod"]
    if "startDate" in period:
        expected_start = date.fromisoformat(period["startDate"])
    else:
        expected_start = first_date
        if first_date.strftime("%Y-%m") != period["month"]:
            add_check(checks, "INFEASIBLE", "TRAVEL_MONTH", "days.0.date", "Ngày bắt đầu nằm ngoài tháng yêu cầu.")
    for index, day in enumerate(days):
        if day["dayNumber"] != index + 1:
            add_check(checks, "INFEASIBLE", "DAY_NUMBER", f"days.{index}.dayNumber", "Số thứ tự ngày phải bắt đầu từ 1 và liên tiếp.")
        # Cộng timedelta để kiểm tra cả trường hợp qua cuối tháng/năm.
        try:
            expected_date = expected_start + timedelta(days=index)
        except OverflowError:
            add_check(checks, "INFEASIBLE", "TRAVEL_DATE", f"days.{index}.date", "Ngày vượt phạm vi lịch được hỗ trợ.")
            continue
        if date.fromisoformat(day["date"]) != expected_date:
            add_check(checks, "INFEASIBLE", "TRAVEL_DATE", f"days.{index}.date", "Ngày đi không khớp hoặc không liên tiếp.")


def _check_place(activity, places, checks, path):
    """Kiểm tra địa điểm, ca mở cửa và thời lượng tối thiểu đã được cung cấp."""
    place = places.get((activity["type"], activity["placeId"]))
    if place is None:
        status = "INFEASIBLE" if places else "UNVERIFIED"
        add_check(checks, status, "PLACE_DATA", path, "Không tìm thấy địa điểm đúng loại trong dataset.")
        return
    windows = _window(place.get("openingHours", place.get("opening_hours")))
    start = time_to_minutes(activity["startTime"])
    end = time_to_minutes(activity["endTime"])
    if "unverified" in str(place.get("source", "")).lower():
        add_check(checks, "UNVERIFIED", "PLACE_SOURCE", path, "Nguồn dữ liệu địa điểm chưa xác minh.")
        return
    if windows is None:
        add_check(checks, "UNVERIFIED", "OPENING_HOURS", path, "Chưa biết giờ mở cửa đủ rõ để kiểm tra.")
    elif not any(opening <= start and end <= closing for opening, closing in windows):
        add_check(checks, "INFEASIBLE", "OUTSIDE_OPENING_HOURS", path, "Hoạt động không nằm trọn trong một ca mở cửa.")

    # Đây là metadata tối thiểu, không dùng thời lượng gợi ý làm ràng buộc cứng.
    if "minVisitMinutes" in place:
        minimum = known_number(place["minVisitMinutes"])
        if minimum is None:
            add_check(checks, "UNVERIFIED", "VISIT_DURATION_DATA", path, "Thời lượng tối thiểu không hợp lệ.")
        elif end - start < minimum:
            add_check(checks, "INFEASIBLE", "VISIT_DURATION", path, "Không đủ thời lượng tối thiểu cho địa điểm.")


def validate_schedule(request: dict, plan: dict, dataset: dict | None = None) -> dict:
    """Kiểm tra lịch của CandidatePlan và trả status, checks, reasons.

    Đầu vào theo schema chung; không tin thời gian di chuyển do AI tự đề xuất.
    Bộ kiểm tra không sửa request, plan hoặc dataset của bên gọi.
    """
    checks = []
    inputs = validated_inputs(request, plan, checks)
    if inputs is None:
        return result_from_checks(checks)
    request, plan = inputs
    dataset = dataset or {}
    places = places_by_id(dataset)
    _check_dates(request, plan["days"], checks)

    for index, day in enumerate(plan["days"]):
        activities = day["activities"]
        path = f"days.{index}"
        status = validate_day(activities)
        add_check(checks, status, "DAY_SCHEDULE", path, "Kiểm tra thời lượng và giao nhau của các hoạt động.")
        starts = [time_to_minutes(item["startTime"]) for item in activities]
        if starts != sorted(starts):
            add_check(checks, "INFEASIBLE", "ACTIVITY_ORDER", path, "Hoạt động phải được liệt kê theo giờ bắt đầu.")
        for position, activity in enumerate(activities):
            _check_place(activity, places, checks, f"{path}.activities.{position}")
        for previous, following in zip(activities, activities[1:]):
            # zip ghép từng cặp liền nhau; không tự tìm đường đi vòng qua điểm khác.
            reference = route_reference(dataset, previous["placeId"], following["placeId"])
            duration = known_number(reference.get("durationMin")) if reference else None
            status = check_transfer(previous["endTime"], following["startTime"], duration)
            add_check(checks, status, "TRANSFER_GAP", path,
                      f"Thời gian giữa {previous['activityId']} và {following['activityId']}.")
    return result_from_checks(checks)
