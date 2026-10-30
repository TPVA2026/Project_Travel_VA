
# backend/tests/test_requests.py

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

URL = "/api/v1/requests/validate"


@pytest.fixture
def valid_request():
    """Dữ liệu chuyến đi hợp lệ dùng chung cho các test."""
    return {
        "travelPeriod": {"month": "2026-12"},
        "durationDays": 2,
        "departureLocation": "Ho Chi Minh City",
        "travelers": {"count": 2},
        "budget": {
            "amount": 3000000,
            "currency": "VND",
            "scope": "group"
        }
    }


# TEST 1: Request hợp lệ
def test_valid_request(valid_request):
    response = client.post(URL, json=valid_request)

    assert response.status_code == 200

    data = response.json()
    assert data["valid"] is True
    assert data["data"]["durationDays"] == 2
    assert data["data"]["budget"]["amount"] == 3000000


# TEST 2: Thiếu budget
def test_missing_budget(valid_request):
    valid_request.pop("budget")

    response = client.post(URL, json=valid_request)

    assert response.status_code == 422
    assert "budget" in response.json()["detail"]["missing"]


# TEST 3: durationDays không hợp lệ
def test_invalid_duration(valid_request):
    valid_request["durationDays"] = -2

    response = client.post(URL, json=valid_request)

    assert response.status_code == 422


# TEST 4: Số người phải >= 1
def test_invalid_travelers(valid_request):
    valid_request["travelers"]["count"] = 0

    response = client.post(URL, json=valid_request)

    assert response.status_code == 422


# TEST 5: Ngân sách âm
def test_negative_budget(valid_request):
    valid_request["budget"]["amount"] = -100000

    response = client.post(URL, json=valid_request)

    assert response.status_code == 422


# TEST 6: Normalize khoảng trắng và currency
def test_normalization(valid_request):
    valid_request["departureLocation"] = "  Ho Chi Minh City  "
    valid_request["budget"]["currency"] = " vnd "

    response = client.post(URL, json=valid_request)

    assert response.status_code == 200

    data = response.json()["data"]
    assert data["departureLocation"] == "Ho Chi Minh City"
    assert data["budget"]["currency"] == "VND"


# TEST 7: Ngân sách bằng 0 vẫn hợp lệ theo schema
def test_zero_budget(valid_request):
    valid_request["budget"]["amount"] = 0

    response = client.post(URL, json=valid_request)

    assert response.status_code == 200
    assert response.json()["data"]["budget"]["amount"] == 0


# TEST 8: Ngày bắt đầu sau ngày kết thúc
def test_invalid_date_range(valid_request):
    valid_request["travelPeriod"] = {
        "startDate": "2026-12-20",
        "endDate": "2026-12-18"
    }

    response = client.post(URL, json=valid_request)

    assert response.status_code == 422


# TEST 9: JSON body không phải object
def test_invalid_body_type():
    response = client.post(URL, json=[1, 2, 3])

    assert response.status_code == 422
