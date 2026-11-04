# Feasibility rules

Owner: M4

## Trạng thái và thứ tự ưu tiên

- `INFEASIBLE`: có ít nhất một vi phạm đã được xác nhận bằng dữ liệu.
- `UNVERIFIED`: chưa phát hiện vi phạm nhưng còn dữ liệu bắt buộc chưa rõ,
  hoặc đầu vào không đúng schema. Dữ liệu thiếu không được coi là 0.
- `FEASIBLE`: các bộ kiểm tra đã thực hiện đều đạt và không còn dữ liệu bắt buộc
  chưa xác minh trong phạm vi được mô tả bên dưới.

Thứ tự: `INFEASIBLE` > `UNVERIFIED` > `FEASIBLE`. Ví dụ chi phí chưa biết nhưng
hai hoạt động trùng giờ vẫn là `INFEASIBLE`. Sở thích không làm mất hiệu lực
ngân sách hoặc giới hạn bắt buộc; chấm điểm/xếp hạng thuộc TPVA-25.

## Đầu vào và kết quả

Hàm `evaluate_feasibility(request, plan, dataset=None, supplemental_costs=None)`
nhận TravelRequest và CandidatePlan theo schema chung. Nếu không truyền dataset,
hàm gọi `load_dataset()`; truyền `{}` là chủ động kiểm tra khi chưa có dữ liệu.
Không gọi AI, không sửa đầu vào, không ghi trạng thái ngược vào CandidatePlan.

Kết quả chứa `status`, `planId`, `checks`, `reasons` và `components` với `cost`,
`schedule`, `travel`. Mỗi check có `status`, `code`, `path`, `message` để UI giải
thích kết quả. Đầu vào sai schema trả `UNVERIFIED`/`INVALID_INPUT`, chưa có
`components`; tầng HTTP cần trả lỗi 422 khi gặp trường hợp này.

## Chi phí — TPVA-23

Tổng tiền là VND cả nhóm cho cả chuyến. Ngân sách theo người được nhân số người.
Giá hoạt động phải khớp dữ liệu đã xác minh; thiếu phạm vi giá `priceVnd` thì
chưa xác minh. `avgPricePerPersonVnd` được nhân số người. Không tự phân tích giá
văn bản, đoán mức vé trẻ em hoặc tự nhân số đêm cho một giá chưa rõ đơn vị.
Transport/accommodation lấy từ `supplemental_costs` đã xác nhận cho cả chuyến.
Chi tiết hợp đồng ở `backend/app/algorithms/README.md`.

## Ngày và giờ — TPVA-24

- Số ngày bằng `durationDays`; `dayNumber` bắt đầu từ 1 và liên tiếp.
- Với `startDate`, ngày đầu khớp ngày yêu cầu; các ngày sau liên tiếp theo lịch.
- Với `month`, ngày đầu thuộc tháng yêu cầu; chuyến có thể kết thúc ở tháng sau.
- Hoạt động cùng ngày phải có giờ `HH:MM`, bắt đầu < kết thúc, liệt kê theo
  thứ tự bắt đầu và không giao nhau. Không hỗ trợ hoạt động đi qua nửa đêm.
- Hai hoạt động chạm nhau về giờ không trùng, nhưng vẫn phải đủ thời gian di chuyển.
- Địa điểm phải tồn tại đúng loại trong dataset. Mỗi hoạt động phải nằm trọn một
  ca mở cửa. Chấp nhận `openingHours` hoặc `opening_hours`: chuỗi `7:00 - 17:30`,
  các ca cách nhau bởi `;`, list cặp giờ hoặc dict `{open, close}`.
- `24/7` là mở cả ngày; cửa sổ mở qua đêm được tách thành hai khoảng. `tự do`,
  `không cố định`, nguồn `UNVERIFIED` hoặc định dạng chưa hiểu -> `UNVERIFIED`.
- Nếu dataset có `minVisitMinutes`, phải đạt thời lượng tối thiểu này. Không
  biến thời lượng khuyến nghị thành ràng buộc bắt buộc.

## Chặng và giới hạn — TPVA-24

Chỉ dùng bảng chuẩn dạng list `travelMatrix` hoặc `travel_matrix`, mỗi dòng:

```json
{"from": "PLACE_A", "to": "PLACE_B", "durationMin": 20, "distanceKm": 5}
```

- Dữ liệu có hướng: không suy chặng ngược hoặc đường đi qua điểm khác.
- Chặng phải nối từng cặp hoạt động liên tiếp, không thừa/lặp/đảo thứ tự.
  Thiếu chặng -> `UNVERIFIED`; chặng sai điểm hoặc thừa -> `INFEASIBLE`.
- Giá trị số AI khác số đã biết trong dataset -> `INFEASIBLE`. Số đo trong
  dataset thiếu/sai, nguồn chưa xác minh hoặc cặp có nhiều dòng -> `UNVERIFIED`.
- Khoảng trống giữa hoạt động phải >= `durationMin` từ dataset.
- `betweenActivities`: kiểm tra từng chặng với giới hạn đã chọn.
- `daily`: tổng các chặng giữa hoạt động được biểu diễn trong mỗi ngày của
  CandidatePlan. Tổng đã biết vượt giới hạn vẫn là lỗi dù chặng khác thiếu dữ liệu.
- `fromDeparture`: tra đúng `from=departureLocation`, `to=destinationId` trong
  bảng chuẩn; thiếu số đo cần thiết -> `UNVERIFIED`. Không có thông tin để suy
  hành trình từ nơi ở tới điểm đầu hoặc chặng quay về ngoài những phạm vi này.
- Mức bằng đúng giới hạn được chấp nhận; chỉ kiểm tra giới hạn được cung cấp.

Dataset thật hiện có bảng lồng theo thành phố với số đo từ **trung tâm thành phố**.
Đây chưa phải bảng chặng giữa các cặp id, nên không dùng để xác nhận các chặng
giữa hoạt động. Kết quả `UNVERIFIED` là có chủ đích khi thiếu bảng chuẩn.

## Chỉnh sửa và kiểm thử

Mỗi lần chỉnh sửa phải gọi lại `evaluate_feasibility()` với kế hoạch mới và
dataset hiện hành. Hàm không lưu cache trạng thái của lần đánh giá trước.
Test bao gồm kế hoạch ban đầu đạt, sau đó thay ngân sách/giờ/giới hạn và phải
nhận `INFEASIBLE`. Chức năng nhận revision từ AI và lưu kế hoạch thuộc M3/M6.

Từ thư mục `backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider tests/test_feasibility.py tests/test_schedule_validator.py tests/test_travel_validator.py app/algorithms/test/test_cost_validator.py
```
