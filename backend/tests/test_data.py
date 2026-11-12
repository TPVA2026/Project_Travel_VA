from copy import deepcopy

from app.services.data_service import _apply_routing_points, load_dataset, normalize_dataset


def test_dataset_has_expected_keys():
    assert set(load_dataset()) == {"destinations", "attractions", "dining", "travel_matrix", "hotels", "demoCostPolicy"}


def test_production_dataset_has_canonical_relationships_and_flat_matrix():
    dataset = load_dataset()
    destination_ids = {item["id"] for item in dataset["destinations"]}
    assert dataset["attractions"] and dataset["dining"] and dataset["travel_matrix"]
    assert all(item["destinationId"] in destination_ids for item in dataset["attractions"])
    assert all(item["destinationId"] in destination_ids for item in dataset["dining"])
    assert all(set(("from", "to", "durationMin", "distanceKm")) <= leg.keys()
               for leg in dataset["travel_matrix"])


def test_reviewed_routing_points_are_an_overlay_not_snapshot_mutation():
    dataset = load_dataset()
    places = {place["id"]: place for place in dataset["attractions"]}
    assert places["OTM_H_N669249200"]["routingPoint"]["profile"] == "driving"
    assert places["OTM_H_W161714451"]["routingPoint"]["reviewed"] is True

    raw = {"attractions": [{"id": "a"}], "dining": []}
    before = deepcopy(raw)
    result = _apply_routing_points(deepcopy(raw), {"points": [{
        "placeId": "a", "reviewed": True, "profile": "driving",
        "latitude": 1, "longitude": 2,
    }]})
    assert result["attractions"][0]["routingPoint"]["latitude"] == 1
    assert before == {"attractions": [{"id": "a"}], "dining": []}


def test_adapter_is_conservative_and_does_not_mutate_input():
    raw = {
        "destinations": [{"id": "H", "city": "Huế"}],
        "attractions": [
            {"id": "a1", "city": "Huế", "cost": "50.000 VND", "travel_time": "10 phút"},
            {"id": "a2", "city": "Huế", "cost": "30.000 - 70.000 VND", "travel_time": "7-10 phút"},
        ],
        "restaurants": [{"id": "r1", "city": "Hue", "cost": "miễn phí"}],
        "travel_matrix": {"destinations": {"Huế": {"between_locations": [{
            "from_id": "a1", "to_id": "r1", "distance_km": None,
            "duration_minutes": None, "status": "needs_route_verification",
        }]}}},
    }
    before = deepcopy(raw)
    normalized = normalize_dataset(raw)
    assert normalized["attractions"][0]["priceVnd"] == 50000
    assert normalized["attractions"][0]["durationMin"] == 10
    assert normalized["attractions"][1]["priceVnd"] is None
    assert normalized["attractions"][1]["durationMin"] is None
    assert normalized["dining"][0]["avgPricePerPersonVnd"] == 0
    assert normalized["dining"][0]["destinationId"] == "H"
    assert normalized["travel_matrix"][0]["durationMin"] is None
    assert raw == before


def test_adapter_canonicalizes_flat_matrix_without_mutating_input():
    raw = {
        "destinations": [],
        "travel_matrix": [{
            "from": "a1",
            "to": "a2",
            "distanceKm": 8.6,
        }],
    }
    before = deepcopy(raw)

    normalized = normalize_dataset(raw)

    assert normalized["travel_matrix"] == [{
        "from": "a1",
        "to": "a2",
        "distanceKm": 8.6,
        "durationMin": None,
    }]
    assert raw == before
