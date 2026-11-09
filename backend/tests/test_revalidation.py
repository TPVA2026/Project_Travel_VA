"""TPVA-26: kiểm tra sửa lịch -> đánh giá lại -> tính lại thứ hạng, không gọi AI."""

from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.algorithms.feasibility import evaluate_feasibility
from app.services.input_service import validate_travel_request
from app.services.planning_service import apply_revision, revalidate_plan, revalidate_revision


def change(field, value, plan_id="p1"):
    """Tạo RevisionRequest đúng một trường theo hợp đồng chung."""
    return {"planId": plan_id, "changeType": field, field: value}


def revision_options(case):
    """Cung cấp dataset và chi phí đã xác nhận cho phiên bản đang kiểm tra."""
    _, plan, dataset, costs = case
    return {"dataset": dataset, "supplemental_costs_by_plan": {plan["planId"]: costs}}


@pytest.mark.parametrize("field, value", [
    ("budget", {"amount": 1000, "currency": "VND", "scope": "group"}),
    ("travelPeriod", {"month": "2026-12"}),
    ("durationDays", 2), ("departureLocation", "Da Nang"),
    ("travelers", {"count": 3}),
    ("limits", {"appliesTo": "daily", "maxDistanceKm": 4}),
    ("preferences", {"interests": [{"type": "nature", "priority": 1}]}),
])
def test_apply_revision_changes_only_named_field(m4_case, field, value):
    """Cả 7 loại revision đều được áp dụng, các trường khác không bị sửa."""
    request, _, _, _ = m4_case
    before = deepcopy(request)
    normalized_before = validate_travel_request(before).model_dump(mode="json", by_alias=True)
    updated = apply_revision(request, change(field, value))
    assert request == before
    for name in normalized_before:
        if name != field:
            assert updated[name] == normalized_before[name]
    if field in ("budget", "travelPeriod", "durationDays", "departureLocation"):
        assert updated[field] == value
    else:
        for name, expected in value.items():
            assert updated[field][name] == expected


def test_valid_revision_recalculates_cost_and_score_without_mutation(m4_case):
    """Tăng ngân sách đổi C và S, không dùng lại điểm cũ hoặc sửa dữ liệu gốc."""
    request, original, dataset, costs = m4_case
    revision = change("budget", {"amount": 1000, "currency": "VND", "scope": "group"})
    before = deepcopy((m4_case, revision))
    result = revalidate_revision(request, original, revision, **revision_options(m4_case))
    assert result["status"] == "FEASIBLE"
    assert result["evaluation"]["components"]["cost"]["budget"] == 1000
    scored = result["ranking"]["ranked"][0]
    assert scored["components"]["C"] == 0.6
    assert scored["score"] == pytest.approx(0.3 * 0.6 + 0.25 * 0.5)
    assert (m4_case, revision) == before
    result["plan"]["days"][0]["activities"][0]["startTime"] = "00:00"
    assert original["days"][0]["activities"][0]["startTime"] == "08:00"


@pytest.mark.parametrize("field, value, expected", [
    ("budget", {"amount": 399, "currency": "VND", "scope": "group"}, "INFEASIBLE"),
    ("travelers", {"count": 3}, "INFEASIBLE"),
    ("durationDays", 2, "INFEASIBLE"),
    ("travelPeriod", {"startDate": "2026-11-13"}, "INFEASIBLE"),
    ("limits", {"appliesTo": "daily", "maxDistanceKm": 4}, "INFEASIBLE"),
])
def test_revision_cannot_bypass_constraints(m4_case, field, value, expected):
    """Thay yêu cầu phải tính lại ngân sách, số người, ngày và giới hạn."""
    request, original, _, _ = m4_case
    assert evaluate_feasibility(request, original, m4_case[2], m4_case[3])["status"] == "FEASIBLE"
    result = revalidate_revision(request, original, change(field, value), **revision_options(m4_case))
    assert result["status"] == expected
    assert result["ranking"]["ranked"] == []
    assert result["ranking"]["excluded"][0]["planId"] == "p1"


