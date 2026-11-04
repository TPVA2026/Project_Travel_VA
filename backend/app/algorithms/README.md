# Python Cost & Budget Validator

This module checks **only the budget constraint**. Whole-plan feasibility also requires schedule and travel validation.

## Quick start

```powershell
# Chạy từ thư mục gốc repo, dùng môi trường .venv.
.\.venv\Scripts\python.exe -m pip install "pytest>=8,<9" "pydantic>=2,<3"
cd backend
..\.venv\Scripts\python.exe -m pytest -q app/algorithms/test/test_cost_validator.py
```

## Integration

```python
from app.algorithms.cost_validator import validate_cost_budget

result = validate_cost_budget(
    {"budget": 3_000_000},
    {"costs": {
        "transport": 500_000,
        "accommodation": 1_200_000,
        "dining": [{"name": "day 1", "amount": 200_000},
                   {"name": "day 2", "amount": 250_000}],
        "activities": 300_000,
    }},
)
print(result)
```

**Contract:** `budget` and all cost entries are **total trip VND**, not per-person. Required keys are `transport`, `accommodation`, `dining`, `activities`. Each cost accepts a nonnegative number, numeric string, or an array of items `{name, amount}`. `None` or an omitted category indicates unknown cost, **never zero**. To represent a confirmed free category use explicit `0`. For itemized categories, use an empty list only when confirmed to have no charges.

**Result:** `status` (`FEASIBLE`, `INFEASIBLE`, `UNVERIFIED`), `budget`, `known_total`, `total_cost` (null if missing), `remaining_budget` (null if missing), `breakdown`, `missing_costs`, `reasons`.

**Priority:** known subtotal > valid budget = `INFEASIBLE`; otherwise missing essential data = `UNVERIFIED`; otherwise all categories known and total <= budget = `FEASIBLE`.

Note: if group size is involved, callers must compute whole-group trip costs *before* calling the validator; this module does not silently multiply per-person costs. Invalid negative/nonfinite values are not accepted as known costs. `FEASIBLE` here means budget-only feasible, not an approved itinerary.

## Sử dụng schema chung của dự án

Gọi từ backend (để Python tìm được package `app`):

```python
from app.algorithms.cost_validator import evaluate_candidate_costs

result = evaluate_candidate_costs(
    request,  # Dictionary TravelRequest: budget.amount/currency/scope, travelers.count.
    candidate_plan,  # Dictionary theo schema CandidatePlan.
    dataset,  # Dataset có attractions và dining, lấy từ load_dataset().
    supplemental_costs={
        "transport": 500_000,
        "accommodation": 1_200_000,
    },  # Tổng tiền VND cho cả nhóm, cả chuyến; chỉ dùng dữ liệu đã xác nhận.
)
```

- Hàm kiểm tra TravelRequest/CandidatePlan bằng Pydantic; sai cấu trúc sẽ phát sinh
  `pydantic.ValidationError`. Bên gọi phải xử lý lỗi này.
- Ngân sách `perPerson` được nhân với `travelers.count`; `group` giữ nguyên.
- Hoạt động phải có `costStatus="KNOWN"`, địa điểm và loại hoạt động phải khớp
  dataset, giá AI phải bằng giá dataset, nguồn không được ghi `UNVERIFIED`.
- `avgPricePerPersonVnd` nhân theo số người. Với `priceVnd`, dataset phải có thêm
  `priceScope="perPerson"` hoặc `priceScope="group"`; thiếu phạm vi thì chưa xác minh.
  Đây là metadata giá được adapter hỗ trợ, không phải trường bắt buộc của dataset hiện tại.
- Không tự phân tích các giá văn bản như `30k - 70k` hoặc suy đoán giá vé trẻ em.
  Dataset hiện tại có nhiều giá dạng này nên có thể trả `UNVERIFIED`.
- Thiếu transport/accommodation, hoạt động chưa xác minh, hoặc không có hoạt động
  của một nhóm chi phí đều không được tự coi là miễn phí. Các nhóm supplemental
  `dining`/`activities` bị bỏ qua để không ghi đè giá từ dataset.
- Kết quả `FEASIBLE` của hàm này chỉ nói về ngân sách; đánh giá toàn lịch trình
  cần kết hợp kiểm tra lịch và di chuyển.

## Các hàm và cú pháp Python

- `_amount(value)`: đổi dữ liệu tiền thành số hợp lệ; `None` thể hiện chưa biết.
- `validate_cost_budget(request, plan)`: cộng các khoản chi và quyết định trạng thái ngân sách.
- `_verified_activity_cost(activity, place, travelers)`: kiểm chứng giá hoạt động và quy đổi theo nhóm.
- `evaluate_candidate_costs(request, plan, dataset, supplemental_costs=None)`: nối schema chung với validator.

Các hàm đều có docstring/chú thích tiếng Việt trong file. `dict` là bảng key/value,
`list` là danh sách; `.get()` đọc key an toàn; `for` duyệt phần tử; `return` trả kết quả;
`is None` kiểm tra dữ liệu chưa có; `_` đầu tên hàm thể hiện hàm hỗ trợ nội bộ.
