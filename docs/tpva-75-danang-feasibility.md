# TPVA-75 — dữ liệu tối thiểu và kiểm thử feasibility ngoài Huế

## Phạm vi

Địa phương được chọn là **Đà Nẵng** (`VN_48`, folder `DaNang`). Bộ kiểm thử dùng
validator hiện có qua `POST /itineraries/evaluate`; không gọi AI và không tự bổ
sung dữ liệu giả vào production dataset.

Snapshot dataset ngày 27/11/2026:

| Nhóm dữ liệu | Hiện có | Dữ liệu quyết định feasibility |
|---|---:|---|
| Attraction | 613 | 0 bản ghi có giá, giờ mở cửa hoặc thời lượng |
| Restaurant | 0 | Chưa có giá, giờ mở cửa và nguồn cho bữa ăn |
| Accommodation | 0 | Chưa có giá phòng/công suất/nguồn cho lưu trú |
| Transport | 0 | Chưa có giá tuyến đến Đà Nẵng |
| Route nội thành | 0 chặng cho hai điểm fixture | Thiếu `durationMin` và `distanceKm` có nguồn |

Hai địa điểm dùng để chạy lại là `OTM_VN_48_N4944327526` (Linh Ung Pagoda) và
`OTM_VN_48_W302872188` (Museum of Cham Sculpture). Cả hai tồn tại trong dataset,
nhưng đều thiếu `priceVnd`, `openingHours` và `durationMin`.

## Kết quả thực tế

Fixture: `backend/tests/fixtures/acceptance/danang_feasibility_scenarios.json`.

| Ca | Kết quả | Mã lý do trọng tâm | Kết luận |
|---|---|---|---|
| `DN01_structurally_valid_baseline` | `UNVERIFIED` | `BUDGET`, `OPENING_HOURS` | Cấu trúc lịch hợp lệ, nhưng thiếu bằng chứng để kết luận khả thi. |
| `DN02_missing_route_evidence` | `UNVERIFIED` | `MISSING_LEG`, `UNSUPPORTED_LEG`, `TRAVEL_DATA`, `TRANSFER_GAP` | Thiếu route không được đổi thành 0 phút và không bị kết luận là vi phạm. |
| `DN03_proven_day_count_violation` | `INFEASIBLE` | `DAY_COUNT` | Kế hoạch có hai ngày trong khi request yêu cầu một ngày; dữ liệu khác còn thiếu không che mất vi phạm. |

Không có ca nào đạt `FEASIBLE` với production dataset hiện tại. Đây là kết quả
đúng: validator phân biệt `UNVERIFIED` do thiếu bằng chứng với `INFEASIBLE` do
vi phạm xác định.

## Dữ liệu tối thiểu cần bổ sung

Để một lịch Đà Nẵng có thể đạt `FEASIBLE`, Data cần cung cấp cho đúng những địa
điểm/chặng xuất hiện trong lịch:

1. Attraction và restaurant: giá VND, phạm vi giá (`perPerson` hoặc `group`),
   trạng thái/nguồn bằng chứng, giờ mở cửa theo ngày và thời lượng tối thiểu.
2. Route có hướng cho từng cặp hoạt động liên tiếp: `from`, `to`,
   `durationMin`, `distanceKm`, phương tiện và nguồn đã xác minh. Không suy chặng
   ngược chiều.
3. Restaurant đủ để lập các bữa ăn: `avgPricePerPersonVnd`, giờ mở cửa và nguồn.
4. Accommodation cho chuyến nhiều ngày: giá mỗi phòng/đêm, sức chứa người lớn,
   tiền tệ, trạng thái giá và nguồn.
5. Transport từ nơi khởi hành đến Đà Nẵng: giá cả nhóm/cả chuyến hoặc quote có
   phạm vi, tiền tệ và nguồn phù hợp request.

Giá hoặc route chưa biết phải tiếp tục là `null`/`UNVERIFIED`; không ghi 0 trừ
khi có bằng chứng khoản đó thực sự miễn phí.

## Chạy lại

Từ thư mục `backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest tests/test_tpva_75_danang_feasibility.py -q
```

Test gọi endpoint thật trong process và kiểm tra status, code và path của từng
lý do. Khi Data bổ sung bằng chứng, cập nhật fixture và bảng kết quả theo output
mới; chỉ đổi kỳ vọng sang `FEASIBLE` khi toàn bộ cost, schedule và travel đều có
bằng chứng đầy đủ.
