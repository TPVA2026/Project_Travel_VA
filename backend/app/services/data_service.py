from pathlib import Path
import json


DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as file:
        return json.load(file)


def load_dataset() -> dict:
    return {
        "destinations": _load("destinations.json"),
        "attractions": _load("attractions.json"),
        "dining": _load("restaurants.json"),
        "travel_matrix": _load("travel_matrix.json"),
    }


def get_destinations() -> list[dict]:
    current_file = Path(__file__).resolve()

    app_dir = current_file.parent.parent

    file_path = app_dir / "data" / "destinations.json"

    with open(file_path, encoding="utf-8") as file:
        des = json.load(file)

    if not all (isinstance(item,dict) for item in des):
        raise ValueError("Each destination must be an object")

    return des
