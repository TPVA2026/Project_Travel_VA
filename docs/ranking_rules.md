# Preference scoring and ranking

## Phạm vi

Chỉ chấm các kế hoạch đã qua kiểm tra `FEASIBLE`. Điểm tổng kết hợp mức phù hợp
sở thích hiện tại/lịch sử, tiết kiệm chi phí và ít di chuyển. Ngân sách, lịch và
giới hạn di chuyển vẫn là ràng buộc bắt buộc trước bước tính điểm.

## Công thức điểm tổng

Tất cả điểm thành phần và `score` tính nội bộ trong khoảng **0–1**:

```text
P_personalized = (1 - alpha) * P_current + alpha * P_history
S = 0.45 * P_personalized + 0.30 * C + 0.25 * T
score = S
score100 = 100 * S  (chỉ để hiển thị)
```

Không trộn các điểm C/T dạng 0–100 vào phép cộng trên; giá trị 0–100 tương ứng
là 100 lần điểm nội bộ. Bằng S giữ thứ tự đầu vào, không làm tròn trước khi sắp.
Thiếu thành phần bắt buộc thì `score=null`, không tự chia lại trọng số.

## P hiện tại

Một sở thích chỉ được tính một lần dù nhiều hoạt động có cùng nhãn.

| Priority | Trọng số |
| --- | --- |
| 1 — quan trọng nhất | 4 |
| 2 | 3 |
| 3 | 2 |
| 4 hoặc không cung cấp priority | 1 |

Đây là quy tắc trọng số của thuật toán; schema chỉ quy định 1 là quan trọng nhất.
Mục trùng loại dùng trọng số cao nhất thay vì cộng dồn. Khi mọi mục không có
priority, tất cả có trọng số bằng nhau.

```text
P_current = tổng trọng số các sở thích khớp / tổng trọng số sở thích yêu cầu
```

Ví dụ: culture priority 1, nature priority 4. Kế hoạch chỉ đáp ứng culture có
`P_current = 4 / (4 + 1) = 0.8`; chỉ đáp ứng nature có P bằng 0.2.

- Không có sở thích hiện tại: P_current=0; vẫn tính C/T và lịch sử nếu có.
- Thiếu nhãn của sở thích cần kiểm tra: P_current=null, không coi là điểm 0.

## Lịch sử và alpha

`selected_history` là list record của các lịch người dùng đã chọn, lấy từ backend
cho đúng người dùng. Mỗi record có `planId`, `interestTags` và có thể có `source`.
Chỉ đếm planId khác nhau, tag thuộc danh mục hỗ trợ, không rỗng, nguồn không ghi
`UNVERIFIED`. Thiếu tag hoặc chưa suy được sở thích không làm tăng alpha.

| Số lịch dùng được | alpha |
| --- | --- |
| 0 | 0 |
| 1–2 | 0.10 |
| >= 3 | 0.20 |

Mỗi tag chỉ tính một lần trong một lịch. Trọng số lịch sử của tag bằng số lịch
có tag đó. P_history bằng tổng trọng số tag khớp của lịch mới chia tổng trọng số
tag lịch sử. Khi alpha=0, P_history không cần có giá trị. Ở alpha=0.2, phần lịch
sử tối đa là `0.45 * 0.2 = 0.09`, tương đương 9 điểm trên thang 100.
Module nhận lịch sử từ bên gọi, không tự ghi lịch sử hoặc lấy danh tính từ client.

## C — tiết kiệm chi phí

```text
C = clamp(1 - total_cost / budget, 0, 1)
```

Lấy chi phí và ngân sách cả nhóm/cả chuyến từ kết quả kiểm tra chi phí đã xác minh.
Ví dụ chi 400 trên ngân sách 500 -> C=0.2 (20 điểm trên thang 100).
Ngân sách bằng 0 làm tỷ lệ không xác định: C=null và lịch chuyển vào `unscored`.
Clamp không thay thế kiểm tra vượt ngân sách trước đó.

## T — ít di chuyển

Tổng phút lấy từ `components.travel.dailyTotals[].durationMin` đã đối chiếu
dataset, không dùng trực tiếp số AI đưa ra. Phạm vi là các chặng di chuyển
được biểu diễn trong CandidatePlan; không tự thêm hành trình ngoài kế hoạch.

Nếu có giới hạn phút **cả chuyến** được xác nhận, truyền `trip_time_limit_minutes`:

```text
T = clamp(1 - total_minutes / trip_time_limit_minutes, 0, 1)
```

Giới hạn phải hữu hạn, dương. Lịch vượt giới hạn bị loại `INFEASIBLE` trước chấm
điểm. Không tự dùng giới hạn daily/betweenActivities/fromDeparture làm giới hạn
cả chuyến vì chúng có phạm vi khác nhau.

Nếu không có giới hạn cả chuyến:

```text
T = (t_max - t) / (t_max - t_min)
```

t_min/t_max chỉ lấy từ các lịch FEASIBLE đủ P, C và tổng phút đã xác minh trong
cùng lượt. Lịch bị loại hoặc thiếu dữ liệu chấm không làm thay đổi tập chuẩn hóa.
Nếu chỉ có một lịch hoặc mọi lịch có cùng thời gian: T=0.5 (50 điểm trên thang 100).
Thiếu phút di chuyển thì T=null, không tự coi là 0 phút.

