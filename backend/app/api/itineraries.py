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

        from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
        import time
        from app.services.ai.itinerary_generator import _unique_plan_id

        plans, candidates, warnings, seen = [], [], [], set()
        seen_ids = set()
        attempts = 0
        max_attempts = body.count * 3
        concurrency = min(2, body.count)
        rate_limit_hits = 0
        cooldown_until = 0.0
        pool = ThreadPoolExecutor(max_workers=concurrency)
        pending = set()

        def refill():
            nonlocal attempts
            while (
                len(pending) < concurrency
                and len(pending) + len(candidates) < body.count
                and attempts < max_attempts
                and time.monotonic() >= cooldown_until
            ):
                pending.add(pool.submit(generate_candidate, request, dataset,
                                        previous_plans=plans.copy()))
                attempts += 1

        try:
            refill()
            yield emit('progress', candidateIndex=1, requestedCount=body.count)
            while pending or (
                len(candidates) < body.count
                and attempts < max_attempts
            ):
                refill()

                if not pending:
                    delay = cooldown_until - time.monotonic()
                    if delay > 0:
                        time.sleep(delay)
                    refill()

                if not pending:
                    break

                done, _ = wait(pending, return_when=FIRST_COMPLETED)
                # Process one completed future at a time; retain the other futures.
                future = next(iter(done))
                pending.remove(future)
                try:
                    plan = future.result()
                    signature = _candidate_signature(plan)
                    if signature in seen:
                        refill()
                        continue
                    _unique_plan_id(plan, seen_ids)
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
                    if len(candidates) < body.count and pending:
                        yield emit('progress', candidateIndex=len(candidates) + 1, requestedCount=body.count)
                except GeminiError as exc:
                    message = str(exc.message)
                    rate_limited = (
                        '429' in message
                        or 'RESOURCE_EXHAUSTED' in message.upper()
                        or exc.code in {'RATE_LIMIT', 'RATE_LIMITED', 'RESOURCE_EXHAUSTED'}
                    )

                    if rate_limited:
                        rate_limit_hits += 1
                        concurrency = 1
                        delay = min(30, 5 * (2 ** (rate_limit_hits - 1)))
                        cooldown_until = time.monotonic() + delay

                        if attempts >= max_attempts:
                            warnings.append({
                                'code': 'PARTIAL_GENERATION',
                                'message': message
                            })
                    else:
                        warnings.append({
                            'code': 'PARTIAL_GENERATION',
                            'message': message
                        })
                    # Do not cancel other in-flight requests on a provider error.
                except PlanningError as exc:
                    warnings.append({'code': exc.code, 'message': exc.message})
                except Exception:
                    warnings.append({'code': 'INTERNAL', 'message': 'Unexpected generation error'})
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

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
