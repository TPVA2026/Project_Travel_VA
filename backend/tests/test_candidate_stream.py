import json
from threading import Lock, Barrier
from fastapi.testclient import TestClient
from app.main import app
from app.api import itineraries


def test_streams_complete_candidates_before_final(monkeypatch):
    request = {'durationDays': 3}
    monkeypatch.setattr(itineraries, 'validate_travel_request', lambda x: type('R', (), {'model_dump': lambda self, **kwargs: request})())
    monkeypatch.setattr('app.services.planning_service._load_planning_dataset', lambda req: {})
    calls = []
    lock = Lock()
    barrier = Barrier(2, timeout=5)
    def generate(req, ds, previous_plans=None, max_retries=None, repair_invalid=False):
        assert max_retries == 0
        with lock:
            calls.append(len(previous_plans or []))
            i = len(calls)
        if i <= 2:
            barrier.wait()
        return {'planId': f'p{i}', 'days': [{'dayNumber': n} for n in range(1, 4)]}
    monkeypatch.setattr(itineraries, 'generate_candidate', generate)
    monkeypatch.setattr('app.services.ai.itinerary_generator._candidate_signature', lambda plan: plan['planId'])
    monkeypatch.setattr(itineraries, 'evaluate_plan', lambda req, plan: {'status': 'FEASIBLE'})
    monkeypatch.setattr(itineraries, 'rank_candidate_plans', lambda req, plans: {'ranked': [], 'unscored': [], 'excluded': []})
    with TestClient(app) as client:
        response = client.post('/itineraries/pipeline-stream', json={'request': request, 'count': 3})
    assert response.status_code == 200
    events = [json.loads(line) for line in response.text.splitlines()]
    assert [e['type'] for e in events] == ['progress', 'candidate', 'progress', 'candidate', 'progress', 'candidate', 'complete']
    assert [len(e['candidate']['plan']['days']) for e in events if e['type'] == 'candidate'] == [3, 3, 3]
    assert calls == [0, 0, 1]
    assert len(calls) == 3
    assert events[-1]['result']['pipelineStatus'] == 'COMPLETE'


def test_stream_keeps_first_candidate_on_gemini_error(monkeypatch):
    from app.services.ai.gemini_client import GeminiError
    request = {'durationDays': 2}
    monkeypatch.setattr(itineraries, 'validate_travel_request', lambda x: type('R', (), {'model_dump': lambda self, **kwargs: request})())
    monkeypatch.setattr('app.services.planning_service._load_planning_dataset', lambda req: {})
    calls = []
    lock = Lock()
    def generate(req, ds, previous_plans=None, max_retries=None, repair_invalid=False):
        assert max_retries == 0
        with lock:
            calls.append(1)
            i = len(calls)
        if i > 1:
            raise GeminiError('API_ERROR', 'Gemini returned HTTP 503')
        return {'planId': 'p1', 'days': [{'dayNumber': 1}, {'dayNumber': 2}]}
    monkeypatch.setattr(itineraries, 'generate_candidate', generate)
    monkeypatch.setattr('app.services.ai.itinerary_generator._candidate_signature', lambda plan: plan['planId'])
    monkeypatch.setattr(itineraries, 'evaluate_plan', lambda req, plan: {'status': 'UNVERIFIED'})
    monkeypatch.setattr(itineraries, 'rank_candidate_plans', lambda req, plans: {'ranked': [], 'unscored': [], 'excluded': []})
    with TestClient(app) as client:
        response = client.post('/itineraries/pipeline-stream', json={'request': request, 'count': 3})
    events = [json.loads(line) for line in response.text.splitlines()]
    assert len([e for e in events if e['type'] == 'candidate']) == 1
    assert events[-1]['result']['pipelineStatus'] == 'PARTIAL'


