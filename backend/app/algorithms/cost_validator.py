"""TPVA-23: kiểm tra ngân sách, không quyết định khả thi của toàn lịch trình.

validate_cost_budget: dùng các nhóm chi phí đã quy đổi về tổng tiền cả chuyến.
evaluate_candidate_costs: chuyển TravelRequest/CandidatePlan sang các nhóm đó.
"""

from math import isfinite



REQUIRED_COSTS = ("transport", "accommodation", "dining", "activities")


def _amount(value):
    """Đổi số/chuỗi số thành float; trả None nếu thiếu hoặc không hợp lệ.

    None nghĩa là chưa biết, khác với 0 (đã xác nhận miễn phí).
    Tên bắt đầu bằng _ thể hiện đây là hàm hỗ trợ nội bộ của module.
    """
    # bool là lớp con của int trong Python, nên phải loại trước khi đổi số.
    if isinstance(value, bool) or value is None:
        return None
    if not isinstance(value, (int, float, str)):
        return None
    # try/except bắt lỗi chuyển kiểu để dữ liệu sai không làm chương trình dừng.
    try:
        amount = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    # Biểu thức điều kiện: trả amount nếu điều kiện đúng, ngược lại trả None.
    return amount if isfinite(amount) and amount >= 0 else None



def validate_cost_budget(request: dict, plan: dict) -> dict:
    """Tính chi phí cả chuyến và so với ngân sách dạng số.
    """
    request = request if isinstance(request, dict) else {}
    plan = plan if isinstance(plan, dict) else {}
    # dict.get(key) trả None khi không có key, thay vì phát sinh KeyError.
    budget = _amount(request.get("budget"))
    costs = plan.get("costs")
    costs = costs if isinstance(costs, dict) else {}

    known_total = 0.0
    breakdown = {}
    missing_costs = []

    # for duyệt từng nhóm; list [] lưu khoản thiếu, dict {} lưu kết quả theo tên.
    for category in REQUIRED_COSTS:
        value = costs.get(category)
        if isinstance(value, list):
            category_total = 0.0
            complete = True
            # enumerate cung cấp cả vị trí (bắt đầu từ 0) và phần tử trong list.
            for index, item in enumerate(value):
                if not isinstance(item, dict):
                    # append thêm phần tử; f-string chèn giá trị biến vào chuỗi.
                    missing_costs.append(f"{category}[{index}]")
                    complete = False
                    continue
                amount = _amount(item.get("amount"))
                if amount is None:
                    name = item.get("name")
                    missing_costs.append(name if isinstance(name, str) and name else f"{category}[{index}]")
                    complete = False
                else:
                    category_total += amount  # Tương đương category_total = category_total + amount.
            breakdown[category] = category_total if complete else None
            known_total += category_total
        else:
            amount = _amount(value)
            breakdown[category] = amount
            if amount is None:
                missing_costs.append(category)
            else:
                known_total += amount

    # Các số đầu vào hữu hạn vẫn có thể tràn float khi cộng quá lớn.
    if not isfinite(known_total):
        return {
            "status": "UNVERIFIED", "budget": budget, "known_total": None,
            "total_cost": None, "remaining_budget": None,
            "breakdown": {key: value if value is None or isfinite(value) else None
                          for key, value in breakdown.items()},
            "missing_costs": missing_costs,
            "reasons": ["Cost total exceeds the supported numeric range."],
        }

    if budget is not None and known_total > budget:
        status = "INFEASIBLE"
        reasons = ["Known costs exceed budget."]
    elif budget is None or missing_costs:
        status = "UNVERIFIED"
        reasons = []
        if budget is None:
            reasons.append("Budget is missing or invalid.")
        if missing_costs:
            reasons.append("Required costs are missing or invalid: " + ", ".join(missing_costs))
    else:
        status = "FEASIBLE"
        reasons = []

    total_cost = known_total if not missing_costs else None
    return {
        "status": status,
        "budget": budget,
        "known_total": known_total,
        "total_cost": total_cost,
        "remaining_budget": budget - total_cost if budget is not None and total_cost is not None else None,
        "breakdown": breakdown,
        "missing_costs": missing_costs,
        "reasons": reasons,
    }


def _verified_activity_cost(activity: dict, place: dict, travelers: int):
    """Lấy giá hoạt động từ dataset và quy đổi sang tổng tiền của nhóm.

    Giá AI phải khớp dataset và có trạng thái KNOWN. Không đoán giá từ chuỗi
    như '30k - 70k'. priceVnd cần priceScope rõ ràng; avgPricePerPersonVnd
    đã thể hiện đơn vị theo người ngay trong tên trường.
    """
    if activity["costStatus"] != "KNOWN":
        return None
    # 'in' kiểm tra chuỗi con; lower() chuyển chữ thường để so sánh ổn định.
    if "unverified" in str(place.get("source", "")).lower():
        return None
    if place.get("priceStatus", "KNOWN") not in ("KNOWN", "VERIFIED"):
        return None
    if place.get("priceVnd") is not None:
        price = _amount(place["priceVnd"])
        scope = place.get("priceScope")
    else:
        price = _amount(place.get("avgPricePerPersonVnd"))
        scope = "perPerson"
    proposed = _amount(activity["estimatedCostVnd"])
    if price is None or proposed != price or scope not in ("perPerson", "group"):
        return None
    return price * travelers if scope == "perPerson" else price


