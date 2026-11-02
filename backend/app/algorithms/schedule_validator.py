"""TPVA-24: kiểm tra ngày, giờ và thời lượng trong lịch trình."""


def _minutes(value):
    # TODO: Chuyển giờ trong hợp đồng dữ liệu thành số phút để so sánh.
    ...


def _window(value):
    # TODO: Đọc khoảng giờ mở cửa; giữ trạng thái chưa biết khi dữ liệu không đủ.
    ...


def validate_schedule(request: dict, plan: dict, places: dict | None = None) -> dict:
    # TODO: Kiểm tra ngày đi, số ngày, thứ tự và giao nhau giữa các hoạt động.
    # TODO: Kiểm tra giờ mở cửa, thời lượng tham quan và khoảng trống cho di chuyển.
    ...
