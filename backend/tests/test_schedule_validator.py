"""Kiểm tra quy tắc lịch trình TPVA-24 bằng dữ liệu nhỏ đã biết kết quả."""

from copy import deepcopy

import pytest

from app.algorithms.schedule_validator import _window, validate_schedule


@pytest.mark.parametrize("value, expected", [
    ("7:00 - 17:30", [(420, 1050)]),
    ("08:00–12:00; 13:00—17:00", [(480, 720), (780, 1020)]),
    ("24/7", [(0, 1440)]),
    ("00:00 - 24:00", [(0, 1440)]),
    ("20:00 - 02:00", [(1200, 1440), (0, 120)]),
    ({"open": "08:00", "close": "17:00"}, [(480, 1020)]),
    ([["08:00", "12:00"], ["13:00", "17:00"]], [(480, 720), (780, 1020)]),
    ("tự do", None), ("không cố định", None), (None, None),
    ("24:00 - 25:00", None), ("08:00 - 08:00", None),
    ([], None), ([["08:00"]], None),
])
def test_opening_windows(value, expected):
    """Giữ nguyên dữ liệu chưa rõ; không đoán các nhãn tự do thành 24/7."""
    assert _window(value) == expected


def test_valid_schedule_preserves_inputs(m4_case):
    before = deepcopy(m4_case)
    assert validate_schedule(*m4_case[:3])["status"] == "FEASIBLE"
    assert m4_case == before


@pytest.mark.parametrize("case, code", [
    ("day_count", "DAY_COUNT"), ("day_number", "DAY_NUMBER"),
    ("date", "TRAVEL_DATE"), ("month", "TRAVEL_MONTH"),
    ("overlap", "DAY_SCHEDULE"), ("order", "ACTIVITY_ORDER"),
    ("opening", "OUTSIDE_OPENING_HOURS"), ("minimum", "VISIT_DURATION"),
    ("transfer", "TRANSFER_GAP"), ("place", "PLACE_DATA"),
])
def test_confirmed_schedule_violations(m4_case, case, code):
    request, plan, dataset, _ = m4_case
    day = plan["days"][0]
    if case == "day_count":
        request["durationDays"] = 2
    elif case == "day_number":
        day["dayNumber"] = 2
    elif case == "date":
        day["date"] = "2026-11-13"
    elif case == "month":
        request["travelPeriod"] = {"month": "2026-12"}
    elif case == "overlap":
        day["activities"][1]["startTime"] = "08:30"
    elif case == "order":
        day["activities"].reverse()
    elif case == "opening":
        dataset["attractions"][0]["opening_hours"] = "08:30 - 17:00"
    elif case == "minimum":
        dataset["attractions"][0]["minVisitMinutes"] = 61
    elif case == "transfer":
        dataset["travel_matrix"][0]["durationMin"] = 31
    else:
        day["activities"][0]["placeId"] = "invented"
    result = validate_schedule(request, plan, dataset)
    assert result["status"] == "INFEASIBLE"
    assert any(item["code"] == code for item in result["reasons"])


@pytest.mark.parametrize("case", ["opening", "route", "source", "empty", "minimum"])
def test_unknown_schedule_data(m4_case, case):
    request, plan, dataset, _ = m4_case
    if case == "opening":
        dataset["attractions"][0]["opening_hours"] = "không cố định"
    elif case == "route":
        dataset["travel_matrix"] = []
    elif case == "source":
        dataset["attractions"][0]["source"] = "UNVERIFIED"
    elif case == "minimum":
        dataset["attractions"][0]["minVisitMinutes"] = "one hour"
    else:
        plan["days"][0]["activities"] = []
    assert validate_schedule(request, plan, dataset)["status"] == "UNVERIFIED"


def test_break_in_opening_hours_is_not_a_valid_visit(m4_case):
    request, plan, dataset, _ = m4_case
    dataset["attractions"][0]["opening_hours"] = "07:00 - 08:30; 08:45 - 17:00"
    assert validate_schedule(request, plan, dataset)["status"] == "INFEASIBLE"


def test_days_can_cross_month_when_start_month_matches(m4_case):
    request, plan, dataset, _ = m4_case
    request.update(travelPeriod={"month": "2026-11"}, durationDays=2)
    plan["days"][0]["date"] = "2026-11-30"
    second = deepcopy(plan["days"][0])
    second.update(dayNumber=2, date="2026-12-01")
    for activity in second["activities"]:
        activity["activityId"] += "-day2"
    plan["days"].append(second)
    assert validate_schedule(request, plan, dataset)["status"] == "FEASIBLE"


def test_invalid_schema_returns_reason(m4_case):
    request, plan, dataset, _ = m4_case
    plan["days"][0]["activities"][0]["startTime"] = "8:00"
    result = validate_schedule(request, plan, dataset)
    assert result["status"] == "UNVERIFIED"
    assert result["reasons"][0]["code"] == "INVALID_INPUT"
