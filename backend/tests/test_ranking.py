"""Kiểm tra công thức TPVA-25 được dùng lại sau revision của TPVA-26."""

import pytest

from app.algorithms.ranking import (
    build_history_profile, calculate_cost_score, calculate_personalized_preference,
    calculate_preference_score, calculate_total_score, calculate_travel_score,
    rank_candidates,
)


@pytest.mark.parametrize("count, alpha", [(0, 0), (1, 0.1), (2, 0.1), (3, 0.2), (8, 0.2)])
def test_history_alpha_boundaries(count, alpha):
    """Số lịch dùng được, không phải số hoạt động, quyết định alpha."""
    history = [{"planId": f"old-{index}", "interestTags": ["culture"]} for index in range(count)]
    assert build_history_profile(history)["alpha"] == alpha


def test_duplicate_or_unusable_history_does_not_inflate_alpha():
    """Một lịch lặp ba lần không được tính như ba lịch đã chọn."""
    record = {"planId": "old", "interestTags": ["culture", "culture"]}
    history = [record, record, record, {"planId": "no-tags"}]
    assert build_history_profile(history) == {
        "usablePlanCount": 1, "alpha": 0.1, "weights": {"culture": 1},
    }


def test_current_preferences_and_total_formula():
    """Kiểm tra bằng phép tính tay, điểm nội bộ 0–1."""
    interests = [{"type": "culture", "priority": 1}, {"type": "nature", "priority": 4}]
    current = calculate_preference_score(interests, ["culture"])
    assert current == 0.8
    personal = calculate_personalized_preference(current, 0.3, 0.2)
    assert personal == pytest.approx(0.7)
    assert calculate_total_score(personal, 0.5, 0.4) == pytest.approx(0.565)


def test_history_has_at_most_nine_percent_total_weight():
    """Lịch sử tối đa đóng góp 0.45 * 0.2 = 0.09 vào S."""
    personal = calculate_personalized_preference(0, 1, 0.2)
    assert calculate_total_score(personal, 0, 0) == pytest.approx(0.09)


@pytest.mark.parametrize("cost, budget, expected", [
    (0, 100, 1), (20, 100, 0.8), (100, 100, 0),
    (150, 100, 0), (None, 100, None), (0, 0, None),
])
def test_cost_formula_and_missing_values(cost, budget, expected):
    """Chi phí thiếu hoặc ngân sách 0 không được tự suy thành điểm 0/1."""
    assert calculate_cost_score(cost, budget) == expected


@pytest.mark.parametrize("minutes, limit, low, high, expected", [
    (20, 100, None, None, 0.8), (100, 100, None, None, 0),
    (20, None, 20, 40, 1), (30, None, 20, 40, 0.5),
    (40, None, 20, 40, 0), (20, None, 20, 20, 0.5),
    (None, 100, None, None, None),
])
def test_travel_formula_and_neutral_tie(minutes, limit, low, high, expected):
    """T được tính lại trong cùng lượt; một lịch hoặc bằng nhau nhận 0.5."""
    assert calculate_travel_score(minutes, limit, low, high) == expected


def test_ranker_never_accepts_a_client_feasible_flag(m4_case):
    """Schema CandidatePlan từ chối cờ trạng thái do client/AI tự thêm."""
    request, plan, dataset, costs = m4_case
    plan["status"] = "FEASIBLE"
    result = rank_candidates(request, [plan], dataset, {"p1": costs})
    assert result["ranked"] == []
    assert result["excluded"][0]["status"] == "UNVERIFIED"
