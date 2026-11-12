from copy import deepcopy
from unittest.mock import Mock

from app.services.ai import repair_service


def make_plan(place_id):
    return {
        "days": [{
            "dayNumber": 1,
            "activities": [{
                "placeId": place_id,
                "startTime": "09:00",
            }],
        }],
    }


def test_multiple_repair_distinct_candidates(monkeypatch):
    plans = [make_plan("A"), make_plan("B"), make_plan("C")]

    generate = Mock(side_effect=deepcopy(plans))
    evaluate = Mock(return_value={
        "status": "FEASIBLE",
        "checks": [],
    })

    monkeypatch.setattr(repair_service, "generate_candidate", generate)
    monkeypatch.setattr(repair_service, "evaluate_plan", evaluate)
    monkeypatch.setattr(
        "app.services.ai.itinerary_generator.load_dataset",
        lambda **kwargs: {},
    )

    result = repair_service.generate_candidates_with_repair({}, count=3)

    assert len(result["candidates"]) == 3
    assert result["warnings"] == []
    assert generate.call_count == 3
    assert evaluate.call_count == 3


def test_multiple_repair_stops_after_two_repairs(monkeypatch):
    original = make_plan("A")
    repaired1 = make_plan("B")
    repaired2 = make_plan("C")

    generate = Mock(return_value=original)
    repair = Mock(side_effect=[repaired1, repaired2])
    evaluate = Mock(return_value={
        "status": "INFEASIBLE",
        "checks": [{
            "status": "INFEASIBLE",
            "code": "OUTSIDE_OPENING_HOURS",
            "path": "days.0.activities.0",
            "message": "Outside opening hours",
        }],
    })

    monkeypatch.setattr(repair_service, "generate_candidate", generate)
    monkeypatch.setattr(repair_service, "generate_repaired_candidate", repair)
    monkeypatch.setattr(repair_service, "evaluate_plan", evaluate)
    monkeypatch.setattr(
        "app.services.ai.itinerary_generator.load_dataset",
        lambda **kwargs: {},
    )

    result = repair_service.generate_candidates_with_repair({}, count=1)

    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["repairsUsed"] == 2
    assert result["candidates"][0]["repairExhausted"] is True
    assert repair.call_count == 2
    assert evaluate.call_count == 3


def test_multiple_repair_skips_duplicate_after_repair(monkeypatch):
    plan_a = make_plan("A")
    plan_b = make_plan("B")
    plan_c = make_plan("C")

    generate = Mock(side_effect=[
        plan_a, plan_b, plan_c,
    ])

    evaluate = Mock(side_effect=[
        {"status": "FEASIBLE", "checks": []},
        {
            "status": "INFEASIBLE",
            "checks": [{
                "status": "INFEASIBLE",
                "code": "OUTSIDE_OPENING_HOURS",
                "path": "days.0.activities.0",
                "message": "Outside opening hours",
            }],
        },
        {"status": "FEASIBLE", "checks": []},
        {"status": "FEASIBLE", "checks": []},
    ])

    repair = Mock(return_value=plan_a)

    monkeypatch.setattr(repair_service, "generate_candidate", generate)
    monkeypatch.setattr(repair_service, "generate_repaired_candidate", repair)
    monkeypatch.setattr(repair_service, "evaluate_plan", evaluate)
    monkeypatch.setattr(
        "app.services.ai.itinerary_generator.load_dataset",
        lambda **kwargs: {},
    )

    result = repair_service.generate_candidates_with_repair({}, count=2)

    assert len(result["candidates"]) == 2
    assert result["candidates"][0]["plan"] == plan_a
    assert result["candidates"][1]["plan"] == plan_c
    assert repair.call_count == 1
    assert any("Duplicate" in warning for warning in result["warnings"])
