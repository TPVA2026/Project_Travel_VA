import json
from pathlib import Path
from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.main import app
from app.api import itineraries


client = TestClient(app)


def load_hue_request():
    path = Path(__file__).parent / "fixtures" / "acceptance" / "hue_scenarios.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    scenario = next(
        item for item in data["scenarios"]
        if item["id"] == "S05_attr_h_08_before_opening"
    )
    return scenario["body"]["request"], scenario["body"]["plan"]


def test_generate_with_auto_repair(monkeypatch):
    request, plan = load_hue_request()

    mock_repair = Mock(return_value={
        "status": "UNVERIFIED",
        "plan": plan,
        "evaluation": {
            "status": "UNVERIFIED",
            "checks": [],
        },
        "repairsUsed": 1,
        "repairExhausted": False,
    })

    monkeypatch.setattr(itineraries, "generate_with_repair", mock_repair)

    response = client.post(
        "/itineraries/generate",
        json={**request, "autoRepair": True},
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "UNVERIFIED"
    assert response.json()["repairsUsed"] == 1
    mock_repair.assert_called_once()


def test_generate_rejects_invalid_auto_repair(monkeypatch):
    request, _ = load_hue_request()

    mock_repair = Mock()
    monkeypatch.setattr(itineraries, "generate_with_repair", mock_repair)

    response = client.post(
        "/itineraries/generate",
        json={**request, "autoRepair": "yes"},
    )

    assert response.status_code == 422
    mock_repair.assert_not_called()


def test_auto_repair_timeout_returns_504(monkeypatch):
    from app.services.ai.gemini_client import GeminiError

    request, _ = load_hue_request()

    monkeypatch.setattr(
        itineraries,
        "generate_with_repair",
        Mock(side_effect=GeminiError("TIMEOUT", "Gemini timed out")),
    )

    response = client.post(
        "/itineraries/generate",
        json={**request, "autoRepair": True},
    )

    assert response.status_code == 504
    assert response.json()["error"] == "TIMEOUT"


def test_auto_repair_invalid_plan_returns_422(monkeypatch):
    from app.services.ai.gemini_client import GeminiError

    request, _ = load_hue_request()

    monkeypatch.setattr(
        itineraries,
        "generate_with_repair",
        Mock(side_effect=GeminiError(
            "INVALID_PLAN",
            "Plan failed schema checks",
            422,
        )),
    )

    response = client.post(
        "/itineraries/generate",
        json={**request, "autoRepair": True},
    )

    assert response.status_code == 422
    assert response.json()["error"] == "INVALID_PLAN"


def test_auto_repair_planning_error_returns_status(monkeypatch):
    from app.services.planning_service import PlanningError

    request, _ = load_hue_request()

    monkeypatch.setattr(
        itineraries,
        "generate_with_repair",
        Mock(side_effect=PlanningError(
            "INVALID_PLAN",
            "M4 rejected the plan",
            status_code=422,
        )),
    )

    response = client.post(
        "/itineraries/generate",
        json={**request, "autoRepair": True},
    )

    assert response.status_code == 422
    assert response.json()["error"] == "INVALID_PLAN"
