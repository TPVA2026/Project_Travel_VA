"""Explainable soft itinerary diagnostics, independent of hard feasibility."""

from collections import Counter

from app.algorithms.feasibility import time_to_minutes
from app.schemas.candidate_plan import CandidatePlan


def evaluate_quality(plan, *, intentional_rest_days=()):
    """Rest intent must be explicit server/user metadata, never inferred prose.

    Thresholds are soft product heuristics: >8 stops, >3h idle, and lunch
    outside 11:00–14:00. No score/status modifies M4 feasibility.
    """
    plan = CandidatePlan.model_validate(plan).model_dump(mode="json")
    warnings, days, visits = [], [], Counter()
    for day in plan["days"]:
        number, activities = day["dayNumber"], day["activities"]
        sightseeing = sum(a["type"] == "sightseeing" for a in activities)
        periods = Counter()
        ordered = sorted(activities, key=lambda a: a["startTime"])
        for a in ordered:
            visits[(a["type"], a["placeId"])] += 1
            start = time_to_minutes(a["startTime"])
            periods["morning" if start < 720 else "afternoon" if start < 1080 else "evening"] += 1
            # Only explicit reason identifies a lunch; do not label every meal lunch.
            if a["type"] == "dining" and any(word in a["reason"].casefold() for word in ("lunch", "ăn trưa")):
                if not 660 <= start <= 840:
                    warnings.append({"code": "LUNCH_TIMING", "dayNumber": number,
                                     "activityId": a["activityId"]})
        if sightseeing <= 1 and number not in intentional_rest_days:
            warnings.append({"code": "SPARSE_DAY", "dayNumber": number})
        if len(activities) > 8:
            warnings.append({"code": "DENSE_DAY", "dayNumber": number})
        for before, after in zip(ordered, ordered[1:]):
            gap = time_to_minutes(after["startTime"]) - time_to_minutes(before["endTime"])
            if gap > 180 and number not in intentional_rest_days:
                warnings.append({"code": "LONG_IDLE_GAP", "dayNumber": number,
                                 "fromActivityId": before["activityId"], "toActivityId": after["activityId"],
                                 "minutes": gap})
        days.append({"dayNumber": number, "activityCount": len(activities),
                     "sightseeingCount": sightseeing, "periodCounts": dict(periods),
                     "intentionalRest": number in intentional_rest_days})
    duplicates = [{"type": kind, "placeId": place, "visits": count}
                  for (kind, place), count in visits.items() if count > 1]
    for item in duplicates:
        warnings.append({"code": "REPEATED_PLACE", **item})
    return {"warnings": warnings, "metrics": {"days": days, "repeatedPlaces": duplicates,
                                              "geographicClustering": None}, "score": None}
