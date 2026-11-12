# Four canonical collections

Edit only these primary files for place data:

| File | Contents |
| --- | --- |
| destinations.json | 34 province-level destinations |
| restaurants.json | Dining venues |
| attractions.json | M2 and imported Vietnam sightseeing records |
| accommodations.json | Lodging room/rate options, with sources and occupancy |

Every place references destinations.json through destinationId. Place IDs were
preserved. Province IDs H (Hue), HCM and NT are legacy IDs kept for compatibility;
NT now labels Khanh Hoa, retains Nha Trang as name/legacyCity and VN_56 as an
explicit alias. Imported VN_56 place references were remapped to NT and retain
legacyDestinationId. No ambiguous physical-place duplicates were auto-merged.

The attraction with mixed restaurant/religion tags remains flagged for manual
classification review. Dining currently covers Hue only; it is not a complete
nationwide restaurant inventory. Three lodging options represent two hotels,
not three independent establishments. Estimated prices remain ESTIMATED.

travel_matrix.json and routing_points.json are supporting route evidence.
They are not substitutes for exact visitor hours or booking quotes.

archive/legacy-20261112 holds the exact pre-migration source snapshots, including
the former OpenTripMap and Hue enrichment files. They are not read at runtime.
Future import commands write staging snapshots into archive/imports for review;
they do not silently overwrite curated canonical data.

Backend compatibility: restaurants.json is exposed internally as dining and
accommodations.json as hotels. The date-independent demo cost projection still
labels hotel from-prices and published meal estimates separately from verified
totals. TRAVEL_DATASET_PROFILE is no longer used by the loader.
