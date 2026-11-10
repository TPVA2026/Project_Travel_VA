import httpx
import json

from app.services import data_service
from app.services.ai.context_builder import build_context

from app.services.opentripmap_national import (
    fetch_tile, make_destinations, normalize_places, province_for_point,
    tiles_for_provinces,
)


PROVINCES = [{
    "code": "01", "name": "Hà Nội", "bbox": [105, 20, 106, 21],
    "geometry": {"type": "Polygon", "coordinates": [
        [[105, 20], [106, 20], [106, 21], [105, 21], [105, 20]],
        [[105.4, 20.4], [105.6, 20.4], [105.6, 20.6], [105.4, 20.6], [105.4, 20.4]],
    ]},
}]


def test_boundary_filter_and_destination_mapping():
    assert province_for_point(105.2, 20.2, PROVINCES)["code"] == "01"
    assert province_for_point(105.5, 20.5, PROVINCES) is None
    assert len(tiles_for_provinces(PROVINCES, 0.5)) == 4
    assert make_destinations(PROVINCES) == [
        {"id": "VN_01", "city": "Hà Nội", "source": "Vietnamese Provinces Database"}
    ]
    places = normalize_places([
        {"xid": "W1", "name": "Temple", "point": {"lon": 105.2, "lat": 20.2}},
        {"xid": "W2", "name": "Outside", "point": {"lon": 105.5, "lat": 20.5}},
        {"xid": "W1", "name": "Temple", "point": {"lon": 105.2, "lat": 20.2}},
    ], PROVINCES)
    assert len(places) == 1
    assert places[0]["destinationId"] == "VN_01"
    assert places[0]["priceVnd"] is None


def test_fetch_tile_reads_all_pages():
    offsets = []

    def respond(request):
        offsets.append(int(request.url.params["offset"]))
        return httpx.Response(200, json=[{"xid": f"W{len(offsets)}"}] if len(offsets) <= 2 else [])

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        items = fetch_tile(client, (105, 20, 106, 21), "test-key", page_size=1, pause=0)
    assert offsets == [0, 1, 2]
    assert len(items) == 2


def test_nationwide_snapshot_is_available_to_planner(tmp_path, monkeypatch):
    monkeypatch.setattr(data_service, "DATA_DIR", tmp_path)
    for filename, value in {
        "destinations.json": [{"id": "H", "city": "Huế"}],
        "attractions.json": [], "restaurants.json": [], "travel_matrix.json": [],
        "opentripmap_vietnam.json": {
            "destinations": [{"id": "VN_01", "city": "Hà Nội"}],
            "attractions": [{"id": "OTM_VN_01_W1", "destinationId": "VN_01",
                             "name": "Temple", "priceVnd": None}],
        },
    }.items():
        (tmp_path / filename).write_text(json.dumps(value), encoding="utf-8")
    dataset = data_service.load_dataset()
    assert dataset["nationwide"] is True
    assert len(dataset["destinations"]) == 2
    assert build_context({"preferences": {"destination": "Hà Nội"}}, dataset)[
        "attractions"][0]["id"] == "OTM_VN_01_W1"
    assert build_context({}, dataset)["attractions"] == []
