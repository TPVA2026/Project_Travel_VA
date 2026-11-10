"""Kiểm tra các hàm xử lý giờ và lịch trong ngày, không cần gọi AI."""

from copy import deepcopy

import pytest

from app.algorithms.feasibility import (
    check_overlap,
    check_transfer,
    evaluate_feasibility,
    time_to_minutes,
    validate_activity_time,
    validate_day,
)


def activity(start, end):
    """Tạo dữ liệu hoạt động ngắn gọn dùng chung cho các bài test."""
    return {"startTime": start, "endTime": end}


@pytest.mark.parametrize("value, expected", [
    ("08:30", 510), ("00:00", 0), ("23:59", 1439), ("08:00", 480),
    ("25:00", None), ("12:60", None), ("-1:30", None), ("08:30:45", None),
    ("abc", None), (None, None), (830, None), ("", None),
    ("8:30", None), ("08:3", None), (" 08:30", None), ("+8:30", None),
])
def test_time_to_minutes(value, expected):
    """Kiểm tra giờ hợp lệ, biên 00/59 và dữ liệu sai định dạng."""
    assert time_to_minutes(value) == expected


@pytest.mark.parametrize("value, expected", [
    (activity("08:00", "09:30"), "FEASIBLE"),
    (activity("00:00", "00:01"), "FEASIBLE"),
    (activity("10:00", "09:00"), "INFEASIBLE"),
    (activity("09:30", "09:30"), "INFEASIBLE"),
    (activity(None, "09:30"), "UNVERIFIED"),
    (activity("abc", "09:30"), "UNVERIFIED"),
    ({"endTime": "09:30"}, "UNVERIFIED"),
    (None, "UNVERIFIED"),
])
def test_activity_time(value, expected):
    """Giờ thiếu và hoạt động có thời lượng không dương là hai trường hợp khác nhau."""
    assert validate_activity_time(value) == expected


@pytest.mark.parametrize("first, second, expected", [
    (activity("08:00", "09:30"), activity("09:00", "10:00"), True),
    (activity("08:00", "09:30"), activity("10:00", "11:00"), False),
    (activity("08:00", "09:30"), activity("09:30", "10:00"), False),
    (activity("08:00", "12:00"), activity("09:00", "10:00"), True),
    (activity("08:00", "09:00"), activity("08:00", "09:00"), True),
    (activity(None, "09:30"), activity("09:00", "10:00"), None),
    (activity("10:00", "09:30"), activity("09:00", "10:00"), None),
])
def test_overlap_both_orders(first, second, expected):
    """Đảo thứ tự hai hoạt động không được thay đổi kết quả giao nhau."""
    assert check_overlap(first, second) is expected
    assert check_overlap(second, first) is expected


@pytest.mark.parametrize("end, start, travel, expected", [
    ("09:00", "09:30", 20, "FEASIBLE"),
    ("09:00", "09:30", 30, "FEASIBLE"),
    ("09:00", "09:30", 40, "INFEASIBLE"),
    ("09:00", "09:00", 0, "FEASIBLE"),
    ("09:00", "09:00", 1, "INFEASIBLE"),
    ("09:30", "09:00", None, "INFEASIBLE"),
    ("09:00", "09:30", None, "UNVERIFIED"),
    (None, "09:30", 20, "UNVERIFIED"),
    ("09:00", "abc", 20, "UNVERIFIED"),
    ("09:00", "09:30", -1, "UNVERIFIED"),
    ("09:00", "09:30", True, "UNVERIFIED"),
    ("09:00", "09:30", "20", "UNVERIFIED"),
    ("09:00", "09:30", float("inf"), "UNVERIFIED"),
    ("09:00", "09:30", float("nan"), "UNVERIFIED"),
])
def test_transfer(end, start, travel, expected):
    """Kiểm tra đủ/thiếu thời gian và không biến dữ liệu chưa rõ thành số 0."""
    assert check_transfer(end, start, travel) == expected


