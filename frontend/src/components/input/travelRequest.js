export const INTERESTS = [
  ["sightseeing", "Sightseeing"],
  ["culture", "Culture"],
  ["nature", "Nature"],
  ["relaxation", "Relaxation"],
];

export const ADDITIONAL_REQUIREMENTS_MAX = 500;

// Inclusive trip length the form allows. Backend schema only requires durationDays >= 1;
// the MVP target is 1–3 days and is not yet enforced server-side.
export const MAX_TRIP_DAYS = 3;
export const TRIP_TIME_ZONE = "Asia/Bangkok";
export const MAX_START_AHEAD_YEARS = 1;
export const MAX_MONTHS_AHEAD = 12;

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatIsoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Today's calendar date in Asia/Bangkok, as YYYY-MM-DD.
export function localTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRIP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function localYearMonth(now = new Date()) {
  return localTodayIso(now).slice(0, 7);
}

export function addDaysIso(iso, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days)));
  return formatIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addYearsIso(iso, years) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year + Number(years), month - 1, day));
  return formatIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addMonthsYm(yearMonth, months) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(yearMonth ?? ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(months), 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function startDateBounds(now = new Date()) {
  const today = localTodayIso(now);
  return { min: today, max: addYearsIso(today, MAX_START_AHEAD_YEARS) };
}

// End date is inclusive: start through start + (MAX_TRIP_DAYS - 1).
// A range may cross a month or year boundary.
export function endDateBounds(start, now = new Date()) {
  const today = localTodayIso(now);
  if (!isIsoDate(start)) {
    return { min: today, max: addDaysIso(today, MAX_TRIP_DAYS - 1) };
  }
  return { min: start, max: addDaysIso(start, MAX_TRIP_DAYS - 1) };
}

export function monthBounds(now = new Date()) {
  const current = localYearMonth(now);
  return { min: current, max: addMonthsYm(current, MAX_MONTHS_AHEAD) };
}

export function tripLimitHint() {
  return `Up to ${MAX_TRIP_DAYS} days`;
}

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
export function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match || Number(match[1]) < 1) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Inclusive civil-day count for two YYYY-MM-DD calendar dates. Uses the date
// parts only (not local midnights), so a Bangkok evening is not shifted back a day.
export function inclusiveDays(start, end) {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return null;
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const count = Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86400000) + 1;
  return Number.isInteger(count) && count > 0 ? count : null;
}

export function isValidTripDays(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_TRIP_DAYS;
}

export function endDateFromLength(start, days) {
  if (!isIsoDate(start) || !isValidTripDays(days)) return "";
  return addDaysIso(start, Number(days) - 1);
}

// Formats a calendar date in Asia/Bangkok, e.g. "Sat, 16 Nov".
export function formatBangkokDate(iso, options = { weekday: "short", day: "numeric", month: "short" }) {
  if (!isIsoDate(iso)) return "";
  return new Date(`${iso}T12:00:00+07:00`).toLocaleDateString("en-GB", { timeZone: TRIP_TIME_ZONE, ...options });
}

export function formatReturnLabel(iso) {
  if (!isIsoDate(iso)) return "";
  const weekday = formatBangkokDate(iso, { weekday: "short" });
  const rest = formatBangkokDate(iso, { day: "numeric", month: "short" });
  return `Returns ${weekday}, ${rest}`;
}

// Resolves a safe dates-only trip period. Duration cards are the source of truth
// when present; otherwise a start/end pair is used if it is 1..MAX_TRIP_DAYS.
// Returns null for past starts, over-long ranges, or invalid values — buildPayload
// must not send those.
export function resolveTripPeriod(data, now = new Date()) {
  const start = data.get("startDate");
  const today = localTodayIso(now);
  const { max: startMax } = startDateBounds(now);
  if (!isIsoDate(start) || start < today || start > startMax) return null;

  const rawDays = data.get("durationDays");
  if (rawDays !== "" && rawDays != null) {
    if (!isValidTripDays(rawDays)) return null;
    const days = Number(rawDays);
    return { startDate: start, endDate: endDateFromLength(start, days), durationDays: days };
  }

  const end = data.get("endDate");
  const span = inclusiveDays(start, end);
  if (!isValidTripDays(span)) return null;
  return { startDate: start, endDate: end, durationDays: span };
}

