from math import isfinite


INTEREST_TYPES = ("sightseeing", "culture", "nature", "relaxation")


def _interest_weights(interests):
    """Đổi priority 1/2/3/4 thành trọng số 4/3/2/1, mục trùng lấy mức cao nhất."""
    if interests is None:
        return {}
    if not isinstance(interests, list):
        raise ValueError("interests must be a list")
    weights = {}
    for interest in interests:
        if isinstance(interest, str):
            kind, priority = interest, None
        elif isinstance(interest, dict):
            kind, priority = interest.get("type"), interest.get("priority")
        else:
            raise ValueError("each interest must be a string or dictionary")
        if kind not in INTEREST_TYPES:
            raise ValueError("unsupported interest type")
        if priority is None:
            weight = 1
        else:
            # bool là lớp con của int nên phải loại riêng.
            if isinstance(priority, bool) or not isinstance(priority, int) or not 1 <= priority <= 4:
                raise ValueError("priority must be an integer from 1 to 4")
            weight = 5 - priority
        weights[kind] = max(weights.get(kind, 0), weight)
    return weights


def _tag_set(plan_tags):
    """Kiểm tra list nhãn rồi đổi thành set để nhãn trùng chỉ xuất hiện một lần.

    None nghĩa là thiếu dữ liệu; [] nghĩa là đã biết danh sách nhãn rỗng.
    """
    if not isinstance(plan_tags, list) or any(not isinstance(tag, str) or not tag for tag in plan_tags):
        raise ValueError("plan_tags must be a list of nonempty strings")
    return set(plan_tags)


def filter_feasible(results):
    """Lọc kết quả FEASIBLE từ bộ đánh giá, không dùng trạng thái do AI cung cấp.

    Hàm này nhận kết quả nội bộ đã tin cậy. Pipeline dùng rank_candidates để
    tự tính lại trạng thái thay vì nhận cờ FEASIBLE từ người gọi bên ngoài.
    """
    if not isinstance(results, list) or any(not isinstance(item, dict) for item in results):
        raise ValueError("results must be a list of dictionaries")
    feasible = []
    for result in results:
        if result.get("status") == "FEASIBLE":
            feasible.append(result.copy())  # append cần phần tử muốn thêm.
    return feasible


def count_matching_interests(interests, plan_tags):
    """Đếm loại sở thích khớp, không đếm lại nhãn hoặc sở thích trùng."""
    weights = _interest_weights(interests)
    tags = _tag_set(plan_tags)
    count = 0
    for kind in weights:
        if kind in tags:
            count += 1
    return count


def calculate_preference_score(interests, plan_tags):
    """P hiện tại trong 0–1: trọng số sở thích khớp / tổng trọng số yêu cầu."""
    weights = _interest_weights(interests)
    if not weights:
        return 0.0
    if plan_tags is None:
        return None
    tags = _tag_set(plan_tags)
    matched_weight = 0
    for kind, weight in weights.items():
        if kind in tags:
            matched_weight += weight
    # Không làm tròn ở đây để không đảo thứ tự các điểm gần nhau.
    return matched_weight / sum(weights.values())


def _unit_score(value, name):
    """Xác nhận điểm thuộc 0–1; None biểu thị dữ liệu thiếu, không phải điểm 0."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
        raise ValueError(f"{name} must be a finite number from 0 to 1")
    return value


def _nonnegative_number(value):
    """Đọc số đo đã xác minh, từ chối bool, số âm, NaN, vô cực và chuỗi số."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        return None
    if isinstance(value, float) and not isfinite(value):
        return None
    return value


def build_history_profile(selected_history=None):
    """Suy trọng số tag và alpha từ các lịch từng chọn có nhãn đáng tin cậy.

    Mỗi record có planId và interestTags. Chỉ đếm planId khác nhau, nhãn hợp lệ,
    không rỗng và nguồn không ghi UNVERIFIED. Mỗi tag tính một lần trong một lịch.
    selected_history phải được lấy từ lịch sử đúng người dùng ở backend.
    """
    if selected_history is None:
        selected_history = []
    if not isinstance(selected_history, list):
        raise ValueError("selected_history must be a list")
    seen, weights = set(), {}
    for record in selected_history:
        if not isinstance(record, dict):
            continue
        plan_id, tags = record.get("planId"), record.get("interestTags")
        if not isinstance(plan_id, str) or not plan_id or plan_id in seen:
            continue
        if (not isinstance(tags, list) or not tags
                or any(tag not in INTEREST_TYPES for tag in tags)
                or "unverified" in str(record.get("source", "")).lower()):
            continue
        seen.add(plan_id)
        for tag in set(tags):
            weights[tag] = weights.get(tag, 0) + 1
    count = len(seen)
    alpha = 0.0 if count == 0 else (0.1 if count <= 2 else 0.2)
    return {"usablePlanCount": count, "alpha": alpha, "weights": weights}


