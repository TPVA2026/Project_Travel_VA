
from copy import deepcopy

import pytest

from app.services.ai.destination_suggestion_service import suggest_destinations


@pytest.fixture
def dataset():
    return {
        "destinations": [
            {"id": "H", "city": "Huế", "description": "Cố đô có di sản văn hóa và lịch sử"},
            {"id": "DN", "city": "Đà Nẵng", "description": "Thành phố biển với cảnh quan thiên nhiên"},
            {"id": "HN", "city": "Hà Nội", "description": "Thành phố có nhiều di tích lịch sử"},
            {"id": "X", "city": "Thành phố X", "description": "Thành phố thử nghiệm"},
        ],
        "attractions": [],
        "dining": [
            {"id": "R1", "destinationId": "H", "name": "Quán bún bò"},
            {"id": "R2", "destinationId": "DN", "name": "Quán hải sản"},
        ],
    }


@pytest.fixture
def travel_request():
    return {
        "travelPeriod": {"month": "2026-12"},
        "durationDays": 2,
        "departureLocation": "TP. Hồ Chí Minh",
        "travelers": {"count": 2, "characteristics": []},
        "budget": {"amount": 8000000, "currency": "VND", "scope": "group"},
        "preferences": {
            "destination": None,
            "interests": [{"type": "culture", "priority": 1}],
            "dining": {"preferred": ["bún bò"], "avoid": []},
        },
        "additionalRequirements": None,
    }


def test_only_m4_feasible_supported_cities(travel_request, dataset):
    result = suggest_destinations(travel_request, dataset, ["H", "DN", "UNKNOWN"])

    assert {item["destinationId"] for item in result} == {"H", "DN"}
    assert all(item["reason"] for item in result)


def test_empty_feasible_list(travel_request, dataset):
    assert suggest_destinations(travel_request, dataset, []) == []


def test_missing_m4_list_is_not_allowed(travel_request, dataset):
    with pytest.raises(ValueError):
        suggest_destinations(travel_request, dataset, None)


def test_returns_at_most_three(travel_request, dataset):
    result = suggest_destinations(travel_request, dataset, ["H", "DN", "HN", "X"])

    assert len(result) == 3


def test_interest_and_dining_ranking(travel_request, dataset):
    result = suggest_destinations(travel_request, dataset, ["H", "DN"])

    assert result[0]["destinationId"] == "H"
    assert "văn hóa" in result[0]["reason"]


def test_form_wins_over_conflicting_prose(travel_request, dataset):
    travel_request["additionalRequirements"] = "Tôi muốn đi Đà Nẵng, không thích Huế"

    result = suggest_destinations(travel_request, dataset, ["H", "DN"])

    assert result[0]["destinationId"] == "H"


def test_constraints_are_unchanged(travel_request, dataset):
    original_request = deepcopy(travel_request)

    suggest_destinations(travel_request, dataset, ["H", "DN"])

    assert travel_request == original_request


def test_explicit_destination_does_not_trigger_suggestions(travel_request, dataset):
    travel_request["preferences"]["destination"] = "Huế"

    assert suggest_destinations(travel_request, dataset, ["H", "DN"]) == []

def test_excludes_departure_city(travel_request):
    travel_request["departureLocation"] = "Huế"

    dataset = {
        "destinations": [
            {"id": "H", "city": "Huế", "description": "Di tích lịch sử"},
            {"id": "DN", "city": "Đà Nẵng", "description": "Biển và thiên nhiên"},
        ],
        "attractions": [],
        "dining": [],
    }

    results = suggest_destinations(
        travel_request,
        dataset,
        ["H", "DN"],
    )

    assert len(results) == 1
    assert results[0]["destinationId"] == "DN"