import json

from app.services.ai import day_stream


def test_generate_days_incrementally(monkeypatch):
    monkeypatch.setattr(day_stream, 'build_context', lambda req, ds: {'destinations': [], 'attractions': []})
    monkeypatch.setattr(day_stream, 'valid_destination_ids', lambda ctx: {'VN_48'})
    monkeypatch.setattr(day_stream, 'supported_place_ids', lambda ctx: {'p1'})
    monkeypatch.setattr(day_stream, 'build_prompt', lambda *args, **kwargs: 'PROMPT')
    monkeypatch.setattr(day_stream, 'check_grounding', lambda *args, **kwargs: [])
    calls = []

    def fake_request(prompt, schema, **kwargs):
        calls.append(prompt)
        i = len(calls)
        return json.dumps({
            'planId': 'plan1', 'title': 'Trip', 'destinationId': 'VN_48',
            'days': [{'dayNumber': i, 'date': f'2026-12-0{i}', 'activities': [], 'travelLegs': []}],
            'missingData': [], 'assumptions': [],
        })

    monkeypatch.setattr(day_stream, 'request_text', fake_request)
    request = {'durationDays': 3, 'travelPeriod': {'startDate': '2026-12-01', 'endDate': '2026-12-03'}}
    events = list(day_stream.generate_days(request, {}))
    assert [len(plan['days']) for _, plan in events] == [1, 2, 3]
    assert 'PREVIOUS_DAYS' in calls[1]
    assert '2026-12-03' in calls[2]
