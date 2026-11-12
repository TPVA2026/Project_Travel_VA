from fastapi.testclient import TestClient

from app.main import app
from app.services.data_service import load_dataset

client = TestClient(app)


def test_place_names_come_from_destination_dataset_for_requested_ids_only():
    dataset = load_dataset()
    imported = next(p for p in dataset["attractions"] if p["destinationId"] == "VN_48")
    hotel = dataset["hotels"][0]
    ids = ["ATTR_H_03", "REST_H_05", imported["id"], hotel["id"], "UNKNOWN"]
    response = client.get("/api/v1/places", params=[("ids", i) for i in ids + ids])
    assert response.status_code == 200
    places = {p["id"]: p for p in response.json()["places"]}
    assert set(places) == set(ids) - {"UNKNOWN"}
    assert places["ATTR_H_03"]["name"] == "Đại Nội"
    assert places["REST_H_05"]["name"] == "Bún bò mệ Kéo"
    assert places[imported["id"]]["name"] == imported["name"]
    assert places[hotel["id"]]["name"] == hotel["name"]
    assert "distancesToAttractions" not in places["ATTR_H_03"]


def test_place_lookup_without_ids_does_not_return_entire_dataset():
    assert client.get("/api/v1/places").json() == {"places": []}