def test_stream_limits_duplicate_attempts(monkeypatch):
    request = {'durationDays': 3}

    monkeypatch.setattr(
        itineraries, 'validate_travel_request',
        lambda x: type('R', (), {
            'model_dump': lambda self, **kwargs: request
        })()
    )

    monkeypatch.setattr(
        'app.services.planning_service._load_planning_dataset',
        lambda req: {}
    )

    calls = []
    lock = Lock()

    def generate(req, ds, previous_plans=None, max_retries=None, repair_invalid=False):
        assert max_retries == 0
        with lock:
            calls.append(1)
        return {
            'planId': 'p1',
            'days': [
                {'dayNumber': n} for n in range(1, 4)
            ]
        }

    monkeypatch.setattr(
        itineraries, 'generate_candidate', generate
    )

    monkeypatch.setattr(
        'app.services.ai.itinerary_generator._candidate_signature',
        lambda plan: 'same-route'
    )

    monkeypatch.setattr(
        itineraries, 'evaluate_plan',
        lambda req, plan: {'status': 'FEASIBLE'}
    )

    monkeypatch.setattr(
        itineraries, 'rank_candidate_plans',
        lambda req, plans: {
            'ranked': [],
            'unscored': [],
            'excluded': []
        }
    )

    with TestClient(app) as client:
        response = client.post(
            '/itineraries/pipeline-stream',
            json={'request': request, 'count': 3}
        )

    events = [
        json.loads(line)
        for line in response.text.splitlines()
    ]

    assert len(calls) == 6
    assert len([
        e for e in events if e['type'] == 'candidate'
    ]) == 1
    assert events[-1]['result']['pipelineStatus'] == 'PARTIAL'


def test_stream_provider_error_stops_new_calls(monkeypatch):
    from app.services.ai.gemini_client import GeminiError

    request = {"durationDays": 3}

    monkeypatch.setattr(
        itineraries,
        "validate_travel_request",
        lambda x: type("R", (), {
            "model_dump": lambda self, **kwargs: request
        })()
    )

    monkeypatch.setattr(
        "app.services.planning_service._load_planning_dataset",
        lambda req: {}
    )

    calls = []
    lock = Lock()

    def generate(req, ds, previous_plans=None,
                 max_retries=None, repair_invalid=False):
        assert max_retries == 0

        with lock:
            calls.append(1)

        raise GeminiError(
            "API_ERROR", "Gemini returned HTTP 503", 503
        )

    monkeypatch.setattr(
        itineraries, "generate_candidate", generate
    )

    with TestClient(app) as client:
        response = client.post(
            "/itineraries/pipeline-stream",
            json={"request": request, "count": 3}
        )

    events = [
        json.loads(line)
        for line in response.text.splitlines()
    ]

    assert len(calls) == 2
    assert events[-1]["type"] == "error"
    assert not any(
        e["type"] == "candidate" for e in events
    )


def test_first_candidate_emitted_while_second_generates(
    monkeypatch
):
    import asyncio
    from threading import Event

    request = {"durationDays": 3}
    second_started = Event()
    release_second = Event()
    calls = []
    lock = Lock()

    monkeypatch.setattr(
        itineraries,
        "validate_travel_request",
        lambda x: type("R", (), {
            "model_dump": lambda self, **kwargs: request
        })()
    )

    monkeypatch.setattr(
        "app.services.planning_service._load_planning_dataset",
        lambda req: {}
    )

    def generate(req, ds, previous_plans=None,
                 max_retries=None, repair_invalid=False):
        assert max_retries == 0

        with lock:
            calls.append(1)
            i = len(calls)

        if i == 1:
            assert second_started.wait(5)
        else:
            second_started.set()
            assert release_second.wait(5)

        return {
            "planId": f"p{i}",
            "days": [
                {"dayNumber": n}
                for n in range(1, 4)
            ],
        }

    monkeypatch.setattr(
        itineraries, "generate_candidate", generate
    )

    monkeypatch.setattr(
        "app.services.ai.itinerary_generator._candidate_signature",
        lambda plan: plan["planId"]
    )

    monkeypatch.setattr(
        itineraries, "evaluate_plan",
        lambda req, plan: {"status": "UNVERIFIED"}
    )

    monkeypatch.setattr(
        itineraries, "rank_candidate_plans",
        lambda req, plans: {
            "ranked": [], "unscored": [], "excluded": []
        }
    )

    async def check_stream():
        response = itineraries.pipeline_stream(
            itineraries.PipelineBody(
                request=request, count=2
            )
        )

        iterator = response.body_iterator

        try:
            progress = json.loads(await anext(iterator))
            assert progress["type"] == "progress"

            first = json.loads(await anext(iterator))
            assert first["type"] == "candidate"
            assert first["candidate"]["planId"] == "p1"
            assert second_started.is_set()
            assert not release_second.is_set()

        finally:
            release_second.set()

        remaining = [
            json.loads(line)
            async for line in iterator
        ]

        assert remaining[-1]["type"] == "complete"
        assert len(
            remaining[-1]["result"]["candidates"]
        ) == 2

    asyncio.run(check_stream())


