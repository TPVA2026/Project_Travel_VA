"""Optional demo estimates, separate from verified cost and feasibility."""

def project_hue_costs(request, plan, dataset, cost):
    if not dataset.get("demoCostPolicy") or plan.get("destinationId") != "H":
        return None
    count = request["travelers"]["count"]
    nights = max(0, request["durationDays"] - 1)
    hotels = [h for h in dataset.get("hotels", []) if h.get("destinationId") == "H"
              and h.get("demoDefault") and h.get("pricePerRoomNightVnd") is not None]
    items, uncovered = [], list(cost.get("missing_costs", []))
    breakdown = cost.get("breakdown", {})
    hotel = hotels[0] if len(hotels) == 1 else None
    if breakdown.get("accommodation") is None:
        if hotel is not None:
            rooms = (count + hotel["capacityAdults"] - 1) // hotel["capacityAdults"]
            items.append({"category": "accommodation", "name": hotel["name"] + " — " + hotel["roomType"],
                          "amountVnd": rooms * nights * hotel["pricePerRoomNightVnd"],
                          "rooms": rooms, "nights": nights, "unitPriceVnd": hotel["pricePerRoomNightVnd"],
                          "sourceUrl": hotel["sourceUrl"], "status": "ESTIMATED",
                          "note": hotel["note"]})
            uncovered = [x for x in uncovered if x != "accommodation"]
    dining = {p["id"]: p for p in dataset.get("dining", [])}
    for day in plan["days"]:
        for activity in day["activities"]:
            if activity["type"] != "dining":
                continue
            # Only replace the missing activity, never count known spend twice.
            if activity["activityId"] not in uncovered:
                continue
            place = dining.get(activity["placeId"], {})
            evidence = place.get("diningEstimateEvidence", {})
            amount = place.get("avgPricePerPersonVnd")
            if amount is None or place.get("priceStatus") != "ESTIMATED":
                continue
            items.append({"category": "dining", "activityId": activity["activityId"],
                          "name": place["name"], "amountVnd": amount * count,
                          "perPersonVnd": amount, "travelers": count,
                          "sourceUrl": evidence.get("sourceUrl"), "status": "ESTIMATED",
                          "note": evidence.get("basis")})
            uncovered.remove(activity["activityId"])
    known = cost.get("known_total")
    subtotal = known + sum(i["amountVnd"] for i in items) if known is not None else None
    return {"status": "ESTIMATED", "currency": "VND", "items": items,
            "subtotalVnd": subtotal, "totalVnd": subtotal if not uncovered else None,
            "uncovered": uncovered,
            "assumptions": ["Midpoint of published ranges is a demo estimate, not a measured mean.",
                            "Only meals scheduled in this plan are counted; a snack may not be a full meal.",
                            "Hotel nights = durationDays - 1; travelers share rooms as adults up to published capacity.",
                            "Hotel from-price is not a dated booking; taxes, surcharges and availability remain unconfirmed.",
                            "Transport from departure is not estimated here. Feasibility and verified totals are unchanged."]}
