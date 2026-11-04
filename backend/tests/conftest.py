"""Dữ liệu nhỏ, độc lập với API/AI để kiểm tra thuật toán M4."""

import pytest


@pytest.fixture
def m4_case():
    """Một chuyến một ngày có đủ dữ liệu đã xác nhận cho mọi ràng buộc."""
    request = {
        "travelPeriod": {"startDate": "2026-11-12"}, "durationDays": 1,
        "departureLocation": "Hue", "travelers": {"count": 2},
        "budget": {"amount": 500, "currency": "VND", "scope": "group"},
    }
    plan = {
        "planId": "p1", "title": "Trip", "destinationId": "HUE",
        "missingData": [], "assumptions": [],
        "days": [{"dayNumber": 1, "date": "2026-11-12",
                  "travelLegs": [{"fromPlaceId": "s1", "toPlaceId": "r1", "durationMin": 20, "distanceKm": 5}],
                  "activities": [
                      {"activityId": "a1", "placeId": "s1", "type": "sightseeing",
                       "startTime": "08:00", "endTime": "09:00", "estimatedCostVnd": 100,
                       "costStatus": "KNOWN", "reason": "Visit"},
                      {"activityId": "a2", "placeId": "r1", "type": "dining",
                       "startTime": "09:30", "endTime": "10:30", "estimatedCostVnd": 50,
                       "costStatus": "KNOWN", "reason": "Lunch"},
                  ]}],
    }
    dataset = {
        "destinations": [{"id": "HUE"}],
        "attractions": [{"id": "s1", "priceVnd": 100, "priceScope": "perPerson", "opening_hours": "7:00 - 17:30"}],
        "dining": [{"id": "r1", "avgPricePerPersonVnd": 50, "openingHours": "08:00 - 22:00"}],
        "travel_matrix": [{"from": "s1", "to": "r1", "durationMin": 20, "distanceKm": 5}],
    }
    return request, plan, dataset, {"transport": 100, "accommodation": 0}
