from fastapi.testclient import TestClient

from src.app import app
from src.modules.data.travel_repository import load_dataset

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_dataset_has_expected_keys():
    assert set(load_dataset()) == {"destinations", "attractions", "dining", "travel_matrix"}


# TODO(M6): add end-to-end tests for /requests, /destinations, /itineraries
