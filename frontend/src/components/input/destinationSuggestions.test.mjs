import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SUGGESTIONS, filterSuggestions, mockDestinationSuggester, placeKey, setDestinationSuggester, suggestDestinations } from "./destinationSuggestions.js";

const SUPPORTED = [
  { id: "H", city: "Huế" },
  { id: "NT", city: "Nha Trang" },
  { id: "HCM", city: "Thành phố Hồ Chí Minh" },
  { id: "DN", city: "Đà Nẵng" },
  { id: "LD", city: "Lâm Đồng" },
  { id: "NB", name: "Ninh Bình" },
];
const REQUEST = { departureLocation: "Ho Chi Minh City", durationDays: 3, travelers: { count: 2 }, budget: { amount: 8000000, currency: "VND", scope: "group" } };

test("placeKey matches names regardless of accents, case and city prefixes", () => {
  assert.equal(placeKey("Đà Nẵng"), placeKey("da nang"));
  assert.equal(placeKey("Thành phố Hồ Chí Minh"), placeKey("Ho Chi Minh City"));
  assert.equal(placeKey("  HUẾ "), "hue");
  assert.equal(placeKey(null), "");
});

test("unsupported, departure, duplicate and malformed suggestions are filtered out", () => {
  const kept = filterSuggestions([
    { city: "Atlantis", reason: "Not in the dataset." },
    { city: "Ho Chi Minh City", reason: "Departure city." },
    { city: "da nang", reason: "Beaches." },
    { city: "Đà Nẵng", reason: "Duplicate." },
    { city: 42, reason: "Wrong type." },
    null,
    { reason: "No city." },
    { city: "Hue" },
  ], SUPPORTED, "Thành phố Hồ Chí Minh");
  assert.deepEqual(kept, [{ city: "Đà Nẵng", reason: "Beaches." }, { city: "Huế", reason: "" }], "Supported label is used, never the adapter's spelling");
  assert.deepEqual(filterSuggestions("not a list", SUPPORTED, ""), []);
  assert.deepEqual(filterSuggestions([{ city: "Hue" }], [], ""), [], "Without a supported list nothing can be suggested");
});

test("suggestions are capped", () => {
  const many = SUPPORTED.map(item => ({ city: item.city || item.name, reason: "ok" }));
  assert.equal(filterSuggestions(many, SUPPORTED, "Ha Noi").length, MAX_SUGGESTIONS);
});

test("the mock adapter only returns supported cities and makes no network call", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("The mock must not call the network"); };
  try {
    const raw = await mockDestinationSuggester({ ...REQUEST, additionalRequirements: "We love the beach and seafood." }, { destinations: SUPPORTED });
    const labels = new Set(SUPPORTED.map(item => item.city || item.name));
    assert.ok(raw.length > 0);
    for (const item of raw) { assert.ok(labels.has(item.city), item.city); assert.equal(typeof item.reason, "string"); }
    assert.ok(["Đà Nẵng", "Nha Trang"].includes(raw[0].city), "Description keywords rank coastal cities first");
    const shown = await suggestDestinations(REQUEST, SUPPORTED);
    assert.ok(shown.length > 0 && shown.length <= MAX_SUGGESTIONS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an injected adapter is filtered, and its errors and timeouts reach the caller", async () => {
  try {
    let received;
    setDestinationSuggester(async (request, { destinations }) => {
      received = { request, destinations };
      return [{ city: "Atlantis", reason: "x" }, { city: "Nha Trang", reason: "Sea." }];
    });
    assert.deepEqual(await suggestDestinations(REQUEST, SUPPORTED), [{ city: "Nha Trang", reason: "Sea." }]);
    assert.equal(received.request, REQUEST);
    assert.equal(received.destinations, SUPPORTED);

    setDestinationSuggester(async () => { throw new Error("M3 down"); });
    await assert.rejects(suggestDestinations(REQUEST, SUPPORTED), /M3 down/);

    setDestinationSuggester(() => new Promise(() => {}));
    await assert.rejects(suggestDestinations(REQUEST, SUPPORTED, { timeoutMs: 20 }), /timed out/);
  } finally {
    setDestinationSuggester(null);
  }
});
