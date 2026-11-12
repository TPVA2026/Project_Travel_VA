# TPVA-51 itinerary quality

`rank_candidates` returns an additive `quality_report` map keyed by planId,
including excluded and unscored plans. Reports contain warnings and per-day
counts/distribution. They do not alter hard statuses or preference/cost/travel
scores. Hard-failed and unverified plans remain excluded from primary ranking.

Heuristics report repeated places, days with at most one sightseeing stop,
more than eight activities, gaps longer than three hours and explicitly labeled
lunch outside 11:00–14:00. These warnings explain product heuristics, not proof
of invalidity. All dining activities are not assumed to be lunch.

`evaluate_quality(..., intentional_rest_days=[...])` accepts explicit day numbers
for intentional rest from a trusted caller. Natural language is not used to infer
rest intent. CandidatePlan currently has no rest-day contract; the public ranking
API therefore leaves this unset pending M1/M6 contract integration.

`geographicClustering` and `score` remain null until a reviewed geographic quality
metric/weight is available. Missing measurements are not represented as zero.
Integration review with TPVA-48/49/50 remains required before release closure.
