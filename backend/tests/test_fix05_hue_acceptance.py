import json
from copy import deepcopy
from pathlib import Path
from unittest.mock import Mock

from app.services.ai import repair_service
from app.services import planning_service


def test_hue_day2_repair_and_reevaluate(monkeypatch):
    fixture = json.loads(
        (Path(__file__).parent / "fixtures" / "acceptance" / "hue_scenarios.json")
        .read_text(encoding="utf-8")
    )

    scenario = next(
        item for item in fixture["scenarios"]
        if item["id"] == "S05_attr_h_08_before_opening"
    )

    request = scenario["body"]["request"]
    original = deepcopy(scenario["body"]["plan"])
    repaired = deepcopy(original)

    activity = repaired["days"][1]["activities"][1]
    activity["startTime"] = "09:00"
    activity["endTime"] = "10:00"

    initial_evaluation = planning_service.evaluate_plan(request, original)

    assert initial_evaluation["status"] == "INFEASIBLE"
    assert any(
        item["code"] == "OUTSIDE_OPENING_HOURS"
        and item["path"] == "days.1.activities.1"
        for item in initial_evaluation["reasons"]
    )

    generate = Mock(return_value=deepcopy(original))
    repair = Mock(return_value=deepcopy(repaired))
    evaluate = Mock(wraps=planning_service.evaluate_plan)

    monkeypatch.setattr(repair_service, "generate_candidate", generate)
    monkeypatch.setattr(repair_service, "generate_repaired_candidate", repair)
    monkeypatch.setattr(repair_service, "evaluate_plan", evaluate)

    result = repair_service.generate_with_repair(request)

    assert generate.call_count == 1
    assert repair.call_count == 1
    assert evaluate.call_count == 2

    feedback = repair.call_args.kwargs["feedback"]

    assert any(
        item["code"] == "OUTSIDE_OPENING_HOURS"
        and item["path"] == "days.1.activities.1"
        for item in feedback
    )

    assert result["repairsUsed"] == 1
    assert result["plan"]["days"][1]["activities"][1]["startTime"] == "09:00"

    final = result["evaluation"]

    assert result["status"] == "UNVERIFIED"
    assert final["status"] == "UNVERIFIED"

    assert not any(
        item["code"] == "OUTSIDE_OPENING_HOURS"
        and item["status"] == "INFEASIBLE"
        for item in final["checks"]
    )

    assert any(
        item["code"] == "UNSUPPORTED_LEG"
        and item["path"] == "days.1.travelLegs"
        and item["status"] == "UNVERIFIED"
        for item in final["checks"]
    )

    assert any(
        item["code"] == "TRAVEL_DATA"
        and item["path"] == "days.1.travelLegs"
        and item["status"] == "UNVERIFIED"
        for item in final["checks"]
    )
