"""Server-side Gemini client on the official Google Gen AI Python SDK (`google-genai`) (M3).

Security: the API key is read from the server environment only and handed to the SDK client
(which sends it in the `x-goog-api-key` header, never in the URL). Error messages never include
the key or raw upstream bodies.
"""
import copy
import os
import random
import time
from typing import Callable

import httpx
from google import genai
from google.genai import errors, types

from app.services.ai.prompt_templates import SYSTEM_PROMPT

DEFAULT_MODEL = "gemini-3.6-flash"
RETRY_STATUS = {429, 500, 503, 504}  # transient: overload / rate limit
_DOC_KEYS = ("$schema", "title", "description")  # top-level doc keys not needed by Gemini


class GeminiError(Exception):
    """code: CONFIG | TIMEOUT | NETWORK | API_ERROR | EMPTY | MALFORMED | INVALID_PLAN | NO_DATA"""

    def __init__(self, code: str, message: str, status: int | None = None, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


def _gemini_schema(schema: dict) -> dict:
    s = copy.deepcopy(schema)
    for k in _DOC_KEYS:
        s.pop(k, None)
    return s


def _make_client(api_key: str, timeout_s: float):
    """The only place that builds the SDK client (tests replace it with a fake)."""
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_s * 1000)))


def _safe_detail(exc: Exception, api_key: str) -> str | None:
    """Short upstream message for debugging; truncated and scrubbed of the key."""
    msg = str(getattr(exc, "message", "") or "")
    return msg.replace(api_key, "***")[:300] or None


def request_text(
    prompt: str,
    schema: dict,
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout_s: float | None = None,
    max_retries: int | None = None,
    client=None,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """Call Gemini with JSON-schema structured output and return the raw text.

    `client` is an SDK-like object (`client.models.generate_content(...)`); tests inject a fake.
    """
    api_key = os.getenv("GEMINI_API_KEY") if api_key is None else api_key
    model = model or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
    if timeout_s is None:
        timeout_s = float(os.getenv("GEMINI_TIMEOUT_MS") or 30000) / 1000
    if max_retries is None:
        max_retries = int(os.getenv("GEMINI_MAX_RETRIES") or 3)
    if not api_key:
        raise GeminiError("CONFIG", "GEMINI_API_KEY is not set on the server")

    if client is None:
        client = _make_client(api_key, timeout_s)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        temperature=0.3,
        response_mime_type="application/json",
        response_json_schema=_gemini_schema(schema),
    )

    attempt = 0
    while True:
        try:
            response = client.models.generate_content(model=model, contents=prompt, config=config)
            break
        except errors.APIError as e:
            failure = GeminiError("API_ERROR", f"Gemini returned HTTP {e.code}", e.code, _safe_detail(e, api_key))
        except httpx.TimeoutException:
            failure = GeminiError("TIMEOUT", "Gemini request failed")
        except httpx.HTTPError:
            failure = GeminiError("NETWORK", "Gemini request failed")

        if failure.status and failure.status not in RETRY_STATUS:
            raise failure  # 400/401/403/404: retrying won't help
        if attempt >= max_retries:
            raise failure
        sleep(min(1.0 * 2**attempt, 8.0) + random.random() * 0.3)
        attempt += 1

    try:
        text = response.text
    except (AttributeError, ValueError, TypeError):
        text = None
    if not text:
        raise GeminiError("EMPTY", "No content (possibly blocked or truncated)")
    return text
