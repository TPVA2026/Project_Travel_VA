"""Bounded itinerary repair using deterministic M4 feedback."""

from app.services.ai.itinerary_generator import (
    generate_candidate,
    generate_repaired_candidate,
)
from app.services.ai.gemini_client import GeminiError
from app.services.planning_service import evaluate_plan


MAX_REPAIRS = 2


def generate_with_repair(
    request: dict,
    *,
    max_repairs: int = MAX_REPAIRS,
    **client_kwargs,
) -> dict:
    """Generate, evaluate, and repair an itinerary with bounded M4 feedback."""
    if isinstance(max_repairs, bool) or not isinstance(max_repairs, int):
        raise ValueError("max_repairs must be a non-negative integer")
    if max_repairs < 0:
        raise ValueError("max_repairs must be a non-negative integer")

    plan = generate_candidate(request, check_hours=False, **client_kwargs)
    evaluation = evaluate_plan(request, plan)
    repairs_used = 0

    while evaluation["status"] == "INFEASIBLE" and repairs_used < max_repairs:
        feedback = select_repair_feedback(evaluation)

        if not feedback:
            break

        repairs_used += 1

        try:
            repaired_plan = generate_repaired_candidate(
                request,
                previous_plan=plan,
                feedback=feedback,
                **client_kwargs,
            )
        except GeminiError as exc:
            if exc.code in ("MALFORMED", "INVALID_PLAN"):
                break
            raise

        plan = repaired_plan
        evaluation = evaluate_plan(request, plan)

    return {
        "status": evaluation["status"],
        "plan": plan,
        "evaluation": evaluation,
        "repairsUsed": repairs_used,
        "repairExhausted": (
            evaluation["status"] == "INFEASIBLE"
            and repairs_used >= max_repairs
        ),
    }


HARD_CONSTRAINT_CODES = (
    "OUTSIDE_OPENING_HOURS",
    "TRANSFER_GAP",
    "TRAVEL_LIMIT",
)


def select_repair_feedback(evaluation: dict, max_items: int = 10) -> list[dict]:
    """Select confirmed M4 violations, prioritizing hard constraints."""
    if not isinstance(max_items, int) or isinstance(max_items, bool) or max_items < 1:
        raise ValueError("max_items must be a positive integer")

    checks = evaluation.get("checks", [])
    violations = [
        item for item in checks
        if isinstance(item, dict) and item.get("status") == "INFEASIBLE"
    ]

    violations.sort(
        key=lambda item: (
            item.get("code") not in HARD_CONSTRAINT_CODES,
            HARD_CONSTRAINT_CODES.index(item["code"])
            if item.get("code") in HARD_CONSTRAINT_CODES else len(HARD_CONSTRAINT_CODES),
        )
    )

    return [
        {
            "status": item["status"],
            "code": item.get("code"),
            "path": item.get("path"),
            "message": item.get("message"),
            **({"evidence": item["evidence"]} if "evidence" in item else {}),
        }
        for item in violations[:max_items]
    ]


def generate_candidates_with_repair(
    request: dict,
    *,
    count: int = 3,
    max_repairs: int = MAX_REPAIRS,
    **client_kwargs,
) -> dict:
    """Generate distinct candidates, evaluate and repair each with bounded calls."""
    from app.services.ai.itinerary_generator import (
        _candidate_signature,
        load_dataset,
    )

    if isinstance(count, bool) or not isinstance(count, int) or count < 1:
        raise ValueError("count must be a positive integer")

    if isinstance(max_repairs, bool) or not isinstance(max_repairs, int) or max_repairs < 0:
        raise ValueError("max_repairs must be a non-negative integer")

    dataset = load_dataset()
    results = []
    seen = set()
    previous_plans = []
    warnings = []

    max_attempts = count * 3

    for _ in range(max_attempts):
        if len(results) >= count:
            break

        try:
            plan = generate_candidate(
                request,
                dataset,
                previous_plans=previous_plans.copy(),
                check_hours=False,
                **client_kwargs,
            )
        except GeminiError as exc:
            if results and exc.code in ("MALFORMED", "INVALID_PLAN", "EMPTY"):
                warnings.append(f"Candidate generation stopped: {exc.code}")
                break
            raise

        initial_signature = _candidate_signature(plan)

        if initial_signature in seen:
            continue

        evaluation = evaluate_plan(request, plan)
        repairs_used = 0

        while evaluation["status"] == "INFEASIBLE" and repairs_used < max_repairs:
            feedback = select_repair_feedback(evaluation)
            if not feedback:
                break

            repairs_used += 1

            try:
                repaired = generate_repaired_candidate(
                    request,
                    previous_plan=plan,
                    feedback=feedback,
                    dataset=dataset,
                    **client_kwargs,
                )
            except GeminiError as exc:
                if exc.code in ("MALFORMED", "INVALID_PLAN"):
                    warnings.append(
                        f"Candidate repair stopped: {exc.code}"
                    )
                    break
                raise

            plan = repaired
            evaluation = evaluate_plan(request, plan)

        signature = _candidate_signature(plan)

        if signature in seen:
            warnings.append("Duplicate candidate after repair was skipped")
            continue

        seen.add(signature)
        previous_plans.append(plan)

        results.append({
            "status": evaluation["status"],
            "plan": plan,
            "evaluation": evaluation,
            "repairsUsed": repairs_used,
            "repairExhausted": (
                evaluation["status"] == "INFEASIBLE"
                and repairs_used >= max_repairs
            ),
        })

    if len(results) < count:
        warnings.append(
            f"Only {len(results)} distinct candidates generated; requested {count}"
        )

    return {
        "candidates": results,
        "warnings": warnings,
    }
