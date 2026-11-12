"""Read-only readiness report: python -m scripts.audit_hue_mvp (from backend)."""

import json

from app.algorithms.schedule_validator import _window
from app.algorithms.validation_common import route_reference
from app.services.data_service import load_dataset


def audit():
    dataset = load_dataset()
    places = [p for collection in ("attractions", "dining") for p in dataset[collection]
              if p.get("destinationId") == "H" and p["id"].startswith(("ATTR_H_", "REST_H_"))]
    ids = {p["id"] for p in places}
    report = []
    for p in places:
        is_dining = p["id"].startswith("REST_")
        price_field = "avgPricePerPersonVnd" if is_dining else "priceVnd"
        unknown = []
        if _window(p.get("openingHours")) is None:
            unknown.append("exact_opening_hours")
        if p.get(price_field) is None or p.get("priceStatus") == "ESTIMATED":
            unknown.append("confirmed_per_person_price")
        source_unverified = p.get("unverifiedFields", [])
        report.append({"id": p["id"], "name": p["name"], "missingForEvaluation": unknown,
                       "sourceUnverifiedFields": source_unverified,
                       "hasInterestTags": bool(p.get("interestTags")),
                       "hasDiningEstimate": is_dining and p.get("avgPricePerPersonVnd") is not None,
                       "hasPublishedPriceRange": isinstance(p.get("priceRangeVnd"), dict)})
    pairs = [(a, b) for a in ids for b in ids if a != b]
    return {"dataset": "four canonical collections", "places": report, "placeCount": len(places),
            "withTags": sum(p["hasInterestTags"] for p in report),
            "withPublishedPriceRange": sum(p["hasPublishedPriceRange"] for p in report),
            "withDiningEstimate": sum(p["hasDiningEstimate"] for p in report),
            "readableOpeningHours": sum("exact_opening_hours" not in p["missingForEvaluation"] for p in report),
            "acceptedDirectedRoutes": sum(route_reference(dataset, a, b) is not None for a, b in pairs),
            "possibleDirectedRoutes": len(pairs),
            "note": "Readable values are not blanket field verification. Lodging/transport totals and order quantities require trip-specific evidence."}


if __name__ == "__main__":
    print(json.dumps(audit(), ensure_ascii=False, indent=2))
