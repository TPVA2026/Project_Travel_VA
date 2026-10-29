"""M3.1 / M3.3: Pydantic CandidatePlan gate + dataset grounding (no fabricated costs/ids; AI output stays UNVERIFIED)."""
import copy
import json
import math
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from app.schemas.candidate_plan import Activity, CandidatePlan, Day, TravelLeg
from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import CANDIDATE_PLAN_SCHEMA, check_grounding, generate_candidate, validate_schema
from app.services.ai.prompt_templates import SYSTEM_PROMPT
from m3_fakes import ok

FIX = Path(__file__).parent / "fixtures"
load = lambda name: json.loads((FIX / name).read_text(encoding="utf-8"))

sample = load("sample_response.json")["plan"]
live = load("live_demo_output.json")
request = load("travel_request.json")
json_schema = Draft202012Validator(CANDIDATE_PLAN_SCHEMA)

# Dataset with real prices, so cost VALUES (not only statuses) can be checked.
PRICED = {
    "destinations": [{"id": "DN"}],
    "attractions": [{"id": "DN-ATT-001", "name": "a", "durationMin": 60, "priceVnd": 100000, "openHours": None, "source": "M2-VERIFIED"}],
    "dining": [{"id": "DN-DIN-001", "name": "d", "durationMin": 60, "avgPricePerPersonVnd": 50000, "openHours": None, "source": "M2-VERIFIED"}],
    "travel_matrix": [],
}


def act(aid, pid, typ, start, end, cost, status):
    return {"activityId": aid, "placeId": pid, "type": typ, "startTime": start, "endTime": end,
            "estimatedCostVnd": cost, "costStatus": status, "reason": "r"}


def priced_plan(*activities, destination="DN"):
    return {"planId": "P", "title": "t", "destinationId": destination, "missingData": [], "assumptions": [],
            "days": [{"dayNumber": 1, "date": "2026-12-01", "travelLegs": [], "activities": list(activities)}]}


GOOD = priced_plan(act("A1", "DN-ATT-001", "sightseeing", "09:00", "10:00", 100000, "KNOWN"),
                   act("A2", "DN-DIN-001", "dining", "11:00", "12:00", 50000, "KNOWN"))


# ---- Pydantic is the gate ----
@pytest.mark.parametrize("p", [sample, live])
def test_pydantic_accepts_contract_plans_and_roundtrips_unchanged(p):
    assert validate_schema(p) == []
    assert CandidatePlan.model_validate(p).model_dump() == p


def mutate(fn):
    p = copy.deepcopy(sample)
    fn(p)
    return p


ACT0 = lambda p: p["days"][0]["activities"][0]
BAD_PLANS = {
    "missing field": mutate(lambda p: p.pop("title")),
    "extra plan field (AI score)": mutate(lambda p: p.update(score=0.93)),
    "extra plan field (verified flag)": mutate(lambda p: p.update(status="FEASIBLE")),
    "extra activity field": mutate(lambda p: ACT0(p).update(verified=True)),
    "bad time format": mutate(lambda p: ACT0(p).update(startTime="8:30")),
    "bad costStatus": mutate(lambda p: ACT0(p).update(costStatus="VERIFIED")),
    "bad type": mutate(lambda p: ACT0(p).update(type="shopping")),
    "negative cost": mutate(lambda p: ACT0(p).update(estimatedCostVnd=-1, costStatus="UNVERIFIED")),
    "cost as string": mutate(lambda p: ACT0(p).update(estimatedCostVnd="5000", costStatus="UNVERIFIED")),
    "cost as bool": mutate(lambda p: ACT0(p).update(estimatedCostVnd=True, costStatus="UNVERIFIED")),
    "dayNumber 0": mutate(lambda p: p["days"][0].update(dayNumber=0)),
    "no days": mutate(lambda p: p.update(days=[])),
    "negative leg duration": mutate(lambda p: p["days"][0]["travelLegs"][0].update(durationMin=-5)),
}


@pytest.mark.parametrize("name", BAD_PLANS)
def test_pydantic_rejects_what_the_shared_json_schema_rejects(name):
    bad = BAD_PLANS[name]
    assert not json_schema.is_valid(bad)  # the shared contract rejects it ...
    assert validate_schema(bad) != []


def test_pydantic_is_never_looser_than_the_shared_json_schema():
    for bad in BAD_PLANS.values():
        if validate_schema(bad) == []:
            assert json_schema.is_valid(bad)