def test_infeasible_original_can_become_feasible(m4_case):
    """Không giữ mãi trạng thái lỗi cũ khi yêu cầu đã được sửa hợp lệ."""
    request, original, dataset, costs = m4_case
    request["budget"]["amount"] = 300
    assert evaluate_feasibility(request, original, dataset, costs)["status"] == "INFEASIBLE"
    revision = change("budget", {"amount": 500, "currency": "VND", "scope": "group"})
    result = revalidate_revision(request, original, revision, **revision_options(m4_case))
    assert result["status"] == "FEASIBLE"
    assert len(result["ranking"]["ranked"]) == 1


@pytest.mark.parametrize("edit, expected", [
    ("overlap", "INFEASIBLE"), ("opening", "INFEASIBLE"),
    ("transfer", "INFEASIBLE"), ("leg_endpoint", "INFEASIBLE"),
    ("unknown_cost", "UNVERIFIED"), ("price_mismatch", "UNVERIFIED"),
    ("missing_leg", "UNVERIFIED"),
])
def test_activity_edits_are_revalidated(m4_case, edit, expected):
    """Sửa trực tiếp hoạt động/chặng cũng phải qua đầy đủ bộ kiểm tra."""
    request, original, dataset, _ = m4_case
    revised = deepcopy(original)
    day = revised["days"][0]
    if edit == "overlap":
        day["activities"][1]["startTime"] = "08:30"
    elif edit == "opening":
        day["activities"][0].update(startTime="06:00", endTime="07:00")
    elif edit == "transfer":
        day["activities"][1]["startTime"] = "09:10"
    elif edit == "leg_endpoint":
        day["travelLegs"][0]["fromPlaceId"] = "r1"
    elif edit == "unknown_cost":
        day["activities"][0].update(estimatedCostVnd=None, costStatus="NO_DATA")
    elif edit == "price_mismatch":
        day["activities"][0]["estimatedCostVnd"] = 1
    else:
        day["travelLegs"] = []
    result = revalidate_plan(request, revised, **revision_options(m4_case))
    assert result["status"] == expected
    assert result["ranking"]["ranked"] == []
    assert original["days"][0]["activities"][0]["startTime"] == "08:00"


def test_missing_fresh_costs_do_not_reuse_previous_totals(m4_case):
    """Chi phí cũ không tự xuất hiện lại nếu chưa truyền chi phí được xác nhận."""
    request, original, dataset, costs = m4_case
    previous = evaluate_feasibility(request, original, dataset, costs)
    assert previous["status"] == "FEASIBLE"
    result = revalidate_plan(request, original, dataset=dataset)
    assert result["status"] == "UNVERIFIED"
    assert result["evaluation"]["components"]["cost"]["total_cost"] is None
    assert previous["status"] == "FEASIBLE"


def test_changed_dataset_invalidates_old_evaluation(m4_case):
    """Dataset đổi sau lần kiểm tra trước phải được đọc lại khi chỉnh sửa."""
    request, original, dataset, costs = m4_case
    previous = evaluate_feasibility(request, original, dataset, costs)
    dataset["travel_matrix"][0]["durationMin"] = 31
    result = revalidate_plan(request, original, **revision_options(m4_case))
    assert previous["status"] == "FEASIBLE"
    assert result["status"] == "INFEASIBLE"


def test_request_with_conflicting_end_date_is_rejected(m4_case):
    """Không tự xóa endDate để lách điều kiện durationDays khớp khoảng ngày."""
    request, original, _, _ = m4_case
    request["travelPeriod"]["endDate"] = "2026-11-12"
    with pytest.raises(ValidationError):
        revalidate_revision(request, original, change("durationDays", 2), **revision_options(m4_case))


@pytest.mark.parametrize("case", ["wrong_target", "new_id", "ai_status", "ai_score"])
def test_plan_identity_and_schema_cannot_be_bypassed(m4_case, case):
    """Sai planId hoặc trạng thái/điểm tự gắn phải bị từ chối trước khi chấp nhận lịch."""
    request, original, _, _ = m4_case
    revision = change("budget", {"amount": 500, "currency": "VND", "scope": "group"})
    revised = deepcopy(original)
    error = ValueError
    if case == "wrong_target":
        revision["planId"] = "someone-else"
    elif case == "new_id":
        revised["planId"] = "new-id"
    else:
        revised["status" if case == "ai_status" else "score"] = "FEASIBLE" if case == "ai_status" else 1
        error = ValidationError
    with pytest.raises(error):
        revalidate_revision(request, original, revision, revised_plan=revised, **revision_options(m4_case))


