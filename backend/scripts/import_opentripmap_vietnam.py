"""Refresh all named OpenTripMap attractions covered by Vietnam province polygons."""

import argparse
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

from app.services.data_service import DATA_DIR
from app.services.opentripmap_national import (
    fetch_tile, load_provinces, make_destinations, normalize_places, tiles_for_provinces,
)


def _write_json(path: Path, data: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step", type=float, default=0.5,
                        help="Grid size in degrees; keep the same value when resuming")
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    api_key = os.getenv("OPENTRIPMAP_API_KEY")
    if not api_key:
        parser.error("Set OPENTRIPMAP_API_KEY in backend/.env")

    cache = DATA_DIR / "opentripmap_vietnam_cache"
    cache.mkdir(exist_ok=True)
    boundary_cache = cache / "provinces.json"
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        if boundary_cache.exists():
            provinces = json.loads(boundary_cache.read_text(encoding="utf-8"))
        else:
            provinces = load_provinces(client)
            _write_json(boundary_cache, provinces)
        if len(provinces) != 34:
            raise ValueError("Expected 34 province boundaries")
        tiles = tiles_for_provinces(provinces, args.step)
        print(f"Scanning {len(tiles)} tiles across 34 provinces. Completed tiles are cached.", flush=True)
        for number, box in enumerate(tiles, 1):
            filename = "_".join(str(round(value * 1000000)) for value in box) + ".json"
            tile_path = cache / filename
            if tile_path.exists():
                continue
            items = fetch_tile(client, box, api_key)
            _write_json(tile_path, items)
            print(f"{number}/{len(tiles)}: {len(items)} results", flush=True)

    # Publish only after every tile is present. A failed run leaves the last good snapshot intact.
    all_items = []
    for box in tiles:
        filename = "_".join(str(round(value * 1000000)) for value in box) + ".json"
        all_items.extend(json.loads((cache / filename).read_text(encoding="utf-8")))
    places = normalize_places(all_items, provinces)
    _write_json(DATA_DIR / "opentripmap_vietnam.json", {
        "destinations": make_destinations(provinces), "attractions": places,
        "source": "OpenTripMap", "boundarySource": "Vietnamese Provinces Database",
        "tileCount": len(tiles),
    })
    print(f"Imported {len(places)} unique attractions across Vietnam.", flush=True)


if __name__ == "__main__":
    main()
