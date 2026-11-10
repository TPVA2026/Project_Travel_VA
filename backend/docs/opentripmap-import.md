# OpenTripMap attraction import

OpenTripMap supplies named points of interest for the three destinations in `app/data/destinations.json`. The backend imports them to `app/data/opentripmap_attractions.json`; `load_dataset()` merges that snapshot with curated attractions automatically. Refreshing the snapshot requires an API key, but serving the saved dataset does not.

1. Register for a key at https://dev.opentripmap.org/.
2. Copy `backend/.env.example` to `backend/.env` and set `OPENTRIPMAP_API_KEY`.
3. From `backend`, run `python -m scripts.import_opentripmap`.

The import requests geoname and one radius page (50 named places within 10 km) per destination. It stores source IDs and URLs, coordinates and distance from the city center. OpenTripMap does not supply verified admission prices, visit durations, opening hours or travel times in this request, so those fields remain unknown. The existing travel matrix is unchanged; routes involving imported places have no verified leg data.

The free plan is listed for noncommercial use at 5,000 requests per day and 10 requests per second. Review the OpenTripMap and OpenStreetMap ODbL terms before redistributing the snapshot. Sources: https://dev.opentripmap.org/product and https://dev.opentripmap.org/price.

## Nationwide import

From `backend`, run `python -m scripts.import_opentripmap_vietnam`. This fetches 34 current province boundaries from the Vietnamese Provinces Database, scans their covering grid with OpenTripMap `bbox` queries, follows every result page, filters coordinates through province polygons, and deduplicates by OpenTripMap `xid`. Completed grid tiles are cached in `app/data/opentripmap_vietnam_cache/`; rerunning the command resumes an interrupted scan. The finished snapshot is published to `app/data/opentripmap_vietnam.json` only after every tile succeeds. The loader then adds the new province destinations and attractions automatically. Existing Huế and Hồ Chí Minh destination IDs are retained.

The scan may need more than one day on the free API tier. It retrieves **all named tourist attractions returned by the API** (`interesting_places`, `rate=1`), not every facility or unnamed object in OpenTripMap. The boundary source is a community dataset and may need review for disputed or recently changed areas. The planner requires `preferences.destination` once this snapshot is loaded. It sends at most 100 imported attractions from that province to the model, preferring higher OpenTripMap ratings, while the full snapshot remains available in `load_dataset()`. OpenTripMap does not provide verified admission prices, opening hours, visit durations, or route times in the list response; these remain unknown. See the [boundary dataset](https://github.com/thanglequoc/vietnamese-provinces-database/tree/master/json/geojson) and [OpenTripMap API example](https://dev.opentripmap.org/examples).
