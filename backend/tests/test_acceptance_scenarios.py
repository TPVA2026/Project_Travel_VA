"""TPVA-54 regression: replay the Huế acceptance scenarios in-process.

Scenarios and expected results live in tests/fixtures/acceptance/hue_scenarios.json
and are judged by the same code as the live runner (scripts/run_acceptance_scenarios.py).
Known product gaps are xfails with their owner. When the owning team fixes one,
the scenario passes and the entry should be removed from KNOWN_GAPS.
"""
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from scripts.run_acceptance_scenarios import judge, load_scenarios

client = TestClient(app)

LIVE_ONLY = {
    "S02_valid_3day_generate": "needs GEMINI_API_KEY and network; run scripts/run_acceptance_scenarios.py",
    "S18_osrm_timeout": "needs a separately configured OSRM server profile; see docs/evidence/tpva-54",
}
KNOWN_GAPS = {
    "S12_duplicate_stop": "M4/M3: no rule flags a repeated stop (A -> A leg is accepted by grounding and evaluation)",
    "S16_no_destination_generate": "M3/M6: skipped destination returns 422 NO_DATA; PR #50 suggest_destinations is not wired into /generate",
    "S19_invalid_transport_type": "M1: input_service drops non-string transportation values instead of returning 422 (fix proposed in TPVA-53)",
}


@pytest.mark.parametrize("scenario", load_scenarios(), ids=lambda s: s["id"])
def test_acceptance_scenario(scenario, monkeypatch):
    if scenario["id"] in LIVE_ONLY:
        pytest.skip(LIVE_ONLY[scenario["id"]])
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("OSRM_ROUTING_ENABLED", "false")
    if "raw" in scenario:
        resp = client.post(scenario["endpoint"], content=scenario["raw"], headers={"Content-Type": "application/json"})
    else:
        resp = client.post(scenario["endpoint"], json=scenario["body"])
    try:
        body = resp.json()
    except ValueError:
        body = resp.text
    verdict, notes = judge(scenario, resp.status_code, body)
    if scenario["id"] in KNOWN_GAPS and verdict == "FAIL":
        pytest.xfail(f"{KNOWN_GAPS[scenario['id']]} ({'; '.join(notes)})")
    assert verdict == "PASS", notes


def test_never_feasible_without_evidence():
    """No scenario in the Huế set may come back FEASIBLE: the dataset has no verified legs or trip costs."""
    for scenario in load_scenarios():
        if scenario["endpoint"] != "/itineraries/evaluate" or scenario.get("server") or "raw" in scenario:
            continue
        resp = client.post(scenario["endpoint"], json=scenario["body"])
        if resp.status_code == 200:
            assert resp.json()["status"] != "FEASIBLE", scenario["id"]