export const REQUIRED = "This field is required.";

function filledWrong(value, bad) {
  return value !== "" && value != null && bad(Number(value));
}

export function valueErrors(data) {
  const errors = {};
  const start = data.get("startDate");
  const end = data.get("endDate");
  const today = localTodayIso();
  const { min: startMin, max: startMax } = startDateBounds();
  if (start && !isIsoDate(start)) errors.startDate = "Use a full date (YYYY-MM-DD).";
  else if (start && start < startMin) errors.startDate = "Start date can't be in the past.";
  else if (start && start > startMax) errors.startDate = "Start date must be within 1 year from today.";
  const rawDays = data.get("durationDays");
  if (rawDays !== "" && rawDays != null && !isValidTripDays(rawDays)) {
    errors.durationDays = `Choose 1 to ${MAX_TRIP_DAYS} days.`;
  }
  if (end && !isIsoDate(end)) errors.endDate = "Use a full date (YYYY-MM-DD).";
  else if (end && !errors.endDate && isIsoDate(start) && end < start) {
    errors.endDate = "End date must be on or after the start date.";
  } else if (end && !errors.endDate && isIsoDate(start)) {
    const span = inclusiveDays(start, end);
    if (span == null || span > MAX_TRIP_DAYS) {
      errors.endDate = `Choose an end date within ${MAX_TRIP_DAYS} days of the start date.`;
    }
  } else if (end && !errors.endDate && end < today) {
    errors.endDate = "End date can't be in the past.";
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
  if (!data.get("startDate")) errors.startDate = REQUIRED;
  const hasLength = isValidTripDays(data.get("durationDays"));
  const hasEnd = isIsoDate(data.get("endDate")) && !errors.endDate;
  if (!hasLength && !hasEnd && !errors.durationDays) errors.durationDays = REQUIRED;
  if (!String(data.get("departureLocation") ?? "").trim()) {
    errors.departureLocation = REQUIRED;
  }
  if (data.get("travelerCount") === "" || data.get("travelerCount") == null) {
    errors.travelerCount = REQUIRED;
  }
  const budgetRaw = normalizeBudgetInput(data.get("budgetAmount"));
  if (budgetRaw === "") errors.budgetAmount = REQUIRED;
  else if (/^\d+$/.test(budgetRaw) && Number(budgetRaw) > 0 && Number(budgetRaw) < 1000) {
    errors.budgetAmount = "Enter at least 1,000 VND.";
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

export function buildPayload(data, now = new Date()) {
  const period = resolveTripPeriod(data, now);
  if (!period) {
    throw new Error("Trip dates must be today or later and at most 3 days.");
  }
  const payload = {
    travelPeriod: { startDate: period.startDate, endDate: period.endDate },
    durationDays: period.durationDays,
    departureLocation: String(data.get("departureLocation")).trim(),
    travelers: { count: Number(data.get("travelerCount")) },
    budget: {
      amount: Number(thousandVnd(data.get("budgetAmount"))),
      currency: "VND",
      scope: isSoloTravelerCount(data.get("travelerCount")) ? "perPerson" : data.get("budgetScope"),
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
  const keys = ["startDate", "durationDays", "departureLocation", "travelerCount", "budgetAmount", "budgetScope"];
  const filled = keys.filter(key => String(data.get(key) ?? "").trim()).length;
  return Math.round(filled / keys.length * 100);
}

// Only recognized thousands separators are removed. Invalid input stays invalid.
export function normalizeBudgetInput(value) {
  const text = String(value ?? "").trim();
  return /^\d{1,3}(,\d{3})+$/.test(text) ? text.replaceAll(",", "") : text;
}

// Trip budgets ignore VND below 1,000. 3,987,654 is saved as 3,987,000.
function thousandVnd(value) {
  const raw = normalizeBudgetInput(value);
  if (!/^\d+$/.test(raw)) return raw;
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount < 1000) return raw;
  return String(Math.floor(amount / 1000) * 1000);
}

export function formatBudgetInput(value) {
  const raw = thousandVnd(value);
  return /^\d+$/.test(raw) ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(value ?? "");
}

// A single traveler can only use a per-person budget.
export function isSoloTravelerCount(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n === 1;
}
