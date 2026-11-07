import json
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

import app.api.itineraries as itineraries_api
from app.main import app
from app.services.ai.gemini_client import GeminiError

client = TestClient(app)
URL = "/itineraries/generate"


@pytest.fixture
def valid_request():
    return {
        "travelPeriod": {"startDate": "2026-12-15", "endDate": "2026-12-16"},
        "durationDays": 2,
        "departureLocation": "  Ho Chi Minh City  ",
        "travelers": {"count": 2, "characteristics": [" adults ", ""]},
        "budget": {"amount": 3000000, "currency": " vnd ", "scope": " group "},
    }


@pytest.fixture
def generate_mock(monkeypatch):
    # Existing fixture only; this test does not assert dataset grounding.
    fixture = Path(__file__).parent / "fixtures" / "sample_response.json"
    plan = json.loads(fixture.read_text(encoding="utf-8"))["plan"]
    mock = Mock(return_value=plan)
    monkeypatch.setattr(itineraries_api, "generate_candidate", mock)
    return mock


@pytest.mark.parametrize("case", ["missing", "duration", "dates", "non_object", "null"])
def test_invalid_request_does_not_call_gemini(valid_request, generate_mock, case):
    if case == "missing":
        del valid_request["budget"]
    elif case == "duration":
        valid_request["durationDays"] = -3
    elif case == "dates":
        valid_request["travelPeriod"]["endDate"] = "2026-12-14"
    elif case == "non_object":
        valid_request = []
    elif case == "null":
        valid_request = None

    response = client.post(URL, json=valid_request)

    assert response.status_code == 422
    assert "detail" in response.json()
    generate_mock.assert_not_called()


def test_valid_request_is_normalized_before_gemini(valid_request, generate_mock):
    response = client.post(URL, json=valid_request)

    assert response.status_code == 200
    generate_mock.assert_called_once_with({
        "travelPeriod": {"startDate": "2026-12-15", "endDate": "2026-12-16"},
        "durationDays": 2,
        "departureLocation": "Ho Chi Minh City",
        "travelers": {"count": 2, "characteristics": ["adults"]},
        "budget": {"amount": 3000000, "currency": "VND", "scope": "group"},
        "limits": None,
        "preferences": None,
    })
    assert response.json() == {"status": "UNVERIFIED", "plan": generate_mock.return_value}
    # Dates are strings, field names use aliases, and all values serialize to JSON.
    json.dumps(generate_mock.call_args.args[0])


@pytest.mark.parametrize("code,status,expected_http", [
    ("TIMEOUT", None, 504),
    ("CONFIG", None, 500),
    ("INVALID_PLAN", 422, 422),
    ("NO_DATA", 422, 422),
    ("API_ERROR", 503, 502),
    ("NETWORK", None, 502),
    ("TIMEOUT", 422, 504),
    ("CONFIG", 422, 500),
])
def test_gemini_error_mapping(valid_request, generate_mock, code, status, expected_http):
    generate_mock.side_effect = GeminiError(code, "Safe public message", status, ["Safe detail"])

    response = client.post(URL, json=valid_request)

    assert response.status_code == expected_http
    assert response.json() == {
        "error": code, "message": "Safe public message", "details": ["Safe detail"],
    }
    generate_mock.assert_called_once()


def test_unexpected_error_does_not_expose_internal_details(valid_request, generate_mock):
    generate_mock.side_effect = RuntimeError("internal path /private/server; key=TEST_SECRET")

    response = client.post(URL, json=valid_request)

    assert response.status_code == 500
    assert response.json() == {"error": "INTERNAL"}
    assert "TEST_SECRET" not in response.text
    generate_mock.assert_called_once()
