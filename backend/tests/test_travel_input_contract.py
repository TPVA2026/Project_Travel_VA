"""TPVA-53: input contract for budget, travelers, period, transport, costs and destination.

Current-field cases come from tests/fixtures/travelInputCases.json. Tests for the
PROPOSED tripCosts contract (docs/api_contract.md 4.11) are skipped until ZT/Sand
sign off and the schema is changed.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures"
CASES = json.loads((FIXTURES / "travelInputCases.json").read_text(encoding="utf-8"))
URL = CASES["endpoint"]
PROPOSED = "PROPOSED tripCosts contract (api_contract.md 4.11) awaits ZT/Sand sign-off; schema unchanged"


def _subset(expected, actual):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(_subset(v, actual.get(k)) for k, v in expected.items())
    return expected == actual


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda c: c["id"])
def test_validate_input_case(case):
    resp = client.post(URL, json=case["body"])
    expect = case["expect"]
    assert resp.status_code == expect["http"], resp.text
    body = resp.json()
    if expect["http"] == 200:
        data = body["data"]
        if "data" in expect:
            assert _subset(expect["data"], data), data
        if expect.get("noDestination"):
            assert not (data.get("preferences") or {}).get("destination")
    else:
        detail = body["detail"]
        for field in expect.get("missing", []):
            assert field in detail["missing"]
        if "conflictContains" in expect:
            assert any(expect["conflictContains"] in msg for msg in detail["conflicts"]), detail


def test_validate_does_not_mutate_input():
    case = next(c for c in CASES["cases"] if c["id"] == "transport-blank-dropped")
    body = json.loads(json.dumps(case["body"]))
    client.post(URL, json=body)
    assert body == case["body"]


def test_generate_without_destination_never_picks_a_city(monkeypatch):
    """Skipped destination: generation stops before Gemini and returns no plan."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    case = next(c for c in CASES["cases"] if c["id"] == "destination-omitted")
    resp = client.post("/itineraries/generate", json=case["body"])
    assert resp.status_code == 422
    assert resp.json()["error"] == "NO_DATA"
    assert "plan" not in resp.json()


def test_unknown_trip_costs_stay_unverified_not_zero():
    """Missing cost: with no price and no transport/lodging cost the budget is UNVERIFIED."""
    fixture = json.loads((FIXTURES / "hue_osrm_evaluate.json").read_text(encoding="utf-8"))
    resp = client.post("/itineraries/evaluate", json=fixture)
    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] != "FEASIBLE"
    budget = [c for c in result["checks"] if c["code"] == "BUDGET"]
    assert budget and budget[0]["status"] == "UNVERIFIED"
    for day in fixture["plan"]["days"]:
        for activity in day["activities"]:
            assert activity["estimatedCostVnd"] is None and activity["costStatus"] == "NO_DATA"


def _with_costs(costs):
    body = json.loads(json.dumps(CASES["cases"][0]["body"]))
    body["tripCosts"] = costs
    return body


@pytest.mark.skip(reason=PROPOSED)
def test_proposed_known_group_transport_cost_is_accepted():
    body = _with_costs({"transport": {"status": "known", "amountVnd": 1200000, "scope": "group",
                                      "period": "entireTrip", "mode": "car", "source": "user"}})
    resp = client.post(URL, json=body)
    assert resp.status_code == 200
    assert resp.json()["data"]["tripCosts"]["transport"]["amountVnd"] == 1200000


@pytest.mark.skip(reason=PROPOSED)
def test_proposed_per_person_lodging_per_night_is_accepted():
    body = _with_costs({"accommodation": {"status": "estimated", "amountVnd": 400000, "scope": "perPerson",
                                          "period": "perNight", "source": "user"}})
    assert client.post(URL, json=body).status_code == 200


@pytest.mark.skip(reason=PROPOSED)
def test_proposed_unknown_cost_must_be_null_not_zero():
    body = _with_costs({"transport": {"status": "unknown", "amountVnd": 0}})
    assert client.post(URL, json=body).status_code == 422


@pytest.mark.skip(reason=PROPOSED)
def test_proposed_known_cost_needs_scope_and_period():
    body = _with_costs({"transport": {"status": "known", "amountVnd": 500000}})
    assert client.post(URL, json=body).status_code == 422


@pytest.mark.skip(reason=PROPOSED)
def test_proposed_cost_scope_rejects_entire_trip_as_scope():
    body = _with_costs({"transport": {"status": "known", "amountVnd": 500000, "scope": "entireTrip",
                                      "period": "entireTrip", "source": "user"}})
    assert client.post(URL, json=body).status_code == 422


@pytest.mark.skip(reason="Destination confirmation step is an open product decision (api_contract.md 4.12)")
def test_proposed_generate_requires_confirmed_destination():
    pass
