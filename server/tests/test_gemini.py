"""M3 tests: Gemini client, schema, grounding, and secret hygiene. Gemini is always mocked."""
import copy
import json
import re
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from src.app import app
from src.controllers import itinerary_controller
from src.modules.ai.gemini_client import GeminiError
from src.modules.ai.itinerary_generator import check_grounding, generate_candidate, validate_schema

ROOT = Path(__file__).resolve().parents[2]
FIX = Path(__file__).parent / "fixtures"
load = lambda p: json.loads(p.read_text(encoding="utf-8"))

dataset = load(FIX / "sample_dataset.json")
request = load(FIX / "travel_request.json")
plan = load(ROOT / "shared" / "examples" / "sampleResponse.json")["plan"]
NOSLEEP = lambda _s: None


def wrap(obj):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}}]}


def transport(handler):
    return httpx.MockTransport(handler)


def ok(obj):
    return transport(lambda req: httpx.Response(200, json=wrap(obj)))


def test_sample_plan_matches_schema_and_is_grounded():
    assert validate_schema(plan) == []
    assert check_grounding(plan, dataset) == []


def test_live_demo_output_is_valid():
    live = load(FIX / "live_demo_output.json")
    assert validate_schema(live) == []
    assert check_grounding(live, dataset) == []


def test_schema_rejects_bad_plans():
    bad = copy.deepcopy(plan)
    bad["days"][0]["activities"][0]["startTime"] = "8:30"
    del bad["days"][0]["date"]
    assert len(validate_schema(bad)) >= 2


def test_grounding_rejects_invented_place_overlap_and_null_cost_known():
    bad = copy.deepcopy(plan)
    bad["days"][0]["activities"][0]["placeId"] = "INVENTED-1"
    bad["days"][0]["activities"][1]["startTime"] = "10:00"
    bad["days"][0]["activities"][2]["costStatus"] = "KNOWN"
    errs = check_grounding(bad, dataset)
    assert any("unknown placeId" in e for e in errs)
    assert any("overlaps" in e for e in errs)
    assert any("null cost marked KNOWN" in e for e in errs)


def test_grounding_enforces_cost_status_against_dataset():
    bad = copy.deepcopy(plan)
    bad["days"][0]["activities"][0]["estimatedCostVnd"] = 50000  # dataset price is null
    bad["days"][0]["activities"][0]["costStatus"] = "UNVERIFIED"
    bad["days"][1]["activities"][0]["costStatus"] = "KNOWN"  # price 0 but source is UNVERIFIED
    errs = check_grounding(bad, dataset)
    assert any("must be null/NO_DATA" in e for e in errs)
    assert any("must be UNVERIFIED" in e for e in errs)


def test_key_sent_in_header_only_with_structured_output():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["headers"] = req.headers
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json=wrap(plan))

    out = generate_candidate(request, dataset, api_key="TEST_KEY_123", transport=transport(handler))
    assert out == plan
    assert "TEST_KEY_123" not in seen["url"]
    assert seen["headers"]["x-goog-api-key"] == "TEST_KEY_123"
    cfg = seen["body"]["generationConfig"]
    assert cfg["responseMimeType"] == "application/json"
    assert cfg["responseJsonSchema"]["required"]
    assert "$schema" not in cfg["responseJsonSchema"]


def code_of(**kw):
    with pytest.raises(GeminiError) as e:
        generate_candidate(request, dataset, sleep=NOSLEEP, **kw)
    return e.value


def test_error_handling():
    assert code_of(api_key="", transport=ok({})).code == "CONFIG"
    assert code_of(api_key="k", max_retries=0, transport=transport(lambda r: httpx.Response(429))).code == "API_ERROR"
    bad_json = transport(lambda r: httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}))
    assert code_of(api_key="k", transport=bad_json).code == "MALFORMED"
    assert code_of(api_key="k", transport=transport(lambda r: httpx.Response(200, json={}))).code == "EMPTY"
    assert code_of(api_key="k", transport=ok({"planId": "x"})).code == "INVALID_PLAN"

    def timeout(req):
        raise httpx.ReadTimeout("t")

    assert code_of(api_key="k", max_retries=0, transport=transport(timeout)).code == "TIMEOUT"

    def netdown(req):
        raise httpx.ConnectError("x")

    assert code_of(api_key="k", max_retries=0, transport=transport(netdown)).code == "NETWORK"


def test_retries_transient_503_then_succeeds_no_retry_on_400_gives_up():
    n = {"v": 0}

    def flaky(req):
        n["v"] += 1
        if n["v"] <= 2:
            return httpx.Response(503, json={"error": {"message": "overloaded"}})
        return httpx.Response(200, json=wrap(plan))

    assert generate_candidate(request, dataset, api_key="k", transport=transport(flaky), sleep=NOSLEEP) == plan
    assert n["v"] == 3

    m = {"v": 0}

    def bad_request(req):
        m["v"] += 1
        return httpx.Response(400, json={"error": {"message": "bad schema"}})

    e = code_of(api_key="k", transport=transport(bad_request))
    assert (e.code, e.status, e.details, m["v"]) == ("API_ERROR", 400, "bad schema", 1)

    k = {"v": 0}

    def always_503(req):
        k["v"] += 1
        return httpx.Response(503, json={})

    e = code_of(api_key="k", max_retries=3, transport=transport(always_503))
    assert e.status == 503 and k["v"] == 4


def test_error_does_not_leak_key_or_upstream_body():
    t = transport(lambda r: httpx.Response(401, json={"error": {"message": "x"}}, headers={"x-echo": "SECRET_KEY_ABC"}))
    e = code_of(api_key="SECRET_KEY_ABC", transport=t)
    assert "SECRET_KEY_ABC" not in f"{e.message} {e.details}"


# ---- HTTP endpoint (Gemini mocked) ----
client = TestClient(app)


def test_endpoint_returns_unverified_plan(monkeypatch):
    monkeypatch.setattr(itinerary_controller, "generate_candidate", lambda body: plan)
    res = client.post("/itineraries/generate", json=request)
    assert res.status_code == 200
    assert res.json()["status"] == "UNVERIFIED"
    assert res.json()["plan"] == plan


def test_endpoint_without_server_key_is_500_config(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    res = client.post("/itineraries/generate", json=request)
    assert res.status_code == 500
    assert res.json()["error"] == "CONFIG"


@pytest.mark.parametrize("code,status,http", [("TIMEOUT", None, 504), ("INVALID_PLAN", 422, 422), ("API_ERROR", 503, 502)])
def test_endpoint_maps_errors(monkeypatch, code, status, http):
    def boom(body):
        raise GeminiError(code, "m", status)

    monkeypatch.setattr(itinerary_controller, "generate_candidate", boom)
    assert client.post("/itineraries/generate", json=request).status_code == http


# ---- secret hygiene ----
def test_no_secret_committed_and_none_in_client():
    skip = {"node_modules", ".venv", "__pycache__", ".git", ".pytest_cache"}
    for f in ROOT.rglob("*"):
        if not f.is_file() or skip & set(f.parts) or f.name == ".env" or f.suffix not in {".py", ".json", ".md", ".js", ".jsx", ".html", ".yml", ".example"}:
            continue
        text = f.read_text(encoding="utf-8", errors="ignore")
        assert not re.search(r"AIza[0-9A-Za-z_-]{30,}", text), f"key-like string in {f}"
        if "client" in f.relative_to(ROOT).parts[:1]:
            assert "GEMINI_API_KEY" not in text, f"client file references the key: {f}"
