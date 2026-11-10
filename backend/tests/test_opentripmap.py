import httpx
import pytest

from app.services.opentripmap_service import OpenTripMapError, fetch_attractions


def test_fetch_attractions_maps_places_and_keeps_unknowns_unknown():
    def respond(request):
        assert request.url.params["apikey"] == "test-key"
        if request.url.path.endswith("/geoname"):
            return httpx.Response(200, json={"status": "OK", "lat": 16.4, "lon": 107.5})
        return httpx.Response(200, json=[
            {"xid": "W123", "name": "Historic site", "dist": 1250,
             "point": {"lat": 16.41, "lon": 107.51}},
            {"xid": "bad.id", "name": "Bad id"},
            {"xid": "W999", "name": ""},
        ])

    with httpx.Client(base_url="https://api.opentripmap.com", transport=httpx.MockTransport(respond)) as client:
        places = fetch_attractions([{"id": "H", "city": "Huế"}], api_key="test-key", client=client)
    assert len(places) == 1
    assert places[0]["id"] == "OTM_H_W123"
    assert places[0]["destinationId"] == "H"
    assert places[0]["distanceKm"] == 1.25
    assert places[0]["priceVnd"] is None
    assert places[0]["durationMin"] is None


def test_fetch_attractions_requires_key_and_hides_request_error(monkeypatch):
    monkeypatch.delenv("OPENTRIPMAP_API_KEY", raising=False)
    with pytest.raises(OpenTripMapError, match="OPENTRIPMAP_API_KEY"):
        fetch_attractions([], api_key="")

    def fail(_request):
        return httpx.Response(401)

    with httpx.Client(base_url="https://api.opentripmap.com", transport=httpx.MockTransport(fail)) as client:
        with pytest.raises(OpenTripMapError, match="OpenTripMap request failed") as error:
            fetch_attractions([{"id": "H", "city": "Huế"}], api_key="secret", client=client)
    assert "secret" not in str(error.value)
