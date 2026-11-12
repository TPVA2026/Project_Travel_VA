# FreeModel provider integration (M3)

FreeModel can replace the direct Google Gemini transport without changing the
itinerary API, CandidatePlan contract, dataset, prompt context, or M4 algorithms.
The existing `request_text` function still returns JSON text and raises the same
`GeminiError` codes consumed by the routes and planning services.

## Configuration

Copy the server-only variables from `backend/.env.example` into `backend/.env`:

```dotenv
AI_PROVIDER=freemodel
FREEMODEL_BASE_URL=https://freemodel.in/v1
FREEMODEL_API_KEY=
FREEMODEL_MODEL=gemini-3.7-flash
FREEMODEL_TIMEOUT_MS=180000
FREEMODEL_MAX_RETRIES=1
```

Set the key locally and restart the backend. Never commit `.env` or expose the
key to the frontend. Existing process variables take precedence over `.env`.
An explicit `model`/`api_key` argument overrides the corresponding provider
variable. Missing model configuration falls back to `gemini-3.7-flash`.

When `AI_PROVIDER` is unset, the legacy `gemini` path remains the default for
backward compatibility. Set `AI_PROVIDER=gemini` to use the existing Google SDK
and its `GEMINI_*` settings. Set `AI_PROVIDER=codex` to use the same chat
completions client against the CCPro gateway:

```dotenv
AI_PROVIDER=codex
CODEX_BASE_URL=https://api.ccpro.cn/v1
CODEX_MODEL=gpt-6-luna
CODEX_API_KEY=
```

Put that key in `backend/.env` only. Unknown providers fail with `CONFIG`; a failed
FreeModel request never silently switches providers or generates sample data.

Each FreeModel call waits up to `FREEMODEL_TIMEOUT_MS` (180 seconds in the
example env). The results page waits 10 minutes for the whole pipeline, which
covers three calls at that limit. A timeout is still not retried, and there is
no new output-token limit.

## Protocol

The client uses the existing `httpx` dependency to send
`POST https://freemodel.in/v1/chat/completions` with server-side Bearer auth.
Each request defines one function named `submit_itinerary`. Its `parameters`
are a copy of `candidate_plan.schema.json` with only the top-level descriptive
keys (`$schema`, `title`, `description`) removed. All required fields, nested
properties, null types, and `additionalProperties: false` constraints remain.
The source schema is never modified.

`tool_choice` explicitly selects `submit_itinerary`. The client accepts exactly
one function call, parses its string `arguments` as a complete JSON object, and
returns JSON text to the unchanged itinerary generator. It does not treat
assistant prose, Markdown, multiple calls, or another itinerary shape as a plan.
No function is executed and no second inference call is needed to consume the
submission. This is structured data generation, not an external action.

Strict Pydantic validation and dataset grounding still run after parsing, for
generation, repair, and revision. Unknown costs/times/distances remain `null`;
there is no repair that fabricates values. Model-supplied feasibility/ranking
fields are rejected, and M4 remains responsible for evaluation and ranking.

Protocol references:

- [FreeModel Chat Completions](https://freemodel.in/docs/chat-completions)
- [FreeModel function calling and tool choice](https://freemodel.in/docs/tool-calling)
- [FreeModel model catalog](https://freemodel.in/models)

## Errors and retry

- Missing/invalid configuration: `CONFIG`.
- Timeout: `TIMEOUT`, with phase and configured timeout; **never retried**.
- Other HTTP transport failures: `NETWORK`; **never retried**, since the outcome
  of an upstream generation may be unknown.
- Non-success HTTP responses: `API_ERROR`, with HTTP status only.
- Invalid response JSON, absent/wrong/multiple function calls, incomplete or
  non-object arguments, non-finite numbers: `MALFORMED`; **never retried**.
- CandidatePlan/schema/grounding failures retain `INVALID_PLAN`; **no added
  automatic retry**.

Only HTTP 429, 500, 502, 503 and 504 allow a single retry. The configured retry
count is capped at one, even if an existing caller passes a higher value; zero
disables retries. The delay is one second unless the provider supplies a numeric
`Retry-After` between zero and five seconds. Longer, invalid, or date-form
`Retry-After` values prevent an automatic retry rather than retrying too early
or adding a long wait. Redirects are not followed, protecting the Bearer key.

Errors contain stable reason codes and JSON line/column where useful, never raw
provider bodies, argument contents, exception text, keys, or authorization
headers. Existing API response shapes/status mapping are unchanged.

## Verification and limits

Mocked tests cover the outgoing schema/tool request, provider selection, model
precedence, parsing, HTTP errors, retry limits, timeouts, sanitized diagnostics,
and public generation-route schema/grounding enforcement. Mock success does
**not** establish that FreeModel's live model honors function calling.

**Live FreeModel function calling: NOT VERIFIED.** No paid/live inference was
performed for this PR. A future explicitly authorized smoke test should confirm
model availability, function calling, latency within the normal timeout, and
valid dataset-grounded itinerary generation. This PR does not claim to fix an
upstream model that ignores the requested function/schema.

The full existing prompt is retained. Prompt compression, deduplication, usage
logging/accounting, token thresholds, and per-request call budgets are excluded
and should be reviewed independently as follow-up work. Dataset modifications,
demo corrections, frontend changes, and schema/M4 changes are also excluded.
