
from collections import Counter

from app.services.data_service import load_dataset


def check_duplicate_ids():
    data = load_dataset()

    attractions = data["attractions"]
    restaurants = data["dining"]

    # Lấy danh sách ID của từng dataset
    attraction_ids = [place["id"] for place in attractions]
    restaurant_ids = [place["id"] for place in restaurants]

    # Kiểm tra ID trùng giữa hai dataset
    common_ids = set(attraction_ids) & set(restaurant_ids)

    # Kiểm tra ID trùng trong từng dataset
    duplicate_attractions = {
        place_id
        for place_id, count in Counter(attraction_ids).items()
        if count > 1
    }

    duplicate_restaurants = {
        place_id
        for place_id, count in Counter(restaurant_ids).items()
        if count > 1
    }

    print("=== DATASET ID VALIDATION ===")
    print(f"Attractions: {len(attractions)}")
    print(f"Restaurants: {len(restaurants)}")

    print("\n1. Duplicate IDs across datasets:")
    if common_ids:
        for place_id in sorted(common_ids):
            attraction_names = [
                place["name"] for place in attractions
                if place["id"] == place_id
            ]
            restaurant_names = [
                place["name"] for place in restaurants
                if place["id"] == place_id
            ]

            print(f"\nID: {place_id}")
            print(f"  Attractions: {attraction_names}")
            print(f"  Restaurants: {restaurant_names}")
    else:
        print("No duplicates found.")

    print("\n2. Duplicate IDs within attractions:")
    print(sorted(duplicate_attractions) or "None")

    print("\n3. Duplicate IDs within restaurants:")
    print(sorted(duplicate_restaurants) or "None")

    total_duplicates = (
        common_ids
        | duplicate_attractions
        | duplicate_restaurants
    )

    print("\n=== RESULT ===")
    if total_duplicates:
        print(f"FAILED: {len(total_duplicates)} duplicate ID values found.")
        return False

    print("PASSED: All place IDs are unique.")
    return True


if __name__ == "__main__":
    success = check_duplicate_ids()
    raise SystemExit(0 if success else 1)
