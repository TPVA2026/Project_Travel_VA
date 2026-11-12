
from unittest.mock import patch

import pytest

from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import generate_candidates


def make_plan(place_id: str) -> dict:
    return {
        "days": [
            {
                "dayNumber": 1,
                "activities": [
                    {
                        "placeId": place_id,
                        "startTime": "09:00",
                    }
                ],
            }
        ]
    }


def test_generate_three_distinct_candidates():
    plans = [
        make_plan("place-a"),
        make_plan("place-a"),
        make_plan("place-b"),
        make_plan("place-c"),
    ]

    with patch(
        "app.services.ai.itinerary_generator.generate_candidate",
        side_effect=plans,
    ) as mock_generate:
        result = generate_candidates(
            request={},
            dataset={},
            count=3,
        )

    assert len(result) == 3
    assert mock_generate.call_count == 4


def test_insufficient_distinct_candidates():
    duplicate = make_plan("place-a")
    warnings = []

    with patch(
        "app.services.ai.itinerary_generator.generate_candidate",
        return_value=duplicate,
    ) as mock_generate:
        result = generate_candidates(
            request={},
            dataset={},
            count=3,
            warnings=warnings,
        )

    assert len(result) == 1
    assert mock_generate.call_count == 9
    assert len(warnings) == 1
    assert "Only 1 distinct candidates" in warnings[0]


@pytest.mark.parametrize("count", [0, -1, 1.5, True, "3"])
def test_invalid_candidate_count(count):
    with pytest.raises(ValueError):
        generate_candidates(
            request={},
            dataset={},
            count=count,
        )


@pytest.mark.parametrize(
    "error_code",
    ["TIMEOUT", "NETWORK", "API_ERROR", "EMPTY", "MALFORMED", "INVALID_PLAN"],
)
def test_generate_candidates_propagates_errors(error_code):
    error = GeminiError(error_code, "Gemini generation failed")

    with patch(
        "app.services.ai.itinerary_generator.generate_candidate",
        side_effect=error,
    ) as mock_generate:
        with pytest.raises(GeminiError) as exc:
            generate_candidates(
                request={},
                dataset={},
                count=3,
            )

    assert exc.value.code == error_code
    assert mock_generate.call_count == 1


def test_no_partial_candidates_on_failure():
    first_plan = make_plan("place-a")
    error = GeminiError("TIMEOUT", "Gemini request timed out")

    with patch(
        "app.services.ai.itinerary_generator.generate_candidate",
        side_effect=[first_plan, error],
    ) as mock_generate:
        with pytest.raises(GeminiError) as exc:
            generate_candidates(
                request={},
                dataset={},
                count=3,
            )

    assert exc.value.code == "TIMEOUT"
    assert mock_generate.call_count == 2



def test_candidates_with_different_times_are_duplicates():
    plan_a = make_plan("place-a")
    plan_b = make_plan("place-a")
    plan_b["days"][0]["activities"][0]["startTime"] = "10:00"

    plan_c = make_plan("place-b")
    plan_d = make_plan("place-c")

    with patch(
        "app.services.ai.itinerary_generator.generate_candidate",
        side_effect=[plan_a, plan_b, plan_c, plan_d],
    ) as mock_generate:
        result = generate_candidates(
            request={},
            dataset={},
            count=3,
        )

    assert len(result) == 3
    assert mock_generate.call_count == 4



def test_previous_candidates_are_passed_to_generator():
    plan_a = make_plan("place-a")
    plan_b = make_plan("place-b")
    plan_c = make_plan("place-c")

    with patch(
        "app.services.ai.itinerary_generator.generate_candidate",
        side_effect=[plan_a, plan_b, plan_c],
    ) as mock_generate:
        result = generate_candidates(
            request={},
            dataset={},
            count=3,
        )

    assert len(result) == 3
    assert mock_generate.call_count == 3

    calls = mock_generate.call_args_list

    assert calls[0].kwargs["previous_plans"] == []
    assert calls[1].kwargs["previous_plans"] == [plan_a]
    assert calls[2].kwargs["previous_plans"] == [plan_a, plan_b]



from app.services.ai.prompt_templates import build_prompt


def test_prompt_requests_distinct_candidate():
    previous_plan = make_plan("place-a")

    prompt = build_prompt(
        request={"durationDays": 1},
        dataset={"attractions": []},
        previous_plans=[previous_plan],
    )

    assert "PREVIOUS_CANDIDATE_ROUTES" in prompt
    assert "place-a" in prompt
    assert "DIFFERENT itinerary" in prompt
    assert "Do not merely change activity times" in prompt


def test_first_candidate_prompt_has_no_previous_routes():
    prompt = build_prompt(
        request={"durationDays": 1},
        dataset={"attractions": []},
    )

    assert "TRAVEL_REQUEST" in prompt
    assert "DATASET" in prompt
    assert "PREVIOUS_CANDIDATE_ROUTES" not in prompt


def test_generate_candidates_respects_max_attempts():
    duplicate = make_plan("place-a")
    warnings = []

    with patch(
        "app.services.ai.itinerary_generator.generate_candidate",
        return_value=duplicate,
    ) as mock_generate:
        result = generate_candidates(
            request={},
            dataset={},
            count=3,
            warnings=warnings,
        )

    assert mock_generate.call_count == 9
    assert len(result) == 1
    assert len(warnings) == 1
    assert "Only 1 distinct candidates" in warnings[0]
