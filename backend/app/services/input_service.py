from app.schemas.travel_request import TravelRequest

# TODO(Khánh): report missing fields (TPVA-10)


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


def validate_travel_request(payload: dict) -> TravelRequest:
    """Normalize, then parse. Raises pydantic.ValidationError with field locations."""
    return TravelRequest.model_validate(normalize_travel_request(payload))