def _history_score(profile, plan_tags):
    """P lịch sử: phần trọng số tag lịch sử được kế hoạch mới đáp ứng."""
    weights = profile["weights"]
    if not weights or plan_tags is None:
        return None
    tags = _tag_set(plan_tags)
    return sum(weight for tag, weight in weights.items() if tag in tags) / sum(weights.values())


def calculate_personalized_preference(current_score, history_score=None, alpha=0.0):
    """P cá nhân hóa = (1-alpha) * P hiện tại + alpha * P lịch sử."""
    current_score = _unit_score(current_score, "current_score")
    history_score = _unit_score(history_score, "history_score")
    if isinstance(alpha, bool) or alpha not in (0.0, 0.1, 0.2):
        raise ValueError("alpha must be 0, 0.1 or 0.2")
    if current_score is None:
        return None
    if alpha == 0:
        return current_score  # Không có lịch sử thì không cần P lịch sử.
    if history_score is None:
        return None
    return (1 - alpha) * current_score + alpha * history_score


def calculate_cost_score(total_cost, trip_budget):
    """C = clamp(1 - chi phí/ngân sách, 0, 1), dùng tiền cả nhóm/cả chuyến.

    Ngân sách bằng 0 khiến tỷ lệ không xác định, nên trả None thay vì đoán điểm.
    Hàm không thay thế kiểm tra ngân sách bắt buộc trước khi xếp hạng.
    """
    total_cost = _nonnegative_number(total_cost)
    trip_budget = _nonnegative_number(trip_budget)
    if total_cost is None or trip_budget is None or trip_budget == 0:
        return None
    return max(0.0, min(1.0, 1 - total_cost / trip_budget))


def calculate_travel_score(total_minutes, trip_time_limit_minutes=None,
                           min_minutes=None, max_minutes=None):
    """T: tỷ lệ còn lại so với giới hạn cả chuyến, hoặc min–max trong cùng lượt.

    Không có giới hạn và mọi lịch cùng thời gian -> 0.5. min/max chỉ lấy từ
    các lịch FEASIBLE đã đủ dữ liệu cho mọi thành phần chấm điểm.
    """
    total_minutes = _nonnegative_number(total_minutes)
    if total_minutes is None:
        return None
    if trip_time_limit_minutes is not None:
        limit = _nonnegative_number(trip_time_limit_minutes)
        if limit is None or limit == 0:
            return None
        return max(0.0, min(1.0, 1 - total_minutes / limit))
    minimum, maximum = _nonnegative_number(min_minutes), _nonnegative_number(max_minutes)
    if minimum is None or maximum is None or minimum > maximum:
        return None
    if maximum == minimum:
        return 0.5
    return max(0.0, min(1.0, (maximum - total_minutes) / (maximum - minimum)))


def calculate_total_score(personalized_preference, cost_score, travel_score):
    """S = 0.45 * P cá nhân hóa + 0.30 * C + 0.25 * T; kết quả thuộc 0–1."""
    preference = _unit_score(personalized_preference, "personalized_preference")
    cost = _unit_score(cost_score, "cost_score")
    travel = _unit_score(travel_score, "travel_score")
    if preference is None or cost is None or travel is None:
        return None
    return 0.45 * preference + 0.30 * cost + 0.25 * travel


def sort_scored_plans(scored_plans):
    """Sắp điểm giảm dần, bằng điểm giữ thứ tự ban đầu; không sửa list đầu vào."""
    if not isinstance(scored_plans, list):
        raise ValueError("scored_plans must be a list")
    for item in scored_plans:
        score = item.get("score") if isinstance(item, dict) else None
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            raise ValueError("each score must be a number from 0 to 1")
        if not 0 <= score <= 1 or not isfinite(score):
            raise ValueError("each score must be a finite number from 0 to 1")
    # sorted phải được return. lambda chọn field để so sánh; reverse đảo giảm dần.
    return sorted([item.copy() for item in scored_plans],
                  key=lambda item: item["score"], reverse=True)


def _verified_travel_minutes(evaluation):
    """Cộng phút từ dailyTotals đã đối chiếu dataset, không dùng số AI trực tiếp."""
    days = (evaluation.get("components") or {}).get("travel", {}).get("dailyTotals")
    if not isinstance(days, list) or not days:
        return None
    total = 0
    for day in days:
        minutes = _nonnegative_number(day.get("durationMin")) if isinstance(day, dict) else None
        if minutes is None:
            return None
        total += minutes
    return _nonnegative_number(total)


