"""Backend orchestration for evaluation and deterministic revalidation.

Candidate evaluation validates and grounds data before M4. Revision helpers
from TPVA-26 then re-run feasibility and ranking without trusting stale state.
"""
from copy import deepcopy

from pydantic import ValidationError

from app.algorithms.feasibility import evaluate_feasibility
from app.algorithms.ranking import rank_candidates
from app.algorithms.validation_common import result_from_checks
from app.schemas.candidate_plan import CandidatePlan
from app.services.ai.context_builder import build_context, supported_place_ids, valid_destination_ids
from app.services.ai.itinerary_generator import check_grounding
from app.services.data_service import load_dataset
from app.services.input_service import (
    request_problems,
    validate_revision_request,
    validate_travel_request,
)


class PlanningError(Exception):
    """Public evaluation error, containing no raw internal exception."""

    def __init__(self, code, message, details=None, status_code=422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details
        self.status_code = status_code


def evaluate_plan(request: dict, plan: dict) -> dict:
    """Evaluate a submitted pair without AI, inferred data, or ranking.

    The full dataset is passed to M4 to retain opening hours, price scopes and
    departure routes. The filtered context is used for the existing M3 gate.
    Transport/accommodation costs remain unknown until a trusted source exists.
    """
    try:
        normalized_request = validate_travel_request(request).model_dump(mode="json", by_alias=True)
    except ValidationError as exc:
        raise PlanningError("VALIDATION_ERROR", "Invalid travel request.", request_problems(request, exc)) from None
    try:
        validated_plan = CandidatePlan.model_validate(plan).model_dump(mode="json")
    except ValidationError as exc:
        raise PlanningError(
            "INVALID_PLAN", "Plan failed schema checks.",
            exc.errors(include_input=False, include_context=False, include_url=False),
        ) from None

    try:
        dataset = load_dataset()
    except Exception:
        raise PlanningError("DATASET_ERROR", "Unable to load planning data.", status_code=500) from None

    # Container errors are server dataset failures, not invalid client plans.
    # The existing nested matrix is allowed but remains unsupported by M4.
    if (not isinstance(dataset, dict)
            or any(not isinstance(dataset.get(key, []), list)
                   for key in ("destinations", "attractions", "dining"))
            or not isinstance(dataset.get("travel_matrix", dataset.get("travelMatrix", [])), (list, dict))):
        raise PlanningError("DATASET_ERROR", "Invalid planning data structure.", status_code=500)

    context = build_context(normalized_request, dataset)
    if not valid_destination_ids(context):
        raise PlanningError("NO_DATA", "No verified destination IDs available for this request")
    if not supported_place_ids(context):
        raise PlanningError("NO_DATA", "No supported places in the curated dataset for this request")
    errors = check_grounding(validated_plan, context)
    if errors:
        raise PlanningError("INVALID_PLAN", "Plan failed schema/grounding checks", errors)
    return evaluate_feasibility(normalized_request, validated_plan, dataset)


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
