"""Backend orchestration: validate and ground before calling M4."""
from pydantic import ValidationError

from app.algorithms.feasibility import evaluate_feasibility
from app.schemas.candidate_plan import CandidatePlan
from app.services.ai.context_builder import build_context, supported_place_ids, valid_destination_ids
from app.services.ai.itinerary_generator import check_grounding
from app.services.data_service import load_dataset
from app.services.input_service import request_problems, validate_travel_request


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