def _score_feasible(evaluations, interests, tags_by_plan, profile, trip_time_limit_minutes,
                    history_tags_by_plan=None):
    """Lọc điều kiện trước, lập tập đủ dữ liệu rồi mới chuẩn hóa T theo tập đó."""
    if not isinstance(tags_by_plan, dict):
        raise ValueError("tags_by_plan must be a dictionary")
    if trip_time_limit_minutes is not None:
        limit = _nonnegative_number(trip_time_limit_minutes)
        if limit is None or limit == 0:
            raise ValueError("trip_time_limit_minutes must be finite and positive")
    weights = _interest_weights(interests)
    feasible = filter_feasible(evaluations)
    seen = set()
    eligible, unscored, excluded = [], [], []
    for evaluation in feasible:
        plan_id = evaluation.get("planId")
        if not isinstance(plan_id, str) or not plan_id or plan_id in seen:
            raise ValueError("feasible evaluations need unique nonempty planId values")
        seen.add(plan_id)
        minutes = _verified_travel_minutes(evaluation)
        if trip_time_limit_minutes is not None and minutes is not None and minutes > trip_time_limit_minutes:
            excluded.append({"planId": plan_id, "status": "INFEASIBLE", "reasons": [{
                "status": "INFEASIBLE", "code": "TRIP_TIME_LIMIT", "path": "trip_time_limit_minutes",
                "message": "Tổng phút di chuyển vượt giới hạn cả chuyến.",
            }]})
            continue
        tags = tags_by_plan.get(plan_id)
        current = calculate_preference_score(interests, tags)
        history_tags = tags if history_tags_by_plan is None else history_tags_by_plan.get(plan_id)
        historical = _history_score(profile, history_tags)
        personal = calculate_personalized_preference(current, historical, profile["alpha"])
        cost_data = (evaluation.get("components") or {}).get("cost") or {}
        cost = calculate_cost_score(cost_data.get("total_cost"), cost_data.get("budget"))
        components = {"P_current": current, "P_history": historical,
                      "alpha": profile["alpha"], "P_personalized": personal,
                      "C": cost, "T": None}
        missing = []
        if current is None:
            missing.append("P_current")
        if profile["alpha"] > 0 and historical is None:
            missing.append("P_history")
        if cost is None:
            missing.append("C")
        if minutes is None:
            missing.append("T")
        tag_set = _tag_set(tags) if tags is not None else set()
        item = {
            "planId": plan_id, "score": None, "score100": None,
            "matchedInterests": [kind for kind in weights if kind in tag_set],
            "components": components, "usableHistoryCount": profile["usablePlanCount"],
        }
        if missing:
            item.update(status="FEASIBLE", scoringStatus="UNVERIFIED", missingComponents=missing)
            unscored.append(item)
        else:
            eligible.append((item, minutes))
    times = [minutes for _, minutes in eligible]
    minimum = min(times) if times else None
    maximum = max(times) if times else None
    for item, minutes in eligible:
        components = item["components"]
        components["T"] = calculate_travel_score(
            minutes, trip_time_limit_minutes, minimum, maximum,
        )
        item["score"] = calculate_total_score(components["P_personalized"], components["C"], components["T"])
        item["score100"] = item["score"] * 100  # Chỉ đổi thang để hiển thị.
        item["scoringStatus"] = "SCORED"
    return {"ranked": sort_scored_plans([item for item, _ in eligible]),
            "unscored": unscored, "excluded": excluded}


def rank_plans(evaluations, interests, tags_by_plan, selected_history=None,
               trip_time_limit_minutes=None):
    """Xếp kết quả nội bộ đã xác minh theo S; pipeline bên ngoài dùng rank_candidates.

    evaluations cần components.cost.total_cost/budget và travel.dailyTotals.
    Không dùng các cờ FEASIBLE nhận trực tiếp từ client/AI.
    """
    profile = build_history_profile(selected_history)
    return _score_feasible(evaluations, interests, tags_by_plan, profile,
                           trip_time_limit_minutes)["ranked"]


def _candidate_tags(plan, dataset, interests):
    """Lấy nhãn từ attractions đã xác minh; không suy nhãn từ tên/reason của AI.

    Loại sightseeing lấy từ collection attractions. Các nhãn culture/nature/
    relaxation đọc ở metadata interestTags. Thiếu nhãn cần thiết -> trả None.
    Chỉ chấm sở thích tham quan; không suy sở thích ăn uống từ nhà hàng.
    """
    weights = _interest_weights(interests)
    tags = set()
    missing = []
    places = {}
    duplicate_ids = set()
    for place in dataset.get("attractions", []):
        place_id = place.get("id")
        if place_id in places:
            duplicate_ids.add(place_id)
        places[place_id] = place
    for day in plan["days"]:
        for activity in day["activities"]:
            if activity["type"] != "sightseeing":
                continue
            place_id = activity["placeId"]
            place = places.get(place_id)
            if place is None or place_id in duplicate_ids or "unverified" in str(place.get("source", "")).lower():
                missing.append(place_id)
                continue
            tags.add("sightseeing")
            if any(kind != "sightseeing" for kind in weights):
                raw_tags = place.get("interestTags")
                if (not isinstance(raw_tags, list)
                        or any(tag not in INTEREST_TYPES for tag in raw_tags)):
                    missing.append(place_id)
                    continue
                tags.update(raw_tags)
    return (None if missing else sorted(tags)), list(dict.fromkeys(missing))


