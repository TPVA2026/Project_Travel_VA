"""Country-wide OpenTripMap attraction import helpers."""

import math
import re
import time

import httpx

from app.services.opentripmap_service import OpenTripMapError


BOUNDARY_REPO = "https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/json/geojson"
# The 2026 boundary dataset contains 34 provinces/cities.
PROVINCE_FILES = (
    "01_ha_noi", "04_cao_bang", "08_tuyen_quang", "11_dien_bien", "12_lai_chau",
    "14_son_la", "15_lao_cai", "19_thai_nguyen", "20_lang_son", "22_quang_ninh",
    "24_bac_ninh", "25_phu_tho", "31_hai_phong", "33_hung_yen", "37_ninh_binh",
    "38_thanh_hoa", "40_nghe_an", "42_ha_tinh", "44_quang_tri", "46_hue",
    "48_da_nang", "51_quang_ngai", "52_gia_lai", "56_khanh_hoa", "66_dak_lak",
    "68_lam_dong", "75_dong_nai", "79_ho_chi_minh", "80_tay_ninh", "82_dong_thap",
    "86_vinh_long", "91_an_giang", "92_can_tho", "96_ca_mau",
)


def request_json(client: httpx.Client, url: str, *, params: dict | None = None,
                 pause: float = 0.12) -> object:
    """Retry transient failures without exposing URLs that contain the API key."""
    for attempt in range(5):
        try:
            response = client.get(url, params=params)
            if response.status_code in (429, 500, 502, 503, 504):
                if attempt < 4:
                    time.sleep(max(pause, min(30, 2 ** attempt)))
                    continue
            response.raise_for_status()
            result = response.json()
            time.sleep(pause)
            return result
        except (httpx.HTTPError, ValueError):
            if attempt < 4:
                time.sleep(max(pause, min(30, 2 ** attempt)))
                continue
            raise OpenTripMapError("National import request failed") from None
    raise OpenTripMapError("National import request failed")


def load_provinces(client: httpx.Client, *, pause: float = 0.12) -> list[dict]:
    provinces = []
    for folder in PROVINCE_FILES:
        data = request_json(client, f"{BOUNDARY_REPO}/{folder}/{folder}.geojson", pause=pause)
        if not isinstance(data, dict) or len(data.get("features", [])) != 1:
            raise ValueError(f"Invalid boundary data: {folder}")
        feature = data["features"][0]
        props = feature["properties"]
        code, name = props["code"], props["name"]
        if not re.fullmatch(r"\d{2}", str(code)) or not isinstance(name, str):
            raise ValueError(f"Invalid province metadata: {folder}")
        bbox = data["bbox"]
        provinces.append({"code": str(code), "name": name, "bbox": bbox,
                          "geometry": feature["geometry"]})
    return provinces


def _in_ring(lon: float, lat: float, ring: list) -> bool:
    inside = False
    for index in range(len(ring)):
        x1, y1 = ring[index - 1][:2]
        x2, y2 = ring[index][:2]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def province_for_point(lon: float, lat: float, provinces: list[dict]) -> dict | None:
    for province in provinces:
        left, bottom, right, top = province["bbox"]
        if not (left <= lon <= right and bottom <= lat <= top):
            continue
        geometry = province["geometry"]
        polygons = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
                    else [geometry["coordinates"]])
        for polygon in polygons:
            if polygon and _in_ring(lon, lat, polygon[0]) and not any(
                _in_ring(lon, lat, hole) for hole in polygon[1:]
            ):
                return province
    return None


def tiles_for_provinces(provinces: list[dict], step: float = 0.5) -> list[tuple[float, float, float, float]]:
    """Cover every province bbox; extra border cells are filtered by polygon later."""
    if not 0 < step <= 1:
        raise ValueError("step must be in (0, 1]")
    cells = set()
    for province in provinces:
        left, bottom, right, top = province["bbox"]
        for x in range(math.floor(left / step), math.ceil(right / step)):
            for y in range(math.floor(bottom / step), math.ceil(top / step)):
                cells.add((round(x * step, 6), round(y * step, 6),
                           round((x + 1) * step, 6), round((y + 1) * step, 6)))
    return sorted(cells)


def fetch_tile(client: httpx.Client, box: tuple, api_key: str, *, page_size: int = 500,
               pause: float = 0.12, depth: int = 0) -> list[dict]:
    """Read all pages; split dense boxes when the API repeats an offset page."""
    if not 1 <= page_size <= 500:
        raise ValueError("page_size must be 1..500")
    left, bottom, right, top = box
    offset, all_items, page_signatures = 0, [], set()
    while True:
        page = request_json(client, "https://api.opentripmap.com/0.1/en/places/bbox", params={
            "lon_min": left, "lat_min": bottom, "lon_max": right, "lat_max": top,
            "limit": page_size, "offset": offset, "rate": 1,
            "kinds": "interesting_places", "format": "json", "apikey": api_key,
        }, pause=pause)
        if not isinstance(page, list):
            raise OpenTripMapError("Invalid OpenTripMap bbox response")
        signature = tuple(item.get("xid") if isinstance(item, dict) else None for item in page)
        if signature in page_signatures:
            if depth >= 8:
                raise OpenTripMapError("OpenTripMap repeats pages in a very dense map area")
            middle_lon, middle_lat = (left + right) / 2, (bottom + top) / 2
            quarters = (
                (left, bottom, middle_lon, middle_lat),
                (middle_lon, bottom, right, middle_lat),
                (left, middle_lat, middle_lon, top),
                (middle_lon, middle_lat, right, top),
            )
            return [item for quarter in quarters for item in fetch_tile(
                client, quarter, api_key, page_size=page_size, pause=pause, depth=depth + 1
            )]
        page_signatures.add(signature)
        all_items.extend(page)
        if len(page) < page_size:
            return all_items
        offset += len(page)


def make_destinations(provinces: list[dict]) -> list[dict]:
    return [{"id": f"VN_{p['code']}", "city": p["name"], "source": "Vietnamese Provinces Database"}
            for p in provinces if p["code"] not in {"46", "79"}]


def normalize_places(items: list[dict], provinces: list[dict]) -> list[dict]:
    places = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        xid, name, point = item.get("xid"), item.get("name"), item.get("point")
        if not isinstance(xid, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", xid):
            continue
        if not isinstance(name, str) or not name.strip() or not isinstance(point, dict):
            continue
        try:
            lat, lon = float(point["lat"]), float(point["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(lat) or not math.isfinite(lon):
            continue
        province = province_for_point(lon, lat, provinces)
        if province is None:
            continue
        destination_id = {"46": "H", "79": "HCM"}.get(
            province["code"], f"VN_{province['code']}")
        places[xid] = {
            "id": f"OTM_{destination_id}_{xid}", "destinationId": destination_id,
            "city": province["name"], "name": name.strip(), "source": "OpenTripMap",
            "sourceId": xid, "sourceUrl": f"https://opentripmap.com/en/card/{xid}",
            "kinds": item.get("kinds"), "rate": item.get("rate"),
            "latitude": lat, "longitude": lon,
            "priceVnd": None, "durationMin": None, "openingHours": None,
        }
    return list(places.values())
