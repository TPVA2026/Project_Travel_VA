import os
import re
import time
import unicodedata

import requests

PROVINCES = [
    "Hà Nội", "TP Hồ Chí Minh", "Hải Phòng", "Đà Nẵng", "Huế", "Cần Thơ",
    "Tuyên Quang", "Lào Cai", "Thái Nguyên", "Phú Thọ", "Bắc Ninh", "Hưng Yên",
    "Ninh Bình", "Thanh Hóa", "Nghệ An", "Hà Tĩnh", "Quảng Trị", "Quảng Ngãi",
    "Gia Lai", "Khánh Hòa", "Lâm Đồng", "Đắk Lắk", "Đồng Nai", "Tây Ninh",
    "Vĩnh Long", "Đồng Tháp", "Cà Mau", "An Giang",
    "Cao Bằng", "Lạng Sơn", "Lai Châu", "Điện Biên", "Sơn La", "Quảng Ninh",
]

QUERY_OVERRIDE = {
    "TP Hồ Chí Minh": "Ho Chi Minh City skyline",
    "Huế": "Hue Imperial City",
    "Hà Nội": "Hanoi Hoan Kiem Lake",
}

API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "VietnamImageDownloader/1.0 (personal use)"}
OUT_DIR = "images"


def safe_get(url, **kw):
    for i in range(6):
        r = requests.request("GET", url, **kw)
        if r.status_code == 429:
            try:
                wait = int(float(r.headers.get("Retry-After", 10 * (i + 1))))
            except ValueError:
                wait = 10 * (i + 1)
            print(f"  bị giới hạn tốc độ, chờ {wait}s...")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r
    raise RuntimeError("bị giới hạn (429) quá nhiều lần")


def to_filename(name):
    name = name.replace("Đ", "D").replace("đ", "d")
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Za-z0-9]", "", name.title())


def find_image_url(name):
    query = QUERY_OVERRIDE.get(name, f"{name} Vietnam landscape")
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 15,
        "prop": "imageinfo", "iiprop": "url|mime|size", "iiurlwidth": 1600,
    }
    r = safe_get(API, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", {})
    for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") == "image/jpeg" and info.get("width", 0) >= 1200 \
                and info.get("width", 0) > info.get("height", 0):
            return info.get("thumburl") or info["url"]
    return None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    failed = []
    for name in PROVINCES:
        path = os.path.join(OUT_DIR, to_filename(name) + ".jpg")
        if os.path.exists(path):
            print(f"[bỏ qua] {path}")
            continue
        try:
            url = find_image_url(name)
            if not url:
                raise RuntimeError("không tìm thấy ảnh phù hợp")
            img = safe_get(url, headers=HEADERS, timeout=60)
            img.raise_for_status()
            with open(path, "wb") as f:
                f.write(img.content)
            print(f"[ok] {path}")
        except Exception as e:
            print(f"[lỗi] {name}: {e}")
            failed.append(name)
        time.sleep(4)
    if failed:
        print("\nCần tự thay ảnh thủ công cho:", ", ".join(failed))


if __name__ == "__main__":
    main()
