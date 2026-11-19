from fastapi.testclient import TestClient
import pytest

from app import auth
from app.auth import AuthenticatedUser, get_current_user
from app.main import app


@pytest.fixture
def trip_client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRIPS_DATABASE_PATH", str(tmp_path / "trips.sqlite3"))
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def authenticate_as(subject: str):
    # Google is deliberately mocked: endpoint tests consume only a verified identity.
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=subject, email=f"{subject}@example.test"
    )


def itinerary(title: str, place: str):
    return {
        "planId": f"candidate-{title}",
        "title": title,
        "destination": "Hue",
        "days": [{"dayNumber": 1, "activities": [{"placeId": place}]}],
    }


def test_google_token_verifier_uses_stable_subject(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "web-client.apps.googleusercontent.com")
    observed = {}

    def fake_verify(token, request, audience):
        observed.update(token=token, audience=audience)
        return {
            "sub": "google-account-123",
            "email": "person@example.test",
            "iss": "https://accounts.google.com",
        }

    monkeypatch.setattr(auth.id_token, "verify_oauth2_token", fake_verify)
    user = auth.verify_google_token("mock-google-id-token")
    assert user.id == "google-account-123"
    assert observed == {
        "token": "mock-google-id-token",
        "audience": "web-client.apps.googleusercontent.com",
    }


def test_trips_require_authentication(trip_client):
    response = trip_client.get("/api/trips")
    assert response.status_code == 401
    assert "trips" not in response.json()


def test_create_list_get_update_and_start_new_trip_does_not_overwrite(trip_client):
    authenticate_as("account-a")

    trip_a = trip_client.post("/api/trips", json={"itinerary": itinerary("A", "place-a")})
    trip_b = trip_client.post("/api/trips", json={"itinerary": itinerary("B", "place-b")})
    assert trip_a.status_code == trip_b.status_code == 201
    id_a = trip_a.json()["trip"]["id"]
    id_b = trip_b.json()["trip"]["id"]
    assert id_a != id_b

    listed = trip_client.get("/api/trips").json()["trips"]
    assert {item["id"] for item in listed} == {id_a, id_b}
    assert all("itinerary" not in item for item in listed)
    assert trip_client.get(f"/api/trips/{id_a}").json()["trip"]["itinerary"]["title"] == "A"

    revised = itinerary("A revised", "place-a2")
    updated = trip_client.put(f"/api/trips/{id_a}", json={"itinerary": revised})
    assert updated.status_code == 200
    assert updated.json()["trip"]["id"] == id_a
    assert trip_client.get(f"/api/trips/{id_b}").json()["trip"]["itinerary"]["title"] == "B"


def test_account_cannot_list_read_or_update_another_accounts_trips(trip_client):
    authenticate_as("account-a")
    created = trip_client.post("/api/trips", json={"itinerary": itinerary("Private", "secret")})
    trip_id = created.json()["trip"]["id"]

    authenticate_as("account-b")
    assert trip_client.get("/api/trips").json() == {"trips": []}
    assert trip_client.get(f"/api/trips/{trip_id}").status_code == 404
    response = trip_client.put(
        f"/api/trips/{trip_id}", json={"itinerary": itinerary("Stolen", "changed")}
    )
    assert response.status_code == 404

    authenticate_as("account-a")
    original = trip_client.get(f"/api/trips/{trip_id}").json()["trip"]["itinerary"]
    assert original["title"] == "Private"
