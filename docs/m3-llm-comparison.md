# M3.1 - LLM API comparison and choice

Owner: M3 | Date: 2026-10-29 | Status: decision taken (Gemini), open items listed at the end

## 1. What the project needs from an LLM API

The LLM only *proposes* a candidate itinerary; M4's deterministic checks decide feasibility. So the API must:

| # | Requirement | Why (project source) |
|---|---|---|
| R1 | Output constrained to a JSON Schema (nested objects/arrays, enums, time pattern, **nullable numbers**) | Candidate plans must be parseable; unknown costs/times must be `null`, never 0 (problem statement: do not invent prices or hours) |
| R2 | Called from the server with a secret key | No client-side secret (M3 acceptance criteria) |
| R3 | Usable for a student prototype with 10+ test scenarios | Course timeline and resources |
| R4 | Transient failures are recoverable | Problem statement: external AI availability, limits and response time may affect the assistant |
| R5 | Works with Vietnamese place names | Dataset covers destinations in Vietnam |

Structured output only guarantees the *shape* of the answer, not that it is true. Whatever API is used, grounding checks
(`itinerary_generator.check_grounding`) stay mandatory: known `placeId`s, no overlaps, cost status and travel legs equal to the dataset.

## 2. Candidates

Gemini API (Google), OpenAI API, Claude API (Anthropic). Self-hosted open models were not evaluated (setup and hosting effort is out of scope for this prototype).

| | Gemini API | OpenAI API | Claude API |
|---|---|---|---|
| Structured-output mechanism | `responseMimeType: application/json` + `responseJsonSchema`; SDK helpers for Pydantic/Zod [1] | `response_format: {type: "json_schema", strict: true}` [4] | `output_config.format` with `type: "json_schema"` [6] |
| What is guaranteed | Output adheres to the provided JSON Schema [1] | Strict mode matches the schema; OpenAI reports 100% on its evals for `gpt-4o-2024-08-06` [4] | Constrained decoding: valid JSON that matches the schema [6] |
| Schema limits | Supported subset; the schema size counts toward input tokens [2] | Subset; every property must be in `required` and `additionalProperties: false` [5] | Standard JSON Schema "with some limitations"; a small extra system prompt is added, so input tokens are slightly higher [6] |
| Fit with our `candidate_plan.schema.json` | **Used and working** (nested objects/arrays, enums, patterns, nullable types) | Shape already compatible (all properties required, `additionalProperties: false`, checked in this repo); `pattern`, `minimum`, `minItems` support **not verified** | Not tested; limitation list not checked in detail |
| Free tier for prototyping (R3) | Yes for Flash-class models, with lower rate limits [8] (secondary source, 2026-09-30) | Not verified | Not verified |
| Server-side key (R2) | `x-goog-api-key` header, implemented | API key header | API key header |
| Integration status | Implemented and tested (`gemini_client.py`) | None | None |

## 3. Decision

**Use the Gemini API** (default model `gemini-3.6-flash`, configurable with `GEMINI_MODEL`).

Reasons, in order of weight:
1. **R1 is met and demonstrated.** The real Gemini response in `tests/fixtures/live_demo_output.json` passed the JSON-schema and grounding checks (`test_live_demo_output_is_valid`). That file was produced by the earlier Node prototype with the same request and schema; the Python client run is still to be refreshed (see open items).
2. **R3.** Flash-class models have a free tier [8], which is enough for the 10+ test scenarios; the other two options were not confirmed to have one.
3. **Cost of switching.** Gemini is already integrated, tested (mocked) and documented. Only the HTTP call is provider-specific: `gemini_client.request_text`. The prompt, `context_builder`, schema and grounding checks do not depend on the provider, so changing provider means replacing one function plus a schema compatibility check.
4. **R4** is handled in our code (see below), so it does not separate the three options.

This is a decision for *this prototype's constraints*, not a claim that Gemini is better in general. All three offer schema-constrained JSON.

## 4. Risks and mitigations

| Risk | Mitigation (status) |
|---|---|
| Transient `429/500/503/504` (a 503 was seen during the first live run) | Retry with exponential backoff, max `GEMINI_MAX_RETRIES`; errors mapped to `TIMEOUT`, `API_ERROR`, ... (done, tested) |
| Free-tier quota exhausted (HTTP 429) | Cache a known-good response for the demo; switch to another Flash model via `GEMINI_MODEL` (to prepare before the demo) |
| Model names change quickly | `GEMINI_MODEL` in `.env`; check ListModels before the demo and pin one model so results are reproducible. Google's model page listed `gemini-3.6-flash` as stable on 2026-10-29 [7]; a secondary source lists newer Flash models, so a newer one may exist [8] |
| Valid shape but wrong content | Grounding checks reject unknown ids, invented costs and invented travel times; plans stay `UNVERIFIED` until M4 evaluates them (done, tested) |
| Free-tier data handling | A secondary source says free-tier content may be used to improve Google products [8] (not checked against Google's terms): send only the curated dataset and the trip request, and no personal data |
| Provider outage or quota blocks the demo | Switching path: implement `request_text` for another provider, test that our schema is accepted (OpenAI strict mode: check `pattern`/`minimum`/`minItems`), re-run `test_ai.py` |

## 5. Open items

- Re-run `python -m scripts.gemini_demo` with a key to refresh `live_demo_output.json` from the Python client.
- Vietnamese output is **not yet verified**: the stored live output has English reasons. Run one request written in Vietnamese and check the text (R5).
- Re-check pricing and free-tier limits on Google's official pricing page and rate-limit page [3] before the demo; the numbers in secondary sources change often.
- No side-by-side run of the three providers was done; the comparison relies on official documentation plus the Gemini results of this project.

## 6. Sources (accessed 2026-10-29)

Official documentation
1. Gemini API, Structured outputs: https://ai.google.dev/gemini-api/docs/json-mode
2. Firebase AI Logic, structured output (response schema counts toward input tokens): https://firebase.google.com/docs/vertex-ai/structured-output
3. Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
4. OpenAI, Introducing Structured Outputs in the API (2024-08-06): https://openai.com/blog/introducing-structured-outputs-in-the-api
6. Claude API, Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
7. Gemini models: https://ai.google.dev/models

Secondary sources (verify before relying on them)
5. Simon Willison on OpenAI Structured Outputs (schema subset, all keys required): https://simonwillison.net/2024/Aug/6/openai-structured-outputs
8. Gemini API free tier limits 2026 (dated 2026-09-30): https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026

Note: this comparison was drafted with help from an AI assistant that is itself built by Anthropic (one of the three candidates). The decision follows the project's constraints in section 1; review the sources yourself before presenting it.
