# Dataset by destination

Each entry in `destinations.json` declares a `dataFolder`. Edit the three files
inside that folder; empty collections are JSON arrays `[]`.

| File | Contents |
| --- | --- |
| destinations.json | 34 province-level destinations |
| `<dataFolder>/restaurants.json` | Dining venues for that destination |
| `<dataFolder>/attractions.json` | Curated and imported sightseeing records for that destination |
| `<dataFolder>/accomodation.json` | Lodging room/rate options for that destination |

Examples: `Hue/`, `NhaTrang/`, `DaNang/`, `HoChiMinh/`. Folder names use
unaccented PascalCase. The lodging filename is intentionally `accomodation.json`.
The loader validates folder names, unique IDs and each record's `destinationId`;
all three files are required. The former root collection files are removed.

Planning resolves the request destination through `destinations.json` before
opening place files. For example, `Huế`/`Hue`/`H` reads only
`Hue/attractions.json`, `Hue/restaurants.json` and `Hue/accomodation.json`, plus
shared route evidence. Generate, Evaluate, Rank and revision use this scoped
loader. The destination list and input validation read only the manifest.
Place-name requests from the UI include the destination to use the same scope.
`load_dataset()` without arguments remains available for nationwide discovery;
`load_dataset(request=...)` with a missing/unknown/ambiguous destination returns
an empty dataset rather than opening every folder.

Every place references destinations.json through destinationId. Place IDs were
preserved. Province IDs H (Hue), HCM and NT are legacy IDs kept for compatibility;
NT now labels Khanh Hoa, retains Nha Trang as name/legacyCity and VN_56 as an
explicit alias. Imported VN_56 place references were remapped to NT and retain
legacyDestinationId. No ambiguous physical-place duplicates were auto-merged.

The attraction with mixed restaurant/religion tags remains flagged for manual
classification review. Dining currently covers Hue only; it is not a complete
nationwide restaurant inventory. Three lodging options represent two hotels,
not three independent establishments. Estimated prices remain ESTIMATED.

For Hue itinerary generation, the 10 curated attractions and 10 curated dining
venues form the planning set. Imported OpenTripMap records remain available for
discovery; their coordinates alone do not establish an entrance, opening hours,
ticket price, or visit duration. Numeric dining estimates and any attraction
price with an unverified price field or scope must be treated as UNVERIFIED by
the candidate generator and cost evaluator. A missing price stays NO_DATA,
not zero.

As of the 2026-11-12 snapshot, no curated Hue routing point has been
reviewed and no directed route is accepted as verified. Route verification
requires an approved, profile-specific point for each endpoint and a successful
OSRM response within the snap-distance limit; do not promote seed matrix values
or copy a POI coordinate into the reviewed overlay to satisfy this check.

travel_matrix.json and routing_points.json are supporting route evidence.
They are not substitutes for exact visitor hours or booking quotes.

archive/legacy-20261112 holds the exact pre-migration source snapshots, including
the former OpenTripMap and Hue enrichment files. They are not read at runtime.
Future import commands write staging snapshots into archive/imports for review;
they do not silently overwrite curated canonical data.

Backend compatibility: per-destination restaurants.json is combined as dining and
accomodation.json as hotels. The date-independent demo cost projection still
labels hotel from-prices and published meal estimates separately from verified
totals. TRAVEL_DATASET_PROFILE is no longer used by the loader.

## Destination folders

| ID | Destination | Folder |
| --- | --- | --- |
| H | Huế | `Hue/` |
| NT | Khánh Hoà | `NhaTrang/` |
| HCM | Thành phố Hồ Chí Minh | `HoChiMinh/` |
| VN_01 | Hà Nội | `HaNoi/` |
| VN_04 | Cao Bằng | `CaoBang/` |
| VN_08 | Tuyên Quang | `TuyenQuang/` |
| VN_11 | Điện Biên | `DienBien/` |
| VN_12 | Lai Châu | `LaiChau/` |
| VN_14 | Sơn La | `SonLa/` |
| VN_15 | Lào Cai | `LaoCai/` |
| VN_19 | Thái Nguyên | `ThaiNguyen/` |
| VN_20 | Lạng Sơn | `LangSon/` |
| VN_22 | Quảng Ninh | `QuangNinh/` |
| VN_24 | Bắc Ninh | `BacNinh/` |
| VN_25 | Phú Thọ | `PhuTho/` |
| VN_31 | Hải Phòng | `HaiPhong/` |
| VN_33 | Hưng Yên | `HungYen/` |
| VN_37 | Ninh Bình | `NinhBinh/` |
| VN_38 | Thanh Hoá | `ThanhHoa/` |
| VN_40 | Nghệ An | `NgheAn/` |
| VN_42 | Hà Tĩnh | `HaTinh/` |
| VN_44 | Quảng Trị | `QuangTri/` |
| VN_48 | Đà Nẵng | `DaNang/` |
| VN_51 | Quảng Ngãi | `QuangNgai/` |
| VN_52 | Gia Lai | `GiaLai/` |
| VN_66 | Đắk Lắk | `DakLak/` |
| VN_68 | Lâm Đồng | `LamDong/` |
| VN_75 | Đồng Nai | `DongNai/` |
| VN_80 | Tây Ninh | `TayNinh/` |
| VN_82 | Đồng Tháp | `DongThap/` |
| VN_86 | Vĩnh Long | `VinhLong/` |
| VN_91 | An Giang | `AnGiang/` |
| VN_92 | Cần Thơ | `CanTho/` |
| VN_96 | Cà Mau | `CaMau/` |
