"""Real schema/grounding/M4, using synthetic fixtures and no Gemini."""
from copy import deepcopy
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import planning_service as planning
from app.services.ai import itinerary_generator

client = TestClient(app)
URL = "/itineraries/evaluate"


@pytest.fixture
def case(m4_case, monkeypatch):
    request, plan, dataset, _ = m4_case
    request["preferences"] = {"destination": "HUE"}
    for place in dataset["attractions"] + dataset["dining"]:
        place["destinationId"] = "HUE"
    loader = Mock(return_value=dataset)
    monkeypatch.setattr(planning, "load_dataset", loader)
    monkeypatch.setattr(itinerary_generator, "request_text", Mock(side_effect=AssertionError("No Gemini")))
    return {"request": request, "plan": plan}, dataset, loader


def test_valid_plan_reaches_evaluator_normalized_once(case, monkeypatch):
    body, dataset, loader = case
    body["request"]["departureLocation"] = " Hue "
    body["request"]["budget"]["currency"] = " vnd "
    before = deepcopy((body, dataset))
    result = {"status": "UNVERIFIED", "custom": "preserved"}
    evaluator = Mock(return_value=result)
    monkeypatch.setattr(planning, "evaluate_feasibility", evaluator)
    assert planning.evaluate_plan(body["request"], body["plan"]) is result
    evaluator.assert_called_once()
    request_arg, plan_arg, data_arg = evaluator.call_args.args
    assert request_arg["departureLocation"] == "Hue"
    assert request_arg["budget"]["currency"] == "VND"
    assert request_arg["travelPeriod"]["startDate"] == "2026-11-12"
    assert plan_arg == body["plan"]
    assert data_arg is dataset
    assert data_arg["attractions"][0]["opening_hours"] == "7:00 - 17:30"
    loader.assert_called_once()
    assert loader.call_args.kwargs["request"]["preferences"]["destination"] == body["request"]["preferences"]["destination"]
    assert (body, dataset) == before
    itinerary_generator.request_text.assert_not_called()


@pytest.mark.parametrize("status", ["FEASIBLE", "INFEASIBLE", "UNVERIFIED"])
def test_evaluator_results_are_200_unchanged(case, monkeypatch, status):
    body, _, loader = case
    result = {"status": status, "planId": "p1", "checks": [], "reasons": [], "components": {}}
    evaluator = Mock(return_value=result)
    monkeypatch.setattr(planning, "evaluate_feasibility", evaluator)
    response = client.post(URL, json=body)
    assert response.status_code == 200
    assert response.json() == result
    evaluator.assert_called_once()
    loader.assert_called_once()
    assert loader.call_args.kwargs["request"]["preferences"]["destination"] == body["request"]["preferences"]["destination"]


@pytest.mark.parametrize("failure", [
    "request", "plan", "destination", "place", "missing_ids", "unsupported", "mapping", "cost", "travel",
])
def test_invalid_inputs_do_not_reach_m4(case, monkeypatch, failure):
    body, dataset, loader = case
    if failure == "request":
        body["request"]["durationDays"] = 0
    elif failure == "plan":
        body["plan"]["status"] = "FEASIBLE"
    elif failure == "destination":
        body["plan"]["destinationId"] = "unknown"
    elif failure == "place":
        body["plan"]["days"][0]["activities"][0]["placeId"] = "unknown"
    elif failure == "missing_ids":
        dataset["destinations"] = [{"name": "Test destination without ID"}]
    elif failure == "unsupported":
        body["request"]["preferences"]["destination"] = "unsupported"
    elif failure == "mapping":
        dataset["attractions"][0]["destinationId"] = "unrelated"
    elif failure == "cost":
        body["plan"]["days"][0]["activities"][0]["estimatedCostVnd"] = 101
    else:
        body["plan"]["days"][0]["travelLegs"][0]["durationMin"] = 21
    before = deepcopy((body, dataset))
    evaluator = Mock(side_effect=AssertionError("Must reject before M4"))
    monkeypatch.setattr(planning, "evaluate_feasibility", evaluator)
    response = client.post(URL, json=body)
    assert response.status_code == 422
    assert response.json()["error"] in {"VALIDATION_ERROR", "INVALID_PLAN", "NO_DATA"}
    evaluator.assert_not_called()
    assert loader.call_count == (0 if failure in ("request", "plan") else 1)
    assert (body, dataset) == before


@pytest.mark.parametrize("body", [{}, {"request": {}, "plan": []}, {"request": {}, "plan": {}, "extra": True}])
def test_invalid_envelope_is_422(monkeypatch, body):
    loader = Mock()
    monkeypatch.setattr(planning, "load_dataset", loader)
    assert client.post(URL, json=body).status_code == 422
    loader.assert_not_called()