def test_stream_provider_error_stops_new_calls_additional_2(monkeypatch):
    from app.services.ai.gemini_client import GeminiError

    request = {"durationDays": 3}

    monkeypatch.setattr(
        itineraries,
        "validate_travel_request",
        lambda x: type("R", (), {
            "model_dump": lambda self, **kwargs: request
        })()
    )

    monkeypatch.setattr(
        "app.services.planning_service._load_planning_dataset",
        lambda req: {}
    )

    calls = []
    lock = Lock()

    def generate(req, ds, previous_plans=None,
                 max_retries=None, repair_invalid=False):
        assert max_retries == 0

        with lock:
            calls.append(1)

        raise GeminiError(
            "API_ERROR", "Gemini returned HTTP 503", 503
        )

    monkeypatch.setattr(
        itineraries, "generate_candidate", generate
    )

    with TestClient(app) as client:
        response = client.post(
            "/itineraries/pipeline-stream",
            json={"request": request, "count": 3}
        )

    events = [
        json.loads(line)
        for line in response.text.splitlines()
    ]

    assert len(calls) == 2
    assert events[-1]["type"] == "error"
    assert not any(
        e["type"] == "candidate" for e in events
    )


def test_first_candidate_emitted_while_second_generates_additional_2(
    monkeypatch
):
    import asyncio
    from threading import Event

    request = {"durationDays": 3}
    second_started = Event()
    release_second = Event()
    calls = []
    lock = Lock()

    monkeypatch.setattr(
        itineraries,
        "validate_travel_request",
        lambda x: type("R", (), {
            "model_dump": lambda self, **kwargs: request
        })()
    )

    monkeypatch.setattr(
        "app.services.planning_service._load_planning_dataset",
        lambda req: {}
    )

    def generate(req, ds, previous_plans=None,
                 max_retries=None, repair_invalid=False):
        assert max_retries == 0

        with lock:
            calls.append(1)
            i = len(calls)

        if i == 1:
            assert second_started.wait(5)
        else:
            second_started.set()
            assert release_second.wait(5)

        return {
            "planId": f"p{i}",
            "days": [
                {"dayNumber": n}
                for n in range(1, 4)
            ],
        }

    monkeypatch.setattr(
        itineraries, "generate_candidate", generate
    )

    monkeypatch.setattr(
        "app.services.ai.itinerary_generator._candidate_signature",
        lambda plan: plan["planId"]
    )

    monkeypatch.setattr(
        itineraries, "evaluate_plan",
        lambda req, plan: {"status": "UNVERIFIED"}
    )

    monkeypatch.setattr(
        itineraries, "rank_candidate_plans",
        lambda req, plans: {
            "ranked": [], "unscored": [], "excluded": []
        }
    )

    async def check_stream():
        response = itineraries.pipeline_stream(
            itineraries.PipelineBody(
                request=request, count=2
            )
        )

        iterator = response.body_iterator

        try:
            progress = json.loads(await anext(iterator))
            assert progress["type"] == "progress"

            first = json.loads(await anext(iterator))
            assert first["type"] == "candidate"
            assert first["candidate"]["planId"] == "p1"
            assert second_started.is_set()
            assert not release_second.is_set()

        finally:
            release_second.set()

        remaining = [
            json.loads(line)
            async for line in iterator
        ]

        assert remaining[-1]["type"] == "complete"
        assert len(
            remaining[-1]["result"]["candidates"]
        ) == 2

    asyncio.run(check_stream())
