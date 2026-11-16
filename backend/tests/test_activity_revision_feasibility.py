"""TPVA-73: edited activities must pass the existing M4 checks again.

Fixtures are isolated test evidence, never production prices or routes.
"""
from copy import deepcopy

import pytest

from app.services.planning_service import revalidate_plan


@pytest.fixture
def edited_trip(m4_case):
    request, plan, dataset, costs = deepcopy(m4_case)
    request["budget"]["amount"] = 1000
    last = deepcopy(plan["days"][0]["activities"][0])
    last.update(activityId="a3", placeId="s2", startTime="11:00", endTime="12:00")
    place = deepcopy(dataset["attractions"][0])
    place["id"] = "s2"
    dataset["attractions"].append(place)
    restaurant = deepcopy(dataset["dining"][0])
    restaurant["id"] = "r2"
    dataset["dining"].append(restaurant)
    day = plan["days"][0]
    day["activities"].append(last)
    day["travelLegs"].append(dict(fromPlaceId="r1", toPlaceId="s2", durationMin=20, distanceKm=5))
    dataset["travel_matrix"] = [dataset["travel_matrix"][0]] + [
        {"from": a, "to": b, "durationMin": 20, "distanceKm": 5}
        for a, b in [("r1", "s2"), ("s1", "r2"), ("r2", "s2")]
    ]
    return request, plan, dataset, costs


def evaluate(case, plan=None):
    request, original, dataset, costs = case
    return revalidate_plan(request, plan or original, dataset=dataset,
                           supplemental_costs_by_plan={"p1": costs})


def replace_middle(case):
    revised = deepcopy(case[1])
    day = revised["days"][0]
    day["activities"][1]["placeId"] = "r2"
    day["travelLegs"][0]["toPlaceId"] = "r2"
    day["travelLegs"][1]["fromPlaceId"] = "r2"
    return revised


def test_replace_middle_rechecks_both_routes_and_keeps_inputs(edited_trip):
    before = deepcopy(edited_trip)
    assert evaluate(edited_trip)["status"] == "FEASIBLE"
    revised = replace_middle(edited_trip)
    result = evaluate(edited_trip, revised)
    assert result["status"] == "FEASIBLE"
    assert result["evaluation"]["components"]["travel"]["dailyTotals"][0]["durationMin"] == 40
    assert result["evaluation"]["components"]["cost"]["total_cost"] == 600
    assert edited_trip == before
    assert result["plan"] == revised


@pytest.mark.parametrize("origin,destination", [("s1", "r2"), ("r2", "s2")])
def test_each_new_route_requires_evidence(edited_trip, origin, destination):
    revised = replace_middle(edited_trip)
    edited_trip[2]["travel_matrix"] = [r for r in edited_trip[2]["travel_matrix"]
        if (r["from"], r["to"]) != (origin, destination)]
    result = evaluate(edited_trip, revised)
    assert result["status"] == "UNVERIFIED"
    assert not result["ranking"]["ranked"]
    assert any(r["code"] == "UNSUPPORTED_LEG" and r["path"] and r["message"]
               for r in result["evaluation"]["reasons"])


def test_regenerated_day_cannot_keep_stale_legs(edited_trip):
    revised = deepcopy(edited_trip[1])
    revised["days"][0]["activities"][1]["placeId"] = "r2"
    result = evaluate(edited_trip, revised)
    assert result["status"] != "FEASIBLE"
    assert not result["ranking"]["ranked"]


def test_edited_trip_requires_current_supplemental_costs(edited_trip):
    request, _, dataset, _ = edited_trip
    result = revalidate_plan(request, replace_middle(edited_trip), dataset=dataset)
    assert result["status"] == "UNVERIFIED"
    assert "transport" in result["evaluation"]["components"]["cost"]["missing_costs"]
    assert "accommodation" in result["evaluation"]["components"]["cost"]["missing_costs"]
    assert not result["ranking"]["ranked"]


def test_regenerated_day_rechecks_whole_trip_budget(edited_trip):
    revised = replace_middle(edited_trip)
    edited_trip[2]["dining"][1]["avgPricePerPersonVnd"] = 400
    revised["days"][0]["activities"][1]["estimatedCostVnd"] = 400
    result = evaluate(edited_trip, revised)
    assert result["status"] == "INFEASIBLE"
    assert result["evaluation"]["components"]["cost"]["known_total"] == 1300
    assert not result["ranking"]["ranked"]


@pytest.mark.parametrize("kind", ["gap", "distance", "minutes"])
def test_travel_checks_apply_without_transport_preference(edited_trip, kind):
    # The UI may omit transportation preferences; internal legs remain required.
    revised = replace_middle(edited_trip)
    assert "preferences" not in edited_trip[0]
    if kind == "gap":
        revised["days"][0]["activities"][1]["startTime"] = "09:10"
    else:
        edited_trip[0]["limits"] = {"appliesTo": "daily",
            "maxDistanceKm" if kind == "distance" else "maxTravelTimeMinutes": 1}
    result = evaluate(edited_trip, revised)
    assert result["status"] == "INFEASIBLE"
    assert not result["ranking"]["ranked"]
    code = "TRANSFER_GAP" if kind == "gap" else "TRAVEL_LIMIT"
    assert any(r["code"] == code and r["message"] and r["path"]
               for r in result["evaluation"]["reasons"])


def test_regenerated_day_reports_repeated_places_across_days(edited_trip):
    request, plan, _, _ = edited_trip
    request["durationDays"] = 2
    request["budget"]["amount"] = 2000
    second = deepcopy(plan["days"][0])
    second.update(dayNumber=2, date="2026-11-13")
    for activity in second["activities"]:
        activity["activityId"] += "-day2"
    plan["days"].append(second)
    result = evaluate(edited_trip)
    assert result["status"] == "FEASIBLE"
    report = result["ranking"]["quality_report"]["p1"]
    assert any(w["code"] == "REPEATED_PLACE" and w["placeId"] == "s1"
               and w["visits"] == 2 for w in report["warnings"])
    assert result["evaluation"]["components"]["cost"]["total_cost"] == 1100
