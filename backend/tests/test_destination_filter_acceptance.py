"""Isolated contract checks; fixtures never enter the production dataset."""
from copy import deepcopy

import pytest

from app.services.destination_filter_service import filter_feasible_destinations


@pytest.fixture
def destination_case(m4_case):
    request = deepcopy(m4_case[0])
    request["departureLocation"] = "Hue"
    dataset = {"destinations": [{"id": "H", "city": "Hue"}, {"id": "DN", "city": "Da Nang"}],
               "travel_matrix": [{"from": "H", "to": "DN", "durationMin": 120, "distanceKm": 100},
                                 {"from": "DN", "to": "H", "durationMin": 130, "distanceKm": 100}]}
    quote = {"DN": {"departureLocation": "Hue", "travelPeriod": request["travelPeriod"],
                    "durationDays": 1, "travelersCount": 2, "currency": "VND", "scope": "group",
                    "transportation": [], "evidenceStatus": "VERIFIED", "source": "test fixture",
                    "costs": {"transport": 100, "accommodation": 100, "dining": 100, "activities": 100}}}
    return request, dataset, quote


@pytest.mark.parametrize("budget,status", [(500, "FEASIBLE"), (400, "FEASIBLE"), (399, "INFEASIBLE")])
def test_budget_boundary_and_no_feasible_city(destination_case, budget, status):
    request, dataset, quote = destination_case
    request["budget"]["amount"] = budget
    before = deepcopy(destination_case)
    result = filter_feasible_destinations(request, dataset, trip_costs_by_destination=quote)
    assert result["status"] == status
    assert result["feasibleDestinationIds"] == (["DN"] if status == "FEASIBLE" else [])
    assert destination_case == before


@pytest.mark.parametrize("missing", ["return_route", "quote", "wrong_party"])
def test_missing_or_mismatched_evidence_stays_unverified(destination_case, missing):
    request, dataset, quote = destination_case
    if missing == "return_route":
        dataset["travel_matrix"].pop()
    elif missing == "quote":
        quote.clear()
    else:
        quote["DN"]["travelersCount"] = 3
    result = filter_feasible_destinations(request, dataset, trip_costs_by_destination=quote)
    assert result["status"] == "UNVERIFIED"
    assert result["feasibleDestinationIds"] == []
