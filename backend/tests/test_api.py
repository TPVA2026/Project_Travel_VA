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
            "travelPeriod": {"month": "2026-12"},
            "durationDays": 2,
            "departureLocation": "Ho Chi Minh City",
            "travelers": {"count": 2},
            "budget": {"amount": 3000000, "currency": "VND", "scope": "group"},
            "preferences": {"destination": "Da Lat"}
        }
    )

    assert response.status_code == 200
    assert response.json()["valid"] is True

def test_invalid_duration():
    response = client.post(
        "/api/v1/requests/validate",
        json={
            "travelPeriod": {"month": "2026-12"},
            "durationDays": 0,
            "departureLocation": "Ho Chi Minh City",
            "travelers": {"count": 2},
            "budget": {"amount": 3000000, "currency": "VND", "scope": "group"},
            "preferences": {"destination": "Da Lat"}
        }
    )

    assert response.status_code == 422
    assert "detail" in response.json()
# TODO(ZT): add end-to-end tests for /requests, /destinations, /itineraries

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


# Test 1: Đọc danh sách địa điểm thành công
def test_get_destinations_success(monkeypatch):
    mock_data = [
        {
            "city_name": "Nha Trang",
            "description": "Coastal city",
            "best_time_to_visit": None
        },
        {
            "city_name": "Hue",
            "description": "Historical city",
            "best_time_to_visit": "January to April"
        }
    ]

    monkeypatch.setattr(
        "app.api.destinations.get_destinations",
        lambda: mock_data
    )

    response = client.get("/api/v1/destinations")

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert response.json()["destinations"] == mock_data


# Test 2: Dataset rỗng
def test_get_destinations_empty(monkeypatch):
    monkeypatch.setattr(
        "app.api.destinations.get_destinations",
        lambda: []
    )

    response = client.get("/api/v1/destinations")

    assert response.status_code == 200
    assert response.json() == {
        "total": 0,
        "destinations": []
    }


# Test 3: Không tìm thấy file dataset
def test_get_destinations_file_error(monkeypatch):

    def mock_error():
        raise FileNotFoundError("destinations.json not found")

    monkeypatch.setattr(
        "app.api.destinations.get_destinations",
        mock_error
    )

    response = client.get("/api/v1/destinations")

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "DATASET_ERROR"
    assert response.json()["detail"]["message"] == (
        "Unable to load destination data."
    )


# Test 4: File JSON sai cú pháp
def test_get_destinations_invalid_json(monkeypatch):

    import json

    def mock_error():
        raise json.JSONDecodeError(
            "Invalid JSON",
            "{invalid}",
            0
        )

    monkeypatch.setattr(
        "app.api.destinations.get_destinations",
        mock_error
    )

    response = client.get("/api/v1/destinations")

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "DATASET_ERROR"


# Test 5: Dataset không phải danh sách
def test_get_destinations_invalid_format(monkeypatch):

    def mock_error():
        raise ValueError("Invalid dataset format")

    monkeypatch.setattr(
        "app.api.destinations.get_destinations",
        mock_error
    )

    response = client.get("/api/v1/destinations")

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "DATASET_ERROR"