@pytest.fixture
def comparison_case(m4_case):
    """Hai lịch khả thi với nhãn khác nhau để kiểm tra thứ hạng sau revision."""
    request, original, dataset, costs = m4_case
    request["preferences"] = {"interests": [
        {"type": "culture", "priority": 1}, {"type": "nature", "priority": 4},
    ]}
    dataset["attractions"][0]["interestTags"] = ["culture"]
    peer = deepcopy(original)
    peer["planId"] = "p2"
    peer["days"][0]["activities"][0]["placeId"] = "s2"
    peer["days"][0]["travelLegs"][0]["fromPlaceId"] = "s2"
    place = deepcopy(dataset["attractions"][0])
    place.update(id="s2", interestTags=["nature"])
    dataset["attractions"].append(place)
    route = deepcopy(dataset["travel_matrix"][0])
    route["from"] = "s2"
    dataset["travel_matrix"].append(route)
    options = {"dataset": dataset, "candidate_plans": [original, peer],
               "supplemental_costs_by_plan": {"p1": costs, "p2": deepcopy(costs)}}
    return request, original, peer, options


def test_preference_revision_reorders_all_candidates(comparison_case):
    """Ưu tiên thay đổi thì điểm và thứ tự đều phải thay đổi, không dùng ranking cũ."""
    request, original, peer, options = comparison_case
    before = deepcopy(comparison_case)
    previous = revalidate_plan(request, original, **options)
    assert [item["planId"] for item in previous["ranking"]["ranked"]] == ["p1", "p2"]
    revision = change("preferences", {"interests": [
        {"type": "nature", "priority": 1}, {"type": "culture", "priority": 4},
    ]})
    result = revalidate_revision(request, original, revision, **options)
    assert [item["planId"] for item in result["ranking"]["ranked"]] == ["p2", "p1"]
    assert result["ranking"]["ranked"][0]["score"] == pytest.approx(0.545)
    assert comparison_case == before


def test_budget_revision_rechecks_other_candidates_too(comparison_case):
    """Ngân sách mới ảnh hưởng cả tập lịch, không chỉ lịch đang chỉnh sửa."""
    request, original, peer, options = comparison_case
    revision = change("budget", {"amount": 399, "currency": "VND", "scope": "group"})
    result = revalidate_revision(request, original, revision, **options)
    assert result["ranking"]["ranked"] == []
    assert {item["planId"] for item in result["ranking"]["excluded"]} == {"p1", "p2"}


def test_removed_candidate_does_not_leave_stale_time_minmax(comparison_case):
    """Sau khi lịch sửa bị loại, lịch còn lại nhận T=.5 cho tập chỉ có một lịch."""
    request, original, peer, options = comparison_case
    revised = deepcopy(original)
    revised["days"][0]["activities"][1]["startTime"] = "08:30"
    result = revalidate_plan(request, revised, **options)
    assert [item["planId"] for item in result["ranking"]["ranked"]] == ["p2"]
    assert result["ranking"]["ranked"][0]["components"]["T"] == 0.5


def test_revised_activity_changes_interest_score(comparison_case):
    """Thay địa điểm hoạt động phải lấy nhãn mới, không giữ điểm văn hóa của lịch cũ."""
    request, original, peer, options = comparison_case
    revised = deepcopy(peer)
    revised["planId"] = "p1"
    result = revalidate_plan(request, revised, **options)
    scored = next(item for item in result["ranking"]["ranked"] if item["planId"] == "p1")
    assert scored["components"]["P_current"] == 0.2
    assert scored["score"] == pytest.approx(0.275)


def test_request_revision_accepts_a_newly_rebuilt_candidate(m4_case):
    """Sửa thời gian chuyến đi có thể kèm lịch do M3 dựng lại, vẫn phải kiểm tra."""
    request, original, _, _ = m4_case
    revised = deepcopy(original)
    revised["days"][0]["date"] = "2026-12-01"
    result = revalidate_revision(
        request, original, change("travelPeriod", {"month": "2026-12"}),
        revised_plan=revised, **revision_options(m4_case),
    )
    assert result["status"] == "FEASIBLE"
    assert original["days"][0]["date"] == "2026-11-12"


