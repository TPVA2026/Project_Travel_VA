# Đánh giá lại kế hoạch sau chỉnh sửa

## Điểm vào cho pipeline

Các hàm trong `backend/app/services/planning_service.py` nối yêu cầu chỉnh sửa
với bộ kiểm tra khả thi và xếp hạng. Module không gọi AI, không lưu kế hoạch và
không tự cập nhật lịch sử chọn lịch.

### Sửa yêu cầu chuyến đi

```python
from app.services.planning_service import revalidate_revision

result = revalidate_revision(
    request,
    original_plan,
    {
        "planId": original_plan["planId"],
        "changeType": "budget",
        "budget": {"amount": 5_000_000, "currency": "VND", "scope": "group"},
    },
    dataset=dataset,
    revised_plan=revised_candidate,  # Bỏ qua nếu chưa có lịch dựng lại.
    supplemental_costs_by_plan=current_verified_costs,
    candidate_plans=current_candidates,
    selected_history=user_selected_history,
    trip_time_limit_minutes=None,
)
```

RevisionRequest hỗ trợ đúng một trường: `budget`, `travelPeriod`, `durationDays`,
`departureLocation`, `travelers`, `limits` hoặc `preferences`. Trường được chọn
thay toàn bộ đối tượng tương ứng; các trường khác giữ nguyên về ý nghĩa sau khi
chuẩn hóa schema. Ví dụ sửa `preferences` cần gửi toàn bộ sở thích muốn giữ.

Request cuối cùng phải vẫn hợp lệ. Nếu sửa số ngày nhưng `endDate` cũ không khớp,
hàm báo lỗi; không tự bỏ endDate hoặc đoán cách điều chỉnh. Các cặp thay đổi ngày
và số ngày cần được bên gọi chuẩn bị thành một TravelRequest hợp lệ rồi dùng
`revalidate_plan` với lịch mới.

`revision.planId` phải khớp lịch gốc; `revised_plan`, nếu có, phải giữ planId đó.
Nếu không truyền lịch dựng lại, lịch cũ được kiểm tra với yêu cầu mới, nên có thể
trở thành INFEASIBLE/UNVERIFIED thay vì được tự động chỉnh ngày/hoạt động.

### Sửa hoạt động hoặc chặng trong lịch

```python
from app.services.planning_service import revalidate_plan

result = revalidate_plan(
    updated_request,
    revised_candidate,
    dataset=dataset,
    supplemental_costs_by_plan=current_verified_costs,
    candidate_plans=current_candidates,
    selected_history=user_selected_history,
    trip_time_limit_minutes=total_trip_limit,
)
```

Hàm nhận CandidatePlan theo schema chung, không nhận các field `status`/`score`
tự gắn từ client hoặc AI. Sửa hoạt động không cần thêm changeType mới vào
RevisionRequest; M3/UI cung cấp candidate đã sửa để kiểm tra trực tiếp.

## Dữ liệu và thứ tự xử lý

1. Kiểm tra schema của request, revision và candidate; xác nhận đúng planId.
2. Thay lịch cũ cùng id trong tập so sánh hoặc thêm nếu tập chưa có lịch đó.
   Tập so sánh không được chứa planId lặp.
3. Dùng dataset hiện hành để kiểm tra lại ngân sách, ngày/giờ, giờ mở cửa,
   thời lượng tối thiểu, chặng và giới hạn di chuyển.
4. Tính lại khả thi cho toàn bộ tập so sánh dưới request mới. Sau đó mới chấm
   P hiện tại/lịch sử, C, T và S. Min/max thời gian dùng tập đủ dữ liệu mới.
5. Giới hạn phút cả chuyến, nếu có, được phản ánh cả vào evaluation và ranking;
   không trả trạng thái khả thi khi ranking đã phát hiện vi phạm giới hạn đó.

`supplemental_costs_by_plan` là dict `planId -> {transport, accommodation}` chứa
chi phí cả nhóm/cả chuyến đã được bên gọi xác nhận cho **phiên bản hiện tại**.
Không truyền các giá trị cũ chưa xác nhận sau khi đổi ngày, số người, nơi đi hay
phương án di chuyển. Thiếu dữ liệu thì hàm giữ UNVERIFIED, không tự nạp chi phí
từ kết quả đánh giá cũ. Giá hoạt động được đối chiếu lại với dataset.

Nếu `dataset=None`, hàm đọc dataset backend một lần cho cả lượt kiểm tra.
Nếu truyền `{}`, đó là chủ động kiểm tra khi không có dataset, không tự thay bằng
dữ liệu khác. Hàm không sửa request, candidate, dataset, tập lịch hoặc lịch sử đầu vào.

## Kết quả và tích hợp

Kết quả gồm:

- `request`: TravelRequest đã áp dụng thay đổi và chuẩn hóa.
- `plan`: CandidatePlan đang được kiểm tra, giữ riêng với trạng thái/điểm.
- `status`: trạng thái sau khi kiểm tra đầy đủ các ràng buộc đã cung cấp.
- `evaluation`: chi tiết `checks`, `reasons` và `components`.
- `ranking`: `ranked`, `unscored`, `excluded` theo công thức trong `ranking_rules.md`.

FEASIBLE nhưng thiếu metadata sở thích có thể nằm trong `unscored`; điều đó không
có nghĩa lịch vi phạm ràng buộc. Lịch không còn khả thi phải bị loại khỏi `ranked`.
Hàm không tự lưu/chọn kết quả; tầng ứng dụng quyết định thao tác lưu và cần giữ
đúng dữ liệu của user khi cung cấp lịch sử, chi phí và tập lịch so sánh.

Request/candidate sai schema phát sinh Pydantic ValidationError; sai liên kết
planId hoặc danh sách id trùng phát sinh ValueError. Tầng HTTP cần chuyển các
lỗi đầu vào thành 422. Service này chưa thay thế việc M6 xây route `/itineraries/revise`,
kho lưu lịch và cơ chế gọi M3 để dựng lại lịch.

## Chạy test

Từ thư mục `backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider tests/test_revalidation.py tests/test_revision.py tests/test_ranking.py
```
