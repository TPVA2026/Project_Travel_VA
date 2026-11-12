"""Generate + validate a candidate itinerary (M3).

The LLM only PROPOSES a plan. Output stays UNVERIFIED: only M4's deterministic
checks (/itineraries/evaluate) may mark it FEASIBLE.
"""
import json
import re
from pathlib import Path

from pydantic import ValidationError

from app.algorithms.validation_common import route_reference
from app.schemas.candidate_plan import CandidatePlan
from app.services.ai.context_builder import build_context, supported_place_ids, valid_destination_ids
from app.services.ai.gemini_client import GeminiError, request_text
from app.services.ai.opening_hours import check_activity_hours
from app.services.ai.prompt_templates import build_prompt
from app.services.data_service import load_dataset

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schemas" / "candidate_plan.schema.json"
with open(SCHEMA_PATH, encoding="utf-8") as _f:
    CANDIDATE_PLAN_SCHEMA = json.load(_f)  # sent to Gemini; the Pydantic CandidatePlan model is the gate


def _format_errors(exc: ValidationError) -> list[str]:
    return [
        f"${''.join(f'[{p}]' if isinstance(p, int) else f'.{p}' for p in e['loc'])}: {e['msg']}"
        for e in exc.errors()
    ]


def validate_schema(plan) -> list[str]:
    """Pydantic validation of the CandidatePlan contract; [] means valid."""
    try:
        CandidatePlan.model_validate(plan)
    except ValidationError as e:
        return _format_errors(e)
    return []


def check_grounding(plan: dict, dataset: dict, *, check_hours: bool = True) -> list[str]:
    """Every placeId must exist in the dataset, times must not overlap, and cost
    value + status must agree with the curated dataset (not with the model's opinion).

    M3 checks known dataset opening-hour boundaries. Full duration, budget and real-world feasibility remain with M4."""
    dest_ids = valid_destination_ids(dataset)
    if not dest_ids:
        return ["No valid destination IDs available for grounding"]
    if plan["destinationId"] not in dest_ids:
        return [f"unknown destinationId {plan['destinationId']}"]
    places = {p["id"]: p for p in [*dataset.get("attractions", []), *dataset.get("dining", [])]}
    kind = {**{p["id"]: "dining" for p in dataset.get("dining", [])}, **{p["id"]: "sightseeing" for p in dataset.get("attractions", [])}}
    matrix = {}
    for leg in dataset.get("travelMatrix", dataset.get("travel_matrix", [])):
        pair = (leg.get("from"), leg.get("to"))
        reference = route_reference(dataset, *pair)
        matrix[pair] = reference or {
            "durationMin": None, "distanceKm": None,
        }
    errs: list[str] = []
    # Explicit dataset relationships are authoritative; absent mappings are not guessed.
    for day in plan["days"]:
        used_ids = {a["placeId"] for a in day["activities"]}
        used_ids.update(pid for leg in day["travelLegs"]
                        for pid in (leg["fromPlaceId"], leg["toPlaceId"]))
        for pid in sorted(used_ids):
            place = places.get(pid)
            if place and "destinationId" in place:
                if place["destinationId"] != plan["destinationId"]:
                    errs.append(f"placeId {pid} does not belong to destinationId {plan['destinationId']}")
    for d in plan["days"]:
        acts = sorted(d["activities"], key=lambda a: a["startTime"])
        for i, a in enumerate(acts):
            day = d["dayNumber"]
            if a["placeId"] not in places:
                errs.append(f"day {day}: unknown placeId {a['placeId']}")
            if a["startTime"] >= a["endTime"]:
                errs.append(f"day {day}: {a['activityId']} ends before it starts")
            if i > 0 and acts[i - 1]["endTime"] > a["startTime"]:
                errs.append(f"day {day}: {a['activityId']} overlaps previous")
            if a["estimatedCostVnd"] is None and a["costStatus"] == "KNOWN":
                errs.append(f"{a['activityId']}: null cost marked KNOWN")
            pl = places.get(a["placeId"])
            if pl:
                if check_hours:
                    hours_error = check_activity_hours(a, pl)
                    if hours_error:
                        errs.append(hours_error)
                if kind[a["placeId"]] != a["type"]:
                    errs.append(f"{a['activityId']}: type {a['type']} does not match place {a['placeId']} ({kind[a['placeId']]})")
                price = pl.get("priceVnd", pl.get("avgPricePerPersonVnd"))
                if price is not None and a["costStatus"] != "NO_DATA" and a["estimatedCostVnd"] != price:
                    errs.append(f"{a['activityId']}: cost {a['estimatedCostVnd']} != dataset price {price} for {a['placeId']}")
                if price is None and (a["estimatedCostVnd"] is not None or a["costStatus"] != "NO_DATA"):
                    errs.append(f"{a['activityId']}: dataset has no price for {a['placeId']}; must be null/NO_DATA")
                if price is not None and a["costStatus"] == "KNOWN" and re.search("UNVERIFIED", pl.get("source") or "", re.I):
                    errs.append(f"{a['activityId']}: source of {a['placeId']} is unverified; status must be UNVERIFIED")
        errs.extend(_check_travel_legs(d, places, matrix))
    return errs


