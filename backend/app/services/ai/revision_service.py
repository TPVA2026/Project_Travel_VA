"""Gemini-based itinerary revision with deterministic revalidation."""

from pydantic import ValidationError

from app.schemas.candidate_plan import CandidatePlan
from app.services.ai.itinerary_generator import generate_revised_candidate
from app.services.planning_service import (
    PlanningError,
    apply_revision,
    evaluate_plan,
)


def revise_with_gemini(
    request: dict,
    plan: dict,
    revision: dict,
    *,
    dataset: dict | None = None,
    **client_kwargs,
) -> dict:
    """Revise a candidate with Gemini, then revalidate using M4."""

    try:
        original_plan = CandidatePlan.model_validate(plan).model_dump(mode="json")

        if revision.get("planId") != original_plan["planId"]:
            raise PlanningError(
                "PLAN_MISMATCH",
                "Revision planId does not match the candidate plan.",
            )

        updated_request = apply_revision(request, revision)

    except ValidationError as exc:
        raise PlanningError(
            "VALIDATION_ERROR",
            "Invalid revision request.",
            exc.errors(include_url=False),
        ) from None

    revised_plan = generate_revised_candidate(
        updated_request,
        original_plan,
        revision,
        dataset=dataset,
        **client_kwargs,
    )

    evaluation = evaluate_plan(updated_request, revised_plan)

    return {
        "request": updated_request,
        "plan": revised_plan,
        "evaluation": evaluation,
    }
