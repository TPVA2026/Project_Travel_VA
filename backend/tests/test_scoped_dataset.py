"""Verify file access, rather than merely filtering a fully loaded dataset."""

import json
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import data_service
from app.services.ai import itinerary_generator


def watch_hue_files(monkeypatch):
    original = data_service._load
    opened = []

    def read(name):
        opened.append(name)
        if "/" in name:
            assert name.startswith("Hue/"), f"Read outside selected folder: {name}"
        return original(name)

    monkeypatch.setattr(data_service, "_load", read)
    return opened


@pytest.mark.parametrize("selection", ["H", "Huế", " hue "])
def test_selected_loader_reads_only_hue_and_preserves_place_and_route_evidence(monkeypatch, selection):
    full = data_service.load_dataset()
    opened = watch_hue_files(monkeypatch)
    scoped = data_service.load_dataset(selection)
    assert opened == ["destinations.json", "Hue/attractions.json", "Hue/restaurants.json",
                      "Hue/accomodation.json", "Hue/transport.json", "travel_matrix.json"]
    for key in ("attractions", "dining", "hotels"):
        assert scoped[key] == [p for p in full[key] if p["destinationId"] == "H"]
    assert scoped["travel_matrix"] == full["travel_matrix"]  # Keep departure-route evidence.
    assert scoped["demoCostPolicy"] == full["demoCostPolicy"]
    assert len(scoped["destinations"]) == 1


@pytest.mark.parametrize("payload", [
    {}, {"preferences": {"destination": None}},
    {"preferences": {"destination": "unsupported"}, "preferredDestination": "H"},
    {"preferences": {"destination": "../archive"}},
])
def test_missing_or_unsupported_request_does_not_load_any_place_folder(monkeypatch, payload):
    opened = watch_hue_files(monkeypatch)
    assert data_service.load_dataset(request=payload)["attractions"] == []
    assert opened == ["destinations.json"]


def test_shared_routing_overlay_is_filtered_to_loaded_places(monkeypatch):
    opened = []
    original = data_service._load

    def read(name):
        opened.append(name)
        assert "/" not in name or name.startswith("DaNang/")
        return original(name)

    monkeypatch.setattr(data_service, "_load", read)
    dataset = data_service.load_dataset("Da Nang")
    assert [d["id"] for d in dataset["destinations"]] == ["VN_48"]
    assert all(p["destinationId"] == "VN_48" for p in dataset["attractions"])


def test_destination_list_and_validation_open_manifest_only(monkeypatch):
    opened = watch_hue_files(monkeypatch)
    client = TestClient(app)
    assert client.get("/api/v1/destinations").json()["total"] == 34
    assert opened == ["destinations.json"]


def test_generate_evaluate_rank_pipeline_and_place_names_never_read_other_folders(monkeypatch):
    fixture = json.loads((Path(__file__).parent / "fixtures/acceptance/hue_scenarios.json").read_text(encoding="utf-8"))
    body = next(s["body"] for s in fixture["scenarios"] if s["id"] == "S03_valid_3day_evaluate")
    monkeypatch.setattr(itinerary_generator, "request_text", Mock(return_value=json.dumps(body["plan"])))
    monkeypatch.setenv("OSRM_ROUTING_ENABLED", "false")
    opened = watch_hue_files(monkeypatch)
    client = TestClient(app)
    assert client.post("/api/v1/requests/validate", json=body["request"]).status_code == 200
    assert opened == ["destinations.json"]
    for path, payload in [
        ("/itineraries/generate", body["request"]),
        ("/itineraries/evaluate", body),
        ("/itineraries/rank", {"request": body["request"], "plans": [body["plan"]]}),
        ("/itineraries/pipeline", {"request": body["request"], "count": 1}),
    ]:
        response = client.post(path, json=payload)
        assert response.status_code == 200, (path, response.json())
    metadata = client.get("/api/v1/places", params={"destination": "H", "ids": "ATTR_H_03"})
    assert metadata.json()["places"][0]["name"] == "Đại Nội"
    assert any(p == "Hue/attractions.json" for p in opened)
