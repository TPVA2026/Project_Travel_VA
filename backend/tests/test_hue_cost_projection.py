from copy import deepcopy

from app.services.hue_cost_projection import project_hue_costs
from app.algorithms.cost_validator import evaluate_candidate_costs
from app.services.data_service import load_dataset


def projection_case():
    return ({"durationDays": 3, "travelers": {"count": 3}},
            {"destinationId": "H", "days": [{"activities": [
                {"activityId": "meal", "placeId": "r", "type": "dining"}]}]},
            {"demoCostPolicy": {}, "hotels": [], "dining": []},
            {"known_total": 200000, "missing_costs": ["meal", "accommodation", "transport"],
             "breakdown": {"accommodation": None}})


def test_room_and_meal_estimate_is_counted_once():
    request, plan, dataset, cost = projection_case()
    dataset["demoCostPolicy"] = {"status": "ESTIMATED"}
    dataset["hotels"] = [{"destinationId": "H", "demoDefault": True, "capacityAdults": 2,
                           "pricePerRoomNightVnd": 1000000, "name": "Hotel", "roomType": "Double",
                           "sourceUrl": "https://example.org/rooms", "note": "from-price"}]
    dataset["dining"] = [{"id": "r", "name": "Meal", "avgPricePerPersonVnd": 50000,
                          "priceStatus": "ESTIMATED", "diningEstimateEvidence": {"sourceUrl": "https://example.org/menu"}}]
    before = deepcopy((request, plan, dataset, cost))
    result = project_hue_costs(request, plan, dataset, cost)
    assert result["items"][0]["rooms"] == 2
    assert result["items"][0]["nights"] == 2
    assert result["subtotalVnd"] == 4350000
    assert result["totalVnd"] is None
    assert result["uncovered"] == ["transport"]
    assert (request, plan, dataset, cost) == before
    cost.update(missing_costs=["transport"], breakdown={"accommodation": 4000000}, known_total=4350000)
    assert project_hue_costs(request, plan, dataset, cost)["items"] == []


def test_demo_estimates_cannot_become_known_costs(m4_case):
    dataset = load_dataset()
    request, plan, _, _ = m4_case
    plan["destinationId"] = "H"
    activity = plan["days"][0]["activities"][1]
    activity.update(placeId="REST_H_02", estimatedCostVnd=50000, costStatus="KNOWN")
    result = evaluate_candidate_costs(request, plan, dataset)
    assert result["breakdown"]["dining"] is None
    assert result["total_cost"] is None
    assert result["projection"]["items"][-1]["amountVnd"] == 100000


def test_other_destinations_do_not_receive_hue_hotel():
    request, plan, dataset, cost = projection_case()
    dataset["demoCostPolicy"] = {"status": "ESTIMATED"}
    plan["destinationId"] = "NT"
    assert project_hue_costs(request, plan, dataset, cost) is None


def test_canonical_dataset_evaluate_api_returns_lodging_projection(monkeypatch):
    import json
    from pathlib import Path
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setenv("OSRM_ROUTING_ENABLED", "false")
    fixture = json.loads((Path(__file__).parent / "fixtures/acceptance/hue_scenarios.json").read_text(encoding="utf-8"))
    body = deepcopy(next(s for s in fixture["scenarios"] if s["id"] == "S03_valid_3day_evaluate")["body"])
    dataset = load_dataset()
    places = {p["id"]: p for key in ("attractions", "dining") for p in dataset[key]}
    for day in body["plan"]["days"]:
        for activity in day["activities"]:
            place = places[activity["placeId"]]
            price = place.get("avgPricePerPersonVnd") if activity["type"] == "dining" else place.get("priceVnd")
            activity.update(estimatedCostVnd=price, costStatus="KNOWN" if price is not None else "NO_DATA")
    response = TestClient(app).post("/itineraries/evaluate", json=body)
    assert response.status_code == 200, response.json()
    projection = response.json()["components"]["cost"]["projection"]
    hotel = next(i for i in projection["items"] if i["category"] == "accommodation")
    assert hotel["nights"] == 2
    assert hotel["amountVnd"] == 2380952
    assert response.json()["status"] != "FEASIBLE"
