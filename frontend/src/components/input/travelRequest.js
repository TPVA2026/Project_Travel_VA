export const INTERESTS = [
  ["sightseeing", "Sightseeing"],
  ["culture", "Culture"],
  ["nature", "Nature"],
  ["relaxation", "Relaxation"],
];

export const ADDITIONAL_REQUIREMENTS_MAX = 500;

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
  characteristics: "characteristics",
  transportation: "transportation",
  priority: "interests",
  type: "interests",
  additionalRequirements: "additionalRequirements",
  additional_requirements: "additionalRequirements",
};

function listed(data, name) {
  return data.getAll(name).map((item) => String(item).trim()).filter(Boolean);
}

function lines(value) {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const ISO_MONTH = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;

// A real calendar date in YYYY-MM-DD form; any four-digit year is accepted.
function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match || Number(match[1]) < 1) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function daySpan(start, end) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

// Inclusive calendar-day count for two ISO dates, computed in UTC (no timezone shift).
export function inclusiveDays(start, end) {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return null;
  const count = daySpan(start, end);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export const REQUIRED = "This field is required.";

function filledWrong(value, bad) {
  return value !== "" && value != null && bad(Number(value));
}

export function valueErrors(data) {
  const errors = {};
  const start = data.get("startDate");
  const end = data.get("endDate");
  if (data.get("periodMode") !== "month") {
    if (start && !isIsoDate(start)) errors.startDate = "Use a full date (YYYY-MM-DD).";
    if (end && !isIsoDate(end)) errors.endDate = "Use a full date (YYYY-MM-DD).";
  }
  const month = data.get("month");
  if (data.get("periodMode") === "month" && month && !ISO_MONTH.test(month)) errors.month = "Use a month and year (YYYY-MM).";
  if (data.get("periodMode") !== "month" && start && end && !errors.startDate && !errors.endDate && end < start) {
    errors.endDate = "End date must be on or after the start date.";
  }
  if (data.get("periodMode") === "month" && filledWrong(data.get("durationDays"), (n) => n < 1 || !Number.isInteger(n))) {
    errors.durationDays = "Number of days must be at least 1.";
  }
  const departure = String(data.get("departureLocation") ?? "");
  if (departure !== "" && !departure.trim()) errors.departureLocation = REQUIRED;
  if (filledWrong(data.get("travelerCount"), (n) => n < 1 || !Number.isInteger(n))) {
    errors.travelerCount = "Traveler count must be at least 1.";
  }
  const budget = normalizeBudgetInput(data.get("budgetAmount"));
  if (budget !== "" && (!/^\d+$/.test(budget) || !Number.isSafeInteger(Number(budget)))) {
    errors.budgetAmount = "Budget must be a whole number of VND, from 0.";
  }
  for (const [type] of INTERESTS) {
    const priority = data.get(`${type}Priority`);
    const checked = data.getAll("interest").includes(type);
    if (checked && filledWrong(priority, (n) => n < 1 || n > 4 || !Number.isInteger(n))) {
      errors.interests = "Interest level must be from 1 to 4.";
    }
  }
  if (filledWrong(data.get("maxTravelTimeMinutes"), (n) => n < 1 || !Number.isInteger(n))) {
    errors.maxTravelTimeMinutes = "Travel time must be at least 1 minute.";
  }
  if (filledWrong(data.get("maxDistanceKm"), (n) => n <= 0 || !Number.isFinite(n))) {
    errors.maxDistanceKm = "Distance must be greater than 0.";
  }
  if (lines(data.get("characteristics")).some(note => note.length > 80)) {
    errors.characteristics = "Each group note must be 80 characters or fewer, separated by commas.";
  }
  const extra = String(data.get("additionalRequirements") ?? "").trim();
  if (extra.length > ADDITIONAL_REQUIREMENTS_MAX) {
    errors.additionalRequirements = `Extra description must be ${ADDITIONAL_REQUIREMENTS_MAX} characters or fewer.`;
  }
  return errors;
}

export function clientErrors(data) {
  const errors = valueErrors(data);
  const mode = data.get("periodMode");
  if (mode === "month") {
    if (!data.get("month")) errors.month = REQUIRED;
    if (!data.get("durationDays")) errors.durationDays = REQUIRED;
  } else {
    if (!data.get("startDate")) errors.startDate = REQUIRED;
    if (!data.get("endDate") && !errors.endDate) errors.endDate = REQUIRED;
  }
  if (!String(data.get("departureLocation") ?? "").trim()) {
    errors.departureLocation = REQUIRED;
  }
  if (data.get("travelerCount") === "" || data.get("travelerCount") == null) {
    errors.travelerCount = REQUIRED;
  }
  if (normalizeBudgetInput(data.get("budgetAmount")) === "") {
    errors.budgetAmount = REQUIRED;
  }
  if (!data.get("budgetScope")) errors.budgetScope = REQUIRED;

  const minutes = data.get("maxTravelTimeMinutes");
  const hasLimit = data.get("maxDistanceKm") || minutes || data.get("appliesTo");
  if (hasLimit && !data.get("appliesTo")) errors.appliesTo = "Choose what the limit applies to.";
  if (hasLimit && !data.get("maxDistanceKm") && !minutes && !errors.maxDistanceKm) {
    errors.maxDistanceKm = "Enter a distance or a travel time.";
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
      amount: Number(normalizeBudgetInput(data.get("budgetAmount"))),
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

  const additionalRequirements = String(data.get("additionalRequirements") ?? "").trim();
  if (additionalRequirements) payload.additionalRequirements = additionalRequirements;
  return payload;
}

const MISSING_FIELD = {
  travelPeriod: "startDate",
  durationDays: "durationDays",
  departureLocation: "departureLocation",
  travelers: "travelerCount",
  "travelers.count": "travelerCount",
  budget: "budgetAmount",
  "budget.amount": "budgetAmount",
  "budget.scope": "budgetScope",
  "budget.currency": "budgetAmount",
};

export function serverFieldErrors(body) {
  const detail = body?.detail && typeof body.detail === "object" && !Array.isArray(body.detail)
    ? body.detail
    : body ?? {};
  const errors = mapServerErrors(detail.errors);
  for (const field of detail.missing ?? []) {
    const name = MISSING_FIELD[field] ?? field;
    if (!errors[name]) errors[name] = REQUIRED;
  }
  // Skip messages already shown on a field so the same text never appears twice.
  const shown = new Set(Object.values(errors));
  const messages = (detail.messages ?? detail.conflicts ?? []).filter(message => !shown.has(message));
  if (messages.length) errors.form = messages.join(" ");
  return errors;
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

// UI completion only; this does not indicate API validation or trip feasibility.
export function progressOf(data) {
  const keys = data.get("periodMode") === "month"
    ? ["month", "durationDays", "departureLocation", "travelerCount", "budgetAmount", "budgetScope"]
    : ["startDate", "endDate", "departureLocation", "travelerCount", "budgetAmount", "budgetScope"];
  const filled = keys.filter(key => String(data.get(key) ?? "").trim()).length;
  return Math.round(filled / keys.length * 100);
}

// Only recognized thousands separators are removed. Invalid input stays invalid.
export function normalizeBudgetInput(value) {
  const text = String(value ?? "").trim();
  return /^\d{1,3}(,\d{3})+$/.test(text) ? text.replaceAll(",", "") : text;
}

export function formatBudgetInput(value) {
  const raw = normalizeBudgetInput(value);
  return /^\d+$/.test(raw) ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(value ?? "");
}
