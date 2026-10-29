# TravelRequest fields

Contract for M1, M3, M4, and M6. The JSON shape is `backend/app/schemas/travelRequest.schema.json`. The server model is `backend/app/schemas/travel_request.py`.

A field in **Limits** is optional to send. Once sent, it is a mandatory constraint. **Preferences** only affect ranking.

## Required

| Field | Rule |
| --- | --- |
| `travelPeriod` | One of the two shapes below, never both. |
| `travelPeriod.startDate` | `YYYY-MM-DD`, when the user gave dates. |
| `travelPeriod.month` | `YYYY-MM`, when the user gave a month instead of dates. |
| `durationDays` | Integer ≥ 1. If `endDate` is present, it must equal the inclusive day count. |
| `departureLocation` | Non-empty string. |
| `travelers.count` | Integer ≥ 1. |
| `budget.amount` | Integer VND ≥ 0. Zero stays zero so feasibility can reject the trip. |
| `budget.currency` | `VND` only for this prototype. |
| `budget.scope` | `perPerson` or `group`. |

## Optional on a required object

| Field | Rule |
| --- | --- |
| `travelPeriod.endDate` | Inclusive last day, on or after `startDate`. |
| `travelers.characteristics` | Free-text group notes, such as `children` or `older adults`. |

## Limits (optional object, mandatory when present)

| Field | Rule |
| --- | --- |
| `limits.maxDistanceKm` | Number > 0. At least one of the two numeric limits is required. |
| `limits.maxTravelTimeMinutes` | Integer > 0. |
| `limits.appliesTo` | `fromDeparture`, `betweenActivities`, or `daily`. Required whenever `limits` is sent. |

## Preferences (optional object)

| Field | Rule |
| --- | --- |
| `preferences.destination` | Preferred city or area. |
| `preferences.transportation` | List of means of transport. |
| `preferences.interests[].type` | `sightseeing`, `culture`, `nature`, or `relaxation`. |
| `preferences.interests[].priority` | Integer 1–4. 1 is the most important. |
| `preferences.dining.preferred` | Foods or cuisines the user wants. |
| `preferences.dining.avoid` | Foods the user does not want. |

## Examples

- Valid dates and limits: `backend/tests/fixtures/sampleRequest.json`
- Valid month, budget per person: `backend/tests/fixtures/sampleRequestMonth.json`
- Invalid bodies: `backend/tests/fixtures/invalidRequests.json`
