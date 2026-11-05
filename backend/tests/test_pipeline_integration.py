"""Client flow through real generation gates and evaluation; no external AI."""
from copy import deepcopy
import json
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import planning_service as planning
from app.services.ai import itinerary_generator as generator

client = TestClient(app)


@pytest.fixture
def pipeline(m4_case, monkeypatch):
    request, plan, dataset, _ = m4_case
    request["departureLocation"] = " Hue "
    request["budget"]["currency"] = " vnd "
    request["preferences"] = {"destination": "HUE"}
    for place in dataset["attractions"] + dataset["dining"]:
        place["destinationId"] = "HUE"
    monkeypatch.setattr(generator, "load_dataset", lambda: dataset)
    monkeypatch.setattr(planning, "load_dataset", lambda: dataset)
    text = Mock(side_effect=lambda *args, **kwargs: json.dumps(plan))
    monkeypatch.setattr(generator, "request_text", text)
    prompt = Mock(wraps=generator.build_prompt)
    monkeypatch.setattr(generator, "build_prompt", prompt)
    evaluator = Mock(wraps=planning.evaluate_feasibility)
    monkeypatch.setattr(planning, "evaluate_feasibility", evaluator)
    return request, plan, dataset, text, prompt, evaluator


@pytest.mark.parametrize("case", ["valid", "budget", "missing_matrix"])
def test_generate_then_evaluate_pipeline(pipeline, case):
    request, plan, dataset, text, prompt, evaluator = pipeline
    if case == "budget":
        request["budget"]["amount"] = 1
    elif case == "missing_matrix":
        dataset["travel_matrix"] = []
        plan["days"][0]["travelLegs"][0].update(durationMin=None, distanceKm=None)
    before = deepcopy((request, plan, dataset))
    generated = client.post("/itineraries/generate", json=request)
    assert generated.status_code == 200
    assert generated.json() == {"status": "UNVERIFIED", "plan": plan}
    text.assert_called_once()
    normalized = prompt.call_args.args[0]
    assert normalized["departureLocation"] == "Hue"
    assert normalized["budget"]["currency"] == "VND"
    evaluated = client.post("/itineraries/evaluate", json={"request": request, "plan": generated.json()["plan"]})
    assert evaluated.status_code == 200
    evaluator.assert_called_once()
    result = evaluated.json()
    assert result["status"] == ("INFEASIBLE" if case == "budget" else "UNVERIFIED")
    if case == "missing_matrix":
        assert any(c["code"] == "UNSUPPORTED_LEG" for c in result["reasons"])
        assert plan["days"][0]["travelLegs"][0]["durationMin"] is None
    assert (request, plan, dataset) == before


@pytest.mark.parametrize("case", ["request", "unsupported", "missing_ids", "schema", "place", "mapping", "cost"])
def test_pipeline_rejects_before_downstream(pipeline, case):
    request, plan, dataset, text, _, evaluator = pipeline
    if case == "request":
        request["durationDays"] = 0
    elif case == "unsupported":
        request["preferences"]["destination"] = "unsupported"
    elif case == "missing_ids":
        dataset["destinations"] = []
    elif case == "schema":
        plan["verified"] = True
    elif case == "place":
        plan["days"][0]["activities"][0]["placeId"] = "unknown"
    elif case == "mapping":
        dataset["attractions"][0]["destinationId"] = "unrelated"
    else:
        plan["days"][0]["activities"][0]["estimatedCostVnd"] = 101
    response = client.post("/itineraries/generate", json=request)
    assert response.status_code == 422
    evaluator.assert_not_called()
    if case in ("request", "unsupported", "missing_ids"):
        text.assert_not_called()
    else:
        text.assert_called_once()
    # A client cannot bypass generation's gate by submitting the same pair.
    assert client.post("/itineraries/evaluate", json={"request": request, "plan": plan}).status_code == 422
    evaluator.assert_not_called()


def test_generation_dataset_failure_is_safe(pipeline, monkeypatch):
    request, _, _, text, _, evaluator = pipeline
    monkeypatch.setattr(generator, "load_dataset", Mock(side_effect=OSError("private secret")))
    response = client.post("/itineraries/generate", json=request)
    assert response.status_code == 500
    assert response.json() == {"error": "INTERNAL"}
    text.assert_not_called()
    evaluator.assert_not_called()


def test_ranking_is_explicitly_unavailable(pipeline):
    _, _, _, text, _, evaluator = pipeline
    response = client.post("/itineraries/rank", json={"status": "FEASIBLE", "score": 100})
    assert response.status_code == 501
    assert response.json()["error"] == "RANKING_UNAVAILABLE"
    assert "plans" not in response.json()
    text.assert_not_called()
    evaluator.assert_not_called()
