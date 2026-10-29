"""Fake Google Gen AI SDK client for M3 tests (no network, no real key)."""
import json
from types import SimpleNamespace

import httpx
from google.genai import errors as genai_errors


def wrap(obj):
    """A Gemini-shaped REST body holding `obj` as JSON text."""
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}}]}


class FakeAPIError(genai_errors.APIError):
    """APIError with only what the client reads (`code`, `message`), independent of SDK constructor changes."""

    def __init__(self, code, message):
        Exception.__init__(self, f"{code} {message}")
        self.code = code
        self.message = message


class FakeModels:
    def __init__(self, handler):
        self.handler = handler
        self.calls = []  # [{"model", "contents", "config"}]

    def generate_content(self, *, model, contents, config):
        call = {"model": model, "contents": contents, "config": config}
        self.calls.append(call)
        res = self.handler(call)  # an httpx.Response, or raises (httpx errors propagate like in the SDK)
        if not res.is_success:
            try:
                message = (res.json().get("error") or {}).get("message", "")
            except ValueError:
                message = ""
            raise FakeAPIError(res.status_code, message)
        try:
            text = "".join(p.get("text", "") for p in res.json()["candidates"][0]["content"]["parts"])
        except (KeyError, IndexError, TypeError):
            text = None
        return SimpleNamespace(text=text or None)


class FakeClient:
    def __init__(self, handler):
        self.models = FakeModels(handler)


def transport(handler):
    return FakeClient(handler)


def ok(obj):
    return transport(lambda call: httpx.Response(200, json=wrap(obj)))