def test_model_fields_match_the_shared_schema_keys():
    props = CANDIDATE_PLAN_SCHEMA["properties"]
    day = props["days"]["items"]["properties"]
    assert set(CandidatePlan.model_fields) == set(props)
    assert set(Day.model_fields) == set(day)
    assert set(Activity.model_fields) == set(day["activities"]["items"]["properties"])
    assert set(TravelLeg.model_fields) == set(day["travelLegs"]["items"]["properties"])


def test_pydantic_stricter_rules_unknown_cost_is_null_never_zero():
    zero = mutate(lambda p: ACT0(p).update(estimatedCostVnd=0, costStatus="NO_DATA"))
    known_null = mutate(lambda p: ACT0(p).update(estimatedCostVnd=None, costStatus="KNOWN"))
    nan = mutate(lambda p: ACT0(p).update(estimatedCostVnd=math.nan, costStatus="UNVERIFIED"))
    for bad in (zero, known_null, nan):
        assert validate_schema(bad) != []


def test_pydantic_rejects_impossible_date_and_duplicate_activity_ids():
    bad_date = mutate(lambda p: p["days"][0].update(date="2026-02-30"))
    assert json_schema.is_valid(bad_date) and validate_schema(bad_date) != []
    dup = mutate(lambda p: p["days"][1]["activities"][0].update(activityId=p["days"][0]["activities"][0]["activityId"]))
    assert any("duplicate activityId" in e for e in validate_schema(dup))


def test_ai_extra_fields_never_reach_the_caller():
    smuggled = copy.deepcopy(sample)
    smuggled["feasible"] = True
    with pytest.raises(GeminiError) as e:
        generate_candidate(request, load("sample_dataset.json"), api_key="k", client=ok(smuggled))
    assert e.value.code == "INVALID_PLAN" and e.value.status == 422
    assert any("feasible" in x for x in e.value.details)


# ---- grounding: cost VALUES come from the dataset ----
def test_grounding_accepts_costs_copied_from_dataset():
    assert check_grounding(GOOD, PRICED) == []


@pytest.mark.parametrize("fake_cost", [999999, 0, 100001])
def test_grounding_rejects_fabricated_cost_values(fake_cost):
    bad = copy.deepcopy(GOOD)
    bad["days"][0]["activities"][0]["estimatedCostVnd"] = fake_cost
    errs = check_grounding(bad, PRICED)
    assert any("!= dataset price 100000" in e for e in errs)


def test_grounding_rejects_priced_place_claimed_with_null_cost():
    bad = copy.deepcopy(GOOD)
    bad["days"][0]["activities"][0].update(estimatedCostVnd=None, costStatus="UNVERIFIED")
    assert any("!= dataset price" in e for e in check_grounding(bad, PRICED))


def test_grounding_allows_conservative_no_data_for_a_priced_place():
    plan = priced_plan(act("A1", "DN-ATT-001", "sightseeing", "09:00", "10:00", None, "NO_DATA"))
    assert check_grounding(plan, PRICED) == []


def test_grounding_rejects_type_that_does_not_match_the_place():
    bad = priced_plan(act("A1", "DN-DIN-001", "sightseeing", "09:00", "10:00", 50000, "KNOWN"))
    assert any("does not match place DN-DIN-001" in e for e in check_grounding(bad, PRICED))


def test_grounding_rejects_unknown_destination():
    bad = priced_plan(act("A1", "DN-ATT-001", "sightseeing", "09:00", "10:00", 100000, "KNOWN"), destination="ZZ")
    assert any("unknown destinationId ZZ" in e for e in check_grounding(bad, PRICED))


def test_generate_rejects_fabricated_cost_end_to_end():
    bad = copy.deepcopy(GOOD)
    bad["days"][0]["activities"][0]["estimatedCostVnd"] = 1
    with pytest.raises(GeminiError) as e:
        generate_candidate(request, PRICED, api_key="k", client=ok(bad))
    assert e.value.code == "INVALID_PLAN" and any("dataset price" in x for x in e.value.details)


def test_generate_returns_valid_grounded_plan_unchanged():
    assert generate_candidate(request, PRICED, api_key="k", client=ok(GOOD)) == GOOD


def test_prompt_tells_the_model_to_copy_prices_and_add_no_scores():
    assert "EXACTLY" in SYSTEM_PROMPT and "scores" in SYSTEM_PROMPT
