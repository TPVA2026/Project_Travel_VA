
import pytest
from pydantic import ValidationError

from app.mocks.itinerary_mocks import get_mock_itinerary
from app.schemas.candidate_plan import CandidatePlan


def test_mock_itinerary_schema():
    response = get_mock_itinerary()

    assert response["status"] == "UNVERIFIED"

    plan = CandidatePlan.model_validate(response["plan"])

    assert plan.planId == "mock-plan-001"
    assert len(plan.days) >= 1
    assert plan.days[0].dayNumber == 1


def test_empty_days_rejected():
    response = get_mock_itinerary()

    invalid_plan = response["plan"].copy()
    invalid_plan["days"] = []

    with pytest.raises(ValidationError):
        CandidatePlan.model_validate(invalid_plan)


def test_extra_field_rejected():
    response = get_mock_itinerary()

    invalid_plan = response["plan"].copy()
    invalid_plan["score"] = 100

    with pytest.raises(ValidationError):
        CandidatePlan.model_validate(invalid_plan)


def test_mock_not_grounded():
    response = get_mock_itinerary()

    assert response["plan"]["destinationId"] == "PENDING_DATASET_ID"
    assert response["plan"]["days"][0]["activities"] == []
    assert response["plan"]["days"][0]["travelLegs"] == []