def test_whole_trip_limit_is_reflected_in_top_level_status(m4_case):
    """Không trả status FEASIBLE nếu bước xếp hạng phát hiện vượt giới hạn cả chuyến."""
    request, original, _, _ = m4_case
    result = revalidate_plan(request, original, trip_time_limit_minutes=19, **revision_options(m4_case))
    assert result["status"] == result["evaluation"]["status"] == "INFEASIBLE"
    assert any(reason["code"] == "TRIP_TIME_LIMIT" for reason in result["evaluation"]["reasons"])
    assert result["ranking"]["ranked"] == []


def test_feasible_but_missing_tags_is_not_reported_as_infeasible(m4_case):
    """Thiếu tag để chấm khác với vi phạm ràng buộc bắt buộc."""
    request, original, _, _ = m4_case
    request["preferences"] = {"interests": [{"type": "culture"}]}
    result = revalidate_plan(request, original, **revision_options(m4_case))
    assert result["status"] == "FEASIBLE"
    assert result["ranking"]["ranked"] == []
    assert result["ranking"]["unscored"][0]["score"] is None


def test_history_is_read_but_not_modified_or_automatically_learned(comparison_case):
    """Đánh giá lại chưa phải hành động chọn lịch; không tự thêm vào lịch sử."""
    request, original, peer, options = comparison_case
    history = [{"planId": "old", "interestTags": ["nature"]}]
    before = deepcopy(history)
    result = revalidate_plan(request, original, selected_history=history, **options)
    assert result["ranking"]["ranked"][0]["components"]["alpha"] == 0.1
    assert history == before


def test_duplicate_candidates_are_rejected(m4_case):
    """Không thay thế mơ hồ khi tập so sánh chứa nhiều lịch cùng id."""
    request, original, _, _ = m4_case
    with pytest.raises(ValueError, match="unique"):
        revalidate_plan(request, original, candidate_plans=[original, deepcopy(original)],
                        **revision_options(m4_case))


def test_target_is_added_if_absent_from_comparison_set(comparison_case):
    """Có thể truyền chỉ các lịch còn lại, hàm thêm đúng một bản lịch đã sửa."""
    request, original, peer, options = comparison_case
    options["candidate_plans"] = [peer]
    result = revalidate_plan(request, original, **options)
    assert {item["planId"] for item in result["ranking"]["ranked"]} == {"p1", "p2"}


def test_default_dataset_is_loaded_once(m4_case, monkeypatch):
    """Dùng cùng một dataset cho lần kiểm tra và tính lại thứ hạng."""
    request, original, dataset, costs = m4_case
    calls = []

    def load():
        """Thay nguồn file bằng dataset cố định cho bài kiểm tra."""
        calls.append(True)
        return dataset

    monkeypatch.setattr("app.services.planning_service.load_dataset", load)
    result = revalidate_plan(request, original, supplemental_costs_by_plan={"p1": costs})
    assert result["status"] == "FEASIBLE"
    assert len(calls) == 1


def test_new_activity_does_not_reuse_old_route(m4_case):
    """Thay địa điểm phải tra chặng mới, không dùng chặng của địa điểm cũ."""
    request, original, dataset, _ = m4_case
    place = deepcopy(dataset["attractions"][0])
    place["id"] = "s2"
    dataset["attractions"].append(place)
    revised = deepcopy(original)
    revised["days"][0]["activities"][0]["placeId"] = "s2"
    revised["days"][0]["travelLegs"][0]["fromPlaceId"] = "s2"
    result = revalidate_plan(request, revised, **revision_options(m4_case))
    assert result["status"] == "UNVERIFIED"
    assert any(reason["code"] == "UNSUPPORTED_LEG" for reason in result["evaluation"]["reasons"])


def test_departure_revision_rechecks_departure_limit(m4_case):
    """Giới hạn từ nơi xuất phát không được giữ kết quả của nơi xuất phát cũ."""
    request, original, dataset, _ = m4_case
    request["limits"] = {"appliesTo": "fromDeparture", "maxDistanceKm": 100}
    dataset["travel_matrix"].append({"from": "Hue", "to": "HUE", "durationMin": 20, "distanceKm": 5})
    before = revalidate_plan(request, original, **revision_options(m4_case))
    assert before["status"] == "FEASIBLE"
    result = revalidate_revision(request, original, change("departureLocation", "Other city"),
                                 **revision_options(m4_case))
    assert result["status"] == "UNVERIFIED"
    assert any(reason["path"] == "departureLocation" for reason in result["evaluation"]["reasons"])
