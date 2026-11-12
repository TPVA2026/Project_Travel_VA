import assert from "node:assert/strict";
import { ADDITIONAL_REQUIREMENTS_MAX, MAX_TRIP_DAYS, buildPayload, clientErrors, valueErrors, progressOf, normalizeBudgetInput, formatBudgetInput, inclusiveDays, isSoloTravelerCount, serverFieldErrors, localTodayIso, localYearMonth, addDaysIso, addYearsIso, addMonthsYm, startDateBounds, endDateBounds, monthBounds, tripLimitHint } from "./travelRequest.js";

function form(entries) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) value.forEach((item) => data.append(key, item));
    else data.append(key, value);
  }
  return data;
}

const today = localTodayIso();
const validEnd = addDaysIso(today, MAX_TRIP_DAYS - 1);
const currentMonth = localYearMonth();
const nextMonth = addMonthsYm(currentMonth, 1);
const valid = {
  periodMode: "dates",
  startDate: today,
  endDate: validEnd,
  departureLocation: "Ho Chi Minh City",
  travelerCount: "2",
  budgetAmount: "8000000",
  budgetScope: "group",
  interest: ["sightseeing"],
  sightseeingPriority: "1",
};

const withLists = form(valid);
withLists.append("transportation", "taxi");
withLists.append("transportation", "walking");
withLists.append("diningPreferred", "hải sản");
const payload = buildPayload(withLists);
assert.deepEqual(payload.preferences.transportation, ["taxi", "walking"]);
assert.deepEqual(payload.preferences.dining.preferred, ["hải sản"]);
assert.equal(payload.travelPeriod.startDate, today);
assert.equal(payload.durationDays, MAX_TRIP_DAYS);
assert.equal(payload.budget.currency, "VND");
assert.deepEqual(payload.preferences.interests, [{ type: "sightseeing", priority: 1 }]);
assert.equal(clientErrors(form(valid)).durationDays, undefined);

const month = buildPayload(form({ ...valid, periodMode: "month", month: nextMonth, durationDays: String(MAX_TRIP_DAYS) }));
assert.deepEqual(month.travelPeriod, { month: nextMonth });
assert.equal(month.durationDays, MAX_TRIP_DAYS);
assert.equal(clientErrors(form({ ...valid, periodMode: "month", month: nextMonth })).durationDays, "This field is required.");

assert.equal(
  valueErrors(form({ ...valid, maxTravelTimeMinutes: "0", appliesTo: "daily" })).maxTravelTimeMinutes,
  "Travel time must be at least 1 minute.",
);
assert.equal(valueErrors(form({ ...valid, departureLocation: "" })).departureLocation, undefined);
assert.equal(clientErrors(form({ periodMode: "dates" })).departureLocation, "This field is required.");

// Departure stays required and is trimmed; a skipped or blank destination is omitted, never guessed.
const trimmed = buildPayload(form({ ...valid, departureLocation: "  Ho Chi Minh City  ", destination: "   " }));
assert.equal(trimmed.departureLocation, "Ho Chi Minh City");
assert.equal(Object.hasOwn(trimmed.preferences, "destination"), false);
const noPreferences = buildPayload(form({ ...valid, interest: [], sightseeingPriority: "" }));
assert.equal(noPreferences.preferences, undefined);
assert.equal(buildPayload(form({ ...valid, destination: " Da Nang " })).preferences.destination, "Da Nang");

const bad = clientErrors(form({ ...valid, endDate: addDaysIso(today, -1), departureLocation: "  " }));
assert.equal(bad.endDate, "End date must be on or after the start date.");
assert.equal(bad.departureLocation, "This field is required.");

// Simplified UI: selecting interests never invents a priority.
const simple = form(valid);
simple.delete("sightseeingPriority");
assert.deepEqual(buildPayload(simple).preferences.interests, [{ type: "sightseeing" }]);
assert.deepEqual(clientErrors(simple), {});

// Blank optional details stay unspecified; core requirements remain enforced.
simple.delete("interest");
assert.equal(buildPayload(simple).preferences, undefined);
assert.equal(buildPayload(simple).limits, undefined);
simple.delete("budgetScope");
assert.equal(clientErrors(simple).budgetScope, "This field is required.");

