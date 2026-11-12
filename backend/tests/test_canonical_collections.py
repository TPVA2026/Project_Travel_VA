import json
from app.services.data_service import DATA_DIR, load_dataset
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
