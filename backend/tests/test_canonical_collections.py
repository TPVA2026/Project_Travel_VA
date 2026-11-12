import json
import pytest
from app.services.data_service import DATA_DIR, load_dataset, _load_destination_collections
from app.services.ai.context_builder import build_context


def test_four_collections_have_unique_ids_and_valid_relationships():
    dataset = load_dataset()
    assert len(dataset["destinations"]) == 34
    destinations = {d["id"] for d in dataset["destinations"]}
    assert len(destinations) == 34
    seen = set()
    for key in ("attractions", "dining", "hotels"):
        for place in dataset[key]:
            assert place["destinationId"] in destinations
            assert place["id"] not in seen
            seen.add(place["id"])


def test_destination_folders_are_complete_and_correctly_partitioned():
    destinations = json.loads((DATA_DIR / "destinations.json").read_text(encoding="utf-8"))
    folders = {d["id"]: d["dataFolder"] for d in destinations}
    assert folders["H"] == "Hue"
    assert folders["NT"] == "NhaTrang"
    assert folders["VN_48"] == "DaNang"
    assert len(set(folders.values())) == 34
    for destination in destinations:
        folder = DATA_DIR / destination["dataFolder"]
        assert {f.name for f in folder.iterdir()} == {"attractions.json", "restaurants.json", "accomodation.json"}
        for file in folder.iterdir():
            rows = json.loads(file.read_text(encoding="utf-8"))
            assert isinstance(rows, list)
            assert all(p["destinationId"] == destination["id"] for p in rows)
    for old in ("attractions.json", "restaurants.json", "accommodations.json"):
        assert not (DATA_DIR / old).exists()


def test_matrix_source_references_resolve_to_destination_files():
    for leg in load_dataset()["travel_matrix"]:
        reference = leg.get("sourceReference")
        if reference:
            relative = reference["file"].removeprefix("backend/app/data/")
            records = json.loads((DATA_DIR / relative).read_text(encoding="utf-8"))
            assert any(p["id"] == reference["recordId"] for p in records)


def test_loader_rejects_misplaced_records_and_unsafe_folder_names(tmp_path, monkeypatch):
    from app.services import data_service
    monkeypatch.setattr(data_service, "DATA_DIR", tmp_path)
    folder = tmp_path / "Hue"
    folder.mkdir()
    (folder / "attractions.json").write_text(json.dumps([{"id": "a", "destinationId": "NT"}]))
    with pytest.raises(ValueError, match="misplaced"):
        _load_destination_collections([{"id": "H", "dataFolder": "Hue"}])
    with pytest.raises(ValueError, match="folder"):
        _load_destination_collections([{"id": "H", "dataFolder": "../archive"}])


def test_every_imported_place_id_is_preserved():
    archive = DATA_DIR / "archive/legacy-20261112"
    original = json.loads((archive / "opentripmap_vietnam.json").read_text(encoding="utf-8"))
    current = {p["id"] for p in load_dataset()["attractions"]}
    assert {p["id"] for p in original["attractions"]} <= current
    assert not (DATA_DIR / "opentripmap_vietnam.json").exists()
    assert not (DATA_DIR / "hue_mvp_enrichment.json").exists()


def test_khanh_hoa_and_legacy_nha_trang_names_resolve_same_destination():
    dataset = load_dataset()
    for value in ("Nha Trang", "Khánh Hoà", "Khánh Hòa", "VN_56", "NT"):
        context = build_context({"preferences": {"destination": value}}, dataset)
        assert [d["id"] for d in context["destinations"]] == ["NT"]


def test_hue_supplemental_fields_are_in_canonical_collections():
    dataset = load_dataset()
    places = {p["id"]: p for key in ("attractions", "dining") for p in dataset[key]}
    for number in range(1, 11):
        assert places[f"ATTR_H_{number:02}"]["interestTags"]
        dining = places[f"REST_H_{number:02}"]
        assert dining["interestTags"]
        if dining.get("avgPricePerPersonVnd") is not None:
            assert dining["priceStatus"] == "ESTIMATED"
    assert places["ATTR_H_02"]["priceVnd"] == 50000
    assert places["REST_H_04"]["priceRangeVnd"]["min"] == 15000
    assert places["REST_H_04"]["priceRangeVnd"]["status"] == "ESTIMATED"
    assert places["REST_H_02"]["openingHours"] == "08:00 - 19:00"
    # Visiting advice must not become a fabricated hard opening constraint.
    assert places["ATTR_H_06"]["openingHours"] == "không cố định"
    assert places["ATTR_H_06"]["recommendedVisitWindow"] == "08:00 - 16:00"


def test_hue_generation_context_uses_curated_places_only():
    context = build_context({"preferences": {"destination": "H"}}, load_dataset())
    assert len(context["attractions"]) == 10
    assert len(context["dining"]) == 10
    assert all(place["id"].startswith("ATTR_H_") for place in context["attractions"])


@pytest.mark.parametrize("selection,destination_id,folder", [
    ("Huế", "H", "Hue"), ("  HUE  ", "H", "Hue"),
    ("Nha Trang", "NT", "NhaTrang"), ("Khánh Hòa", "NT", "NhaTrang"),
    ("Đà Nẵng", "VN_48", "DaNang"), ("Da Nang", "VN_48", "DaNang"),
    ("Dien Bien", "VN_11", "DienBien"), ("Dak Lak", "VN_66", "DakLak"),
    ("Lam Dong", "VN_68", "LamDong"), ("Dong Nai", "VN_75", "DongNai"),
    ("Dong Thap", "VN_82", "DongThap"),
])
def test_destination_input_selects_places_from_the_correct_folder(selection, destination_id, folder):
    context = build_context({"preferences": {"destination": selection}}, load_dataset())
    assert [d["id"] for d in context["destinations"]] == [destination_id]
    assert context["destinations"][0]["dataFolder"] == folder
    for key, filename in (("attractions", "attractions.json"), ("dining", "restaurants.json")):
        stored = json.loads((DATA_DIR / folder / filename).read_text(encoding="utf-8"))
        stored_ids = {place["id"] for place in stored}
        assert all(place["destinationId"] == destination_id and place["id"] in stored_ids
                   for place in context[key])
    if destination_id == "H":
        assert len(context["attractions"]) == len(context["dining"]) == 10


def test_planning_context_does_not_leak_legacy_route_estimates():
    dataset = load_dataset()
    source = next(p for p in dataset["attractions"] if p["id"] == "ATTR_H_03")
    assert source["distancesToAttractions"]
    context = build_context({"preferences": {"destination": "H"}}, dataset)
    for place in context["attractions"] + context["dining"]:
        assert not {"distancesToAttractions", "distancesToRestaurants", "distanceFromCenter", "distanceKm"} & place.keys()
    assert all(leg["durationMin"] is None and leg["distanceKm"] is None for leg in context["travelMatrix"])
    assert source["distancesToAttractions"]  # Source evidence remains intact.