def test_real_m4_missing_supplements_is_unverified_without_mutation(case):
    body, dataset, loader = case
    before = deepcopy((body, dataset))
    response = client.post(URL, json=body)
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "UNVERIFIED"
    assert result["components"]["schedule"]["status"] == "FEASIBLE"
    assert result["components"]["travel"]["status"] == "FEASIBLE"
    assert result["components"]["cost"]["missing_costs"] == ["transport", "accommodation"]
    assert (body, dataset) == before
    loader.assert_called_once()
    assert loader.call_args.kwargs["request"]["preferences"]["destination"] == body["request"]["preferences"]["destination"]


def test_real_m4_known_budget_excess_is_infeasible(case):
    body, _, _ = case
    body["request"]["budget"]["amount"] = 1
    response = client.post(URL, json=body)
    assert response.status_code == 200
    assert response.json()["status"] == "INFEASIBLE"


def test_missing_leg_is_not_fabricated(case):
    body, dataset, _ = case
    body["plan"]["days"][0]["travelLegs"] = []
    before = deepcopy((body, dataset))
    response = client.post(URL, json=body)
    assert response.status_code == 200
    assert response.json()["status"] == "UNVERIFIED"
    assert any(c["code"] == "MISSING_LEG" for c in response.json()["reasons"])
    assert (body, dataset) == before


def test_missing_matrix_is_unknown(case):
    body, dataset, _ = case
    dataset["travel_matrix"] = []
    body["plan"]["days"][0]["travelLegs"][0].update(durationMin=None, distanceKm=None)
    response = client.post(URL, json=body)
    assert response.status_code == 200
    assert response.json()["status"] == "UNVERIFIED"
    assert any(c["code"] == "UNSUPPORTED_LEG" for c in response.json()["reasons"])


@pytest.mark.parametrize("exception", [FileNotFoundError, ValueError, RuntimeError])
def test_dataset_errors_are_safe(case, monkeypatch, exception):
    body, _, loader = case
    loader.side_effect = exception("private/path API_KEY=test-secret")
    evaluator = Mock()
    monkeypatch.setattr(planning, "evaluate_feasibility", evaluator)
    response = client.post(URL, json=body)
    assert response.status_code == 500
    assert response.json() == {"error": "DATASET_ERROR", "message": "Unable to load planning data.", "details": None}
    assert "test-secret" not in response.text
    evaluator.assert_not_called()


def test_unexpected_evaluator_error_is_safe(case, monkeypatch):
    body, _, _ = case
    monkeypatch.setattr(planning, "evaluate_feasibility", Mock(side_effect=RuntimeError("private test-secret")))
    response = client.post(URL, json=body)
    assert response.status_code == 500
    assert response.json() == {"error": "INTERNAL"}


@pytest.mark.parametrize("malformed", [
    None, [],
    {"destinations": 123}, {"destinations": {}},
    {"attractions": None}, {"dining": "private test-secret"},
    {"travel_matrix": 123},
])
def test_malformed_dataset_is_distinct_from_context_bug(case, monkeypatch, malformed):
    body, _, loader = case
    loader.return_value = malformed
    context = Mock(side_effect=AssertionError("Must reject container before building context"))
    evaluator = Mock()
    monkeypatch.setattr(planning, "build_context", context)
    monkeypatch.setattr(planning, "evaluate_feasibility", evaluator)
    response = client.post(URL, json=body)
    assert response.status_code == 500
    assert response.json() == {
        "error": "DATASET_ERROR", "message": "Invalid planning data structure.", "details": None,
    }
    assert "test-secret" not in response.text
    context.assert_not_called()
    evaluator.assert_not_called()
    loader.assert_called_once()
    assert loader.call_args.kwargs["request"]["preferences"]["destination"] == body["request"]["preferences"]["destination"]


@pytest.mark.parametrize("exception", [RuntimeError, ValueError, TypeError])
def test_unexpected_context_bug_is_safe_internal_error(case, monkeypatch, exception):
    body, _, loader = case
    monkeypatch.setattr(planning, "build_context", Mock(side_effect=exception("private test-secret")))
    evaluator = Mock()
    monkeypatch.setattr(planning, "evaluate_feasibility", evaluator)
    response = client.post(URL, json=body)
    assert response.status_code == 500
    assert response.json() == {"error": "INTERNAL"}
    evaluator.assert_not_called()
    loader.assert_called_once()
    assert loader.call_args.kwargs["request"]["preferences"]["destination"] == body["request"]["preferences"]["destination"]


def test_departure_route_and_metadata_reach_m4(case):
    body, dataset, _ = case
    body["request"]["limits"] = {"appliesTo": "fromDeparture", "maxDistanceKm": 4}
    dataset["travel_matrix"].append({"from": "Hue", "to": "HUE", "durationMin": 20, "distanceKm": 5})
    before = deepcopy((body, dataset))
    response = client.post(URL, json=body)
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "INFEASIBLE"
    assert any(c["code"] == "TRAVEL_LIMIT" and c["path"] == "departureLocation" for c in result["reasons"])
    assert (body, dataset) == before
