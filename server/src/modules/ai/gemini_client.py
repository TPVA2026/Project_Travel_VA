"""Server-side Gemini HTTP client (M3).

Security: the API key is read from the server environment only and sent in the
`x-goog-api-key` header (never in the URL, so it stays out of logs). Error messages
never include the key or raw upstream bodies.
"""
import copy
import os
import random
import time
from typing import Callable

import httpx

from src.modules.ai.prompt_templates import SYSTEM_PROMPT

DEFAULT_MODEL = "gemini-3.6-flash"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
RETRY_STATUS = {429, 500, 503, 504}  # transient: overload / rate limit
_DOC_KEYS = ("$schema", "title", "description")  # top-level doc keys not needed by Gemini


class GeminiError(Exception):
    """code: CONFIG | TIMEOUT | NETWORK | API_ERROR | EMPTY | MALFORMED | INVALID_PLAN"""

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


def request_text(
    prompt: str,
    schema: dict,
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout_s: float | None = None,
    max_retries: int | None = None,
    transport: httpx.BaseTransport | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """Call Gemini with JSON-schema structured output and return the raw text."""
    api_key = os.getenv("GEMINI_API_KEY") if api_key is None else api_key
    model = model or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
    if timeout_s is None:
        timeout_s = float(os.getenv("GEMINI_TIMEOUT_MS") or 30000) / 1000
    if max_retries is None:
        max_retries = int(os.getenv("GEMINI_MAX_RETRIES") or 3)
    if not api_key:
        raise GeminiError("CONFIG", "GEMINI_API_KEY is not set on the server")

    url = f"{BASE_URL}/{model}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            "responseJsonSchema": _gemini_schema(schema),
        },
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}

    res = None
    with httpx.Client(timeout=timeout_s, transport=transport) as client:
        attempt = 0
        while True:
            try:
                res = client.post(url, json=body, headers=headers)
                if res.is_success:
                    break
                detail = None
                try:
                    detail = (res.json().get("error", {}).get("message") or "")[:300] or None
                except Exception:  # body not JSON
                    pass
                failure = GeminiError("API_ERROR", f"Gemini returned HTTP {res.status_code}", res.status_code, detail)
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
        parts = res.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError, TypeError, ValueError):
        text = ""
    if not text:
        raise GeminiError("EMPTY", "No content (possibly blocked or truncated)")
    return text
