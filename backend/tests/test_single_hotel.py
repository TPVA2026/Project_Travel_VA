from copy import deepcopy

from app.services.ai.itinerary_generator import check_grounding


DATASET = {
    "destinations": [
        {"id": "H"},
        {"id": "DN"},
    ],
    "attractions": [],
    "dining": [],
    "travelMatrix": [],
    "hotels": [
        {"id": "HOTEL_H_01", "destinationId": "H"},
        {"id": "HOTEL_DN_01", "destinationId": "DN"},
    ],
}


def make_plan():
    return {
        "destinationId": "H",
        "days": [],
        "hotelId": "HOTEL_H_01",
    }


def test_valid_hotel():
    assert check_grounding(make_plan(), DATASET) == []


def test_unknown_hotel():
    plan = make_plan()
    plan["hotelId"] = "FAKE_HOTEL"

    errors = check_grounding(plan, DATASET)

    assert any("unknown" in e and "hotelId" in e for e in errors)


def test_wrong_destination_hotel():
    plan = make_plan()
    plan["hotelId"] = "HOTEL_DN_01"

    errors = check_grounding(plan, DATASET)

    assert any("does not belong" in e for e in errors)


def test_null_hotel():
    plan = make_plan()
    plan["hotelId"] = None

    assert check_grounding(plan, DATASET) == []


def test_legacy_plan_without_hotel():
    plan = make_plan()
    del plan["hotelId"]

    assert check_grounding(plan, DATASET) == []


def test_duplicate_hotel_id():
    dataset = deepcopy(DATASET)
    dataset["hotels"].append(dataset["hotels"][0])

    errors = check_grounding(make_plan(), dataset)

    assert any("duplicate" in e for e in errors)
