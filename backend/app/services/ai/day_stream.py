"""Incremental candidate generation; partial days are never advertised as verified."""
import json
from datetime import date, timedelta

from pydantic import ValidationError

from app.schemas.candidate_plan import CandidatePlan
from app.services.ai.context_builder import build_context, supported_place_ids, valid_destination_ids
from app.services.ai.gemini_client import GeminiError, request_text
from app.services.ai.itinerary_generator import CANDIDATE_PLAN_SCHEMA, check_grounding
from app.services.ai.prompt_templates import build_prompt


def generate_days(request, dataset, previous_plans=None, **client_kwargs):
    """Yield (dayNumber, partial plan). Each LLM call returns exactly one day."""
    context = build_context(request, dataset)
    if not valid_destination_ids(context) or not supported_place_ids(context):
        raise GeminiError('NO_DATA', 'No supported places for this destination', 422)
    total = request['durationDays']
    period = request.get('travelPeriod') or {}
    start = date.fromisoformat(period['startDate']) if period.get('startDate') else None
    accumulated = []
    plan_id = None
    destination_id = None
    title = None
    missing = []
    assumptions = []
    for day_number in range(1, total + 1):
        expected_date = (start + timedelta(days=day_number - 1)).isoformat() if start else None
        prompt = build_prompt(request, context, previous_plans=previous_plans)
        prompt += ('\n\nINCREMENTAL_DAY_TASK:\n'
                   f'Generate ONLY dayNumber {day_number} of {total}. Return a complete CandidatePlan JSON '
                   'containing exactly ONE entry in days, for the requested day. '
                   'Do not regenerate previous days. Avoid repeated places and respect previous travel schedule. '
                   'Each activityId must be unique across all days. '
                   'The full-trip durationDays remains authoritative; this is only a partial response.\n'
                   f'EXPECTED_DATE: {expected_date or "Use the correct date for this day"}\n'
                   f'PREVIOUS_DAYS: {json.dumps(accumulated, ensure_ascii=False)}\n')
        raw_text = request_text(prompt, CANDIDATE_PLAN_SCHEMA, **client_kwargs)
        try:
            partial = CandidatePlan.model_validate(json.loads(raw_text)).model_dump()
        except (ValueError, ValidationError) as exc:
            raise GeminiError('INVALID_PLAN', 'Invalid incremental day output', 422) from exc
        if len(partial['days']) != 1 or partial['days'][0]['dayNumber'] != day_number:
            raise GeminiError('INVALID_PLAN', 'AI returned the wrong day', 422)
        day = partial['days'][0]
        if expected_date and day['date'] != expected_date:
            raise GeminiError('INVALID_PLAN', 'AI returned the wrong date', 422)
        if destination_id is not None and partial['destinationId'] != destination_id:
            raise GeminiError('INVALID_PLAN', 'Destination changed between days', 422)
        if any(a['activityId'] in {old['activityId'] for d in accumulated for old in d['activities']} for a in day['activities']):
            raise GeminiError('INVALID_PLAN', 'Duplicate activityId between days', 422)
        errors = check_grounding(partial, context)
        if errors:
            raise GeminiError('INVALID_PLAN', 'Incremental day failed grounding', 422, errors)
        if plan_id is None:
            plan_id = partial['planId']
            title = partial['title']
            destination_id = partial['destinationId']
        accumulated.append(day)
        missing.extend(partial['missingData'])
        assumptions.extend(partial['assumptions'])
        yield day_number, {
            'planId': plan_id, 'title': title, 'destinationId': destination_id,
            'days': list(accumulated), 'missingData': list(dict.fromkeys(missing)),
            'assumptions': list(dict.fromkeys(assumptions)),
        }
