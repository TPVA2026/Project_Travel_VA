from pydantic import ValidationError

from app.schemas.travel_request import TravelRequest

_SKIP = {"DatePeriod", "MonthPeriod"}
_PROMPTS = {
    "travelPeriod": "Choose travel dates or a month.",
    "durationDays": "Enter the number of days.",
    "departureLocation": "Enter the departure location.",
    "travelers": "Enter the number of travelers.",
    "travelers.count": "Enter the number of travelers.",
    "budget": "Enter the budget amount and whether it is per person or for the group.",
    "budget.amount": "Enter the budget amount.",
    "budget.scope": "Choose whether the budget is per person or for the group.",
    "budget.currency": "Use VND.",
}


def _clean_list(items):
    if not isinstance(items, list):
        return items
    return [item.strip() for item in items if isinstance(item, str) and item.strip()]


def normalize_travel_request(payload: dict) -> dict:
    """Trim text and currency before validation. Does not fill in missing fields."""
    data = dict(payload)
    if isinstance(data.get("departureLocation"), str):
        data["departureLocation"] = data["departureLocation"].strip()

    travelers = data.get("travelers")
    if isinstance(travelers, dict):
        travelers = dict(travelers)
        if "characteristics" in travelers:
            travelers["characteristics"] = _clean_list(travelers["characteristics"])
        data["travelers"] = travelers

    budget = data.get("budget")
    if isinstance(budget, dict):
        budget = dict(budget)
        if isinstance(budget.get("currency"), str):
            budget["currency"] = budget["currency"].strip().upper()
        if isinstance(budget.get("scope"), str):
            budget["scope"] = budget["scope"].strip()
        data["budget"] = budget

    preferences = data.get("preferences")
    if isinstance(preferences, dict):
        preferences = dict(preferences)
        if isinstance(preferences.get("destination"), str):
            destination = preferences["destination"].strip()
            if destination:
                preferences["destination"] = destination
            else:
                preferences.pop("destination")
        if "transportation" in preferences:
            preferences["transportation"] = _clean_list(preferences["transportation"])
        dining = preferences.get("dining")
        if isinstance(dining, dict):
            dining = dict(dining)
            for key in ("preferred", "avoid"):
                if key in dining:
                    dining[key] = _clean_list(dining[key])
            preferences["dining"] = dining
        data["preferences"] = preferences
    return data


def _field_path(loc) -> str:
    parts = [
        part
        for part in loc
        if isinstance(part, str) and part not in _SKIP and not part.startswith("function-after")
    ]
    return ".".join(parts)


def request_problems(payload: dict, exc: ValidationError) -> dict:
    """List missing fields and constraint conflicts. Does not fill any field."""
    period = payload.get("travelPeriod") if isinstance(payload.get("travelPeriod"), dict) else {}
    has_dates = bool(period.get("startDate") or period.get("endDate"))
    has_month = bool(period.get("month"))
    missing = []
    conflicts = []
    if has_dates and has_month:
        conflicts.append("Choose travel dates or a month, not both.")
    for err in exc.errors():
        loc = err["loc"]
        if has_dates and "MonthPeriod" in loc:
            continue
        if has_month and not has_dates and any("DatePeriod" in part for part in loc if isinstance(part, str)):
            continue
        if err["type"] == "missing":
            field = _field_path(loc)
            if field and field not in missing:
                missing.append(field)
        elif err["type"] == "value_error":
            message = err["msg"].removeprefix("Value error, ")
            if message and message not in conflicts:
                conflicts.append(message)
    messages = [_PROMPTS.get(field, f"Enter {field}.") for field in missing]
    messages.extend(conflicts)
    return {"missing": missing, "conflicts": conflicts, "messages": messages}


def validate_travel_request(payload: dict) -> TravelRequest:
    """Normalize, then parse. Raises pydantic.ValidationError with field locations."""
    return TravelRequest.model_validate(normalize_travel_request(payload))