def evaluate_candidate_costs(request: dict, plan: dict, dataset: dict,
                             supplemental_costs: dict | None = None) -> dict:
    """Kiểm tra chi phí bằng schema chung TravelRequest và CandidatePlan.

    Pydantic kiểm tra cấu trúc; dữ liệu sai sẽ phát sinh ValidationError để
    bên gọi xử lý. Không gọi AI, không tự đọc file và không sửa đầu vào.
    supplemental_costs chứa transport/accommodation đã xác nhận cho cả nhóm,
    cả chuyến; có thể là số hoặc list {name, amount}. Bỏ qua các nhóm khác
    để không ghi đè giá hoạt động đã được kiểm chứng từ dataset.
    'dict | None' nghĩa là có thể truyền dictionary hoặc None; '= None'
    cho phép bỏ qua đối số này khi gọi hàm.
    """
    # Import trong hàm: validator độc lập phía trên không cần tải Pydantic.
    from app.schemas.candidate_plan import CandidatePlan
    from app.schemas.travel_request import TravelRequest

    travel_request = TravelRequest.model_validate(request)
    candidate = CandidatePlan.model_validate(plan).model_dump()
    travelers = travel_request.travelers.count
    budget = travel_request.budget.amount
    if travel_request.budget.scope == "perPerson":
        budget *= travelers  # Ngân sách theo người -> ngân sách cả nhóm.

    supplemental_costs = supplemental_costs or {}
    costs = {
        "transport": supplemental_costs.get("transport"),
        "accommodation": supplemental_costs.get("accommodation"),
        "dining": [],
        "activities": [],
    }
    # Bảng tra cứu dùng tuple (loại, id) làm key để không nhầm loại địa điểm.
    places = {}
    for collection, kind in (("attractions", "sightseeing"), ("dining", "dining")):
        for place in dataset.get(collection, []):
            if isinstance(place, dict) and isinstance(place.get("id"), str):
                places[(kind, place["id"])] = place

    estimates, evidence = [], []
    for day in candidate["days"]:
        for activity in day["activities"]:
            category = "dining" if activity["type"] == "dining" else "activities"
            place = places.get((activity["type"], activity["placeId"]), {})
            costs[category].append({
                "name": activity["activityId"],
                "amount": _verified_activity_cost(activity, place, travelers),
            })
            evidence.append({"activityId": activity["activityId"],
                             "category": category, "currency": "VND",
                             "scope": place.get("priceScope", "perPerson" if "avgPricePerPersonVnd" in place else None),
                             "source": place.get("source"),
                             "knownGroupAmountVnd": costs[category][-1]["amount"]})
            price_range = place.get("priceRangeVnd")
            if isinstance(price_range, dict):
                low, high = _amount(price_range.get("min")), _amount(price_range.get("max"))
                scope = price_range.get("scope", place.get("priceScope"))
                source = price_range.get("source", place.get("source"))
                if low is not None and (high is None or high >= low) and isinstance(source, str) and source.strip():
                    factor = travelers if scope == "perPerson" else 1
                    estimates.append({"activityId": activity["activityId"], "category": category,
                                      "minVnd": low * factor, "maxVnd": high * factor if high is not None else None,
                                      "scope": "group" if scope in ("perPerson", "group") else scope,
                                      "originalScope": scope, "source": source, "currency": "VND"})

    # Không có hoạt động của một nhóm không chứng minh cả chuyến không tốn tiền.
    for category in ("dining", "activities"):
        if not costs[category]:
            costs[category] = None
    result = validate_cost_budget({"budget": budget}, {"costs": costs})
    result["estimatedRanges"] = estimates
    result["costEvidence"] = evidence
    from app.services.hue_cost_projection import project_hue_costs
    projection = project_hue_costs(travel_request.model_dump(mode="json", by_alias=True), candidate, dataset, result)
    if projection is not None:
        result["projection"] = projection
    return result


def trusted_supplemental_costs(request, plan, dataset):
    """Resolve server quotes bound to this exact request and plan revision.

    Only transport/accommodation group totals in VND are accepted. Client/AI
    fields are not read. Legacy direct internal function arguments stay valid.
    """
    records = dataset.get("supplementalCostQuotes", [])
    if not isinstance(records, list):
        return {}
    matching = [row for row in records if isinstance(row, dict)
                and row.get("request") == request and row.get("plan") == plan]
    if len(matching) != 1:
        return {}
    result = {}
    quote_costs = matching[0].get("costs")
    if not isinstance(quote_costs, dict):
        return {}
    for category in ("transport", "accommodation"):
        record = quote_costs.get(category)
        if (isinstance(record, dict) and record.get("evidenceStatus") == "VERIFIED"
                and record.get("currency") == "VND" and record.get("scope") == "group"
                and isinstance(record.get("source"), str) and record["source"].strip()
                and "unverified" not in record["source"].casefold()):
            amount = _amount(record.get("amount"))
            if amount is not None:
                result[category] = amount
    return result
