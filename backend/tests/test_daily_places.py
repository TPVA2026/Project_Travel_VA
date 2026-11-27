from app.services.ai.itinerary_generator import check_daily_places


def make_day(number, places):
    return {
        "dayNumber": number,
        "activities": [
            {"placeId": p, "type": "sightseeing"}
            for p in places
        ],
    }


def test_three_places_rejected():
    plan = {"days": [make_day(1, ["p1", "p2", "p3"])]}
    assert check_daily_places(plan)


def test_four_places_accepted():
    plan = {"days": [make_day(1, ["p1", "p2", "p3", "p4"])]}
    assert check_daily_places(plan) == []


def test_five_places_accepted():
    plan = {"days": [make_day(1, ["p1", "p2", "p3", "p4", "p5"])]}
    assert check_daily_places(plan) == []


def test_duplicate_places_rejected():
    plan = {"days": [make_day(1, ["p1", "p2", "p3", "p3"])]}
    assert check_daily_places(plan)


def test_dining_not_counted():
    day = make_day(1, ["p1", "p2", "p3"])
    day["activities"].append({
        "placeId": "restaurant1",
        "type": "dining",
    })
    assert check_daily_places({"days": [day]})


def test_every_day_must_pass():
    plan = {
        "days": [
            make_day(1, ["p1", "p2", "p3", "p4"]),
            make_day(2, ["p5", "p6", "p7"]),
        ]
    }

    errors = check_daily_places(plan)
    assert len(errors) == 1
    assert "Day 2" in errors[0]
