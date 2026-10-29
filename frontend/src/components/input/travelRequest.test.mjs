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
assert.equal(clientErrors(form({ ...valid, periodMode: "month", month: "2026-12" })).durationDays, "Số ngày phải từ 1.");

assert.equal(
  valueErrors(form({ ...valid, maxTravelTimeMinutes: "0", appliesTo: "daily" })).maxTravelTimeMinutes,
  "Thời gian di chuyển tối thiểu là 1 phút.",
);
assert.equal(valueErrors(form({ ...valid, departureLocation: "" })).departureLocation, undefined);
assert.equal(clientErrors(form({ periodMode: "dates" })).departureLocation, "Nhập điểm đi.");

const bad = clientErrors(form({ ...valid, endDate: "2026-11-01", departureLocation: "  " }));
assert.equal(bad.endDate, "Ngày về phải từ ngày đi trở đi.");
assert.equal(bad.departureLocation, "Nhập điểm đi.");
