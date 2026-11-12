"""FreeModel protocol and existing M3/API gates; all HTTP requests are mocked."""
import copy
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.ai import gemini_client, itinerary_generator as generator
from app.services.ai.freemodel_client import request_text
from app.services.ai.gemini_client import GeminiError

FIXTURES = Path(__file__).parent / "fixtures"
SECRET = "test-credential-do-not-leak"


@pytest.fixture(autouse=True)
def provider_environment(monkeypatch):
    for name in ("FREEMODEL_API_KEY", "FREEMODEL_MODEL", "FREEMODEL_TIMEOUT_MS", "FREEMODEL_MAX_RETRIES", "FREEMODEL_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("AI_PROVIDER", "freemodel")


@pytest.fixture
def sample():
    dataset = json.loads((FIXTURES / "sample_dataset.json").read_text())
    for place in dataset["attractions"] + dataset["dining"]:
        place["destinationId"] = "DN"
    plan = json.loads((FIXTURES / "sample_response.json").read_text())["plan"]
    request = {
        "travelPeriod": {"startDate": plan["days"][0]["date"]},
        "durationDays": len(plan["days"]), "departureLocation": "Ho Chi Minh City",
        "travelers": {"count": 2},
        "budget": {"amount": 8000000, "currency": "VND", "scope": "group"},
        "preferences": {"destination": "DN"},
    }
    return request, plan, dataset


def response(arguments, **overrides):
    result = {"choices": [{"finish_reason": "tool_calls", "message": {
        "content": None,
        "tool_calls": [{"type": "function", "function": {
            "name": "submit_itinerary", "arguments": arguments,
        }}],
    }}]}
    result.update(overrides)
    return result


def transport(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_function_request_and_return_contract(sample):
    request, plan, dataset = sample
    schema_before = copy.deepcopy(generator.CANDIDATE_PLAN_SCHEMA)
    calls = []
    def handler(http_request):
        calls.append(http_request)
        assert str(http_request.url) == "https://freemodel.in/v1/chat/completions"
        assert http_request.headers["Authorization"] == "Bearer " + SECRET
        assert http_request.extensions["timeout"]["read"] == 30
        body = json.loads(http_request.content)
        assert body["model"] == "gemini-3.7-flash"
        assert body["tool_choice"] == {"type": "function", "function": {"name": "submit_itinerary"}}
        assert "response_format" not in body
        assert "max_tokens" not in body
        parameters = body["tools"][0]["function"]["parameters"]
        expected = {k: v for k, v in schema_before.items() if k not in {"$schema", "title", "description"}}
        assert parameters == expected
        assert SECRET not in http_request.content.decode()
        return httpx.Response(200, json=response(json.dumps(plan)))
    with transport(handler) as client:
        result = generator.generate_candidate(request, dataset, api_key=SECRET, client=client)
    assert result == plan
    assert generator.CANDIDATE_PLAN_SCHEMA == schema_before
    assert len(calls) == 1
    # Unknowns are not filled with fabricated zeros.
    assert any(a["estimatedCostVnd"] is None for day in result["days"] for a in day["activities"])


@pytest.mark.parametrize("explicit,configured,expected", [
    (None, None, "gemini-3.7-flash"), (None, "configured-model", "configured-model"),
    ("explicit-model", "configured-model", "explicit-model"),
])
def test_model_precedence(monkeypatch, explicit, configured, expected):
    if configured:
        monkeypatch.setenv("FREEMODEL_MODEL", configured)
    def handler(request):
        assert json.loads(request.content)["model"] == expected
        return httpx.Response(200, json=response('{}'))
    with transport(handler) as client:
        assert json.loads(request_text("prompt", {}, api_key=SECRET, model=explicit, client=client)) == {}


def test_server_environment_and_provider_dispatch(monkeypatch):
    monkeypatch.setenv("FREEMODEL_API_KEY", SECRET)
    monkeypatch.setenv("FREEMODEL_BASE_URL", "https://example.test/v1/")
    def handler(request):
        assert str(request.url) == "https://example.test/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer " + SECRET
        return httpx.Response(200, json=response('{}'))
    with transport(handler) as client:
        assert json.loads(gemini_client.request_text("prompt", {}, client=client)) == {}


def test_codex_provider_uses_openai_url_and_gpt_6_luna(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "codex")
    monkeypatch.setenv("CODEX_API_KEY", "codex-secret")
    monkeypatch.setenv("CODEX_MODEL", "gpt-6-luna")
    monkeypatch.setenv("CODEX_BASE_URL", "https://api.openai.com/v1")
    def handler(request):
        assert str(request.url) == "https://api.openai.com/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer codex-secret"
        assert json.loads(request.content)["model"] == "gpt-6-luna"
        return httpx.Response(200, json=response('{}'))
    with transport(handler) as client:
        assert json.loads(gemini_client.request_text("prompt", {}, client=client)) == {}


@pytest.mark.parametrize("provider", ["", "not-a-provider"])
def test_unknown_provider_is_configuration_error(monkeypatch, provider):
    monkeypatch.setenv("AI_PROVIDER", provider)
    with pytest.raises(GeminiError) as caught:
        gemini_client.request_text("prompt", {}, api_key=SECRET)
    assert caught.value.code == "CONFIG"


def test_missing_key():
    with pytest.raises(GeminiError, match="FREEMODEL_API_KEY"):
        request_text("prompt", {})


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
def test_only_one_transient_http_retry(status):
    calls, sleeps = [], []
    def handler(request):
        calls.append(request)
        return httpx.Response(status, text=SECRET)
    with transport(handler) as client, pytest.raises(GeminiError) as caught:
        request_text("prompt", {}, api_key=SECRET, client=client, max_retries=9, sleep=sleeps.append)
    assert len(calls) == 2
    assert sleeps == [1]
    assert caught.value.code == "API_ERROR"
    assert caught.value.status == status
    assert SECRET not in str(caught.value) + str(caught.value.details)


def test_recovers_after_transient_http_error():
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(502) if len(calls) == 1 else httpx.Response(200, json=response('{}'))
    with transport(handler) as client:
        assert json.loads(request_text("prompt", {}, api_key=SECRET, client=client, sleep=lambda _: None)) == {}
    assert len(calls) == 2


@pytest.mark.parametrize("status", [301, 400, 401, 403, 404, 422])
def test_nonretryable_http_errors_and_redirects(status):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(status, headers={"Location": "https://elsewhere.test/"}, text=SECRET)
    with transport(handler) as client, pytest.raises(GeminiError) as caught:
        request_text("prompt", {}, api_key=SECRET, client=client)
    assert len(calls) == 1
    assert caught.value.status == status
    assert SECRET not in str(caught.value.details)


@pytest.mark.parametrize("header,expected_calls,delay", [("2", 2, 2.0), ("60", 1, None), ("Wed, 21 Oct 2030 07:28:00 GMT", 1, None)])
def test_respects_retry_after_without_long_wait(header, expected_calls, delay):
    calls, sleeps = [], []
    def handler(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": header})
    with transport(handler) as client, pytest.raises(GeminiError):
        request_text("prompt", {}, api_key=SECRET, client=client, sleep=sleeps.append)
    assert len(calls) == expected_calls
    assert sleeps == ([] if delay is None else [delay])


@pytest.mark.parametrize("exception", [httpx.ReadTimeout, httpx.ConnectTimeout, httpx.WriteTimeout, httpx.PoolTimeout, httpx.ConnectError, httpx.ReadError])
def test_no_retry_for_timeouts_or_ambiguous_network_failures(exception):
    calls = []
    def handler(request):
        calls.append(request)
        raise exception(SECRET, request=request)
    with transport(handler) as client, pytest.raises(GeminiError) as caught:
        request_text("prompt", {}, api_key=SECRET, client=client, max_retries=3)
    assert len(calls) == 1
    assert caught.value.code == ("TIMEOUT" if issubclass(exception, httpx.TimeoutException) else "NETWORK")
    assert SECRET not in str(caught.value) + str(caught.value.details)


@pytest.mark.parametrize("arguments", ['not JSON', '{"days":', '[]', 'null', '"text"', '{"cost":NaN}', '{"cost":Infinity}'])
def test_invalid_arguments_are_not_retried(arguments):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=response(arguments))
    with transport(handler) as client, pytest.raises(GeminiError) as caught:
        request_text("prompt", {}, api_key=SECRET, client=client)
    assert caught.value.code == "MALFORMED"
    assert len(calls) == 1


@pytest.mark.parametrize("body", [
    None, [], {"choices": []}, {"choices": [None]},
    {"choices": [{"message": {"content": '{"itinerary":[]}'}}]},
    {"choices": [{"message": {"tool_calls": []}}]},
    {"choices": [{"message": {"tool_calls": [{"type": "function", "function": {"name": "other", "arguments": "{}"}}]}}]},
    {"choices": [{"message": {"tool_calls": [None]}}]},
    {"choices": [{"message": {"tool_calls": [{"type": "function", "function": {"name": "submit_itinerary", "arguments": {}}}]}}]},
    {"choices": [{"finish_reason": "length", "message": {}}]},
])
def test_invalid_response_shape_is_sanitized(body):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, content=json.dumps(body))
    with transport(handler) as client, pytest.raises(GeminiError) as caught:
        request_text("prompt", {}, api_key=SECRET, client=client)
    assert caught.value.code == "MALFORMED"
    assert len(calls) == 1


def test_invalid_http_response_json():
    with transport(lambda _: httpx.Response(200, text=SECRET)) as client, pytest.raises(GeminiError) as caught:
        request_text("prompt", {}, api_key=SECRET, client=client)
    assert caught.value.details == {"reason": "invalid_response_json"}
    assert SECRET not in str(caught.value)


@pytest.mark.parametrize("failure", ["schema", "grounding", "model_feasibility", "wrong_itinerary_shape"])
def test_public_generation_route_keeps_schema_and_grounding(monkeypatch, sample, failure):
    request, plan, dataset = sample
    monkeypatch.setattr(generator, "load_dataset", lambda **kwargs: dataset)
    if failure == "schema":
        del plan["days"][0]["activities"][0]["startTime"]
    elif failure == "grounding":
        plan["days"][0]["activities"][0]["placeId"] = "UNKNOWN_PLACE"
    elif failure == "model_feasibility":
        plan["status"] = "FEASIBLE"
        plan["score"] = 100
    else:
        plan = {"requestSummary": {}, "itinerary": [], "budgetBreakdown": {}, "dataWarnings": []}
    calls = []
    def handler(http_request):
        calls.append(http_request)
        return httpx.Response(200, json=response(json.dumps(plan)))
    real_request = request_text
    with transport(handler) as client:
        monkeypatch.setattr(generator, "request_text", lambda *args, **kwargs: real_request(*args, api_key=SECRET, client=client, **kwargs))
        result = TestClient(app).post("/itineraries/generate", json=request)
    assert result.status_code == 422
    assert result.json()["error"] == "INVALID_PLAN"
    assert result.json()["details"]
    assert SECRET not in result.text
    assert len(calls) == 1


def test_public_generation_success_preserves_unverified_contract(monkeypatch, sample):
    request, plan, dataset = sample
    monkeypatch.setattr(generator, "load_dataset", lambda **kwargs: dataset)
    with transport(lambda _: httpx.Response(200, json=response(json.dumps(plan)))) as client:
        monkeypatch.setattr(generator, "request_text", lambda *args, **kwargs: request_text(*args, api_key=SECRET, client=client, **kwargs))
        result = TestClient(app).post("/itineraries/generate", json=request)
    assert result.status_code == 200
    assert result.json() == {"status": "UNVERIFIED", "plan": plan}


@pytest.mark.parametrize("timeout,retries", [(0, 1), (float("nan"), 1), (30, -1), (30, True), (30, 1.5)])
def test_invalid_settings_are_sanitized(timeout, retries):
    with pytest.raises(GeminiError) as caught:
        request_text("prompt", {}, api_key=SECRET, timeout_s=timeout, max_retries=retries)
    assert caught.value.code == "CONFIG"
