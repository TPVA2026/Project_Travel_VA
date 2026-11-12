"""Backend orchestration for evaluation, ranking and deterministic revalidation.

Candidate evaluation validates and grounds data before M4. Revision helpers
from TPVA-26 then re-run feasibility and ranking without trusting stale state.
"""
from copy import deepcopy

from pydantic import ValidationError

from app.algorithms.feasibility import evaluate_feasibility
from app.algorithms.ranking import rank_candidates
from app.algorithms.validation_common import result_from_checks
from app.schemas.candidate_plan import CandidatePlan
from app.schemas.revision import RevisionRequest
from app.services.ai.context_builder import build_context, supported_place_ids, valid_destination_ids
from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import _candidate_signature, check_grounding, generate_candidate
from app.services.data_service import load_dataset
from app.services.input_service import (
    request_problems,
    validate_revision_request,
    validate_travel_request,
)
from app.services.routing_enrichment import enrich_routes
from app.services.routing_service import RoutingService, get_default_routing_service


class PlanningError(Exception):
    """Public evaluation error, containing no raw internal exception."""

    def __init__(self, code, message, details=None, status_code=422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details
        self.status_code = status_code


def _load_planning_dataset() -> dict:
    """Load and validate dataset containers without exposing internal errors."""
    try:
        dataset = load_dataset()
    except Exception:
        raise PlanningError(
            "DATASET_ERROR", "Unable to load planning data.", status_code=500
        ) from None
    if (not isinstance(dataset, dict)
            or any(not isinstance(dataset.get(key, []), list)
                   for key in ("destinations", "attractions", "dining"))
            or not isinstance(
                dataset.get("travel_matrix", dataset.get("travelMatrix", [])),
                (list, dict),
            )):
        raise PlanningError(
            "DATASET_ERROR", "Invalid planning data structure.", status_code=500
        )
    return dataset


def _prepare_evaluation_inputs(
    request: dict, plans: list[dict], *, single: bool
) -> tuple[dict, list[dict], dict]:
    """Validate and ground one or more candidates against one dataset snapshot."""
    try:
        normalized_request = validate_travel_request(request).model_dump(mode="json", by_alias=True)
    except ValidationError as exc:
        raise PlanningError("VALIDATION_ERROR", "Invalid travel request.", request_problems(request, exc)) from None

    validated_plans = []
    for index, plan in enumerate(plans):
        try:
            validated_plans.append(
                CandidatePlan.model_validate(plan).model_dump(mode="json")
            )
        except ValidationError as exc:
            message = (
                "Plan failed schema checks." if single
                else f"Candidate plan at index {index} failed schema checks."
            )
            raise PlanningError(
                "INVALID_PLAN", message,
                exc.errors(include_input=False, include_context=False, include_url=False),
            ) from None

    dataset = _load_planning_dataset()
    context = build_context(normalized_request, dataset)
    if not valid_destination_ids(context):
        message = (
            "The selected destination is not supported by the current dataset."
            if single else "No supported planning data is available for this request."
        )
        raise PlanningError("NO_DATA", message)
    if not supported_place_ids(context):
        message = (
            "No supported places in the curated dataset for this request"
            if single else "No supported planning data is available for this request."
        )
        raise PlanningError("NO_DATA", message)
    for index, plan in enumerate(validated_plans):
        errors = check_grounding(plan, context)
        if errors:
            message = (
                "Plan failed schema/grounding checks" if single
                else f"Candidate plan at index {index} failed grounding checks."
            )
            raise PlanningError("INVALID_PLAN", message, errors)
    return normalized_request, validated_plans, dataset


def _evaluate_candidate(
    request: dict, plan: dict, dataset: dict, service: RoutingService,
    supplemental_costs: dict | None = None,
) -> dict:
    """Apply the shared trusted-routing and deterministic M4 policy."""
    evaluation_dataset, routes = enrich_routes(request, plan, dataset, service)
    if supplemental_costs is None:
        result = evaluate_feasibility(request, plan, evaluation_dataset)
    else:
        result = evaluate_feasibility(
            request, plan, evaluation_dataset, supplemental_costs
        )
    if service.config.enabled:
        result.setdefault("components", {})["routing"] = {
            "enabled": True,
            "routes": routes,
        }
    return result


def evaluate_plan(request: dict, plan: dict, *,
                  routing_service: RoutingService | None = None) -> dict:
    """Evaluate a submitted pair without AI, inferred data, or ranking.

    The full dataset is passed to M4 to retain opening hours, price scopes and
    departure routes. The filtered context is used for the existing M3 gate.
    Transport/accommodation costs remain unknown until a trusted source exists.
    """
    normalized_request, validated_plans, dataset = _prepare_evaluation_inputs(
        request, [plan], single=True
    )
    validated_plan = validated_plans[0]
    service = routing_service or get_default_routing_service()
    return _evaluate_candidate(
        normalized_request, validated_plan, dataset, service
    )


def apply_revision(request: dict, revision: dict) -> dict:
    """Thay đúng trường changeType và kiểm tra lại TravelRequest hoàn chỉnh.

    Thay toàn bộ đối tượng của trường được chọn (ví dụ budget/preferences),
    giữ nguyên các trường khác. Không tự đoán số ngày hoặc sửa ngày kết thúc.
    Nếu thay đổi làm request mâu thuẫn, Pydantic sẽ phát sinh ValidationError.
    """
    updated = validate_travel_request(request).model_dump(mode="json", by_alias=True)
    change = validate_revision_request(revision).model_dump(
        mode="json", by_alias=True, exclude_none=True,
    )
    field = change["changeType"]
    updated[field] = change[field]
    # model_dump tạo dict mới; không ghi thay đổi vào request của bên gọi.
    return validate_travel_request(updated).model_dump(mode="json", by_alias=True)


def _replace_candidate(candidate_plans, revised_plan):
    """Thay lịch cũ cùng planId trong tập so sánh, hoặc thêm nếu chưa có.

    Mỗi planId chỉ xuất hiện một lần; schema loại score/status do AI tự thêm.
    Không sửa danh sách hoặc các lịch ban đầu của bên gọi.
    """
    if candidate_plans is None:
        candidate_plans = []
    if not isinstance(candidate_plans, list):
        raise ValueError("candidate_plans must be a list")
    pool, seen = [], set()
    for candidate in candidate_plans:
        plan = CandidatePlan.model_validate(candidate).model_dump(mode="json")
        plan_id = plan["planId"]
        if plan_id in seen:
            raise ValueError("candidate_plans must have unique planId values")
        seen.add(plan_id)
        pool.append(deepcopy(revised_plan) if plan_id == revised_plan["planId"] else plan)
    if revised_plan["planId"] not in seen:
        pool.append(deepcopy(revised_plan))
    return pool


def revalidate_plan(request: dict, revised_plan: dict, *, dataset: dict | None = None,
                    supplemental_costs_by_plan: dict | None = None,
                    candidate_plans: list | None = None,
                    selected_history: list | None = None,
                    trip_time_limit_minutes: float | None = None) -> dict:
    """Tính lại chi phí, lịch, chặng, giới hạn và điểm khi hoạt động thay đổi.

    Dấu * yêu cầu các đối số phía sau phải viết tên khi gọi để tránh truyền nhầm.
    Chi phí bổ sung phải được bên gọi xác nhận cho phiên bản lịch hiện tại;
    thiếu thì giữ UNVERIFIED, không lấy lại chi phí/kết quả đánh giá cũ.
    Toàn bộ tập so sánh được đánh giá lại, nên min/max của T không bị lỗi thời.
    """
    updated_request = validate_travel_request(request).model_dump(mode="json", by_alias=True)
    plan = CandidatePlan.model_validate(revised_plan).model_dump(mode="json")
    if supplemental_costs_by_plan is None:
        supplemental_costs_by_plan = {}
    if not isinstance(supplemental_costs_by_plan, dict):
        raise ValueError("supplemental_costs_by_plan must be a dictionary")
    pool = _replace_candidate(candidate_plans, plan)
    dataset = load_dataset() if dataset is None else dataset
    evaluation = evaluate_feasibility(
        updated_request, plan, dataset, supplemental_costs_by_plan.get(plan["planId"]),
    )
    ranking = rank_candidates(
        updated_request, pool, dataset, supplemental_costs_by_plan,
        selected_history=selected_history,
        trip_time_limit_minutes=trip_time_limit_minutes,
    )
    # Giới hạn phút cả chuyến được kiểm tra bổ sung trong ranking. Phản ánh lỗi
    # này vào đánh giá trả về để không có hai trạng thái trái nhau cho cùng lịch.
    for excluded in ranking["excluded"]:
        if excluded["planId"] == plan["planId"]:
            additional = [reason for reason in excluded["reasons"]
                          if reason["code"] == "TRIP_TIME_LIMIT"]
            if additional:
                combined = result_from_checks(evaluation["checks"] + additional)
                evaluation = {**evaluation, **combined}
    return {
        "request": updated_request,
        "plan": plan,
        "status": evaluation["status"],
        "evaluation": evaluation,
        "ranking": ranking,
    }


def revalidate_revision(request: dict, original_plan: dict, revision: dict, *,
                        revised_plan: dict | None = None,
                        dataset: dict | None = None,
                        supplemental_costs_by_plan: dict | None = None,
                        candidate_plans: list | None = None,
                        selected_history: list | None = None,
                        trip_time_limit_minutes: float | None = None) -> dict:
    """Áp dụng RevisionRequest cho đúng lịch rồi gọi lại toàn bộ bộ kiểm tra.

    Nếu có lịch mới do người dùng/M3 chỉnh sửa, truyền revised_plan cùng planId.
    Nếu chưa có lịch mới, kiểm tra lịch cũ với yêu cầu mới; không tự kéo dài ngày,
    di chuyển hoạt động hoặc hứa rằng yêu cầu mới chắc chắn khả thi.
    """
    original = CandidatePlan.model_validate(original_plan).model_dump(mode="json")
    change = validate_revision_request(revision)
    if change.plan_id != original["planId"]:
        raise ValueError("revision.planId must match original_plan.planId")
    plan = original if revised_plan is None else CandidatePlan.model_validate(revised_plan).model_dump(mode="json")
    if plan["planId"] != original["planId"]:
        raise ValueError("revised_plan must keep the original planId")
    updated_request = apply_revision(request, revision)
    return revalidate_plan(
        updated_request, plan, dataset=dataset,
        supplemental_costs_by_plan=supplemental_costs_by_plan,
        candidate_plans=candidate_plans, selected_history=selected_history,
        trip_time_limit_minutes=trip_time_limit_minutes,
    )


def rank_candidate_plans(
    request: dict, plans: list[dict], limit: int = 3, *,
    routing_service: RoutingService | None = None,
    supplemental_costs_by_plan: dict | None = None,
) -> dict:
    """Validate, ground and re-evaluate candidates before using Sand's ranking."""
    if not isinstance(plans, list) or not plans:
        raise PlanningError("INVALID_PLANS", "At least one candidate plan is required.")
    normalized_request, validated_plans, dataset = _prepare_evaluation_inputs(
        request, plans, single=False
    )
    if supplemental_costs_by_plan is None:
        supplemental_costs_by_plan = {}
    if not isinstance(supplemental_costs_by_plan, dict):
        raise PlanningError("RANKING_ERROR", "Candidates could not be ranked.")
    service = routing_service or get_default_routing_service()
    evaluations_by_plan_id = {
        plan["planId"]: _evaluate_candidate(
            normalized_request, plan, dataset, service,
            supplemental_costs_by_plan.get(plan["planId"]),
        )
        for plan in validated_plans
    }
    try:
        result = rank_candidates(
            normalized_request, validated_plans, dataset=dataset,
            supplemental_costs_by_plan=supplemental_costs_by_plan,
            evaluations_by_plan_id=evaluations_by_plan_id,
        )
    except (ValidationError, ValueError, TypeError) as exc:
        raise PlanningError("RANKING_ERROR", "Candidates could not be ranked.") from None
    result["totalRanked"] = len(result["ranked"])
    result["ranked"] = result["ranked"][:limit]
    result["limit"] = limit
    return result


def run_itinerary_pipeline(
    request: dict,
    count: int = 3,
    *,
    routing_service: RoutingService | None = None,
) -> dict:
    """Generate distinct candidates, evaluate them, and rank eligible plans."""
    if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 3:
        raise PlanningError(
            "INVALID_CANDIDATE_COUNT",
            "Candidate count must be an integer from 1 to 3.",
        )
    try:
        normalized_request = validate_travel_request(request).model_dump(
            mode="json", by_alias=True
        )
    except ValidationError as exc:
        raise PlanningError(
            "VALIDATION_ERROR",
            "Invalid travel request.",
            request_problems(request, exc),
        ) from None

    dataset = _load_planning_dataset()
    plans = []
    seen = set()
    warnings = []
    generation_error = None
    for _ in range(count * 3):
        if len(plans) == count:
            break
        try:
            plan = generate_candidate(
                normalized_request,
                dataset,
                previous_plans=plans.copy(),
            )
        except GeminiError as exc:
            generation_error = exc
            break

        signature = _candidate_signature(plan)
        if signature in seen:
            continue
        seen.add(signature)
        plans.append(plan)

    if not plans and generation_error:
        raise generation_error
    if not plans:
        raise GeminiError(
            "INSUFFICIENT_CANDIDATES",
            "No distinct candidate itineraries could be generated.",
        )
    if generation_error:
        warnings.append({
            "code": "PARTIAL_GENERATION",
            "message": generation_error.message,
        })
    if len(plans) < count:
        warnings.append({
            "code": "INSUFFICIENT_CANDIDATES",
            "message": f"Only {len(plans)} distinct candidate(s) generated; requested {count}.",
        })

    service = routing_service or get_default_routing_service()
    candidates = []
    rankable_plans = []
    for plan in plans:
        try:
            evaluation = evaluate_plan(
                normalized_request,
                plan,
                routing_service=service,
            )
            status = evaluation.get("status")
            if status not in {"FEASIBLE", "UNVERIFIED", "INFEASIBLE"}:
                status = "UNVERIFIED"
            rankable_plans.append(plan)
        except PlanningError as exc:
            evaluation = None
            status = "UNVERIFIED"
            warnings.append({
                "code": "EVALUATION_UNAVAILABLE",
                "planId": plan["planId"],
                "message": exc.message,
            })
        candidates.append({
            "planId": plan["planId"],
            "status": status,
            "plan": plan,
            "evaluation": evaluation,
        })

    ranking = {"ranked": [], "unscored": [], "excluded": []}
    if rankable_plans:
        try:
            ranking = rank_candidate_plans(
                normalized_request,
                rankable_plans,
                routing_service=service,
            )
        except PlanningError as exc:
            warnings.append({
                "code": "RANKING_UNAVAILABLE",
                "message": exc.message,
            })
    elif candidates:
        warnings.append({
            "code": "RANKING_UNAVAILABLE",
            "message": "No evaluated candidates were available for ranking.",
        })

    primary = candidates[0]
    return {
        "pipelineStatus": "PARTIAL" if warnings else "COMPLETE",
        "generator": "ai",
        "candidates": candidates,
        "ranking": ranking,
        "warnings": warnings,
        "request": normalized_request,
        # Keep the former single-candidate response fields for existing clients.
        "status": primary["status"],
        "plan": primary["plan"],
        "evaluation": primary["evaluation"],
    }


def revise_and_evaluate(request: dict, plan: dict, revision: dict) -> dict:
    """Apply one request change and always evaluate the unchanged plan again."""
    try:
        current = validate_travel_request(request).model_dump(mode="json", by_alias=True)
        validated_plan = CandidatePlan.model_validate(plan).model_dump(mode="json")
        change = RevisionRequest.model_validate(revision)
    except ValidationError as exc:
        raise PlanningError(
            "VALIDATION_ERROR", "Invalid revision request.",
            exc.errors(include_input=False, include_context=False, include_url=False),
        ) from None
    if change.plan_id != validated_plan["planId"]:
        raise PlanningError("PLAN_MISMATCH", "Revision planId does not match the candidate plan.")

    updated_request = deepcopy(current)
    public_change = change.model_dump(mode="json", by_alias=True, exclude_none=True)
    field = public_change["changeType"]
    updated_request[field] = public_change[field]
    try:
        normalized = validate_travel_request(updated_request).model_dump(mode="json", by_alias=True)
    except ValidationError as exc:
        raise PlanningError(
            "VALIDATION_ERROR", "The revised request is invalid.",
            request_problems(updated_request, exc),
        ) from None
    evaluation = evaluate_plan(normalized, validated_plan)
    return {"request": normalized, "plan": validated_plan, "evaluation": evaluation}