def rank_candidates(request: dict, plans: list, dataset: dict | None = None,
                    supplemental_costs_by_plan: dict | None = None,
                    selected_history: list | None = None,
                    trip_time_limit_minutes: float | None = None,
                    evaluations_by_plan_id: dict | None = None) -> dict:
    """Điểm vào an toàn cho M6: đánh giá lại rồi mới xếp hạng CandidatePlan.

    supplemental_costs_by_plan ánh xạ planId -> chi phí cả chuyến đã xác nhận.
    evaluations_by_plan_id chỉ dành cho kết quả M4 do planning service vừa tạo;
    API không nhận trường này từ client hoặc Gemini.
    selected_history chứa các lịch đã chọn và tag đã kiểm chứng của đúng user.
    trip_time_limit_minutes là giới hạn cho cả chuyến; không tự biến giới hạn
    daily/betweenActivities/fromDeparture thành giới hạn cả chuyến.
    Trả ranked, unscored (khả thi nhưng thiếu điểm thành phần), excluded.
    Không sửa đầu vào, không nhận điểm/trạng thái AI, không gọi dịch vụ AI.
    """
    from app.algorithms.feasibility import evaluate_feasibility
    from app.schemas.travel_request import TravelRequest

    request = TravelRequest.model_validate(request).model_dump(mode="json", by_alias=True)
    if not isinstance(plans, list) or any(not isinstance(plan, dict) for plan in plans):
        raise ValueError("plans must be a list of CandidatePlan dictionaries")
    plan_ids = [plan.get("planId") for plan in plans]
    if any(not isinstance(value, str) or not value for value in plan_ids):
        raise ValueError("each plan needs a nonempty planId")
    if len(set(plan_ids)) != len(plan_ids):
        raise ValueError("planId values must be unique")
    if dataset is None:
        from app.services.data_service import load_dataset
        dataset = load_dataset()
    supplemental_costs_by_plan = supplemental_costs_by_plan or {}
    if not isinstance(supplemental_costs_by_plan, dict):
        raise ValueError("supplemental_costs_by_plan must be a dictionary")
    if evaluations_by_plan_id is not None and not isinstance(evaluations_by_plan_id, dict):
        raise ValueError("evaluations_by_plan_id must be a dictionary")
    interests = (request.get("preferences") or {}).get("interests", [])
    profile = build_history_profile(selected_history)
    evaluations, tags_by_plan, history_tags_by_plan, missing_by_plan, excluded = [], {}, {}, {}, []
    for plan in plans:
        plan_id = plan["planId"]
        if evaluations_by_plan_id is None:
            evaluation = evaluate_feasibility(
                request, plan, dataset, supplemental_costs_by_plan.get(plan_id),
            )
        else:
            evaluation = evaluations_by_plan_id.get(plan_id)
            if (not isinstance(evaluation, dict)
                    or evaluation.get("planId") != plan_id
                    or evaluation.get("status") not in {"FEASIBLE", "INFEASIBLE", "UNVERIFIED"}):
                raise ValueError("each plan needs a matching trusted evaluation")
        if evaluation["status"] != "FEASIBLE":
            excluded.append({"planId": plan_id, "status": evaluation["status"],
                             "reasons": evaluation["reasons"]})
            continue
        evaluations.append(evaluation)
        tags, missing = _candidate_tags(plan, dataset, interests)
        history_tags, history_missing = _candidate_tags(plan, dataset, list(profile["weights"]))
        tags_by_plan[plan_id] = tags
        history_tags_by_plan[plan_id] = history_tags
        missing_by_plan[plan_id] = list(dict.fromkeys(missing + history_missing))
    result = _score_feasible(evaluations, interests, tags_by_plan, profile,
                             trip_time_limit_minutes, history_tags_by_plan)
    for item in result["unscored"]:
        item["missingTagPlaceIds"] = missing_by_plan[item["planId"]]
    result["excluded"] = excluded + result["excluded"]
    from app.algorithms.quality import evaluate_quality
    from pydantic import ValidationError
    reports = {}
    for plan in plans:
        try:
            reports[plan["planId"]] = evaluate_quality(plan)
        except ValidationError:
            # Invalid candidates retain their feasibility diagnostics.
            reports[plan["planId"]] = {"warnings": [{"code": "QUALITY_INVALID_PLAN"}],
                                        "metrics": None, "score": None}
    result["quality_report"] = reports
    return result
