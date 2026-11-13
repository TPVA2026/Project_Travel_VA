from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import generate_candidate
from app.services.ai.repair_service import generate_with_repair
from app.services.ai.revision_service import revise_with_gemini
from app.services.input_service import request_problems, validate_travel_request

from app.services.planning_service import (
    PlanningError,
    evaluate_plan,
    rank_candidate_plans,
    revise_and_evaluate,
    run_itinerary_pipeline,
)

router = APIRouter()


@router.post("/generate")  # candidate generation (Thiện / M3)
def generate(body: dict):
    auto_repair = body.get("autoRepair", False)

    if not isinstance(auto_repair, bool):
        return JSONResponse(
            status_code=422,
            content={"detail": "autoRepair must be a boolean"},
        )

    request_body = {
        key: value
        for key, value in body.items()
        if key != "autoRepair"
    }

    try:
        validated_request = validate_travel_request(request_body)
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={"detail": request_problems(request_body, exc)},
        )

    normalized_body = validated_request.model_dump(
        mode="json",
        by_alias=True,
    )

    try:
        if auto_repair:
            result = generate_with_repair(normalized_body)
        else:
            plan = generate_candidate(normalized_body)

    except GeminiError as exc:
        if exc.status == 429:
            http = 429
            code = "RATE_LIMIT"
        elif exc.code == "TIMEOUT":
            http = 504
            code = exc.code
        elif exc.code == "CONFIG":
            http = 500
            code = exc.code
        elif exc.status == 422:
            http = 422
            code = exc.code
        else:
            http = 502
            code = exc.code

        return JSONResponse(
            {
                "error": code,
                "message": exc.message,
                "details": exc.details,
            },
            status_code=http,
        )

    except PlanningError as exc:
        return JSONResponse(
            {
                "error": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
            status_code=exc.status_code,
        )

    except Exception:
        return JSONResponse(
            {"error": "INTERNAL"},
            status_code=500,
        )

    if auto_repair:
        return result

    return {"status": "UNVERIFIED", "plan": plan}


class EvaluateBody(BaseModel):
    """Endpoint envelope; shared TravelRequest/CandidatePlan schemas are unchanged."""

    model_config = ConfigDict(extra="forbid")
    request: dict
    plan: dict


@router.post("/evaluate")
def evaluate(body: EvaluateBody):
    try:
        return evaluate_plan(body.request, body.plan)
    except PlanningError as exc:
        return JSONResponse(
            {"error": exc.code, "message": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)


class RankBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: dict
    plans: list[dict] = Field(min_length=1, max_length=20)


@router.post("/rank")
def rank(body: RankBody):
    try:
        return rank_candidate_plans(body.request, body.plans)
    except PlanningError as exc:
        return JSONResponse(
            {"error": exc.code, "message": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)


class PipelineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: dict
    count: int = Field(default=3, ge=1, le=3, strict=True)


@router.post("/pipeline")
def pipeline(body: PipelineBody):
    try:
        return run_itinerary_pipeline(body.request, body.count)
    except GeminiError as exc:
        if exc.status == 429:
            http = 429
            code = "RATE_LIMIT"
        elif exc.code == "TIMEOUT":
            http = 504
            code = exc.code
        elif exc.code == "CONFIG":
            http = 500
            code = exc.code
        elif exc.code == "NO_DATA" or exc.status == 422:
            http = 422
            code = exc.code
        else:
            http = 502
            code = (
                "NO_CANDIDATES"
                if exc.code in {"EMPTY", "INSUFFICIENT_CANDIDATES"}
                else exc.code
            )
        return JSONResponse(
            {"error": code, "message": exc.message, "details": exc.details},
            status_code=http,
        )
    except PlanningError as exc:
        return JSONResponse(
            {"error": exc.code, "message": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)


class ReviseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: dict
    plan: dict
    revision: dict
    autoRegenerate: bool = False


@router.post("/revise")
def revise(body: ReviseBody):
    try:
        if body.autoRegenerate:
            return revise_with_gemini(body.request, body.plan, body.revision)
        return revise_and_evaluate(body.request, body.plan, body.revision)
    except PlanningError as exc:
        return JSONResponse(
            {"error": exc.code, "message": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except GeminiError as exc:
        if exc.code == "TIMEOUT":
            http = 504
        elif exc.code == "CONFIG":
            http = 500
        elif exc.status == 422:
            http = 422
        else:
            http = 502

        return JSONResponse(
            {
                "error": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
            status_code=http,
        )

    except Exception:
        return JSONResponse({"error": "INTERNAL"}, status_code=500)


# Selection remains browser-local for the no-account MVP.


@router.post('/pipeline-stream')
def pipeline_stream(body: PipelineBody):
    """Stream each COMPLETE candidate after evaluation, without splitting days."""
    import json
    from fastapi.responses import StreamingResponse
    from app.services.ai.itinerary_generator import _candidate_signature
    from app.services.planning_service import _load_planning_dataset

    try:
        request = validate_travel_request(body.request).model_dump(mode='json', by_alias=True)
        if not 1 <= request['durationDays'] <= 3:
            return JSONResponse({'error': 'INVALID_DURATION', 'message': 'MVP supports 1 to 3 days'}, status_code=422)
        dataset = _load_planning_dataset(request)
    except ValidationError as exc:
        return JSONResponse({'error': 'VALIDATION_ERROR', 'details': request_problems(body.request, exc)}, status_code=422)
    except PlanningError as exc:
        return JSONResponse({'error': exc.code, 'message': exc.message}, status_code=exc.status_code)

    def events():
        def emit(kind, **fields):
            return json.dumps({'type': kind, **fields}, ensure_ascii=False) + '\n'

        plans, candidates, warnings, seen = [], [], [], set()
        # Match the original pipeline's duplicate handling (up to 3 attempts per candidate).
        attempts = 0
        while len(candidates) < body.count and attempts < body.count * 3:
            attempts += 1
            yield emit('progress', candidateIndex=len(candidates) + 1, requestedCount=body.count)
            try:
                plan = generate_candidate(request, dataset, previous_plans=plans.copy())
                signature = _candidate_signature(plan)
                if signature in seen:
                    continue
                seen.add(signature)
                plans.append(plan)
                try:
                    evaluation = evaluate_plan(request, plan)
                    status = evaluation.get('status', 'UNVERIFIED')
                    if status not in {'FEASIBLE', 'UNVERIFIED', 'INFEASIBLE'}:
                        status = 'UNVERIFIED'
                except PlanningError as exc:
                    evaluation, status = None, 'UNVERIFIED'
                    warnings.append({'code': 'EVALUATION_UNAVAILABLE', 'planId': plan['planId'], 'message': exc.message})
                candidate = {'planId': plan['planId'], 'plan': plan, 'status': status, 'evaluation': evaluation}
                candidates.append(candidate)
                yield emit('candidate', candidateIndex=len(candidates), requestedCount=body.count, candidate=candidate)
            except GeminiError as exc:
                warnings.append({'code': 'PARTIAL_GENERATION', 'message': exc.message})
                break
            except PlanningError as exc:
                warnings.append({'code': exc.code, 'message': exc.message})
                break
            except Exception:
                warnings.append({'code': 'INTERNAL', 'message': 'Unexpected generation error'})
                break

        if len(candidates) < body.count:
            warnings.append({'code': 'INSUFFICIENT_CANDIDATES',
                             'message': f'Only {len(candidates)} distinct candidate(s) generated; requested {body.count}.'})
        if not candidates:
            yield emit('error', code=warnings[0]['code'] if warnings else 'NO_CANDIDATES',
                       message=warnings[0]['message'] if warnings else 'No usable candidates')
            return
        try:
            rankable = [c['plan'] for c in candidates if c['evaluation'] is not None]
            ranking = rank_candidate_plans(request, rankable) if rankable else {'ranked': [], 'unscored': [], 'excluded': []}
        except PlanningError as exc:
            ranking = {'ranked': [], 'unscored': [], 'excluded': []}
            warnings.append({'code': 'RANKING_UNAVAILABLE', 'message': exc.message})
        primary = candidates[0]
        result = {'pipelineStatus': 'PARTIAL' if warnings else 'COMPLETE',
                  'generator': 'ai', 'candidates': candidates, 'ranking': ranking,
                  'warnings': warnings, 'request': request,
                  'status': primary['status'], 'plan': primary['plan'], 'evaluation': primary['evaluation']}
        yield emit('complete', result=result)

    return StreamingResponse(events(), media_type='application/x-ndjson',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
