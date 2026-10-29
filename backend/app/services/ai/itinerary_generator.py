"""Generate + validate a candidate itinerary (M3).

The LLM only PROPOSES a plan. Output stays UNVERIFIED: only M4's deterministic
checks (/itineraries/evaluate) may mark it FEASIBLE.
"""
import json
import re
from pathlib import Path

from pydantic import ValidationError

from app.schemas.candidate_plan import CandidatePlan
from app.services.ai.context_builder import build_context, supported_place_ids
from app.services.ai.gemini_client import GeminiError, request_text
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


def check_grounding(plan: dict, dataset: dict) -> list[str]:
    """Every placeId must exist in the dataset, times must not overlap, and cost
    value + status must agree with the curated dataset (not with the model's opinion).

    Opening hours / durations / budget are feasibility rules and stay with M4."""
    places = {p["id"]: p for p in [*dataset.get("attractions", []), *dataset.get("dining", [])]}
    kind = {**{p["id"]: "dining" for p in dataset.get("dining", [])}, **{p["id"]: "sightseeing" for p in dataset.get("attractions", [])}}
    matrix = {(l["from"], l["to"]): l for l in dataset.get("travelMatrix", dataset.get("travel_matrix", []))}
    errs: list[str] = []
    dest_ids = {d["id"] for d in dataset.get("destinations", []) if isinstance(d, dict) and "id" in d}
    if dest_ids and plan["destinationId"] not in dest_ids:
        errs.append(f"unknown destinationId {plan['destinationId']}")
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


def generate_candidate(request: dict, dataset: dict | None = None, **client_kwargs) -> dict:
    """Return a schema-valid, dataset-grounded candidate plan (still UNVERIFIED).

    `dataset` defaults to the M2 repository. `client_kwargs` go to gemini_client.request_text
    (api_key, model, timeout_s, max_retries, client, sleep) - `client` is used by tests.
    """
    dataset = load_dataset() if dataset is None else dataset
    context = build_context(request, dataset)
    if not supported_place_ids(context):  # never ask the LLM to plan without real places: it would invent them
        raise GeminiError("NO_DATA", "No supported places in the curated dataset for this request", 422)
    text = request_text(build_prompt(request, context), CANDIDATE_PLAN_SCHEMA, **client_kwargs)

    try:
        raw = json.loads(text)
    except ValueError:
        raise GeminiError("MALFORMED", "Model output is not valid JSON") from None

    try:
        plan = CandidatePlan.model_validate(raw).model_dump()  # Pydantic gate: only contract fields survive
    except ValidationError as e:
        raise GeminiError("INVALID_PLAN", "Plan failed schema/grounding checks", 422, _format_errors(e)) from None

    errors = check_grounding(plan, context)  # grounding needs a schema-valid plan
    if errors:
        raise GeminiError("INVALID_PLAN", "Plan failed schema/grounding checks", 422, errors)
    return plan