## Nhãn từ dữ liệu

Nhãn `sightseeing` lấy từ địa điểm thuộc collection `attractions` đã được xác minh.
Các nhãn khác đọc từ metadata `interestTags` của địa điểm, ví dụ:

```json
{"id": "PLACE_A", "interestTags": ["culture", "nature"]}
```

`interestTags` là metadata tùy chọn được bộ chấm điểm hỗ trợ, không phải field
bắt buộc của dataset hiện tại. Danh sách rỗng thể hiện đã xác nhận không có
nhãn phù hợp; thiếu field, sai định dạng, id lặp hoặc nguồn `UNVERIFIED` không
đủ để chấm. Không suy nhãn từ tên, mô tả hoặc `reason` do AI viết.
Chỉ xét các hoạt động sightseeing. Nhãn món ăn/nhà hàng không tự trở thành nhãn tham quan.

Dataset hiện tại chưa có đầy đủ metadata này, nên kế hoạch có thể khả thi nhưng
chưa có điểm khi người dùng yêu cầu culture/nature/relaxation. Không bổ sung nhãn giả
vào dữ liệu thật để làm cho kết quả có điểm.

## Cách dùng trong pipeline

Từ thư mục `backend`:

```python
from app.algorithms.ranking import rank_candidates

result = rank_candidates(
    request,  # TravelRequest theo schema chung.
    candidate_plans,  # List các CandidatePlan, không chứa score/status tự thêm.
    dataset,  # Dataset backend đã xác minh; bỏ qua để dùng load_dataset().
    supplemental_costs_by_plan={
        "PLAN_A": {"transport": 500_000, "accommodation": 1_200_000},
    },  # Tổng tiền cả nhóm, cả chuyến từ nguồn đã xác nhận.
    selected_history=[
        {"planId": "OLD_PLAN", "interestTags": ["culture", "nature"]},
    ],  # Lịch đã chọn có nhãn đáng tin cậy, lấy đúng user từ backend.
    trip_time_limit_minutes=None,  # None -> dùng min–max trong lượt hiện tại.
)
```

Hàm tự gọi lại `evaluate_feasibility` cho từng kế hoạch với request/dataset/chi phí
hiện hành trước khi tính điểm. Không chấp nhận điểm hay trạng thái AI trong
CandidatePlan; schema sẽ loại kế hoạch đó. planId phải duy nhất, không rỗng.

Kết quả là dict:

- `ranked`: chỉ kế hoạch FEASIBLE có đủ dữ liệu cho công thức S.
  Mỗi mục có `planId`, `score` (0–1), `score100`, `matchedInterests`,
  `scoringStatus`, `usableHistoryCount` và `components`.
- `components`: `P_current`, `P_history`, `alpha`, `P_personalized`, `C`, `T`.
- `unscored`: kế hoạch FEASIBLE nhưng thiếu dữ liệu; có `missingTagPlaceIds`,
  `missingComponents` và điểm null.
- `excluded`: kế hoạch INFEASIBLE/UNVERIFIED; trả trạng thái và lý do từ bộ đánh giá.

Không sửa CandidatePlan đầu vào, không thêm field vào schema của M3 và không gọi AI.
Request sai schema phát sinh Pydantic ValidationError. Kiểu danh sách/planId sai
phát sinh ValueError; tầng API cần xử lý các lỗi này khi tích hợp.

## Các hàm nhỏ để luyện Python

- `filter_feasible(results)`: lọc kết quả đánh giá nội bộ đáng tin cậy.
- `count_matching_interests(interests, plan_tags)`: đếm số loại sở thích khớp.
- `calculate_preference_score(interests, plan_tags)`: tính điểm có trọng số.
- `build_history_profile(selected_history)`: suy tần suất tag và chọn alpha.
- `calculate_personalized_preference(current_score, history_score, alpha)`: ghép hai điểm P.
- `calculate_cost_score(total_cost, trip_budget)`: tính C trong khoảng 0–1.
- `calculate_travel_score(...)`: tính T bằng giới hạn cả chuyến hoặc min–max.
- `calculate_total_score(personalized_preference, cost_score, travel_score)`: tính S.
- `sort_scored_plans(scored_plans)`: trả danh sách mới sắp theo điểm giảm dần.
- `rank_plans(evaluations, interests, tags_by_plan, selected_history=None,
  trip_time_limit_minutes=None)`: ghép các bước nhỏ, cần cả chi phí và phút đã xác minh.

Các hàm nhỏ nhận sở thích dạng chuỗi để luyện tập hoặc dạng `{type, priority}`
của schema chung. `rank_plans` chỉ dùng cho kết quả nội bộ đã tin cậy và nhãn đã
kiểm chứng; không dùng nó trực tiếp với cờ FEASIBLE từ client/AI. Pipeline bên
ngoài dùng `rank_candidates` để không bỏ qua bước kiểm tra khả thi.

```powershell
..\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider tests/test_ranking.py
```
