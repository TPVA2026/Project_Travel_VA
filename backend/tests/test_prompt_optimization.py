import copy
import json

import pytest

from app.services.ai.prompt_templates import build_prompt


@pytest.mark.parametrize("matrix_key", [
    "travelMatrix",
    "travel_matrix",
])
def test_prompt_removes_only_unknown_legs(matrix_key):
    legs = [
        {
            "from": "A", "to": "B",
            "durationMin": None, "distanceKm": None
        },
        {
            "from": "B", "to": "A",
            "durationMin": 15, "distanceKm": None
        },
        {
            "from": "A", "to": "C",
            "durationMin": None, "distanceKm": 4.5
        },
        {
            "from": "C", "to": "A",
            "durationMin": 0, "distanceKm": None
        },
        {
            "from": "B", "to": "C",
            "durationMin": None, "distanceKm": 0
        },
        {
            "from": "C", "to": "B",
            "durationMin": 10, "distanceKm": 2
        },
    ]

    context = {
        "destinations": [],
        "attractions": [],
        "dining": [],
        matrix_key: legs,
    }

    original = copy.deepcopy(context)

    prompt = build_prompt(
        {"durationDays": 3},
        context
    )

    sent = json.loads(
        prompt.partition("DATASET:\n")[2]
    )

    assert sent["travelMatrix"] == legs[1:]
    assert context == original


def test_prompt_all_unknown_legs():
    context = {
        "travelMatrix": [
            {
                "from": "A",
                "to": "B",
                "durationMin": None,
                "distanceKm": None,
            }
        ]
    }

    prompt = build_prompt({}, context)
    sent = json.loads(
        prompt.partition("DATASET:\n")[2]
    )

    assert sent["travelMatrix"] == []
    assert len(context["travelMatrix"]) == 1


def test_prompt_empty_matrix():
    prompt = build_prompt({}, {})
    sent = json.loads(
        prompt.partition("DATASET:\n")[2]
    )

    assert sent["travelMatrix"] == []
