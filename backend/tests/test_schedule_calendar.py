from app.algorithms.schedule_validator import _calendar_windows, validate_schedule


def calendar(**overrides):
    return {"weekly": {str(day): [["09:00", "17:00"]] for day in range(1, 8)}, **overrides}


def test_weekday_sunday_and_split_hours():
    hours = calendar()
    hours["weekly"]["7"] = [["07:00", "12:00"], ["14:00", "20:00"]]
    assert _calendar_windows(hours, "2026-12-13") == [(420, 720), (840, 1200)]
    assert _calendar_windows(hours, "2026-12-12") == [(540, 1020)]


def test_date_override_and_holiday_unknown():
    hours = calendar(dates={"2026-12-13": []}, holidays=["2026-12-14"])
    assert _calendar_windows(hours, "2026-12-13") == []
    assert _calendar_windows(hours, "2026-12-14") is None


def test_overnight_is_owned_by_previous_weekday():
    hours = calendar()
    hours["weekly"]["6"] = [["20:00", "02:00"]]
    assert _calendar_windows(hours, "2026-12-12") == [(1200, 1440)]
    assert _calendar_windows(hours, "2026-12-13") == [(0, 120), (540, 1020)]


def test_confirmed_hue_morning_violation(m4_case):
    request, plan, dataset, _ = m4_case
    request["travelPeriod"] = {"startDate": "2026-12-12"}
    plan["days"][0]["date"] = "2026-12-12"
    dataset["attractions"][0]["opening_hours"] = calendar()
    result = validate_schedule(request, plan, dataset)
    assert result["status"] == "INFEASIBLE"
    assert any(c["code"] == "OUTSIDE_OPENING_HOURS" for c in result["checks"])


def test_ambiguous_natural_language_stays_unknown():
    assert _calendar_windows("Ngày trong tuần: buổi chiều; Chủ nhật: cả ngày", "2026-12-13") is None
    assert _calendar_windows("tự do", "2026-12-13") is None
