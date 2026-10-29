import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from src.modules.input.validate_request import validate_travel_request

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "shared" / "examples"


def _load(name: str):
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def test_valid_date_request_parses():
    request = validate_travel_request(_load("sampleRequest.json"))
    assert request.duration_days == 3
    assert request.budget.scope == "group"
    assert request.limits is not None
    assert request.limits.applies_to == "daily"
    assert request.travelers.count == 2


def test_valid_month_request_parses():
    request = validate_travel_request(_load("sampleRequestMonth.json"))
    assert request.budget.scope == "perPerson"
    assert request.travel_period.month == "2026-12"
    assert request.limits is None


def test_valid_request_round_trips_camel_case():
    raw = _load("sampleRequest.json")
    dumped = validate_travel_request(raw).model_dump(mode="json", by_alias=True)
    assert dumped["durationDays"] == raw["durationDays"]
    assert dumped["travelPeriod"]["startDate"] == "2026-11-12"
    assert dumped["budget"]["currency"] == "VND"
    assert "duration_days" not in dumped


@pytest.mark.parametrize(
    "case",
    _load("invalidRequests.json"),
    ids=lambda case: case["id"],
)
def test_invalid_requests_are_rejected(case):
    with pytest.raises(ValidationError):
        validate_travel_request(case["body"])
