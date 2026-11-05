import assert from "node:assert/strict";
import { buildPayload, clientErrors, valueErrors } from "./travelRequest.js";

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
