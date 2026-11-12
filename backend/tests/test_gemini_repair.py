"""Tests for bounded M4-feedback itinerary repair."""

import pytest

from app.services.ai import repair_service


def evaluation(status):
    checks = []
    if status == "INFEASIBLE":
        checks = [{
            "status": "INFEASIBLE",
            "code": "OUTSIDE_OPENING_HOURS",
            "path": "days[0].activities[0]",
            "message": "Activity is outside opening hours",
        }]
    return {"status": status, "checks": checks, "reasons": checks}


def test_feasible_plan_needs_no_repair(monkeypatch):
    calls = {"generate": 0, "repair": 0, "evaluate": 0}

    def fake_generate(request, **kwargs):
        calls["generate"] += 1
        return {"planId": "original"}

    def fake_repair(*args, **kwargs):
        calls["repair"] += 1
        return {"planId": "repaired"}

    def fake_evaluate(request, plan):
        calls["evaluate"] += 1
        return evaluation("FEASIBLE")

    monkeypatch.setattr(repair_service, "generate_candidate", fake_generate)
    monkeypatch.setattr(repair_service, "generate_repaired_candidate", fake_repair)
    monkeypatch.setattr(repair_service, "evaluate_plan", fake_evaluate)

    result = repair_service.generate_with_repair({})

    assert result["status"] == "FEASIBLE"
    assert result["repairsUsed"] == 0
    assert result["repairExhausted"] is False
    assert calls == {"generate": 1, "repair": 0, "evaluate": 1}


def test_repair_uses_m4_feedback_and_succeeds(monkeypatch):
    feedback_received = []
    evaluations = iter(["INFEASIBLE", "FEASIBLE"])

    monkeypatch.setattr(
        repair_service,
        "generate_candidate",
        lambda request, **kwargs: {"planId": "original"},
    )

    def fake_repair(request, previous_plan, feedback, **kwargs):
        feedback_received.extend(feedback)
        assert previous_plan["planId"] == "original"
        return {"planId": "repaired"}

    monkeypatch.setattr(
        repair_service,
        "generate_repaired_candidate",
        fake_repair,
    )
    monkeypatch.setattr(
        repair_service,
        "evaluate_plan",
        lambda request, plan: evaluation(next(evaluations)),
    )

    result = repair_service.generate_with_repair({})

    assert result["status"] == "FEASIBLE"
    assert result["plan"]["planId"] == "repaired"
    assert result["repairsUsed"] == 1
    assert result["repairExhausted"] is False
    assert feedback_received[0]["code"] == "OUTSIDE_OPENING_HOURS"


def test_repair_stops_at_limit(monkeypatch):
    calls = {"repair": 0, "evaluate": 0}

    monkeypatch.setattr(
        repair_service,
        "generate_candidate",
        lambda request, **kwargs: {"planId": "original"},
    )

    def fake_repair(request, previous_plan, feedback, **kwargs):
        calls["repair"] += 1
        return {"planId": f"repaired-{calls['repair']}"}

    def fake_evaluate(request, plan):
        calls["evaluate"] += 1
        return evaluation("INFEASIBLE")

    monkeypatch.setattr(
        repair_service,
        "generate_repaired_candidate",
        fake_repair,
    )
    monkeypatch.setattr(
        repair_service,
        "evaluate_plan",
        fake_evaluate,
    )

    result = repair_service.generate_with_repair({}, max_repairs=2)

    assert result["status"] == "INFEASIBLE"
    assert result["repairsUsed"] == 2
    assert result["repairExhausted"] is True
    assert calls == {"repair": 2, "evaluate": 3}


def test_unverified_does_not_trigger_repair(monkeypatch):
    monkeypatch.setattr(
        repair_service,
        "generate_candidate",
        lambda request, **kwargs: {"planId": "original"},
    )
    monkeypatch.setattr(
        repair_service,
        "generate_repaired_candidate",
        lambda *args, **kwargs: pytest.fail("Must not repair UNVERIFIED"),
    )
    monkeypatch.setattr(
        repair_service,
        "evaluate_plan",
        lambda request, plan: evaluation("UNVERIFIED"),
    )

    result = repair_service.generate_with_repair({})

    assert result["status"] == "UNVERIFIED"
    assert result["repairsUsed"] == 0
    assert result["repairExhausted"] is False


