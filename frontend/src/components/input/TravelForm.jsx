const INTERESTS = [
  ["sightseeing", "Tham quan"],
  ["culture", "Văn hóa"],
  ["nature", "Thiên nhiên"],
  ["relaxation", "Nghỉ dưỡng"],
];

export default function TravelForm() {
  return (
    <form>
      <label>
        Điểm đến ưa thích
        <input name="destination" maxLength={200} />
      </label>
      <label>
        Phương tiện
        <input name="transportation" placeholder="taxi, đi bộ" />
      </label>
      <fieldset>
        <legend>Sở thích</legend>
        {INTERESTS.map(([type, label]) => (
          <label key={type}>
            <input type="checkbox" name="interest" value={type} />
            {label}
            <input
              name={`${type}Priority`}
              type="number"
              min={1}
              max={4}
              placeholder="1–4"
            />
          </label>
        ))}
      </fieldset>
      <label>
        Món thích
        <input name="diningPreferred" />
      </label>
      <label>
        Món tránh
        <input name="diningAvoid" />
      </label>

      <details>
        <summary>Bạn muốn hiển thị thêm?</summary>
        <label>
          Đặc điểm nhóm
          <input name="characteristics" placeholder="trẻ em, người lớn tuổi" />
        </label>
        <label>
          Khoảng cách tối đa (km)
          <input name="maxDistanceKm" type="number" min="0" step="any" />
        </label>
        <label>
          Thời gian di chuyển tối đa (phút)
          <input name="maxTravelTimeMinutes" type="number" min="1" />
        </label>
        <label>
          Giới hạn áp dụng cho
          <select name="appliesTo" defaultValue="">
            <option value="">Không đặt giới hạn</option>
            <option value="fromDeparture">Từ điểm xuất phát</option>
            <option value="betweenActivities">Giữa các điểm</option>
            <option value="daily">Trong một ngày</option>
          </select>
        </label>
      </details>
    </form>
  );
}
