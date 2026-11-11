# TPVA-39 — bộ lọc thành phố trước bước M3 xếp hạng

## Cách dùng và hợp đồng nội bộ

```python
from app.services.destination_filter_service import filter_feasible_destinations

result = filter_feasible_destinations(request)
feasible_ids = result["feasibleDestinationIds"]
```

`request` là dictionary hoặc instance TravelRequest. Service chuẩn hóa trên bản
sao và validate bằng schema hiện có. Destination null/bỏ trống/chuỗi trắng được
chấp nhận; destination đã chọn gây `ValueError`, request sai gây Pydantic
`ValidationError`. Không dùng `additionalRequirements` để đổi ràng buộc trên form.

Đầu ra nội bộ:

- `scope`: `DESTINATION_PREFILTER`.
- `status`: có thành phố đạt → FEASIBLE; chưa có thành phố đạt nhưng còn thiếu
  dữ liệu → UNVERIFIED; còn lại → INFEASIBLE.
- `feasibleDestinations`: tất cả thành phố qua bộ lọc, không tự giới hạn 3.
- `feasibleDestinationIds`: list ID tương ứng để M3 nhận.
- `unverified`: thành phố thiếu bằng chứng bắt buộc.
- `excluded`: thành phố xuất phát hoặc vi phạm đã xác nhận.

Mỗi bản ghi có `destinationId`, `city`, `status`, `travelTimeMinutes` (chiều đi),
`distanceKm` (chiều đi), `roundTripTravelTimeMinutes`, `estimatedCostVnd`
(cả nhóm/cả chuyến), `budgetVnd`, `remainingBudgetVnd`, `checks`, `reasons`.
Số đo thiếu là null. Check dùng `{status, code, path, message}` như M4 hiện có.

M3 trên nhánh `feature/m3-destination-suggestions` đã nhận list
`feasible_destination_ids`. Bên điều phối có thể nối:

```python
eligibility = filter_feasible_destinations(
    request, dataset, trip_costs_by_destination=verified_trip_quotes,
)
suggestions = suggest_destinations(
    request, dataset, eligibility["feasibleDestinationIds"], limit=3,
)
info_by_id = {p["destinationId"]: p for p in eligibility["feasibleDestinations"]}
```

Bên điều phối dùng `info_by_id` để đưa thời gian/chi phí vào response đã chốt.
TPVA-39 không quyết định endpoint mới hoặc đổi response Generate. TPVA-38 đã
Done trên Jira nhưng bản contract gợi ý destination chưa có trong docs của phiên
bản này; response HTTP cuối cùng cần theo quyết định M6. Service cung cấp đúng
list ID M3 đang sử dụng và không nhận cờ FEASIBLE từ AI/client.

## Quy tắc

1. Chỉ xét bản ghi thành phố có ID hợp lệ, duy nhất trong dataset.destinations.
   So khớp chính xác ID/city/name/city_name/aliases sau khi chuẩn hóa dấu và tiền
   tố TP/Thành phố. Không geocode/fuzzy-match/đoán thành phố từ địa chỉ dài.
   Alias mơ hồ giữ UNVERIFIED; thành phố xuất phát bị loại.
2. Tuyến đi và tuyến về là hai bản ghi có hướng riêng, mỗi hướng phải duy nhất.
   Không suy chiều ngược, nhân đôi chiều đi hoặc lấy khoảng cách từ tâm/POI.
3. Tổng phút đi/về phải ≤ `durationDays * 24 * 60`; mức bằng được chấp nhận.
   Đây chỉ là kiểm tra tối thiểu về quỹ thời gian vận chuyển, chưa phân bổ thời
   gian tham quan/nghỉ ngơi. Phút thiếu giữ UNVERIFIED; tổng phút đã biết vượt
   mức vẫn đủ để loại dù chiều khác chưa biết.
4. `limits.appliesTo=fromDeparture` áp dụng chiều đi. Giới hạn daily hoặc
   betweenActivities cần CandidatePlan, nên giữ UNVERIFIED ở bước thành phố.
5. Tổng chi phí gồm transport (đi/về), accommodation, dining, activities là VND
   cả nhóm/cả chuyến. Budget perPerson được nhân số người đúng một lần.
   Dùng `validate_cost_budget` hiện có để cộng và so sánh.
6. Vi phạm đã xác nhận có ưu tiên INFEASIBLE, kể cả khi đồng thời thiếu dữ liệu.
   Không vi phạm nhưng thiếu bằng chứng bắt buộc → UNVERIFIED.

FEASIBLE ở đây chỉ là **destination precheck**, chưa phê duyệt CandidatePlan.
Lịch trình sau đó vẫn phải qua grounding, chi phí thực tế, giờ mở cửa, lịch hoạt
động và routing giữa các POI.

## Bằng chứng phía server

Tuyến dùng list chuẩn `travel_matrix` (hoặc `travelMatrix`) với
`from`, `to`, `durationMin`, `distanceKm`, các đầu mút là city ID hoặc alias rõ
ràng. Source ghi unverified bị từ chối. Nếu có evidenceStatus, verificationStatus
hay status, marker phải là VERIFIED/KNOWN/ROUTE_AVAILABLE. Tương thích bảng chuẩn
server cũ chưa có marker. Nếu request có transportation, tuyến cần transportMode
khớp một lựa chọn; không lấy tuyến ô tô làm bằng chứng cho tàu hỏa.

Quote được truyền qua `trip_costs_by_destination`, hoặc
`dataset.destination_trip_costs` khi truyền dataset trực tiếp. Loader mặc định
đọc file server tùy chọn `backend/app/data/destination_trip_costs.json`.
Không đọc bảng giá do client gửi. Không tự tạo file bằng giá phỏng đoán.

Ví dụ mapping **synthetic, chỉ minh họa schema, không phải giá thực tế**:

```json
{
  "H": {
    "departureLocation": "HCM",
    "travelPeriod": {"month": "2026-12"},
    "durationDays": 2,
    "travelersCount": 2,
    "currency": "VND",
    "scope": "group",
    "transportation": [],
    "evidenceStatus": "VERIFIED",
    "source": "SYNTHETIC TEST QUOTE",
    "costs": {
      "transport": 1000000,
      "accommodation": 1000000,
      "dining": 800000,
      "activities": 200000
    }
  }
}
```

Source phải không rỗng, evidenceStatus phải là VERIFIED. Departure, travelPeriod,
durationDays, travelersCount và tập phương tiện phải khớp request. Thiếu khoản
tiền là null hoặc thiếu field; 0 chỉ dùng khi nguồn xác nhận miễn phí. Quote sai
phạm vi hoặc thiếu file giữ UNVERIFIED. Các source file không bị ghi lại.

Production hiện chủ yếu có tuyến giữa POI và chưa có bộ quote liên tỉnh được
xác nhận; danh sách khả thi rỗng là kết quả đúng cho dữ liệu hiện tại. Nhóm cần
bổ sung tuyến liên tỉnh và quote đúng phạm vi để M3 có thành phố đã qua bộ lọc.

## Kiểm thử

Từ `backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider tests/test_destination_filter.py
..\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
```

Tests dùng dữ liệu synthetic cho trường hợp khả thi, sát giới hạn, không có kết
quả, alias, loại nơi xuất phát, route có hướng/trùng/thiếu/provisional, quote sai
ngày/số người/phương tiện, ưu tiên INFEASIBLE, miễn phí khác thiếu dữ liệu,
form thắng prose và inputs/file nguồn không bị sửa.