assert.equal(progressOf(form({})), 0);
assert.equal(progressOf(form({ departureLocation: "Da Nang", travelerCount: "2", budgetAmount: "0" })), 50);
assert.equal(progressOf(form(valid)), 100);
assert.equal(progressOf(form({ periodMode: "month", startDate: today, endDate: validEnd })), 0);
assert.equal(progressOf(form({ ...valid, periodMode: "month", month: nextMonth, durationDays: String(MAX_TRIP_DAYS) })), 100);
assert.equal(progressOf(form({ destination: "Hoi An", interest: ["nature"] })), 0);

assert.equal(formatBudgetInput("5000000"), "5,000,000");
assert.equal(normalizeBudgetInput("5,000,000"), "5000000");
assert.equal(buildPayload(form({ ...valid, budgetAmount: "5,000,000" })).budget.amount, 5000000);
assert.deepEqual(clientErrors(form({ ...valid, budgetAmount: "5,000,000" })), {});
assert.equal(formatBudgetInput("0"), "0");
for (const invalid of ["5,00,000", "-1", "1.5", "abc"]) {
  assert.equal(formatBudgetInput(invalid), invalid);
  assert.ok(valueErrors(form({ ...valid, budgetAmount: invalid })).budgetAmount);
}
assert.equal(clientErrors(form({ ...valid, budgetAmount: "" })).budgetAmount, "This field is required.");

assert.equal(clientErrors(form({ ...valid, budgetAmount: "   " })).budgetAmount, "This field is required.");
for (const value of ["0x10", "1e3", "+1", "9007199254740993"]) {
  assert.ok(clientErrors(form({ ...valid, budgetAmount: value })).budgetAmount);
}

// Optional fields follow the same limits as the backend schema.
{
  const data = new FormData();
  data.set("maxDistanceKm", "0");
  assert.equal(Boolean(valueErrors(data).maxDistanceKm), true);
  data.set("maxDistanceKm", "0.5");
  assert.equal(valueErrors(data).maxDistanceKm, undefined);
  data.set("characteristics", "x".repeat(81));
  assert.equal(Boolean(valueErrors(data).characteristics), true);
  data.set("characteristics", "older adults, children");
  assert.equal(valueErrors(data).characteristics, undefined);
}

{
  const data = form({ ...valid, characteristics: "older adults\nchildren, vegetarian" });
  assert.deepEqual(buildPayload(data).travelers.characteristics, ["older adults", "children", "vegetarian"]);
}

// Calendar values: ISO only, real dates, any four-digit year, inclusive UTC day count.
assert.equal(inclusiveDays("2031-12-30", "2032-01-02"), 4);
assert.equal(inclusiveDays("2028-02-28", "2028-03-01"), 3);
assert.equal(inclusiveDays("2026-03-28", "2026-03-30"), 3);
assert.equal(inclusiveDays("2026-12-15", "2026-12-12"), null);
assert.equal(inclusiveDays("2026-02-30", "2026-03-01"), null);
assert.equal(valueErrors(form({ ...valid, startDate: "2026-02-30" })).startDate, "Use a full date (YYYY-MM-DD).");
assert.equal(valueErrors(form({ ...valid, startDate: "12/11/2026" })).startDate, "Use a full date (YYYY-MM-DD).");
assert.equal(valueErrors(form({ ...valid, startDate: "2099-01-01", endDate: "2099-01-31" })).startDate, "Start date must be within 1 year from today.");
assert.equal(clientErrors(form({ ...valid, startDate: "2099-01-01", endDate: "2099-01-31" })).startDate, "Start date must be within 1 year from today.");
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: "2026-13", durationDays: "2" })).month, "Use a month and year (YYYY-MM).");
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: "2040-01", durationDays: "2" })).month, "Choose a month within the next 12 months.");
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: "0000-01", durationDays: "2" })).month, "Use a month and year (YYYY-MM).");
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: "incomplete:-03", durationDays: "2" })).month, "Use a month and year (YYYY-MM).");
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: "9999-12", durationDays: "2" })).month, "Choose a month within the next 12 months.");

