# OSRM routing MVP

The routing integration calculates only consecutive activity legs submitted to
`POST /itineraries/evaluate`. It does not pre-compute the 9,424-place dataset,
write route results into repository snapshots, geocode with Nominatim, or call a
provider during module import.

## Safe coordinate model

Three coordinate concepts are deliberately separate:

- **Source POI coordinate**: `latitude`/`longitude` supplied by OpenTripMap. It
  locates a point of interest, not necessarily a pedestrian or vehicle entrance.
- **Reviewed routing point**: an optional dataset field of the form
  `routingPoint: {latitude, longitude, reviewed: true, source}`. A person or
  controlled process has approved this point for the small MVP subset.
- **OSRM-snapped coordinate**: the waypoint returned by OSRM after snapping an
  input to its routing graph. Snapping does not independently verify that the
  point is an appropriate entrance.

Raw OpenTripMap coordinates may be sent for an exploratory request only when the
place is in the configured subset. The returned distance and duration then have
`evidenceStatus: PROVISIONAL` and `status: ROUTE_REVIEW_REQUIRED`; they are shown
in routing metadata but are not added to the matrix consumed by M4. Both inputs
must be reviewed and both snap distances must be within the configured threshold
before the route becomes `VERIFIED` and can support travel constraints.

## Configuration

Routing is disabled unless all required opt-in settings are provided:

```dotenv
OSRM_ROUTING_ENABLED=true
OSRM_BASE_URL=https://your-osrm-compatible-host
OSRM_MVP_PLACE_IDS=OTM_H_N669249200,OTM_H_W161714451
OSRM_ENABLED_PROFILES=driving
OSRM_TIMEOUT_SECONDS=3
OSRM_MAX_SNAP_DISTANCE_METERS=100
OSRM_CACHE_SIZE=256
```

`OSRM_BASE_URL` has no default. The public OSRM demo may be configured locally
for a few manual development requests subject to its policy, but is not a
production dependency. The cache is process-local, bounded, and directed:
`A -> B` never satisfies `B -> A`. There are no retries.

Supported request transportation values are:

| Request value | OSRM profile |
| --- | --- |
| `car`, `driving` | `driving` |
| `walk`, `walking` | `walking` (disabled until provider-verified) |
| `bicycle`, `cycling` | `cycling` (disabled until provider-verified) |

The configured OSRM deployment must actually provide the selected profile.
`OSRM_ENABLED_PROFILES` defaults to `driving`; walking/cycling must be verified
on that deployment before being added. Other values return `UNSUPPORTED_MODE`
without a network request. On 2026-11-11, the public demo returned identical
route metrics and waypoints for the `driving`, `walking`, and `cycling` paths in
the Huế probe, so only `driving` is treated as verified.

## Evaluation behavior

The enrichment service:

1. derives only unique, consecutive, directed legs from the validated plan;
2. reuses a complete existing verified matrix row;
3. never overwrites an existing verified distance or duration;
4. calls OSRM only when both place IDs are in `OSRM_MVP_PLACE_IDS`;
5. deep-copies the dataset only when inserting verified route evidence;
6. leaves the incoming request, CandidatePlan, and repository dataset unchanged.

The evaluation response gains `components.routing` when routing is enabled:

```json
{
  "enabled": true,
  "routes": [
    {
      "status": "ROUTE_REVIEW_REQUIRED",
      "originPlaceId": "place-a",
      "destinationPlaceId": "place-b",
      "distanceKm": 2.5,
      "durationMin": 15.0,
      "transportMode": "car",
      "provider": "OSRM",
      "profile": "driving",
      "evidenceStatus": "PROVISIONAL",
      "originReviewed": false,
      "destinationReviewed": false
    }
  ]
}
```

Provider timeouts, HTTP failures, and malformed payloads become
`ROUTING_UNAVAILABLE`; internal error text is not returned. `NoRoute` means only
that this provider/profile did not construct a route. Neither condition proves
physical impossibility, so absent verified evidence remains `UNVERIFIED` in M4.

## Offline tests and a small manual request

Run all routing tests without network access:

```bash
cd backend
.venv/bin/python -m pytest tests/test_routing_service.py tests/test_routing_integration.py -q
```

After setting the opt-in environment variables for a controlled provider and
the fixture's MVP place IDs, start the API and submit one small CandidatePlan:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --port 3001
curl -X POST http://localhost:3001/itineraries/evaluate \
  -H 'content-type: application/json' \
  --data @tests/fixtures/hue_osrm_evaluate.json
```

The fixture uses the reviewed, driving-specific overlay in
`app/data/routing_points.json`. Chùa Thiên Mụ is tied to OSM way `205794937`
and Chợ Đông Ba to OSM way `771244229`; both measured `0 m` OSRM snap distance
on 2026-11-11. The OpenTripMap snapshot itself remains unchanged.

Automated tests must continue using `httpx.MockTransport`, never a live server.

## Known limitations

- There is no persistent/shared cache and no route database.
- The service does not discover entrances or review coordinates automatically.
- OSRM route success does not supply admission costs, opening hours, minimum
  visit durations, accommodation costs, or transport prices. Those missing
  inputs can and should keep an itinerary `UNVERIFIED`.
- Only `/itineraries/evaluate` is enriched in this MVP. Generation and ranking
  retain their existing contracts and network behavior.
