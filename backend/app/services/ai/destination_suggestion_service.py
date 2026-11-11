
import re
import unicodedata

from app.algorithms.ranking import _interest_weights


INTEREST_KEYWORDS = {
    "sightseeing": ("tham quan", "di tich", "danh lam", "thang canh", "bao tang"),
    "culture": ("van hoa", "lich su", "di san", "co do", "truyen thong", "den", "chua"),
    "nature": ("thien nhien", "nui", "rung", "bien", "thac", "ho", "vuon quoc gia"),
    "relaxation": ("nghi duong", "thu gian", "suoi khoang", "spa", "bien"),
}


def _normalize(value):
    value = unicodedata.normalize("NFD", str(value).casefold())
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = value.replace("đ", "d")
    return re.sub(r"\s+", " ", value).strip()


def _matches(text, keyword):
    text = _normalize(text)
    keyword = _normalize(keyword)
    return re.search(r"(?<!\w)" + re.escape(keyword) + r"(?!\w)", text) is not None


def suggest_destinations(request, dataset, feasible_destination_ids, limit=3):
    """Rank only M4-feasible destinations that exist in the supported dataset."""
    if not isinstance(request, dict) or not isinstance(dataset, dict):
        raise ValueError("request and dataset must be dictionaries")

    if feasible_destination_ids is None:
        raise ValueError("M4 feasible destination list is required")

    if not isinstance(feasible_destination_ids, (list, tuple, set)):
        raise ValueError("feasible_destination_ids must be a collection")

    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
        raise ValueError("limit must be a positive integer")

    preferences = request.get("preferences") or {}
    if preferences.get("destination"):
        return []

    interests = _interest_weights(preferences.get("interests") or [])
    dining = preferences.get("dining") or {}
    preferred_foods = dining.get("preferred") or []
    avoided_foods = dining.get("avoid") or []
    characteristics = (request.get("travelers") or {}).get("characteristics") or []
    requirements = request.get("additionalRequirements") or ""

    feasible_ids = set(feasible_destination_ids)
    destinations = dataset.get("destinations") or []
    attractions = dataset.get("attractions") or []
    restaurants = dataset.get("dining") or []

    suggestions = []
    seen_ids = set()
    departure = _normalize(request.get("departureLocation") or "")

    for destination in destinations:
        destination_id = destination.get("id")

        if destination_id not in feasible_ids or destination_id in seen_ids:
            continue

        seen_ids.add(destination_id)

        city_name = _normalize(destination.get("city") or "")

        if departure and city_name == departure:
            continue

        city = destination.get("city")
        if not destination_id or not city:
            continue

        description = destination.get("description") or ""
        city_attractions = [
            place for place in attractions
            if place.get("destinationId") == destination_id
        ]
        city_restaurants = [
            place for place in restaurants
            if place.get("destinationId") == destination_id
        ]

        attraction_text = " ".join(
            place.get("name") or "" for place in city_attractions
        )
        evidence = f"{description} {attraction_text}"

        score = 0.0
        reasons = []

        for interest, weight in interests.items():
            if any(_matches(evidence, word) for word in INTEREST_KEYWORDS[interest]):
                score += weight
                reasons.append({
                    "sightseeing": "Có điểm tham quan phù hợp",
                    "culture": "Có địa điểm văn hóa hoặc lịch sử",
                    "nature": "Có cảnh quan thiên nhiên",
                    "relaxation": "Có địa điểm nghỉ ngơi, thư giãn",
                }[interest])

        restaurant_names = " ".join(
            place.get("name") or "" for place in city_restaurants
        )

        for food in preferred_foods:
            if _matches(restaurant_names, food):
                score += 2
                reasons.append(f"Có lựa chọn ăn uống liên quan đến {food}")

        for food in avoided_foods:
            if _matches(restaurant_names, food):
                score -= 2

        # Free-text preferences only add evidence-based relevance.
        # They never override structured form fields or feasibility.
        form_terms = [
            item.get("type", "") for item in preferences.get("interests") or []
        ] + preferred_foods + avoided_foods

        for phrase in [*characteristics, requirements]:
            if not isinstance(phrase, str) or not phrase.strip():
                continue
            if any(_normalize(term) in _normalize(phrase) for term in form_terms if term):
                continue
            if _matches(evidence, phrase):
                score += 1
                reasons.append("Có thông tin phù hợp với yêu cầu bổ sung")
                break

        if not reasons:
            reasons.append("Là điểm đến được hỗ trợ và đã qua bộ lọc khả thi")

        suggestions.append({
            "destinationId": destination_id,
            "city": city,
            "reason": "; ".join(reasons[:2]),
            "_score": score,
        })

    suggestions.sort(key=lambda item: (-item["_score"], item["city"].casefold()))

    for item in suggestions:
        del item["_score"]

    return suggestions[:limit]
