from copy import deepcopy

from app.services.data_service import load_dataset, normalize_dataset


def test_dataset_has_expected_keys():
    assert set(load_dataset()) == {"destinations", "attractions", "dining", "travel_matrix"}


def test_production_dataset_has_canonical_relationships_and_flat_matrix():
    dataset = load_dataset()
    destination_ids = {item["id"] for item in dataset["destinations"]}
    assert dataset["attractions"] and dataset["dining"] and dataset["travel_matrix"]
    assert all(item["destinationId"] in destination_ids for item in dataset["attractions"])
    assert all(item["destinationId"] in destination_ids for item in dataset["dining"])
    assert all(set(("from", "to", "durationMin", "distanceKm")) <= leg.keys()
               for leg in dataset["travel_matrix"])


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
