"""TPVA-75: replayable feasibility evidence for a destination outside Huế."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.data_service import load_dataset


FIXTURE = (
    Path(__file__).parent
    / "fixtures"
    / "acceptance"
    / "danang_feasibility_scenarios.json"
)


def load_fixture():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "scenario",
    load_fixture()["scenarios"],
    ids=lambda scenario: scenario["id"],
)
def test_danang_feasibility_scenarios_replay_actual_api(scenario):
    fixture = load_fixture()
    body = {"request": fixture["request"], "plan": scenario["plan"]}

    response = TestClient(app).post(scenario["endpoint"], json=body)

    assert response.status_code == scenario["expected"]["http"]
    result = response.json()
    assert result["status"] == scenario["expected"]["status"]
    reasons = result["reasons"]
    for expected in scenario["expected"]["requiredReasons"]:
        assert any(
            all(reason.get(key) == value for key, value in expected.items())
            for reason in reasons
        ), f"missing expected reason {expected}; actual={reasons}"
    forbidden = set(scenario["expected"].get("forbiddenStatuses", []))
    assert not any(reason["status"] in forbidden for reason in reasons)


def test_danang_fixture_records_the_current_data_gaps():
    fixture = load_fixture()
    dataset = load_dataset(request=fixture["request"])

    assert [item["id"] for item in dataset["destinations"]] == ["VN_48"]
    assert len(dataset["attractions"]) == 613
    assert dataset["dining"] == []
    assert dataset["hotels"] == []
    assert dataset["transport"] == []

    focused = {
        item["id"]: item
        for item in dataset["attractions"]
        if item["id"] in fixture["focusedPlaceIds"]
    }
    assert set(focused) == set(fixture["focusedPlaceIds"])
    for place in focused.values():
        assert place["priceVnd"] is None
        assert place["openingHours"] is None
        assert place["durationMin"] is None

    directed_pairs = {
        (row.get("from"), row.get("to")) for row in dataset["travel_matrix"]
    }
    assert (
        "OTM_VN_48_N4944327526",
        "OTM_VN_48_W302872188",
    ) not in directed_pairs
