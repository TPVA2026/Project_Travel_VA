"""Tests for TPVA-21 Gemini itinerary revision."""

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.ai import revision_service
from app.services.ai.gemini_client import GeminiError


def test_revision_uses_updated_request_and_revalidates(monkeypatch):
    original = {
        "planId": "plan-1",
        "title": "Original itinerary",
        "destinationId": "DN",
        "days": [
            {
                "dayNumber": 1,
                "date": "2026-12-01",
                "activities": [],
                "travelLegs": [],
            }
        ],
        "missingData": [],
        "assumptions": [],
    }

    revised = deepcopy(original)
    revised["title"] = "Revised itinerary"

    received = {"evaluate_calls": 0}

    def fake_prepare(request, revision):
        received["original_request"] = request
        received["revision"] = revision
        return {"budget": {"amount": 5000000}}

    def fake_generate(request, previous_plan, revision_change, **kwargs):
        received["gemini_request"] = request
        received["previous_plan"] = previous_plan
        received["change"] = revision_change
        return revised

    def fake_evaluate(request, plan):
        received["evaluate_calls"] += 1
        received["evaluated_plan"] = plan
        return {"status": "UNVERIFIED"}

    monkeypatch.setattr(
        revision_service, "apply_revision", fake_prepare
    )
    monkeypatch.setattr(
        revision_service, "generate_revised_candidate", fake_generate
    )
    monkeypatch.setattr(
        revision_service, "evaluate_plan", fake_evaluate
    )

    change = {
        "planId": "plan-1",
        "changeType": "budget",
        "budget": {"amount": 5000000},
    }

    result = revision_service.revise_with_gemini(
        {"budget": {"amount": 8000000}},
        original,
        change,
    )

    assert received["gemini_request"]["budget"]["amount"] == 5000000
    assert received["previous_plan"] == original
    assert received["change"] == change
    assert received["evaluated_plan"] == revised
    assert received["evaluate_calls"] == 1
    assert result["plan"] == revised
    assert result["evaluation"]["status"] == "UNVERIFIED"


@pytest.mark.parametrize(
    ("code", "status", "expected_http"),
    [
        ("TIMEOUT", None, 504),
        ("CONFIG", None, 500),
        ("INVALID_PLAN", 422, 422),
        ("API_ERROR", 503, 502),
    ],
)
def test_revision_api_handles_gemini_errors(
    monkeypatch, code, status, expected_http
):
    def fake_revision(*args, **kwargs):
        raise GeminiError(code, "Gemini revision failed", status)

    monkeypatch.setattr(
        "app.api.itineraries.revise_with_gemini",
        fake_revision,
    )

    response = TestClient(app).post(
        "/itineraries/revise",
        json={
            "request": {},
            "plan": {},
            "revision": {},
            "autoRegenerate": True,
        },
    )

    assert response.status_code == expected_http
    assert response.json()["error"] == code


def test_revision_api_uses_gemini_when_enabled(monkeypatch):
    calls = []

    def fake_revision(request, plan, revision):
        calls.append("gemini")
        return {
            "request": request,
            "plan": plan,
            "evaluation": {"status": "UNVERIFIED"},
        }

    monkeypatch.setattr(
        "app.api.itineraries.revise_with_gemini",
        fake_revision,
    )

    response = TestClient(app).post(
        "/itineraries/revise",
        json={
            "request": {},
            "plan": {"planId": "p1"},
            "revision": {},
            "autoRegenerate": True,
        },
    )

    assert response.status_code == 200
    assert calls == ["gemini"]


def test_revision_api_legacy_mode(monkeypatch):
    calls = []

    def fake_legacy(request, plan, revision):
        calls.append("legacy")
        return {
            "request": request,
            "plan": plan,
            "evaluation": {"status": "UNVERIFIED"},
        }

    monkeypatch.setattr(
        "app.api.itineraries.revise_and_evaluate",
        fake_legacy,
    )

    response = TestClient(app).post(
        "/itineraries/revise",
        json={
            "request": {},
            "plan": {"planId": "p1"},
            "revision": {},
        },
    )

    assert response.status_code == 200
    assert calls == ["legacy"]


def test_revised_candidate_rejects_unknown_place(monkeypatch, m4_case):
    import json
    from app.services.ai import itinerary_generator as generator

    request, plan, dataset, _ = m4_case
    invalid = deepcopy(plan)
    invalid["days"][0]["activities"][0]["placeId"] = "FAKE_PLACE_999"

    monkeypatch.setattr(
        generator,
        "request_text",
        lambda *args, **kwargs: json.dumps(invalid),
    )

    with pytest.raises(GeminiError) as exc:
        generator.generate_revised_candidate(
            request,
            plan,
            {"changeType": "budget"},
            dataset=dataset,
        )

    assert exc.value.code == "INVALID_PLAN"
    assert any("unknown placeId" in str(e) for e in exc.value.details)


def test_revised_candidate_rejects_malformed_json(monkeypatch, m4_case):
    from app.services.ai import itinerary_generator as generator

    request, plan, dataset, _ = m4_case

    monkeypatch.setattr(
        generator,
        "request_text",
        lambda *args, **kwargs: "{invalid json",
    )

    with pytest.raises(GeminiError) as exc:
        generator.generate_revised_candidate(
            request,
            plan,
            {"changeType": "budget"},
            dataset=dataset,
        )

    assert exc.value.code == "MALFORMED"


def test_revision_prompt_includes_original_plan_and_change():
    from app.services.ai.prompt_templates import build_prompt

    original = {"planId": "plan-1", "days": []}
    change = {"changeType": "budget", "budget": {"amount": 5000000}}

    prompt = build_prompt(
        {"budget": {"amount": 5000000}},
        {"destinations": [], "attractions": [], "dining": []},
        revision_plan=original,
        revision_change=change,
    )

    assert "USER_REVISION_TASK" in prompt
    assert "ORIGINAL_PLAN" in prompt
    assert "REQUESTED_CHANGE" in prompt
    assert "plan-1" in prompt
    assert "5000000" in prompt
    assert "Preserve unaffected activities" in prompt
