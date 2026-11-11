import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";

// DOM-level integration for TPVA-42/43: skipped destination -> suggestion confirmation.
test("M1 skipped destination: supported suggestions only, go back, adapter errors, re-validate before generate", async () => {
  const runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => runtimeErrors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", virtualConsole });
  const doc = dom.window.document;
  let fetchCalls = [];
  let validateImpl = async () => ({ ok: true, json: async () => ({ valid: true }) });
  const replacements = {
    window: dom.window, document: doc, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData,
    sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    requestAnimationFrame: callback => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, options) => {
      fetchCalls.push({ url, payload: options?.body ? JSON.parse(options.body) : undefined });
      if (url === "/api/v1/destinations") return { ok: true, json: async () => ({ destinations: [{ id: "DN", city: "Đà Nẵng" }, { id: "H", city: "Huế" }, { id: "NT", city: "Nha Trang" }] }) };
      if (url === "/api/v1/requests/validate") return validateImpl(options);
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "SuggestionHarness.mjs");
  // One bundle, so the injected adapter is the same module instance the form uses.
  await build({
    stdin: { contents: 'export { default } from "./TravelForm.jsx";\nexport { setDestinationSuggester } from "./destinationSuggestions.js";\n', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "js" },
    outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" }, define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  const field = name => doc.getElementById(name) ?? doc.querySelector(`[name="${name}"]`);
  const fill = async (name, value) => actOn(() => { const control = field(name); assert.ok(control, name); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set.call(control, value); control.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  const button = label => [...doc.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label || node.textContent.replace("‹", "").trim() === label);
  const click = async label => actOn(() => { assert.ok(button(label), label); button(label).click(); });
  const radio = async (name, value) => actOn(() => doc.querySelector(`[name="${name}"][value="${value}"]`).click());
  const visible = () => [...doc.querySelectorAll(".request-step")].filter(node => !node.hidden).map(node => Number(node.dataset.step));
  const suggested = () => [...doc.querySelectorAll('[name="suggestedDestination"]')].map(node => node.value);
  const validateCalls = () => fetchCalls.filter(call => call.url === "/api/v1/requests/validate");
  const generateCalls = () => fetchCalls.filter(call => /\/itineraries\//.test(call.url));
  const onResults = () => Boolean(doc.querySelector("#results-probe"));
  const BASE = {
    travelPeriod: { startDate: "2031-03-02", endDate: "2031-03-04" },
    durationDays: 3,
    departureLocation: "Ha Noi",
    travelers: { count: 2 },
    budget: { amount: 9000000, currency: "VND", scope: "group" },
  };
  try {
    const { default: TravelForm, setDestinationSuggester } = await import(output);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter, Routes, Route } = await import("react-router-dom");
    let adapterCalls = [];
    let adapter = async () => [];
    setDestinationSuggester(async (request, context) => { adapterCalls.push({ request, context }); return adapter(request, context); });
    root = createRoot(doc.querySelector("#root"));
    await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(Routes, null,
      React.createElement(Route, { path: "/", element: React.createElement(TravelForm) }),
      React.createElement(Route, { path: "/results", element: React.createElement("p", { id: "results-probe" }, "results") }),
    ))));

    // Fill the required answers and skip the destination on purpose.
    await fill("departureLocation", "  Ha Noi ");
    await click("Next");
    await fill("destination", "Typed then skipped");
    await click("Not sure yet");
    assert.equal(field("destination").value, "");
    await fill("startDate", "2031-03-02");
    await fill("endDate", "2031-03-04");
    await click("Next");
    await click("2 travelers");
    await click("Next");
    await fill("budgetAmount", "9000000");
    await radio("budgetScope", "group");
    await click("Next");
    await click("Skip for now");
    assert.deepEqual(visible(), [6]);
    assert.equal(validateCalls().length, 0);

    // Adapter error: clear message, no confirm button, nothing saved or generated.
    adapter = async () => { throw new Error("M3 unavailable"); };
    await click("Create itinerary");
    assert.deepEqual(validateCalls().map(call => call.payload), [BASE], "Skipped destination is validated without preferences.destination");
    assert.deepEqual(visible(), [7], "Suggestion screen replaces navigation");
    assert.equal(doc.querySelector(".request-step-count").textContent, "Question 7 of 7", "Counter never exceeds the question count");
    assert.equal(doc.getElementById("destination-suggestion-error").textContent, "We couldn't suggest destinations for this trip. Please choose one yourself.");
    assert.equal(button("Use this destination"), undefined, "Cannot continue without a destination");
    assert.equal(onResults(), false);
    assert.equal(sessionStorage.getItem("tpva-travel-request"), null);
    assert.equal(adapterCalls.at(-1).request.departureLocation, "Ha Noi");
    assert.deepEqual(adapterCalls.at(-1).context.destinations.map(item => item.city), ["Đà Nẵng", "Huế", "Nha Trang"]);

    // Only unsupported suggestions count as none.
    adapter = async () => [{ city: "Atlantis", reason: "Not in the dataset." }, { city: "Ha Noi", reason: "Departure." }];
    await click("Try again");
    assert.deepEqual(visible(), [7]);
    assert.deepEqual(suggested(), []);
    assert.ok(doc.getElementById("destination-suggestion-error"));

    // Retry: unsupported and duplicate cities are filtered, supported labels are used.
    adapter = async () => [
      { city: "Atlantis", reason: "Not in the dataset." },
      { city: "nha trang", reason: "Sea and islands." },
      { city: "Da Nang", reason: "Beaches." },
      { city: "Nha Trang", reason: "Duplicate." },
    ];
    await click("Try again");
    assert.deepEqual(suggested(), ["Nha Trang", "Đà Nẵng"]);
    assert.equal(doc.querySelector(".request-suggestion-reason").textContent, "Sea and islands.");
    assert.equal(doc.getElementById("destination-suggestion-error"), null);
    assert.equal(field("destination").value, "", "Suggestions never fill the form until the user confirms one");

    // Confirming without a choice is blocked and sends nothing.
    const before = validateCalls().length;
    await click("Use this destination");
    assert.equal(doc.getElementById("suggestion-error").textContent, "Choose one of the suggested destinations.");
    assert.equal(validateCalls().length, before);
    assert.equal(onResults(), false);

    // The user rejects the suggestions and goes back to choose themselves.
    await radio("suggestedDestination", "Nha Trang");
    await click("Choose a destination myself");
    assert.deepEqual(visible(), [1]);
    assert.equal(field("destination").value, "", "A selected but unconfirmed suggestion is not applied");
    assert.equal(validateCalls().length, before);
    assert.equal(generateCalls().length, 0);
    await click("Back to review");
    assert.deepEqual(visible(), [6]);
    assert.equal(doc.querySelector(".request-review > div:nth-child(2) dd").textContent, "Not chosen yet. We'll suggest some.");

    // Re-validation failure for the chosen city routes to the destination question.
    await click("Create itinerary");
    assert.deepEqual(visible(), [7]);
    await radio("suggestedDestination", "Đà Nẵng");
    validateImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: { errors: [{ loc: ["body", "preferences", "destination"], msg: "Destination is not supported." }] } }) });
    await click("Use this destination");
    assert.equal(validateCalls().at(-1).payload.preferences.destination, "Đà Nẵng");
    assert.deepEqual(visible(), [1]);
    assert.equal(doc.getElementById("destination-error").textContent, "Destination is not supported.");
    assert.equal(onResults(), false);
    assert.equal(sessionStorage.getItem("tpva-travel-request"), null);
    await click("Not sure yet");
    assert.deepEqual(visible(), [6]);

    // Success: the chosen supported city is re-validated, then saved for results.
    validateImpl = async () => ({ ok: true, json: async () => ({ valid: true }) });
    await click("Create itinerary");
    assert.deepEqual(validateCalls().at(-1).payload, BASE, "Destination was cleared again before suggesting");
    await radio("suggestedDestination", "Đà Nẵng");
    fetchCalls = [];
    await click("Use this destination");
    const chosen = { ...BASE, preferences: { destination: "Đà Nẵng" } };
    assert.deepEqual(fetchCalls, [{ url: "/api/v1/requests/validate", payload: chosen }], "Exactly one re-validation, no generate call from the form");
    assert.deepEqual(JSON.parse(sessionStorage.getItem("tpva-travel-request")), chosen);
    assert.equal(onResults(), true);
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
