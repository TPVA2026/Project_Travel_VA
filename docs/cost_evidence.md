# TPVA-50 cost evidence

Cost components expose `estimatedRanges` and `costEvidence` alongside the
existing known totals and missing categories. A canonical `priceRangeVnd`
contains numeric `min`, optional `max`, `scope`, and `source`. Ranges never
contribute to known totals. Per-person ranges are multiplied by party size;
per-serving and per-dish estimates retain their units because order quantities
are unknown. `priceStatus: ESTIMATED` cannot support a KNOWN activity cost.
Source JSON is unchanged; ambiguous natural-language prices require a reviewed
canonical range from the data owner.

The existing evaluation/ranking API resolves supplemental transport and lodging
from server-owned `dataset.supplementalCostQuotes`. Each record binds exact
normalized `request` and `plan` snapshots to `costs`. Each category requires
`amount`, `currency: VND`, `scope: group`, `evidenceStatus: VERIFIED`, and a
nonempty `source`. Ambiguous duplicate quotes and changed revisions are ignored.
These fields are not accepted from a client or AI CandidatePlan. A provider
must populate this dataset collection with booking/quote evidence; no prices
are fabricated when the provider is absent. Existing trusted internal scalar
supplemental arguments remain supported.

The canonical range and quote shape is an additive M4 consumer contract for
FIX-11 / TPVA-34 integration review. Live booking integration and source-data
normalization remain upstream dependencies.
