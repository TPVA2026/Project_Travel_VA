# Architecture

Owner: M6 (all review)

```
User input (form / prompt)
  -> input validation & normalization (M1)
  -> dataset retrieval + context building (M2, M3)
  -> LLM candidate itinerary generation (M3)
  -> deterministic feasibility, cost, ranking (M4)
  -> UI: comparison, revision, selection (M5)
```
M6 orchestrates the backend, testing and deployment. After any revision the plan must pass feasibility checks again.

TODO: add module diagram and sequence diagrams.
