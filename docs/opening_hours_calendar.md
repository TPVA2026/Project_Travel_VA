# TPVA-49 calendar opening hours

`openingHours` (or legacy `opening_hours`) accepts the existing time strings
and a calendar object with `weekly`, `dates`, `holidays`, `holidayHours`.
`weekly` keys are ISO weekdays 1 (Monday) through 7 (Sunday); values are lists
of `["HH:MM", "HH:MM"]` pairs. Date overrides use ISO dates and take precedence.
An empty list explicitly closes a date. Missing windows remain UNVERIFIED.
Holiday dates must be provided by the dataset; the validator does not guess
Vietnamese public holidays. A listed holiday without holidayHours is unknown.

Overnight windows extend into the following date, using the previous day's
calendar entry. A date closure overrides that spill. Legacy daily strings retain
their existing behavior. Natural language such as “tự do”, “buổi chiều” or
“cả ngày” is not converted to specific hours without verified canonical data.

Dataset owners can provide canonical windows without changing CandidatePlan.
Checks use each plan date after checking it against TravelRequest. Verified
directional route references continue to determine transfer gaps; AI travel
durations are not accepted as evidence. This is an additive consumer contract;
the upstream canonical Hue calendar data still requires review under TPVA-16.
