import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.services.input_service import validate_revision_request

FIX = Path(__file__).resolve().parent / "fixtures"


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def test_budget_revision_parses():
    revision = validate_revision_request(_load("revisionRequest.json"))
    assert revision.plan_id == "plan-1"
    assert revision.change_type == "budget"
    assert revision.budget.amount == 5000000
    dumped = revision.model_dump(mode="json", by_alias=True)
    assert dumped["changeType"] == "budget"
    assert "change_type" not in dumped


def test_period_and_duration_revisions_parse():
    month = validate_revision_request(
        {"planId": " plan-2 ", "changeType": "travelPeriod", "travelPeriod": {"month": "2026-12"}}
    )
    assert month.plan_id == "plan-2"
    assert month.travel_period.month == "2026-12"
    days = validate_revision_request(
        {"planId": "plan-2", "changeType": "durationDays", "durationDays": 4}
    )
    assert days.duration_days == 4


@pytest.mark.parametrize("case", _load("invalidRevisions.json"), ids=lambda case: case["id"])
def test_invalid_revisions_are_rejected(case):
    with pytest.raises(ValidationError):
        validate_revision_request(case["body"])
