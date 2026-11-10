"""Run `python -m scripts.import_opentripmap` from backend to refresh POIs."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from app.services.data_service import DATA_DIR, _load
from app.services.opentripmap_service import fetch_attractions


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    places = fetch_attractions(_load("destinations.json"), api_key=os.getenv("OPENTRIPMAP_API_KEY"))
    target = DATA_DIR / "opentripmap_attractions.json"
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(places, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)
    print(f"Imported {len(places)} attractions into {target}")


if __name__ == "__main__":
    main()
