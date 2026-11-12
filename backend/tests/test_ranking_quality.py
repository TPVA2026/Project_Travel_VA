from copy import deepcopy

from app.algorithms.quality import evaluate_quality
from app.algorithms.ranking import rank_candidates


def test_repeated_stops_are_soft_warnings(m4_case):
    request, plan, dataset, costs = m4_case
    second = deepcopy(plan["days"][0]["activities"][0])
    second.update(activityId="a3", startTime="11:00", endTime="12:00")
    plan["days"][0]["activities"].append(second)
    before = deepcopy(plan)
    assert any(w["code"] == "REPEATED_PLACE" for w in evaluate_quality(plan)["warnings"])
    assert plan == before


def test_sparse_day_and_explicit_rest(m4_case):
    plan = m4_case[1]
    assert any(w["code"] == "SPARSE_DAY" for w in evaluate_quality(plan)["warnings"])
    report = evaluate_quality(plan, intentional_rest_days=[1])
    assert not any(w["code"] == "SPARSE_DAY" for w in report["warnings"])
    assert report["metrics"]["days"][0]["intentionalRest"]


def test_lunch_timing_warning(m4_case):
    plan = m4_case[1]
    assert any(w["code"] == "LUNCH_TIMING" for w in evaluate_quality(plan)["warnings"])


def test_quality_never_promotes_hard_failure(m4_case):
    request, plan, dataset, costs = m4_case
    plan["days"][0]["activities"][0]["startTime"] = "06:00"
    result = rank_candidates(request, [plan], dataset, {plan["planId"]: costs})
    assert not result["ranked"]
    assert result["excluded"][0]["status"] == "INFEASIBLE"
    assert plan["planId"] in result["quality_report"]
