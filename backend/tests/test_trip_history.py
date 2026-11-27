import pytest

from app.services.trip_store import create_trip
from app.services.ai.trip_history import get_trip_history


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "TRIPS_DATABASE_PATH",
        str(tmp_path / "test-history.sqlite3")
    )


def save_trip(user, destination, places):
    return create_trip(user, {
        "title": "Test trip",
        "destinationId": destination,
        "days": [{
            "activities": [
                {"placeId": place}
                for place in places
            ]
        }]
    })


def test_no_history():
    assert get_trip_history("user1", "H") == []


def test_same_destination():
    save_trip("user1", "H", ["p1", "p2"])

    assert get_trip_history("user1", "H") == [
        {"days": [{"placeIds": ["p1", "p2"]}]}
    ]


def test_different_destination():
    save_trip("user1", "DN", ["p1"])

    assert get_trip_history("user1", "H") == []


def test_account_isolation():
    save_trip("user1", "H", ["p1"])

    assert get_trip_history("user2", "H") == []


def test_history_limit():
    for i in range(5):
        save_trip("user1", "H", [f"p{i}"])

    assert len(get_trip_history("user1", "H")) == 3


def test_duplicate_places_removed():
    save_trip("user1", "H", ["p1", "p1", "p2"])

    assert get_trip_history("user1", "H") == [
        {"days": [{"placeIds": ["p1", "p2"]}]}
    ]


def test_destination_name_resolution():
    from app.services.destination_resolution import (
        request_destination,
        resolve_destination_id,
    )

    destinations = [
        {"id": "H", "name": "Huế"}
    ]

    save_trip("user1", "H", ["p1", "p2"])

    for name in ["Huế", "Hue", "H"]:
        request = {
            "preferences": {
                "destination": name
            }
        }

        destination = resolve_destination_id(
            request_destination(request),
            destinations
        )

        assert destination == "H"
        assert len(get_trip_history("user1", destination)) == 1


def test_history_in_prompt():
    from app.services.ai.prompt_templates import build_prompt

    history = [
        {"days": [{"placeIds": ["p1", "p2"]}]}
    ]

    prompt = build_prompt(
        {},
        {},
        trip_history=history
    )

    assert "SAVED_TRIP_PREFERENCES" in prompt
    assert "p1" in prompt
    assert "p2" in prompt


def test_no_history_in_prompt():
    from app.services.ai.prompt_templates import build_prompt

    prompt = build_prompt({}, {})

    assert "SAVED_TRIP_PREFERENCES" not in prompt
