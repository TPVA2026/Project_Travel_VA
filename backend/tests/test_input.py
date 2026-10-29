import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.services.input_service import validate_travel_request

EXAMPLES = Path(__file__).resolve().parent / "fixtures"


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


def test_normalize_trims_text_and_currency():
    raw = _load("sampleRequest.json")
    raw["departureLocation"] = "  Hanoi  "
    raw["budget"]["currency"] = " vnd "
    raw["preferences"]["destination"] = "  Hue "
    raw["preferences"]["transportation"] = [" taxi ", " ", "walking"]
    raw["preferences"]["dining"]["avoid"] = [" spicy "]
    request = validate_travel_request(raw)
    assert request.departure_location == "Hanoi"
    assert request.budget.currency == "VND"
    assert request.preferences.destination == "Hue"
    assert request.preferences.transportation == ["taxi", "walking"]
    assert request.preferences.dining.avoid == ["spicy"]


def test_invalid_numbers_and_budget_type_name_the_field():
    month = _load("sampleRequestMonth.json")
    month["budget"]["amount"] = -1
    with pytest.raises(ValidationError) as negative:
        validate_travel_request(month)
    assert any(err["loc"][-1] == "amount" and "0" in err["msg"] for err in negative.value.errors())

    month["budget"]["amount"] = 1000
    month["budget"]["scope"] = "trip"
    with pytest.raises(ValidationError) as scope:
        validate_travel_request(month)
    assert any(err["loc"][-1] == "scope" for err in scope.value.errors())

    month["budget"]["scope"] = "group"
    month["durationDays"] = 0
    month["travelers"]["count"] = 0
    with pytest.raises(ValidationError) as counts:
        validate_travel_request(month)
    fields = {err["loc"][-1] for err in counts.value.errors()}
    assert "durationDays" in fields or "duration_days" in fields
    assert "count" in fields


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
