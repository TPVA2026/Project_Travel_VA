import json
from pathlib import Path

DATA_DIR = Path(__file__).parent

# Shape consumed by M3/M4: { destinations, attractions, dining, travel_matrix }.
# Unknown prices/hours/travel times must stay None (JSON null), never 0.
# TODO(M2): add retrieval filters, provenance and update-date metadata.


def _load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def load_dataset() -> dict:
    return {
        "destinations": _load("destinations.json"),
        "attractions": _load("attractions.json"),
        "dining": _load("restaurants.json"),
        "travel_matrix": _load("travel_matrix.json"),
    }
