"""Optional demo estimates, separate from verified cost and feasibility."""

from app.services.destination_resolution import name_key


def _transport_estimate(request, plan, dataset):
    origin = name_key(request.get("departureLocation"))
    if origin is None:
        return None
    aliases = {"plane": "flight", "airplane": "flight"}
    modes = {aliases.get(name_key(m), name_key(m))
             for m in (request.get("preferences") or {}).get("transportation", [])}
    fares = [r for r in dataset.get("transport", [])
             if r.get("destinationId") == plan["destinationId"]
             and origin in {name_key(r.get("from")), name_key(r.get("fromDestinationId"))}
             and (not modes or r.get("kindOfTransport") in modes)
             and r.get("priceStatus") == "ESTIMATED"
             and r.get("currency") == "VND" and r.get("priceScope") == "perPerson"
             and r.get("tripType") == "oneWay" and r.get("passengerType") == "adult"]
    if not fares:
        return None
    fare = min(fares, key=lambda r: (r["price"], r["id"]))
    count = request["travelers"]["count"]
    return {"category": "transport", "name": f'{fare["from"]} → {fare["to"]} ({fare["kindOfTransport"]})',
            "amountVnd": fare["price"] * count, "perPersonVnd": fare["price"], "travelers": count,
            "tripType": "oneWay", "passengerType": "adult", "serviceFeesIncluded": True,
            "status": "ESTIMATED", "sourceUrl": fare.get("sourceUrl"),
            "sourceStatus": fare.get("sourceStatus"), "referenceId": fare["id"],
            "selectionPolicy": "lowest_reference_fare", "excludedCosts": ["terminalTransfers"],
            "note": "Giá cố định MVP, một chiều/người lớn, gồm phí dịch vụ; chưa bổ sung nguồn. "
                    "Chọn giá tham khảo thấp nhất trong các phương tiện phù hợp. "
                    "Không gồm chiều về và trung chuyển đến/rời sân bay, ga, bến xe."}

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
    if "transport" in uncovered and breakdown.get("transport") is None:
        transport = _transport_estimate(request, plan, dataset)
        if transport:
            items.append(transport)
            uncovered.remove("transport")
    subtotal = known + sum(i["amountVnd"] for i in items) if known is not None else None
    return {"status": "ESTIMATED", "currency": "VND", "items": items,
            "subtotalVnd": subtotal, "totalVnd": subtotal if not uncovered else None,
            "uncovered": uncovered,
            "assumptions": ["Midpoint of published ranges is a demo estimate, not a measured mean.",
                            "Only meals scheduled in this plan are counted; a snack may not be a full meal.",
                            "Hotel nights = durationDays - 1; travelers share rooms as adults up to published capacity.",
                            "Hotel from-price is not a dated booking; taxes, surcharges and availability remain unconfirmed.",
                            "MVP transport fares are fixed for all dates, adult per-person, one-way, service fees included.",
                            "The lowest matching reference fare is used; no return fare or terminal transfer is added.",
                            "Transport sources are pending; feasibility and verified totals are unchanged."]}
