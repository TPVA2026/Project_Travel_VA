"""Kiểm tra tính khả thi của lịch trình M4.

Các hàm giờ riêng chỉ kết luận cho phép kiểm tra tương ứng.
evaluate_feasibility tổng hợp ngân sách, giờ mở cửa, lịch và di chuyển.
Các hoạt động được giả định diễn ra cùng ngày, không đi qua nửa đêm.
"""

from math import isfinite


def time_to_minutes(time_text):
    """Đổi chuỗi HH:MM thành số phút từ 00:00; dữ liệu sai trả None.

    Ví dụ: '08:30' -> 510, '00:00' -> 0, '25:00' -> None.
    """
    # isinstance kiểm tra kiểu trước khi gọi phương thức của chuỗi.
    if not isinstance(time_text, str):
        return None

    # split trả về list; len kiểm tra số phần trước khi truy cập [0], [1].
    parts = time_text.split(":")
    if len(parts) != 2:
        return None

    hour_text = parts[0]
    minute_text = parts[1]
    # Chỉ chấp nhận hai chữ số ASCII cho mỗi phần, đúng hợp đồng HH:MM.
    for part in (hour_text, minute_text):
        if len(part) != 2 or not part.isascii() or not part.isdigit():
            return None

    hour = int(hour_text)
    minute = int(minute_text)
    # Python cho phép nối phép so sánh: 0 <= minute <= 59.
    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return hour * 60 + minute
    return None


def validate_activity_time(activity):
    """Kiểm tra một dict hoạt động có giờ bắt đầu nhỏ hơn giờ kết thúc.

    Thiếu/sai giờ -> UNVERIFIED; kết thúc <= bắt đầu -> INFEASIBLE.
    """
    if not isinstance(activity, dict):
        return "UNVERIFIED"

    # get trả None nếu thiếu key, thay vì phát sinh lỗi KeyError.
    start = time_to_minutes(activity.get("startTime"))
    end = time_to_minutes(activity.get("endTime"))
    # Dùng 'is None', không dùng 'if not start': số phút 0 vẫn hợp lệ.
    if start is None or end is None:
        return "UNVERIFIED"
    if end <= start:
        return "INFEASIBLE"
    return "FEASIBLE"


def evaluate_feasibility(request: dict, plan: dict, dataset: dict | None = None,
                         supplemental_costs: dict | None = None) -> dict:
    """Ghép kiểm tra chi phí, lịch và di chuyển cho một CandidatePlan.

    Luôn tính lại từ dữ liệu đầu vào, kể cả khi kế hoạch vừa được chỉnh sửa.
    Không nhận trạng thái/điểm AI làm bằng chứng. Trả status, checks, reasons
    và chi tiết từng bộ kiểm tra trong components; không sửa đầu vào.
    """
    # Import trong hàm tránh vòng lặp: schedule_validator dùng các hàm giờ ở đây.
    from app.algorithms.cost_validator import evaluate_candidate_costs
    from app.algorithms.schedule_validator import validate_schedule
    from app.algorithms.travel_validator import validate_travel
    from app.algorithms.validation_common import (
        add_check, result_from_checks, validated_inputs,
    )

    checks = []
    inputs = validated_inputs(request, plan, checks)
    if inputs is None:
        return result_from_checks(checks)
    request, plan = inputs
    if dataset is None:
        from app.services.data_service import load_dataset
        dataset = load_dataset(request=request)

    destinations = dataset.get("destinations", [])
    destination_ids = {item["id"] for item in destinations
                       if isinstance(item, dict) and isinstance(item.get("id"), str)}
    if destination_ids and plan["destinationId"] not in destination_ids:
        add_check(checks, "INFEASIBLE", "DESTINATION_ID", "destinationId", "Điểm đến không có trong dataset.")

    cost = evaluate_candidate_costs(request, plan, dataset, supplemental_costs)
    schedule = validate_schedule(request, plan, dataset)
    travel = validate_travel(request, plan, dataset)
    add_check(checks, cost["status"], "BUDGET", "costs",
              "; ".join(cost["reasons"]) or "Chi phí đã biết nằm trong ngân sách.")
    checks.extend(schedule["checks"])
    checks.extend(travel["checks"])
    result = result_from_checks(checks)
    result["planId"] = plan["planId"]
    result["components"] = {"cost": cost, "schedule": schedule, "travel": travel}
    return result


