import json
from fastapi.testclient import TestClient
from app.main import app
from app.api import itineraries


def test_streams_complete_candidates_before_final(monkeypatch):
    request = {'durationDays': 3}
    monkeypatch.setattr(itineraries, 'validate_travel_request', lambda x: type('R', (), {'model_dump': lambda self, **kwargs: request})())
    monkeypatch.setattr('app.services.planning_service._load_planning_dataset', lambda req: {})
    calls = []
    def generate(req, ds, previous_plans=None):
        calls.append(len(previous_plans or []))
        i = len(calls)
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
    assert calls == [0, 1, 2]
    assert events[-1]['result']['pipelineStatus'] == 'COMPLETE'


def test_stream_keeps_first_candidate_on_gemini_error(monkeypatch):
    from app.services.ai.gemini_client import GeminiError
    request = {'durationDays': 2}
    monkeypatch.setattr(itineraries, 'validate_travel_request', lambda x: type('R', (), {'model_dump': lambda self, **kwargs: request})())
    monkeypatch.setattr('app.services.planning_service._load_planning_dataset', lambda req: {})
    calls = []
    def generate(req, ds, previous_plans=None):
        calls.append(1)
        if len(calls) > 1:
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
