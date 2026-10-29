from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_validate_request_accepts_sample():
    import json
    from pathlib import Path

    payload = json.loads(
        (Path(__file__).parent / "fixtures" / "sampleRequest.json").read_text(encoding="utf-8")
    )
    res = client.post("/requests/validate", json=payload)
    assert res.status_code == 200
    assert res.json()["durationDays"] == 3


def test_validate_request_rejects_missing_departure():
    res = client.post("/requests/validate", json={"durationDays": 1})
    assert res.status_code == 422
    body = res.json()
    assert body["errors"]
    assert "departureLocation" in body["missing"]
    assert "budget" in body["missing"]
    assert body["messages"]


# TODO(ZT): add end-to-end tests for /destinations, /itineraries