def check_overlap(first_activity, second_activity):
    """Trả True nếu trùng giờ, False nếu không trùng, None nếu chưa kiểm được.

    Hai hoạt động không cần sắp trước. Chạm nhau ở mốc kết thúc/bắt đầu
    không tính là trùng; thời gian di chuyển được kiểm tra riêng.
    """
    if validate_activity_time(first_activity) != "FEASIBLE":
        return None
    if validate_activity_time(second_activity) != "FEASIBLE":
        return None

    first_start = time_to_minutes(first_activity["startTime"])
    first_end = time_to_minutes(first_activity["endTime"])
    second_start = time_to_minutes(second_activity["startTime"])
    second_end = time_to_minutes(second_activity["endTime"])
    
    
    return first_start < second_end and second_start < first_end


def check_transfer(previous_end, next_start, travel_minutes):
    """So sánh khoảng trống giữa hai hoạt động với số phút di chuyển.

    Bằng đúng thời gian cần thiết vẫn đạt. Thời gian di chuyển thiếu, âm,
    không phải số hoặc không hữu hạn được xem là chưa xác minh.
    """
    previous = time_to_minutes(previous_end)
    following = time_to_minutes(next_start)
    if previous is None or following is None:
        return "UNVERIFIED"

    gap = following - previous
    # Giờ hoạt động sau sớm hơn giờ kết thúc trước đã là vi phạm xác nhận.
    if gap < 0:
        return "INFEASIBLE"

    # bool là lớp con của int, phải loại riêng để True không thành 1 phút.
    if isinstance(travel_minutes, bool) or not isinstance(travel_minutes, (int, float)):
        return "UNVERIFIED"
    # int của Python có thể rất lớn; chỉ float mới có NaN/vô cực.
    if isinstance(travel_minutes, float) and not isfinite(travel_minutes):
        return "UNVERIFIED"
    if travel_minutes < 0:
        return "UNVERIFIED"
    if gap < travel_minutes:
        return "INFEASIBLE"
    return "FEASIBLE"


def validate_day(activities):
    """Kiểm tra giờ và giao nhau của list hoạt động trong một ngày.

    Ưu tiên: vi phạm đã xác nhận > dữ liệu chưa rõ > tất cả đạt.
    Danh sách rỗng/không đúng kiểu trả UNVERIFIED. Hàm không sửa đầu vào
    và chưa kiểm tra di chuyển, giờ mở cửa hay tính đầy đủ của lịch trình.
    """
    if not isinstance(activities, list) or not activities:
        return "UNVERIFIED"

    valid_activities = []
    has_unknown = False
    for activity in activities:
        status = validate_activity_time(activity)
        if status == "INFEASIBLE":
            return "INFEASIBLE"
        if status == "UNVERIFIED":
            has_unknown = True
        else:
            valid_activities.append(activity)

    # sorted tạo list mới. lambda là hàm ngắn dùng giờ bắt đầu làm khóa sắp xếp.
    ordered = sorted(
        valid_activities,
        key=lambda activity: time_to_minutes(activity["startTime"]),
    )
    # range(1, n) duyệt từ 1 đến n-1 để so sánh từng cặp liền nhau.
    for index in range(1, len(ordered)):
        if check_overlap(ordered[index - 1], ordered[index]):
            return "INFEASIBLE"

    if has_unknown:
        return "UNVERIFIED"
    return "FEASIBLE"
