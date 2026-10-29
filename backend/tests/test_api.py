from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "OK"

def test_validate_request():
    response = client.post(
        "/api/v1/requests/validate",
        json={
            "destination": "Da Lat",
            "duration": 2,
            "budget": 3000000
        }
    )

    assert response.status_code == 200
    assert response.json()["valid"] == True

def test_invalid_duration():
    response = client.post(
        "/api/v1/requests/validate",
        json={
            "destination": "Da Lat",
            "duration": 5,
            "budget": 3000000
        }
    )

    assert response.status_code == 422
    assert "detail" in response.json()
# TODO(ZT): add end-to-end tests for /requests, /destinations, /itineraries
