import assert from "node:assert/strict";
import { buildPayload, clientErrors, valueErrors, progressOf, normalizeBudgetInput, formatBudgetInput } from "./travelRequest.js";

function form(entries) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) value.forEach((item) => data.append(key, item));
    else data.append(key, value);
  }
  return data;
}

const valid = {
  periodMode: "dates",
  startDate: "2026-11-12",
  endDate: "2026-11-14",
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
assert.equal(payload.travelPeriod.startDate, "2026-11-12");
assert.equal(payload.durationDays, 3);
assert.equal(payload.budget.currency, "VND");
assert.deepEqual(payload.preferences.interests, [{ type: "sightseeing", priority: 1 }]);
assert.equal(clientErrors(form(valid)).durationDays, undefined);

const month = buildPayload(form({ ...valid, periodMode: "month", month: "2026-12", durationDays: "4" }));
assert.deepEqual(month.travelPeriod, { month: "2026-12" });
assert.equal(month.durationDays, 4);
assert.equal(clientErrors(form({ ...valid, periodMode: "month", month: "2026-12" })).durationDays, "This field is required.");

assert.equal(
  valueErrors(form({ ...valid, maxTravelTimeMinutes: "0", appliesTo: "daily" })).maxTravelTimeMinutes,
  "Travel time must be at least 1 minute.",
);
assert.equal(valueErrors(form({ ...valid, departureLocation: "" })).departureLocation, undefined);
assert.equal(clientErrors(form({ periodMode: "dates" })).departureLocation, "This field is required.");

const bad = clientErrors(form({ ...valid, endDate: "2026-11-01", departureLocation: "  " }));
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
assert.equal(progressOf(form({ periodMode: "month", startDate: "2026-11-12", endDate: "2026-11-14" })), 0);
assert.equal(progressOf(form({ ...valid, periodMode: "month", month: "2026-12", durationDays: "4" })), 100);
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
