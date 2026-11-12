# Hue MVP enrichment — 2026-11-12

Branch: `feature/hue-mvp-data-completion`, based on the current TPVA-50 branch
which contains the cost-evidence consumer. It is not merged or pushed.

## Data location after consolidation

The supplemental fields are now written directly into `Hue/attractions.json` and
`Hue/restaurants.json`. Lodging options are in `Hue/accomodation.json`, under
`backend/app/data/`. Other destinations have equivalent folders declared by
`dataFolder` in `destinations.json`. There is no
runtime Hue overlay and no profile environment variable is required. Original
snapshots are retained in `backend/app/data/archive/legacy-20261112/`.

Review the Hue records in those canonical files. Manual interest tags are
taxonomy choices, not externally verified measurements. Existing M2 source URLs
are retained as reference URLs, not blanket verification of every field.

## What is filled

- Interest tags: 20/20 records (10 sightseeing, 10 dining).
- Eight restaurants receive an ESTIMATED per-person budget from researched
  ranges or bowl prices. `avgPricePerPersonVnd` is the midpoint, not a measured
  average or confirmed order. Bowl/sandwich/cup estimates assume one unit per
  person and explicitly say so. Original menu fields and evidence remain intact.
  O Le has only an older per-person ceiling; Me Keo has an unresolved address
  mismatch. Both averages remain null/UNVERIFIED.
- Cung An Dinh adult admission changes from 25,000 to 50,000 VND in this profile,
  with previous values retained in enrichmentEvidence. The tourism department
  portal lists 50,000 VND/person. Child policy, eligibility, concessions, visit
  date promotions and the conflicting address are not inferred from that price.
- Tay Ho village gains a recommended 08:00–16:00 visit window. It is not a hard
  opening schedule: the cited source explicitly says hours are not fixed.

## Still requires confirmation

- Exact visitor hours for Ben Xua Vy Da, Tay Ho village, Quoc Hoc and Truong Tien.
- Huyen Anh 50 Kim Long: user approved selecting a reported schedule for demo.
  The overlay uses VnExpress's 08:00–19:00. Foody's 09:00–21:00 remains recorded
  as conflicting evidence, not overwritten or described as venue confirmation.
- User requested web-based average budgets rather than confirmed orders.
  Every estimate remains separate from known party totals. No venue contact or
  Google Places API verification was performed; existing map links are retained.
- The current seed matrix has 0 accepted directed routes between these 20
  curated IDs, out of 380 possible ordered pairs. Unverified distances or
  durations derived from assumed speeds are not verified routing evidence.
  Review only the legs actually needed for the demo with the routing owner.
- Departure, dates, travelers, transport mode and lodging/transport quotes are
  trip-specific; place metadata cannot supply these amounts.

Sixteen of the 20 records have machine-readable opening strings. That count
does not mean all 16 have verified visitor hours: inspect unverifiedFields too.
The overlay alone cannot make most complete itineraries FEASIBLE.

## Lodging and projected totals

The overlay includes ÊMM Hue Deluxe and Family room from-prices from its official
site, with adult occupancy and room/night units. The default demo calculation
uses Deluxe (1,190,476 VND/room/night, 2 adults). Rooms = ceil(travelers/2), nights
= max(durationDays-1, 0). This is an explicit shared-room assumption, not a booked
stay. Dates are not sent to a live booking provider; taxes, surcharges, child
policies and dated availability remain unconfirmed. Family is an alternative
reference, not an automatic choice. A Rosaleen Superior reference is retained
but not used automatically because its published page does not establish a
nightly billing period.

`components.cost.projection` returns itemized estimated meals/lodging plus known
spend as `subtotalVnd`. `totalVnd` remains null while there are uncovered items
(e.g. transport). The UI shows a separate estimate with room/night assumptions
and source links. Known/verified totals, missing-cost reasons, ranking eligibility
and hard feasibility statuses are unchanged. It counts only meals actually
scheduled in the CandidatePlan, not a complete food allowance for every day.

Additional research:

- https://vnexpress.net/12-hang-quan-khach-phai-thu-khi-den-hue-4903753.html
- https://www.traveloka.com/vi-vn/explore/culinary/gns-foodtour-hue/337248
- https://bathaofood.com/review-thuy-banh-canh-nam-pho-hue/
- https://lofita.vn/vi/quan-che-cung-dinh-hue.html
- https://www.emmhotels.com/en/emm-hotel-hue/
- https://rosaleenhotel.com/en/product/deluxe-family-suite-with-window/

## Research sources

- Hue tourism department: https://huetourism.gov.vn/goi-y-nhung-goc-check-in-sieu-tho-tai-hue/?pid=MjI5NTJ8Y3NkbGRs0
- Tay Ho visiting advice: https://hue.aeonmall-vietnam.com/cam-nang-aeon-mall-hue/lang-non-tay-ho.html
- Huyen Anh branch listing: https://www.foody.vn/hue/banh-uot-thit-nuong-huyen-anh
- Huyen Anh conflicting hours: https://www.vietnamgo.net/places/banh-uot-huyen-anh-hue
- Quoc Hoc visitor conditions: https://khamphahue.com.vn/Hue-24h/Chi-tiet/tid/Tam-nay-di-Hue-dep-nhat-nam.html/pid/16849/cid/242
- Bun Giam Nuoc published bowl price, not a confirmed order: https://khamphahue.com.vn/Du-lich/Chi-tiet/tid/Bun-Giam-Nuoc-chan-cau-Gia-Hoi.html/pid/3957/cid/383

Sources checked 2026-11-12. No external publication is treated as a live booking
or a promise of the actual price/hours on the demo travel date.