@pytest.mark.parametrize("limit", [-1, 1.5, True, "2"])
def test_invalid_repair_limit_rejected(limit):
    with pytest.raises(ValueError):
        repair_service.generate_with_repair({}, max_repairs=limit)


def test_zero_repair_limit(monkeypatch):
    monkeypatch.setattr(
        repair_service,
        "generate_candidate",
        lambda request, **kwargs: {"planId": "original"},
    )
    monkeypatch.setattr(
        repair_service,
        "evaluate_plan",
        lambda request, plan: evaluation("INFEASIBLE"),
    )
    monkeypatch.setattr(
        repair_service,
        "generate_repaired_candidate",
        lambda *args, **kwargs: pytest.fail("No repair allowed"),
    )

    result = repair_service.generate_with_repair({}, max_repairs=0)

    assert result["repairsUsed"] == 0
    assert result["repairExhausted"] is True


def test_feedback_prioritizes_hard_constraints():
    checks = [
        {"status": "INFEASIBLE", "code": "BUDGET", "path": "costs", "message": "Over budget"},
        {"status": "INFEASIBLE", "code": "TRAVEL_LIMIT", "path": "days.1.travelLegs", "message": "Too far"},
        {"status": "INFEASIBLE", "code": "OUTSIDE_OPENING_HOURS", "path": "days.1.activities.0", "message": "Closed"},
        {"status": "INFEASIBLE", "code": "TRANSFER_GAP", "path": "days.1", "message": "Not enough time"},
    ]

    feedback = repair_service.select_repair_feedback({"checks": checks})

    assert [item["code"] for item in feedback] == [
        "OUTSIDE_OPENING_HOURS",
        "TRANSFER_GAP",
        "TRAVEL_LIMIT",
        "BUDGET",
    ]


def test_feedback_does_not_invent_evidence():
    checks = [
        {
            "status": "UNVERIFIED",
            "code": "OPENING_HOURS",
            "path": "days.1.activities.0",
            "message": "Unknown hours",
        },
        {
            "status": "INFEASIBLE",
            "code": "OUTSIDE_OPENING_HOURS",
            "path": "days.1.activities.1",
            "message": "Outside opening hours",
        },
    ]

    feedback = repair_service.select_repair_feedback({"checks": checks})

    assert len(feedback) == 1
    assert feedback[0]["code"] == "OUTSIDE_OPENING_HOURS"
    assert "evidence" not in feedback[0]


@pytest.mark.parametrize("code", ["MALFORMED", "INVALID_PLAN"])
def test_invalid_repair_keeps_last_evaluated_plan(monkeypatch, code):
    from app.services.ai.gemini_client import GeminiError

    monkeypatch.setattr(
        repair_service,
        "generate_candidate",
        lambda request, **kwargs: {"planId": "original"},
    )
    monkeypatch.setattr(
        repair_service,
        "evaluate_plan",
        lambda request, plan: evaluation("INFEASIBLE"),
    )

    def fake_repair(*args, **kwargs):
        raise GeminiError(code, "Invalid repair output", 422)

    monkeypatch.setattr(
        repair_service,
        "generate_repaired_candidate",
        fake_repair,
    )

    result = repair_service.generate_with_repair({})

    assert result["status"] == "INFEASIBLE"
    assert result["plan"]["planId"] == "original"
    assert result["repairsUsed"] == 1
    assert result["repairExhausted"] is False


def test_repair_timeout_propagates_safely(monkeypatch):
    from app.services.ai.gemini_client import GeminiError

    monkeypatch.setattr(
        repair_service,
        "generate_candidate",
        lambda request, **kwargs: {"planId": "original"},
    )
    monkeypatch.setattr(
        repair_service,
        "evaluate_plan",
        lambda request, plan: evaluation("INFEASIBLE"),
    )

    def fake_repair(*args, **kwargs):
        raise GeminiError("TIMEOUT", "Gemini request timed out")

    monkeypatch.setattr(
        repair_service,
        "generate_repaired_candidate",
        fake_repair,
    )

    with pytest.raises(GeminiError) as exc:
        repair_service.generate_with_repair({})

    assert exc.value.code == "TIMEOUT"
