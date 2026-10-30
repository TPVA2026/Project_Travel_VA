
from app.schemas.candidate_plan import CandidatePlan


def get_mock_itinerary() -> dict:
    mock_plan = {
        "planId": "mock-plan-001",
        "title": "Sample Travel Itinerary",
        "destinationId": "PENDING_DATASET_ID",
        "days": [
            {
                "dayNumber": 1,
                "date": "2026-12-15",
                "activities": [],
                "travelLegs": []
            }
        ],
        "missingData": [
            "Destination and place IDs are pending normalization"
        ],
        "assumptions": [
            "This is a placeholder, not a generated itinerary"
        ]
    }

    validated_plan = CandidatePlan.model_validate(mock_plan)

    return {
        "status": "UNVERIFIED",
        "plan": validated_plan.model_dump(mode="json")
    }
