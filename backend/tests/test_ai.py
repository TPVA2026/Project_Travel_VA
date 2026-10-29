"""M3 tests: Gemini client, schema, grounding, and secret hygiene. Gemini is always mocked."""
import copy
import json
import re
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api import itineraries
from app.services.ai import itinerary_generator as generator
from app.services.ai.context_builder import build_context, supported_place_ids
from app.services.data_service import load_dataset
from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import check_grounding, generate_candidate, validate_schema

ROOT = Path(__file__).resolve().parents[2]
FIX = Path(__file__).parent / "fixtures"
load = lambda p: json.loads(p.read_text(encoding="utf-8"))

dataset = load(FIX / "sample_dataset.json")
request = load(FIX / "travel_request.json")
plan = load(FIX / "sample_response.json")["plan"]
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
    monkeypatch.setattr(itineraries, "generate_candidate", lambda body: plan)
    res = client.post("/itineraries/generate", json=request)
    assert res.status_code == 200
    assert res.json()["status"] == "UNVERIFIED"
    assert res.json()["plan"] == plan


def test_endpoint_without_server_key_is_500_config(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(generator, "load_dataset", lambda: dataset)  # real curated JSON is still empty
    res = client.post("/itineraries/generate", json=request)
    assert res.status_code == 500
    assert res.json()["error"] == "CONFIG"


@pytest.mark.parametrize("code,status,http", [("TIMEOUT", None, 504), ("INVALID_PLAN", 422, 422), ("API_ERROR", 503, 502)])
def test_endpoint_maps_errors(monkeypatch, code, status, http):
    def boom(body):
        raise GeminiError(code, "m", status)

    monkeypatch.setattr(itineraries, "generate_candidate", boom)
    assert client.post("/itineraries/generate", json=request).status_code == http


# ---- secret hygiene ----
def test_no_secret_committed_and_none_in_client():
    skip = {"node_modules", ".venv", "__pycache__", ".git", ".pytest_cache"}
    for f in ROOT.rglob("*"):
        if not f.is_file() or skip & set(f.parts) or f.name == ".env" or f.suffix not in {".py", ".json", ".md", ".js", ".jsx", ".html", ".yml", ".example"}:
            continue
        text = f.read_text(encoding="utf-8", errors="ignore")
        assert not re.search(r"AIza[0-9A-Za-z_-]{30,}", text), f"key-like string in {f}"
        if "frontend" in f.relative_to(ROOT).parts[:1]:
            assert "GEMINI_API_KEY" not in text, f"frontend file references the key: {f}"


# ---- context_builder: only supported ids, no fabricated costs/times/ids ----
def attraction(pid, **kw):
    return {"id": pid, "name": "n", "category": "culture", "durationMin": 60, "priceVnd": None, "openHours": None, "source": "S", **kw}


def dining(pid, **kw):
    return {"id": pid, "name": "n", "cuisine": "x", "durationMin": 60, "avgPricePerPersonVnd": None, "openHours": None, "source": "S", **kw}


MULTI = {
    "destinations": [{"id": "DN", "name": "Da Nang"}, {"id": "HN", "name": "Ha Noi"}],
    "attractions": [attraction("DN-ATT-001"), attraction("HN-ATT-001"), attraction("DN-ATT-002", destinationId="HN")],
    "dining": [dining("DN-DIN-001"), dining("HN-DIN-001")],
    "travel_matrix": [
        {"from": "DN-ATT-001", "to": "DN-DIN-001", "durationMin": 15, "distanceKm": 4.5},
        {"from": "DN-ATT-001", "to": "HN-DIN-001", "durationMin": 999, "distanceKm": 999},
        {"from": "DN-DIN-001", "to": "DN-ATT-001", "durationMin": None, "distanceKm": None},
    ],
}


def ids_of(ctx):
    return sorted(supported_place_ids(ctx))


def test_context_keeps_only_requested_destination():
    ctx = build_context({"preferredDestination": "DN"}, MULTI)
    assert [d["id"] for d in ctx["destinations"]] == ["DN"]
    assert ids_of(ctx) == ["DN-ATT-001", "DN-DIN-001"]  # DN-ATT-002 carries destinationId HN; HN-* excluded


def test_context_without_destination_keeps_all_supported():
    ctx = build_context({}, MULTI)
    assert ids_of(ctx) == ["DN-ATT-001", "DN-ATT-002", "DN-DIN-001", "HN-ATT-001", "HN-DIN-001"]


@pytest.mark.parametrize("wanted", ["XX", "", 5, ["DN"]])
def test_context_unsupported_destination_is_empty(wanted):
    ctx = build_context({"preferredDestination": wanted}, MULTI)
    assert ctx == {"destinations": [], "attractions": [], "dining": [], "travelMatrix": []}


def test_context_drops_bad_and_duplicate_ids():
    data = {
        "destinations": [{"id": "DN"}],
        "attractions": [attraction("DN-ATT-001"), attraction(""), {"name": "no id"}, attraction(None), attraction(7),
                        attraction("has space"), "junk", attraction("DN-ATT-001", name="dup")],
        "dining": [dining("DN-ATT-001"), dining("DN-DIN-001")],  # same id as an attraction -> dropped
        "travel_matrix": [],
    }
    ctx = build_context({"preferredDestination": "DN"}, data)
    assert ids_of(ctx) == ["DN-ATT-001", "DN-DIN-001"]
    assert ctx["attractions"][0]["name"] == "n"  # first record wins


def test_context_never_fabricates_costs_or_times():
    data = {
        "destinations": [{"id": "DN"}],
        "attractions": [
            {"id": "DN-ATT-001"},  # no price/duration/hours at all
            attraction("DN-ATT-002", priceVnd=0, durationMin=90),  # 0 is a real value, keep it
            attraction("DN-ATT-003", priceVnd=-5, durationMin="2h"),
            attraction("DN-ATT-004", priceVnd="50000", durationMin=True),
            attraction("DN-ATT-005", priceVnd=float("nan"), durationMin=float("inf")),
        ],
        "dining": [{"id": "DN-DIN-001"}, dining("DN-DIN-002", avgPricePerPersonVnd=70000)],
        "travel_matrix": [],
    }
    ctx = build_context({"preferredDestination": "DN"}, data)
    by = {p["id"]: p for p in [*ctx["attractions"], *ctx["dining"]]}
    assert by["DN-ATT-001"]["priceVnd"] is None and by["DN-ATT-001"]["durationMin"] is None and by["DN-ATT-001"]["openHours"] is None
    assert by["DN-ATT-002"]["priceVnd"] == 0 and by["DN-ATT-002"]["durationMin"] == 90
    for pid in ("DN-ATT-003", "DN-ATT-004", "DN-ATT-005"):
        assert by[pid]["priceVnd"] is None and by[pid]["durationMin"] is None
    assert by["DN-DIN-001"]["avgPricePerPersonVnd"] is None and "priceVnd" not in by["DN-DIN-001"]
    assert by["DN-DIN-002"]["avgPricePerPersonVnd"] == 70000


def test_context_travel_matrix_only_between_retrieved_places_and_never_invented():
    ctx = build_context({"preferredDestination": "DN"}, MULTI)
    assert ctx["travelMatrix"] == [
        {"from": "DN-ATT-001", "to": "DN-DIN-001", "durationMin": 15, "distanceKm": 4.5},
        {"from": "DN-DIN-001", "to": "DN-ATT-001", "durationMin": None, "distanceKm": None},
    ]  # HN leg dropped; no leg added for missing pairs; reverse direction kept as given (null)


def test_context_output_is_subset_of_input_and_input_untouched():
    before = copy.deepcopy(MULTI)
    ctx = build_context({"preferredDestination": "DN"}, MULTI)
    assert MULTI == before
    src_ids = {p["id"] for p in [*MULTI["attractions"], *MULTI["dining"]]}
    assert supported_place_ids(ctx) <= src_ids
    for leg in ctx["travelMatrix"]:
        assert leg in MULTI["travel_matrix"]  # values copied, not computed


def test_context_keeps_contract_shape_and_unknown_curated_fields():
    ctx = build_context(request, dataset)
    assert set(ctx) == {"destinations", "attractions", "dining", "travelMatrix"}
    assert all(set(leg) == {"from", "to", "durationMin", "distanceKm"} for leg in ctx["travelMatrix"])
    assert ctx["attractions"][0]["source"] == "FIXTURE-UNVERIFIED" and ctx["attractions"][0]["category"] == "nature"
    assert check_grounding(plan, ctx) == []  # sample plan still valid against the retrieved context


def test_context_from_real_curated_json_does_not_crash():
    ctx = build_context({"preferredDestination": "DN"}, load_dataset())
    assert set(ctx) == {"destinations", "attractions", "dining", "travelMatrix"}


# ---- API / generator: prompt carries only supported ids; no data -> 422 ----
def test_prompt_contains_only_supported_ids():
    seen = {}

    def handler(req):
        seen["prompt"] = json.loads(req.content)["contents"][0]["parts"][0]["text"]
        return httpx.Response(200, json=wrap(plan))

    generate_candidate(request, {**dataset, "attractions": [*dataset["attractions"], attraction("HN-ATT-001")]},
                       api_key="k", transport=transport(handler))
    assert "DN-ATT-001" in seen["prompt"] and "HN-ATT-001" not in seen["prompt"]


def test_plan_using_id_outside_context_is_rejected():
    bad = copy.deepcopy(plan)
    bad["days"][0]["activities"][0]["placeId"] = "HN-ATT-001"
    ds = {**dataset, "attractions": [*dataset["attractions"], attraction("HN-ATT-001")]}
    with pytest.raises(GeminiError) as e:
        generate_candidate(request, ds, api_key="k", transport=ok(bad), sleep=NOSLEEP)
    assert e.value.code == "INVALID_PLAN" and any("unknown placeId HN-ATT-001" in x for x in e.value.details)


def test_no_supported_places_never_calls_gemini():
    calls = []
    t = transport(lambda r: calls.append(r) or httpx.Response(200, json=wrap(plan)))
    for ds in ({"destinations": [], "attractions": [], "dining": [], "travel_matrix": []}, dataset):
        req = {**request, "preferredDestination": "XX"} if ds is dataset else request
        with pytest.raises(GeminiError) as e:
            generate_candidate(req, ds, api_key="k", transport=t)
        assert (e.value.code, e.value.status) == ("NO_DATA", 422)
    assert calls == []


def test_endpoint_no_data_is_422(monkeypatch):
    monkeypatch.setattr(generator, "load_dataset", lambda: {"destinations": [], "attractions": [], "dining": [], "travel_matrix": []})
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    res = client.post("/itineraries/generate", json=request)
    assert res.status_code == 422 and res.json()["error"] == "NO_DATA"


# ---- travel-leg grounding: no invented times/ids ----
def test_grounding_rejects_invented_travel_leg_values_and_ids():
    bad = copy.deepcopy(plan)
    leg = bad["days"][0]["travelLegs"][0]
    leg["durationMin"], leg["distanceKm"] = 20, 5.0  # dataset says null
    bad["days"][0]["travelLegs"][1]["toPlaceId"] = "INVENTED-9"
    errs = check_grounding(bad, dataset)
    assert any("durationMin must be None per dataset" in e for e in errs)
    assert any("distanceKm must be None per dataset" in e for e in errs)
    assert any("travel leg uses unknown placeId INVENTED-9" in e for e in errs)


def test_grounding_accepts_leg_values_copied_from_dataset():
    ds = copy.deepcopy(dataset)
    ds["travelMatrix"][0].update(durationMin=15, distanceKm=4.5)
    ok_plan = copy.deepcopy(plan)
    ok_plan["days"][0]["travelLegs"][0].update(durationMin=15, distanceKm=4.5)
    assert check_grounding(ok_plan, ds) == []
