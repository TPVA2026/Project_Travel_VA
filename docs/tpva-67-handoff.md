# TPVA-67 — Bàn giao dữ liệu hiển thị Huế

## Đã tích hợp

- `backend/app/data/Hue/attractions.json`: ảnh, nguồn và mô tả quan sát từ ảnh cho 10 điểm curated.
- `backend/app/data/Hue/restaurants.json`: ảnh, link nguồn do người dùng cung cấp và mô tả cho 10 quán.
- `backend/app/data/Hue/accomodation.json`: `bookingComReference` giữ URL ứng viên, trạng thái đối chiếu danh tính, ngày tìm và ghi chú; không thay link đặt phòng cũ hoặc ghi đè dữ liệu giá.
- `frontend/public/hue-place-display.json`: dữ liệu dùng chung cho FE; mỗi bản ghi dùng ID canonical. Có 20 địa điểm/quán và 13 bản ghi lưu trú (12 cơ sở).
- `frontend/public/images/accomodation.HUE/sources.json`: 36 ảnh đã chuẩn hóa cho 12 cơ sở lưu trú, mô tả dựa trên quan sát ảnh và link tham chiếu Booking.com. ÊMM dùng chung ảnh cơ sở cho hai bản ghi phòng; chưa xác định loại phòng trong ảnh. Ba ảnh Century đã chuyển từ thư mục images gốc vào accomodation.HUE.

## Dùng cho FE / LLM

FE có thể đọc `/hue-place-display.json`, tạo index theo `id`, rồi dùng `description`, `images[].url`, `images[].alt` và `images[].sourceUrl`. Đường dẫn ảnh nằm trong `/images/attractions.HUE/` và `/images/restaurants.HUE/`. Ghi công ảnh dùng `credit` nếu có; chỉ hiển thị link nguồn khi khác null. Chưa thay đổi component giao diện trong task dữ liệu này.

`load_dataset(destination="H")` trả các trường bổ sung. `build_context()` giữ ảnh/mô tả cho curated attractions/dining; mô tả có trạng thái `draft_visual_description`, không xác minh giá, giờ mở cửa, món ăn hoặc tiện ích. Không gửi ảnh thành bằng chứng giá hay routing. Khách sạn vẫn là collection riêng, chưa bổ sung vào schema CandidatePlan.

Booking: chỉ coi URL là tham chiếu ứng viên khi còn `name_match_address_review_required`. Không hiển thị các URL này như cơ sở đã xác minh. `quote: null`, `liveAvailabilityVerified: false` nghĩa là chưa có báo giá theo ngày; không dùng giá 0 thay thế. Tất cả cơ sở còn lại có URL tham chiếu. Không lấy giá từ cache tìm kiếm làm báo giá hiện tại.

## Thứ tự lưu trú

Theo yêu cầu người dùng, đã xóa cơ sở không sử dụng và đánh lại dãy ID ACCOM_H liên tục: 01 Magnolia, 02 Bailey, 03 Lumiere, 04 Century, 05 Deluxe Villa, 06 Sankofa, 07 La Vela, 08 Indochine Palace, 09 Meliá Vinpearl, 10 Azerai. Đã đổi đồng bộ tên ảnh và các tham chiếu; các ID HOTEL_H của ÊMM và Rosaleen giữ nguyên. Các bản lịch trình cũ lưu ID ACCOM_H từ 03 trở đi cần tạo lại theo dataset mới, không diễn giải theo thứ tự cũ.

## Chưa đủ điều kiện Done

1. Link nguồn cho 17 ảnh restaurants đã được người dùng cung cấp trong hội thoại và đồng bộ. Quán Thúy có link ảnh trực tiếp, còn thiếu trang nguồn/tác giả; cần đối chiếu từng ảnh và quyền sử dụng.
2. Đã có 36 ảnh cho đủ 12 cơ sở; cần nguồn ảnh cụ thể. Link Booking là tham chiếu cơ sở, không tự coi là nguồn ảnh. ÊMM dùng chung ảnh cơ sở cho hai bản ghi phòng.
3. Magnolia được người dùng xác nhận đúng cơ sở, địa chỉ 10 Trần Hữu Dực; khác biệt địa chỉ hiển thị trên Booking giữ trong ghi chú. Deluxe Villa khớp 20 Lý Tự Trọng; chưa suy ra số phòng/giường. Sankofa khớp số nhà/đường 8 Ngọc Hồ. Các cơ sở còn trạng thái chờ review được liệt kê trong readiness JSON.
4. Kiểm tra đúng địa điểm/chi nhánh và quyền sử dụng ảnh ngoài ảnh tự chụp. Các link ảnh được ghi là người dùng cung cấp, chưa tự nâng thành verified.

Tình trạng máy đọc được: `docs/tpva-67-readiness.json`. Phần thiếu được giữ nguyên, không đánh task Done chỉ vì có dữ liệu mẫu.

## Kiểm tra

38 test dữ liệu, display metadata và candidate plan đã pass. Lệnh chạy: `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest -p no:debugging backend/tests/test_hue_display_data.py backend/tests/test_data.py backend/tests/test_candidate_plan.py -q` (PowerShell đặt biến môi trường trước khi chạy). Hai tùy chọn trên tránh plugin/debugger của môi trường Python lỗi khi import asyncio. Chưa kiểm thử trình duyệt vì chưa đổi UI; JSON công khai mới là dữ liệu bàn giao cho FE.