// Supported trip length and date window (inclusive days, no past dates, start within 1 year).
assert.equal(MAX_TRIP_DAYS, 3);
assert.equal(tripLimitHint(), "Up to 3 days");
assert.deepEqual(startDateBounds(), { min: today, max: addYearsIso(today, 1) });
assert.deepEqual(endDateBounds(today), { min: today, max: addDaysIso(today, MAX_TRIP_DAYS - 1) });
assert.deepEqual(monthBounds(), { min: currentMonth, max: addMonthsYm(currentMonth, 12) });

assert.equal(valueErrors(form({ ...valid, startDate: addDaysIso(today, -1), endDate: today })).startDate, "Start date can't be in the past.");
assert.equal(valueErrors(form({ ...valid, startDate: addDaysIso(addYearsIso(today, 1), 1), endDate: addDaysIso(addYearsIso(today, 1), 2) })).startDate, "Start date must be within 1 year from today.");
assert.equal(valueErrors(form({ ...valid, startDate: today, endDate: addDaysIso(today, MAX_TRIP_DAYS) })).endDate, `Choose an end date within ${MAX_TRIP_DAYS} days of the start date.`);
assert.equal(valueErrors(form({ ...valid, startDate: today, endDate: addDaysIso(today, MAX_TRIP_DAYS - 1) })).endDate, undefined);
assert.equal(clientErrors(form(valid)).startDate, undefined);
assert.equal(clientErrors(form(valid)).endDate, undefined);

// Crossing a month boundary is allowed for both date and month modes.
{
  const startCross = (() => {
    const lastThis = addDaysIso(`${addMonthsYm(currentMonth, 1)}-01`, -1);
    return lastThis >= today ? lastThis : addDaysIso(`${addMonthsYm(currentMonth, 2)}-01`, -1);
  })();
  const endCross = addDaysIso(startCross, MAX_TRIP_DAYS - 1);
  assert.ok(startCross.slice(0, 7) !== endCross.slice(0, 7), "fixture crosses a month");
  const cross = form({ ...valid, startDate: startCross, endDate: endCross });
  assert.deepEqual(clientErrors(cross), {});
  const crossed = buildPayload(cross);
  assert.equal(crossed.durationDays, MAX_TRIP_DAYS);
  assert.deepEqual(crossed.travelPeriod, { startDate: startCross, endDate: endCross });
  assert.ok(crossed.durationDays <= MAX_TRIP_DAYS);
  assert.ok(crossed.travelPeriod.startDate >= today);
}
{
  // The chosen month is the start month only; a 3-day trip may run into the next month.
  const lateMonth = form({ ...valid, periodMode: "month", month: currentMonth, durationDays: String(MAX_TRIP_DAYS) });
  assert.deepEqual(clientErrors(lateMonth), {});
  const payload = buildPayload(lateMonth);
  assert.deepEqual(payload.travelPeriod, { month: currentMonth });
  assert.equal(payload.durationDays, MAX_TRIP_DAYS);
}
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: addMonthsYm(currentMonth, -1), durationDays: "2" })).month, "Choose this month or a later month.");
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: addMonthsYm(currentMonth, 13), durationDays: "2" })).month, "Choose a month within the next 12 months.");
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: nextMonth, durationDays: "0" })).durationDays, `Choose 1 to ${MAX_TRIP_DAYS} days.`);
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: nextMonth, durationDays: "4" })).durationDays, `Choose 1 to ${MAX_TRIP_DAYS} days.`);
assert.equal(valueErrors(form({ ...valid, periodMode: "month", month: addMonthsYm(currentMonth, 12), durationDays: "1" })).month, undefined);

// Forms that pass client checks never yield a payload longer than maxDays or a past start.
{
  const safe = buildPayload(form(valid));
  assert.ok(safe.durationDays >= 1 && safe.durationDays <= MAX_TRIP_DAYS);
  assert.ok(safe.travelPeriod.startDate >= today);
  assert.ok(safe.travelPeriod.endDate <= addDaysIso(safe.travelPeriod.startDate, MAX_TRIP_DAYS - 1));
}

