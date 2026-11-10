# OpenTripMap attraction import

OpenTripMap supplies named points of interest for the three destinations in `app/data/destinations.json`. The backend imports them to `app/data/opentripmap_attractions.json`; `load_dataset()` merges that snapshot with curated attractions automatically. Refreshing the snapshot requires an API key, but serving the saved dataset does not.

1. Register for a key at https://dev.opentripmap.org/.
2. Copy `backend/.env.example` to `backend/.env` and set `OPENTRIPMAP_API_KEY`.
3. From `backend`, run `python -m scripts.import_opentripmap`.

The import requests geoname and one radius page (50 named places within 10 km) per destination. It stores source IDs and URLs, coordinates and distance from the city center. OpenTripMap does not supply verified admission prices, visit durations, opening hours or travel times in this request, so those fields remain unknown. The existing travel matrix is unchanged; routes involving imported places have no verified leg data.

The free plan is listed for noncommercial use at 5,000 requests per day and 10 requests per second. Review the OpenTripMap and OpenStreetMap ODbL terms before redistributing the snapshot. Sources: https://dev.opentripmap.org/product and https://dev.opentripmap.org/price.
