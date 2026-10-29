## PR description
**Title:** feat(m3): Gemini structured-output prototype, server-side key, itinerary schema + sample
- Adds `geminiClient` (timeout, error codes, schema + grounding validation), `/itineraries/generate`, schema, sample plan.
- No client-side secret: key only via server env; header auth; .env ignored.
- Evidence: `npm test` 6/6 pass (docs/test-output.txt).
- Reviewers: M4 (schema/evaluate contract), M6 (endpoint integration), M1 (TravelRequest shape), M2 (dataset ids).
- Known gap: real-Gemini run to be attached by author.

## Jira comment (before moving to Done)
Delivered Day 1: Gemini request prototype, server-side key handling, itinerary schema, valid sample plan.
Evidence: PR <link>, test output (6/6 pass), sample/candidate-plan.json, live demo output <attach>.
Reviews: M4 ☐  M6 ☐  — move to Done only after both approve and live demo output is attached.
