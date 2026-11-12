"""FreeModel Chat Completions transport; CandidatePlan validation stays in M3."""
import copy
import json
import math
import os
import time
from collections.abc import Callable

import httpx

from app.services.ai.gemini_client import GeminiError
from app.services.ai.prompt_templates import SYSTEM_PROMPT

DEFAULT_MODEL = "gemini-3.7-flash"
BASE_URL = "https://freemodel.in/v1"
FUNCTION_NAME = "submit_itinerary"
RETRY_STATUS = {429, 500, 502, 503, 504}


def _settings(timeout_s, max_retries):
    try:
        timeout_s = float(os.getenv("FREEMODEL_TIMEOUT_MS") or 30000) / 1000 if timeout_s is None else float(timeout_s)
        retries = int(os.getenv("FREEMODEL_MAX_RETRIES") or 1) if max_retries is None else max_retries
        if (not math.isfinite(timeout_s) or timeout_s <= 0
                or isinstance(retries, bool) or not isinstance(retries, int) or retries < 0):
            raise ValueError
    except (ValueError, TypeError, OverflowError):
        raise GeminiError("CONFIG", "FreeModel timeout must be positive and retries must be a non-negative integer") from None
    # Existing consumers can pass their retry setting, but FreeModel never retries twice.
    return timeout_s, min(retries, 1)


def _retry_delay(response: httpx.Response) -> float | None:
    header = response.headers.get("Retry-After")
    if header is None:
        return 1.0
    try:
        seconds = float(header)
    except ValueError:
        return None  # Do not retry early when a provider delay is not understood.
    return seconds if math.isfinite(seconds) and 0 <= seconds <= 5 else None


def _invalid_constant(_value):
    raise ValueError("Non-finite JSON number")


def _parse_arguments(body) -> str:
    """Accept one named function call, not prose or another itinerary format."""
    try:
        choices = body["choices"]
        if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
            raise ValueError
        choice = choices[0]
        if choice.get("finish_reason") == "length":
            raise GeminiError("MALFORMED", "FreeModel function arguments were truncated", details={"reason": "truncated"})
        calls = choice["message"]["tool_calls"]
        if not isinstance(calls, list) or len(calls) != 1:
            raise ValueError
        call = calls[0]
        function = call["function"]
        if call.get("type") != "function" or function["name"] != FUNCTION_NAME:
            raise ValueError
        arguments = function["arguments"]
        if not isinstance(arguments, str) or not arguments.strip():
            raise ValueError
    except (KeyError, IndexError, TypeError, ValueError):
        raise GeminiError("MALFORMED", "FreeModel must return exactly one submit_itinerary function call with JSON arguments", details={"reason": "invalid_function_call"}) from None
    try:
        value = json.loads(arguments, parse_constant=_invalid_constant)
    except json.JSONDecodeError as exc:
        raise GeminiError("MALFORMED", "FreeModel function arguments are not valid JSON", details={
            "reason": "invalid_arguments_json", "line": exc.lineno, "column": exc.colno,
        }) from None
    except ValueError:
        raise GeminiError("MALFORMED", "FreeModel function arguments contain a non-finite number", details={"reason": "non_finite_number"}) from None
    if not isinstance(value, dict):
        raise GeminiError("MALFORMED", "FreeModel function arguments must be a JSON object", details={"reason": "arguments_not_object"})
    # Return the existing request_text contract. Pydantic and grounding run next.
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def request_text(
    prompt: str, schema: dict, *, api_key: str | None = None,
    model: str | None = None, timeout_s: float | None = None,
    max_retries: int | None = None, client=None,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    api_key = os.getenv("FREEMODEL_API_KEY") if api_key is None else api_key
    if not isinstance(api_key, str) or not api_key.strip():
        raise GeminiError("CONFIG", "FREEMODEL_API_KEY is not set on the server")
    model = model or os.getenv("FREEMODEL_MODEL") or DEFAULT_MODEL
    timeout_s, max_retries = _settings(timeout_s, max_retries)
    base_url = (os.getenv("FREEMODEL_BASE_URL") or BASE_URL).rstrip("/")
    parameters = copy.deepcopy(schema)
    for key in ("$schema", "title", "description"):
        parameters.pop(key, None)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT + "\nSubmit exactly one plan using submit_itinerary with the required fields. Do not return prose."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "tools": [{"type": "function", "function": {
            "name": FUNCTION_NAME,
            "description": "Submit one CandidatePlan grounded only in the supplied dataset.",
            "parameters": parameters,
        }}],
        "tool_choice": {"type": "function", "function": {"name": FUNCTION_NAME}},
    }
    owned = client is None
    client = httpx.Client(timeout=timeout_s) if owned else client
    try:
        for attempt in range(max_retries + 1):
            try:
                response = client.post(
                    base_url + "/chat/completions", json=payload,
                    headers={"Authorization": "Bearer " + api_key},
                    timeout=timeout_s, follow_redirects=False,
                )
            except httpx.TimeoutException as exc:
                # An upstream POST may still be running/billed. Never repeat it.
                raise GeminiError("TIMEOUT", "FreeModel request timed out; it was not retried", details={
                    "phase": type(exc).__name__, "timeout_seconds": timeout_s,
                }) from None
            except httpx.HTTPError:
                raise GeminiError("NETWORK", "FreeModel request failed; it was not retried") from None
            if response.is_success:
                try:
                    body = response.json()
                except ValueError:
                    raise GeminiError("MALFORMED", "FreeModel returned an invalid JSON response", details={"reason": "invalid_response_json"}) from None
                return _parse_arguments(body)
            failure = GeminiError("API_ERROR", f"FreeModel returned HTTP {response.status_code}", response.status_code)
            # Never echo raw response bodies/headers; they may contain credentials.
            if response.status_code not in RETRY_STATUS or attempt >= max_retries:
                raise failure
            delay = _retry_delay(response)
            if delay is None:
                raise failure
            sleep(delay)
    finally:
        if owned:
            client.close()
