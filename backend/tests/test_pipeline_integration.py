"""Client flow through generate, evaluate and rank; no external AI."""
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
def test_generate_evaluate_rank_pipeline(pipeline, case):
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
    result = evaluated.json()
    assert result["status"] == ("INFEASIBLE" if case == "budget" else "UNVERIFIED")
    if case == "missing_matrix":
        assert any(c["code"] == "UNSUPPORTED_LEG" for c in result["reasons"])
        assert plan["days"][0]["travelLegs"][0]["durationMin"] is None

    ranked = client.post(
        "/itineraries/rank", json={"request": request, "plans": [generated.json()["plan"]]}
    )
    assert ranked.status_code == 200
    ranking = ranked.json()
    assert ranking["ranked"] == []
    assert ranking["unscored"] == []
    assert ranking["excluded"][0]["status"] == (
        "INFEASIBLE" if case == "budget" else "UNVERIFIED"
    )
    # Evaluate and rank use the same planning-service evaluation policy.
    assert evaluator.call_count == 2
    assert (request, plan, dataset) == before


@pytest.mark.parametrize("candidate_count", [0, 1, 2, 3])
def test_pipeline_endpoint_returns_zero_to_three_candidates(
    pipeline, monkeypatch, candidate_count
):
    request, plan, _, _, _, _ = pipeline
    plans = []
    place_ids = ["ATTR_H_01", "ATTR_H_02", "ATTR_H_03"]
    for index, place_id in enumerate(place_ids[:candidate_count]):
        candidate = deepcopy(plan)
        candidate["planId"] = f"pipeline-{index + 1}"
        candidate["days"][0]["activities"][0]["placeId"] = place_id
        plans.append(candidate)

    calls = 0

    def generate(_request, _dataset, *, previous_plans):
        nonlocal calls
        if calls < candidate_count:
            result = plans[calls]
            calls += 1
            return result
        calls += 1
        if candidate_count == 0:
            raise GeminiError("EMPTY", "No candidate was generated.")
        raise GeminiError("API_ERROR", "Generation stopped.")

    monkeypatch.setattr(planning, "generate_candidate", generate)
    monkeypatch.setattr(
        planning,
        "evaluate_plan",
        lambda _request, candidate, **_kwargs: {
            "planId": candidate["planId"],
            "status": "FEASIBLE",
            "reasons": [],
            "components": {},
        },
    )
    monkeypatch.setattr(
        planning,
        "rank_candidate_plans",
        lambda _request, candidates, **_kwargs: {
            "ranked": [{"planId": item["planId"]} for item in candidates],
            "unscored": [],
            "excluded": [],
        },
    )

    response = client.post(
        "/itineraries/pipeline",
        json={"request": request, "count": 3},
    )
    if candidate_count == 0:
        assert response.status_code == 502
        assert response.json()["error"] == "NO_CANDIDATES"
        return

    assert response.status_code == 200
    result = response.json()
    assert len(result["candidates"]) == candidate_count
    assert result["pipelineStatus"] == (
        "COMPLETE" if candidate_count == 3 else "PARTIAL"
    )
    assert len(result["ranking"]["ranked"]) == candidate_count
    assert all(
        candidate["status"] == "FEASIBLE"
        and candidate["evaluation"]["status"] == "FEASIBLE"
        for candidate in result["candidates"]
    )
    if candidate_count < 3:
        assert any(
            warning["code"] == "INSUFFICIENT_CANDIDATES"
            for warning in result["warnings"]
        )


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


def test_ranking_rejects_client_declared_status_and_score(pipeline):
    _, _, _, text, _, evaluator = pipeline
    response = client.post("/itineraries/rank", json={"status": "FEASIBLE", "score": 100})
    assert response.status_code == 422
    assert response.json()["detail"]
    text.assert_not_called()
    evaluator.assert_not_called()
