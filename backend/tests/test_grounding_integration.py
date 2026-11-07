"""Real schema and grounding gates; Gemini is mocked at request_text."""
import copy
import json
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.ai.context_builder import build_context, supported_place_ids
from app.services.ai import itinerary_generator as generator
from app.services.ai.gemini_client import GeminiError
from app.services.data_service import load_dataset

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def data():
    ds = json.loads((FIX / "sample_dataset.json").read_text())
    # Explicit test-only relationships; production records are never assigned mappings.
    for place in ds["attractions"] + ds["dining"]:
        place["destinationId"] = "DN"
    return ds


@pytest.fixture
def plan():
    return json.loads((FIX / "sample_response.json").read_text())["plan"]


@pytest.mark.parametrize("field", ["id", "name", "city", "city_name"])
def test_canonical_destination_resolves_explicit_dataset_value(data, field):
    dest = data["destinations"][0]
    if field not in dest:
        dest[field] = dest["name"]  # Test-only alias, using an existing fixture value.
    ctx = build_context({"preferences": {"destination": dest[field]}}, data)
    assert supported_place_ids(ctx) == {p["id"] for p in data["attractions"] + data["dining"]}
    assert [d["id"] for d in ctx["destinations"]] == [dest["id"]]


def test_canonical_selection_overrides_legacy(data):
    ctx = build_context({"preferences": {"destination": "unsupported"},
                         "preferredDestination": "DN"}, data)
    assert not supported_place_ids(ctx)


def test_ambiguous_name_is_not_resolved(data):
    data["destinations"].append({"id": "HN", "name": data["destinations"][0]["name"]})
    ctx = build_context({"preferences": {"destination": data["destinations"][0]["name"]}}, data)
    assert not supported_place_ids(ctx)


def test_membership_is_not_inferred_from_prefix(data):
    for place in data["attractions"] + data["dining"]:
        del place["destinationId"]
    assert not supported_place_ids(build_context({"preferences": {"destination": "DN"}}, data))


@pytest.mark.parametrize("destinations", [[], [{"name": "No ID"}], [{"id": None}], [{"id": "bad id"}]])
def test_missing_destination_ids_fail_closed(data, plan, destinations, monkeypatch):
    data["destinations"] = destinations
    text = Mock(side_effect=AssertionError("Gemini must not run"))
    monkeypatch.setattr(generator, "request_text", text)
    assert generator.check_grounding(plan, data)
    with pytest.raises(GeminiError) as exc:
        generator.generate_candidate({}, data)
    assert (exc.value.code, exc.value.status) == ("NO_DATA", 422)
    text.assert_not_called()


def test_real_dataset_without_ids_does_not_call_gemini(monkeypatch):
    text = Mock(side_effect=AssertionError("Gemini must not run"))
    monkeypatch.setattr(generator, "request_text", text)
    with pytest.raises(GeminiError) as exc:
        generator.generate_candidate({}, load_dataset())
    assert (exc.value.code, exc.value.status) == ("NO_DATA", 422)
    text.assert_not_called()


@pytest.mark.parametrize("selection", ["unsupported", "", 123])
def test_unsupported_selection_does_not_call_gemini(data, selection, monkeypatch):
    text = Mock(side_effect=AssertionError("Gemini must not run"))
    monkeypatch.setattr(generator, "request_text", text)
    with pytest.raises(GeminiError) as exc:
        generator.generate_candidate({"preferences": {"destination": selection}}, data)
    assert (exc.value.code, exc.value.status) == ("NO_DATA", 422)
    text.assert_not_called()


@pytest.mark.parametrize("component", ["activity", "travel_leg"])
def test_grounding_enforces_explicit_membership(data, plan, component):
    data["destinations"].append({"id": "HN"})
    pid = (plan["days"][0]["activities"][0]["placeId"] if component == "activity"
           else plan["days"][0]["travelLegs"][0]["toPlaceId"])
    for place in data["attractions"] + data["dining"]:
        if place["id"] == pid:
            place["destinationId"] = "HN"
    assert any("does not belong" in e for e in generator.check_grounding(plan, data))


@pytest.mark.parametrize("failure", [None, "schema", "destination", "place", "membership", "cost", "travel"])
def test_api_runs_schema_and_grounding(data, plan, monkeypatch, failure):
    request = {
        "travelPeriod": {"month": "2026-12"}, "durationDays": 2,
        "departureLocation": "Ho Chi Minh City", "travelers": {"count": 2},
        "budget": {"amount": 8000000, "currency": "VND", "scope": "group"},
        "preferences": {"destination": "DN"},
    }
    if failure == "schema":
        plan["status"] = "FEASIBLE"
    elif failure == "destination":
        plan["destinationId"] = "HN"
    elif failure == "place":
        plan["days"][0]["activities"][0]["placeId"] = "unsupported"
    elif failure == "membership":
        request.pop("preferences")
        data["destinations"].append({"id": "HN"})
        data["attractions"][0]["destinationId"] = "HN"
    elif failure == "cost":
        plan["days"][0]["activities"][0].update(estimatedCostVnd=1, costStatus="KNOWN")
    elif failure == "travel":
        plan["days"][0]["travelLegs"][0]["durationMin"] = 1
    text = Mock(return_value=json.dumps(plan))
    monkeypatch.setattr(generator, "request_text", text)
    monkeypatch.setattr(generator, "load_dataset", lambda: data)
    before = copy.deepcopy(data)
    response = TestClient(app).post("/itineraries/generate", json=request)
    text.assert_called_once()
    assert data == before
    if failure is None:
        assert response.status_code == 200
        assert response.json() == {"status": "UNVERIFIED", "plan": plan}
    else:
        assert response.status_code == 422
        assert response.json()["error"] == "INVALID_PLAN"
        assert "plan" not in response.json()
