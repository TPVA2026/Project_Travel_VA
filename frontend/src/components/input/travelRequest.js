export const INTERESTS = [
  ["sightseeing", "Tham quan"],
  ["culture", "Văn hóa"],
  ["nature", "Thiên nhiên"],
  ["relaxation", "Nghỉ dưỡng"],
];

const LOC_FIELD = {
  startDate: "startDate",
  endDate: "endDate",
  month: "month",
  durationDays: "durationDays",
  duration_days: "durationDays",
  departureLocation: "departureLocation",
  departure_location: "departureLocation",
  count: "travelerCount",
  amount: "budgetAmount",
  scope: "budgetScope",
  maxDistanceKm: "maxDistanceKm",
  max_distance_km: "maxDistanceKm",
  maxTravelTimeMinutes: "maxTravelTimeMinutes",
  appliesTo: "appliesTo",
  applies_to: "appliesTo",
  destination: "destination",
  transportation: "transportation",
  priority: "interests",
  type: "interests",
};

function listed(data, name) {
  return data.getAll(name).map((item) => String(item).trim()).filter(Boolean);
}

function lines(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function daySpan(start, end) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

function filledWrong(value, bad) {
  return value !== "" && value != null && bad(Number(value));
}

export function valueErrors(data) {
  const errors = {};
  const start = data.get("startDate");
  const end = data.get("endDate");
  if (data.get("periodMode") !== "month" && start && end && end < start) {
    errors.endDate = "Ngày về phải từ ngày đi trở đi.";
  }
  if (data.get("periodMode") === "month" && filledWrong(data.get("durationDays"), (n) => n < 1 || !Number.isInteger(n))) {
    errors.durationDays = "Số ngày phải từ 1.";
  }
  const departure = String(data.get("departureLocation") ?? "");
  if (departure !== "" && !departure.trim()) errors.departureLocation = "Nhập điểm đi.";
  if (filledWrong(data.get("travelerCount"), (n) => n < 1 || !Number.isInteger(n))) {
    errors.travelerCount = "Số người phải từ 1.";
  }
  if (filledWrong(data.get("budgetAmount"), (n) => n < 0 || !Number.isInteger(n))) {
    errors.budgetAmount = "Ngân sách là số VND nguyên, từ 0.";
  }
  for (const [type] of INTERESTS) {
    const priority = data.get(`${type}Priority`);
    const checked = data.getAll("interest").includes(type);
    if (checked && filledWrong(priority, (n) => n < 1 || n > 4 || !Number.isInteger(n))) {
      errors.interests = "Mức sở thích từ 1 đến 4.";
    }
  }
  if (filledWrong(data.get("maxTravelTimeMinutes"), (n) => n < 1 || !Number.isInteger(n))) {
    errors.maxTravelTimeMinutes = "Thời gian di chuyển tối thiểu là 1 phút.";
  }
  if (filledWrong(data.get("maxDistanceKm"), (n) => n < 0)) {
    errors.maxDistanceKm = "Khoảng cách không được âm.";
  }
  return errors;
}

export function clientErrors(data) {
  const errors = valueErrors(data);
  const mode = data.get("periodMode");
  if (mode === "month") {
    if (!data.get("month")) errors.month = "Chọn tháng.";
    if (!data.get("durationDays")) errors.durationDays = "Số ngày phải từ 1.";
  } else {
    if (!data.get("startDate")) errors.startDate = "Chọn ngày đi.";
    if (!data.get("endDate") && !errors.endDate) errors.endDate = "Chọn ngày về.";
  }
  if (!String(data.get("departureLocation") ?? "").trim()) {
    errors.departureLocation = "Nhập điểm đi.";
  }
  if (data.get("travelerCount") === "" || data.get("travelerCount") == null) {
    errors.travelerCount = "Số người phải từ 1.";
  }
  if (data.get("budgetAmount") === "" || data.get("budgetAmount") == null) {
    errors.budgetAmount = "Ngân sách là số VND nguyên, từ 0.";
  }
  if (!data.get("budgetScope")) errors.budgetScope = "Chọn kiểu ngân sách.";

  const minutes = data.get("maxTravelTimeMinutes");
  const hasLimit = data.get("maxDistanceKm") || minutes || data.get("appliesTo");
  if (hasLimit && !data.get("appliesTo")) errors.appliesTo = "Chọn giới hạn áp dụng cho đâu.";
  if (hasLimit && !data.get("maxDistanceKm") && !minutes && !errors.maxDistanceKm) {
    errors.maxDistanceKm = "Nhập khoảng cách hoặc thời gian.";
  }
  return errors;
}

export function buildPayload(data) {
  const mode = data.get("periodMode");
  const travelPeriod = mode === "month"
    ? { month: data.get("month") }
    : { startDate: data.get("startDate"), endDate: data.get("endDate") };
  const durationDays = mode === "month"
    ? Number(data.get("durationDays"))
    : daySpan(data.get("startDate"), data.get("endDate"));
  const payload = {
    travelPeriod,
    durationDays,
    departureLocation: String(data.get("departureLocation")).trim(),
    travelers: { count: Number(data.get("travelerCount")) },
    budget: {
      amount: Number(data.get("budgetAmount")),
      currency: "VND",
      scope: data.get("budgetScope"),
    },
  };

  const characteristics = lines(data.get("characteristics"));
  if (characteristics.length) payload.travelers.characteristics = characteristics;

  const preferences = {};
  const destination = String(data.get("destination") ?? "").trim();
  if (destination) preferences.destination = destination;
  const transportation = listed(data, "transportation");
  if (transportation.length) preferences.transportation = transportation;
  const interests = INTERESTS.flatMap(([type]) => {
    if (!data.getAll("interest").includes(type)) return [];
    const priority = data.get(`${type}Priority`);
    return [priority === "" || priority == null ? { type } : { type, priority: Number(priority) }];
  });
  if (interests.length) preferences.interests = interests;
  const preferred = listed(data, "diningPreferred");
  const avoid = listed(data, "diningAvoid");
  if (preferred.length || avoid.length) preferences.dining = { preferred, avoid };
  if (Object.keys(preferences).length) payload.preferences = preferences;

  if (data.get("maxDistanceKm") || data.get("maxTravelTimeMinutes") || data.get("appliesTo")) {
    payload.limits = { appliesTo: data.get("appliesTo") };
    if (data.get("maxDistanceKm")) payload.limits.maxDistanceKm = Number(data.get("maxDistanceKm"));
    if (data.get("maxTravelTimeMinutes")) {
      payload.limits.maxTravelTimeMinutes = Number(data.get("maxTravelTimeMinutes"));
    }
  }
  return payload;
}

export function mapServerErrors(errors) {
  const mapped = {};
  for (const err of errors ?? []) {
    const loc = err.loc ?? [];
    let field = "form";
    for (let i = loc.length - 1; i >= 0; i -= 1) {
      if (LOC_FIELD[loc[i]]) {
        field = LOC_FIELD[loc[i]];
        break;
      }
    }
    mapped[field] = err.msg;
  }
  return mapped;
}