def _check_travel_legs(day: dict, places: dict, matrix: dict) -> list[str]:
    """Legs may only join supported places; durations/distances must equal the dataset values
    (null when the dataset has none) - the LLM must not invent travel times."""
    errs = []
    for leg in day["travelLegs"]:
        f, t = leg["fromPlaceId"], leg["toPlaceId"]
        for pid in (f, t):
            if pid not in places:
                errs.append(f"day {day['dayNumber']}: travel leg uses unknown placeId {pid}")
        ref = matrix.get((f, t)) or {}
        for key in ("durationMin", "distanceKm"):
            expected = ref.get(key)
            if leg[key] != expected:
                errs.append(f"day {day['dayNumber']}: travel leg {f}->{t} {key} must be {expected} per dataset, got {leg[key]}")
    return errs


def generate_candidate(
        request: dict,
        dataset: dict | None = None,
        *,
        previous_plans: list[dict] | None = None,
        check_hours: bool = True, **client_kwargs,
    ) -> dict:
    """Return a schema-valid, dataset-grounded candidate plan (still UNVERIFIED).

    `dataset` defaults to the M2 repository. `client_kwargs` go to gemini_client.request_text
    (api_key, model, timeout_s, max_retries, client, sleep) - `client` is used by tests.
    """
    dataset = load_dataset() if dataset is None else dataset
    context = build_context(request, dataset)
    if not valid_destination_ids(context):
        raise GeminiError(
            "NO_DATA", "The selected destination is not supported by the current dataset.", 422
        )
    if not supported_place_ids(context):  # never ask the LLM to plan without real places: it would invent them
        raise GeminiError("NO_DATA", "No supported places in the curated dataset for this request", 422)
    text = request_text(
        build_prompt(request, context, previous_plans=previous_plans),
        CANDIDATE_PLAN_SCHEMA,
        **client_kwargs,
    )

    try:
        raw = json.loads(text)
    except ValueError:
        raise GeminiError("MALFORMED", "Model output is not valid JSON") from None

    try:
        plan = CandidatePlan.model_validate(raw).model_dump()  # Pydantic gate: only contract fields survive
    except ValidationError as e:
        raise GeminiError("INVALID_PLAN", "Plan failed schema/grounding checks", 422, _format_errors(e)) from None

    errors = check_grounding(plan, context, check_hours=check_hours)  # M4 checks opening hours
    if errors:
        raise GeminiError("INVALID_PLAN", "Plan failed schema/grounding checks", 422, errors)
    return plan



def _candidate_signature(plan: dict) -> tuple:
    """Identify a plan by its ordered places on each day."""

    return tuple(
        (
            day["dayNumber"],
            tuple(
                activity["placeId"]
                for activity in sorted(
                    day["activities"],
                    key=lambda a: a["startTime"],
                )
            ),
        )
        for day in sorted(
            plan["days"],
            key=lambda d: d["dayNumber"],
        )
    )




def generate_candidates(
    request: dict,
    dataset: dict | None = None,
    count: int = 3,
    *,
    warnings: list[str] | None = None,
    **client_kwargs,
) -> list[dict]:
    """Generate up to count distinct candidates with bounded attempts."""

    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError("count must be a positive integer")

    dataset = load_dataset() if dataset is None else dataset

    candidates = []
    seen = set()
    max_attempts = count * 3

    for _ in range(max_attempts):
        if len(candidates) == count:
            break

        try:
            plan = generate_candidate(
                request,
                dataset,
                previous_plans=candidates.copy(),
                **client_kwargs,
            )
        except GeminiError as exc:
            if candidates and exc.code in ("MALFORMED", "INVALID_PLAN", "EMPTY"):
                if warnings is not None:
                    warnings.append(f"Candidate generation stopped: {exc.code}")
                break
            raise

        signature = _candidate_signature(plan)

        if signature in seen:
            continue

        seen.add(signature)
        candidates.append(plan)

    if len(candidates) < count and warnings is not None:
        warnings.append(
            f"Only {len(candidates)} distinct candidates generated; "
            f"requested {count}"
        )

    return candidates


def generate_repaired_candidate(
    request: dict,
    previous_plan: dict,
    feedback: list[dict],
    dataset: dict | None = None,
    **client_kwargs,
) -> dict:
    """Generate one corrected candidate from M4 feedback, still UNVERIFIED."""
    if not feedback:
        raise ValueError("feedback must not be empty")

    dataset = load_dataset() if dataset is None else dataset
    context = build_context(request, dataset)

    if not valid_destination_ids(context) or not supported_place_ids(context):
        raise GeminiError("NO_DATA", "No supported planning data for repair", 422)

    text = request_text(
        build_prompt(
            request,
            context,
            repair_plan=previous_plan,
            repair_feedback=feedback,
        ),
        CANDIDATE_PLAN_SCHEMA,
        **client_kwargs,
    )

    try:
        raw = json.loads(text)
    except ValueError:
        raise GeminiError("MALFORMED", "Repair output is not valid JSON") from None

    try:
        plan = CandidatePlan.model_validate(raw).model_dump()
    except ValidationError as exc:
        raise GeminiError(
            "INVALID_PLAN",
            "Repaired plan failed schema checks",
            422,
            _format_errors(exc),
        ) from None

    errors = check_grounding(plan, context, check_hours=False)
    if errors:
        raise GeminiError(
            "INVALID_PLAN",
            "Repaired plan failed grounding checks",
            422,
            errors,
        )

    return plan