// Optional additionalRequirements: trim, omit when blank, enforce the 500-character limit.
{
  const data = form({ ...valid, additionalRequirements: "  We prefer taxis.  " });
  assert.equal(buildPayload(data).additionalRequirements, "We prefer taxis.");
  assert.equal(valueErrors(data).additionalRequirements, undefined);
}
{
  const data = form({ ...valid, additionalRequirements: "   " });
  assert.equal(buildPayload(data).additionalRequirements, undefined);
  assert.equal("additionalRequirements" in buildPayload(data), false);
}
{
  const data = form(valid);
  assert.equal("additionalRequirements" in buildPayload(data), false);
}
{
  const tooLong = "x".repeat(ADDITIONAL_REQUIREMENTS_MAX + 1);
  const data = form({ ...valid, additionalRequirements: tooLong });
  assert.equal(
    valueErrors(data).additionalRequirements,
    `Extra description must be ${ADDITIONAL_REQUIREMENTS_MAX} characters or fewer.`,
  );
  const exact = form({ ...valid, additionalRequirements: "x".repeat(ADDITIONAL_REQUIREMENTS_MAX) });
  assert.equal(valueErrors(exact).additionalRequirements, undefined);
  assert.equal(buildPayload(exact).additionalRequirements.length, ADDITIONAL_REQUIREMENTS_MAX);
}

// A server message already shown on a field is not repeated at form level.
{
  const long = "Destination is not supported by the current dataset. Choose one of: Da Nang, Hue.";
  const errors = serverFieldErrors({ detail: { errors: [{ loc: ["preferences", "destination"], msg: long }], missing: [], conflicts: [], messages: [long] } });
  assert.deepEqual(errors, { destination: long });
  const both = serverFieldErrors({ detail: { errors: [{ loc: ["preferences", "destination"], msg: long }], messages: [long, "Dates conflict."] } });
  assert.deepEqual(both, { destination: long, form: "Dates conflict." });
}

// TPVA-53: the form sends what the user chose and never invents destination, scope or costs.
{
  const perPerson = buildPayload(form({ ...valid, budgetScope: "perPerson" }));
  assert.deepEqual(perPerson.budget, { amount: 8000000, currency: "VND", scope: "perPerson" });
  assert.equal(perPerson.travelers.count, 2);

  const skipped = buildPayload(form({ ...valid, destination: "   " }));
  assert.equal(skipped.preferences?.destination, undefined, "A blank destination is omitted, not filled in");

  const typed = buildPayload(form({ ...valid, destination: " hue " }));
  assert.equal(typed.preferences.destination, "hue", "The destination is sent as typed, only trimmed");

  const described = buildPayload(form({ ...valid, additionalRequirements: "Take us to Da Nang by taxi" }));
  assert.equal(described.preferences?.destination, undefined, "Free text never fills the destination");
  assert.equal(described.preferences?.transportation, undefined, "Free text never fills transportation");

  for (const key of ["tripCosts", "transportCost", "accommodationCost"]) {
    assert.equal(Object.hasOwn(perPerson, key), false, `${key} is not sent until the contract is agreed`);
  }
}

// One traveler can only be submitted with a per-person budget.
assert.equal(isSoloTravelerCount("1"), true);
assert.equal(isSoloTravelerCount(" 1 "), true);
assert.equal(isSoloTravelerCount(1), true);
assert.equal(isSoloTravelerCount("01"), true);
assert.equal(isSoloTravelerCount("2"), false);
assert.equal(isSoloTravelerCount(""), false);
assert.equal(isSoloTravelerCount("1.5"), false);
{
  const coerced = buildPayload(form({ ...valid, travelerCount: "1", budgetScope: "group" }));
  assert.equal(coerced.travelers.count, 1);
  assert.equal(coerced.budget.scope, "perPerson", "group is never sent with one traveler");
  const kept = buildPayload(form({ ...valid, travelerCount: "1", budgetScope: "perPerson" }));
  assert.equal(kept.budget.scope, "perPerson");
  const group = buildPayload(form({ ...valid, travelerCount: "2", budgetScope: "group" }));
  assert.equal(group.budget.scope, "group");
}