@pytest.mark.parametrize("activities, expected", [
    ([], "UNVERIFIED"),
    (None, "UNVERIFIED"),
    ([activity("00:00", "01:00")], "FEASIBLE"),
    ([activity("10:00", "11:00"), activity("08:00", "09:00")], "FEASIBLE"),
    ([activity("08:00", "09:00"), activity("09:00", "10:00")], "FEASIBLE"),
    ([activity("09:00", "10:00"), activity("08:00", "09:30")], "INFEASIBLE"),
    ([activity("10:00", "09:00")], "INFEASIBLE"),
    ([{}, activity("10:00", "09:00")], "INFEASIBLE"),
    ([{}, activity("08:00", "10:00"), activity("09:00", "11:00")], "INFEASIBLE"),
    ([{}, activity("08:00", "09:00")], "UNVERIFIED"),
])
def test_day_preserves_inputs(activities, expected):
    """Vi phạm xác nhận được ưu tiên, việc sắp lịch không sửa dữ liệu của bên gọi."""
    original = deepcopy(activities)
    assert validate_day(activities) == expected
    assert activities == original


def test_full_evaluation_preserves_inputs(m4_case):
    """Kiểm tra toàn bộ luồng schema -> chi phí -> lịch -> di chuyển."""
    before = deepcopy(m4_case)
    result = evaluate_feasibility(*m4_case)
    assert result["status"] == "FEASIBLE"
    assert result["planId"] == "p1"
    assert set(result["components"]) == {"cost", "schedule", "travel"}
    assert result["reasons"] == []
    assert m4_case == before


def test_confirmed_violation_beats_unknown_data(m4_case):
    """Thiếu chi phí không được che mất lỗi trùng giờ đã được xác nhận."""
    request, plan, dataset, _ = m4_case
    plan["days"][0]["activities"][1]["startTime"] = "08:30"
    result = evaluate_feasibility(request, plan, dataset)
    assert result["status"] == "INFEASIBLE"
    assert result["components"]["cost"]["status"] == "UNVERIFIED"


@pytest.mark.parametrize("edit", ["budget", "schedule", "travel"])
def test_revision_recalculates_all_constraints(m4_case, edit):
    """Kế hoạch ban đầu đạt nhưng sau chỉnh sửa phải được đánh giá lại."""
    request, plan, dataset, supplemental = m4_case
    original = evaluate_feasibility(*m4_case)
    assert original["status"] == "FEASIBLE"
    if edit == "budget":
        request["budget"]["amount"] = 399
    elif edit == "schedule":
        plan["days"][0]["activities"][1]["startTime"] = "08:30"
    else:
        request["limits"] = {"appliesTo": "daily", "maxDistanceKm": 4}
    assert evaluate_feasibility(*m4_case)["status"] == "INFEASIBLE"
    assert original["status"] == "FEASIBLE"  # Kết quả cũ không bị sửa theo.


def test_invalid_schema_never_marked_feasible(m4_case):
    """Field trạng thái do bên ngoài thêm vào không thay thế được phép kiểm tra."""
    request, plan, dataset, supplemental = m4_case
    plan["status"] = "FEASIBLE"
    result = evaluate_feasibility(*m4_case)
    assert result["status"] == "UNVERIFIED"
    assert result["reasons"][0]["code"] == "INVALID_INPUT"


def test_unknown_destination_is_rejected(m4_case):
    """Điểm đến có id không thuộc dataset là vi phạm, không tự tạo địa điểm."""
    request, plan, dataset, supplemental = m4_case
    plan["destinationId"] = "invented"
    result = evaluate_feasibility(*m4_case)
    assert result["status"] == "INFEASIBLE"
    assert any(item["code"] == "DESTINATION_ID" for item in result["reasons"])


def test_real_repository_dataset_is_not_invented_into_pairwise_routes(m4_case):
    """Dữ liệu từ tâm thành phố không chứng minh thời gian giữa hai địa điểm."""
    from app.services.data_service import load_dataset

    request, plan, _, supplemental = m4_case
    dataset = load_dataset()
    plan["destinationId"] = "H"
    first, second = plan["days"][0]["activities"]
    first.update(placeId=dataset["attractions"][0]["id"], estimatedCostVnd=None, costStatus="NO_DATA")
    second.update(placeId=dataset["dining"][0]["id"], estimatedCostVnd=None,
                  costStatus="NO_DATA", startTime="12:00", endTime="13:00")
    plan["days"][0]["travelLegs"] = [{
        "fromPlaceId": first["placeId"], "toPlaceId": second["placeId"],
        "durationMin": None, "distanceKm": None,
    }]
    # Không truyền dataset để kiểm tra cả đường đọc dataset thật mặc định.
    result = evaluate_feasibility(request, plan, supplemental_costs=supplemental)
    assert result["status"] == "UNVERIFIED"
    # The adapter now exposes the real nested pair, but its measurements remain
    # null until verified; recognizing the pair must not make it feasible.
    assert any(item["code"] == "TRAVEL_DATA" for item in result["reasons"])
