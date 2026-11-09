import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { buildPayload, clientErrors } from "./travelRequest.js";

// DOM-level integration, not a browser visual or screen-reader test.
test("M1 compact request: budget slider, exact manual input, validation and retention", async () => {
  const runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => runtimeErrors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", virtualConsole });
  const replacements = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData,
    sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    requestAnimationFrame: callback => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "HomePage.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../../pages/HomePage.jsx", import.meta.url))], outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external", loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" }, define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  const field = name => dom.window.document.getElementById(name) ?? dom.window.document.querySelector(`[name="${name}"]`);
  const fill = async (name, value) => actOn(() => { const control = field(name); assert.ok(control, name); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set.call(control, value); control.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  const button = text => [...dom.window.document.querySelectorAll("button")].find(node => node.textContent === text);
  const click = async text => actOn(() => { assert.ok(button(text), text); button(text).click(); });
  try {
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router-dom");
    const { default: HomePage } = await import(output);
    root = createRoot(dom.window.document.querySelector("#root"));
    await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(HomePage))));
    const form = dom.window.document.querySelector("form");
    assert.ok(dom.window.document.querySelector(".plan-intro"));
    assert.ok(dom.window.document.querySelector(".plan-layout .plan-aside"));
    assert.equal(dom.window.document.querySelector("#plan-prep-title").textContent, "Three things make the first draft easier.");
    assert.equal(dom.window.document.querySelector(".plan-outcomes h2").textContent, "What you get");
    await actOn(() => dom.window.document.querySelector(".entry-choice-card").click());
    assert.equal(dom.window.document.querySelector("#trip-form-panel").hidden, false);
    assert.equal(dom.window.document.activeElement.id, "departureLocation");
    assert.ok(button("Switch to describing"));
    assert.equal(form.querySelector(".request-steps"), null);
    assert.equal(button("Continue"), undefined);
    assert.equal(form.querySelectorAll(".simple-trip-card").length, 1);
    assert.equal(field("departureLocation").closest(".simple-trip-card"), field("budgetAmount").closest(".simple-trip-card"));
    assert.equal(form.querySelector("summary").textContent, "Describe more");
    assert.equal(form.querySelector("details").open, false);
    assert.equal(field("travelerCount").value, "");
    assert.equal(field("budgetAmount").value, "");
    assert.equal(field("budgetScope").checked, false);
    assert.equal(field("budgetSlider").value, "0");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "Budget not set");
    assert.equal(field("budgetSlider").name, "");
    assert.equal(new FormData(form).has("budgetSlider"), false);
    const initialFetch = globalThis.fetch;
    let invalidSubmitCalls = 0;
    globalThis.fetch = () => { invalidSubmitCalls += 1; throw new Error("Incomplete input must not call the API"); };
    try { await click("Create itinerary"); } finally { globalThis.fetch = initialFetch; }
    assert.equal(invalidSubmitCalls, 0);
    assert.equal(dom.window.document.activeElement.id, "departureLocation");

    // Explicitly choosing zero at the untouched thumb works with keyboard or pointer.
    await actOn(() => field("budgetSlider").dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "Home", bubbles: true })));
    assert.equal(field("budgetAmount").value, "0");
    await fill("budgetAmount", "");
    await actOn(() => field("budgetSlider").dispatchEvent(new dom.window.Event("pointerup", { bubbles: true })));
    assert.equal(field("budgetAmount").value, "0");
    // Slider -> field, manual field -> exact slider value, no rounding or price chips.
    await fill("budgetSlider", "7500000");
    assert.equal(field("budgetAmount").value, "7,500,000");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "7,500,000 VND");
    await fill("budgetAmount", "1234567");
    assert.equal(field("budgetSlider").value, "1234567");
    await fill("budgetAmount", "45,678,901");
    assert.equal(field("budgetSlider").max, "45678901");
    assert.equal(field("budgetSlider").value, "45678901");
    assert.equal(buildPayload(new FormData(form)).budget.amount, 45678901);
    await fill("budgetSlider", "12345678");
    assert.equal(field("budgetAmount").value, "12,345,678");
    assert.equal(field("budgetSlider").max, "45678901", "Sliding must not shrink its own range");
    for (const invalid of ["-1", "1.5", "abc", "1,00", "9007199254740992"]) {
      await fill("budgetAmount", invalid);
      assert.equal(field("budgetAmount").value, invalid);
      assert.ok(clientErrors(new FormData(form)).budgetAmount);
    }
    await fill("budgetAmount", "0");
    assert.equal(field("budgetSlider").value, "0");
    assert.equal(buildPayload(new FormData(form)).budget.amount, 0);
    assert.equal(clientErrors(new FormData(form)).budgetAmount, undefined);
    await fill("budgetAmount", "");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "Budget not set");
    assert.equal(clientErrors(new FormData(form)).budgetAmount, "This field is required.");
    assert.equal(new FormData(form).get("budgetAmount"), "");
    await fill("budgetAmount", "7654321");
    await actOn(() => { field("budgetAmount").focus(); field("budgetAmount").blur(); });
    assert.equal(field("budgetAmount").value, "7,654,321");
    assert.equal(field("budgetSlider").value, "7654321");
    assert.equal(field("budgetSlider").max, "20000000");

    await fill("departureLocation", "Hue");
    await fill("startDate", "2030-06-01");
    await fill("endDate", "2030-06-03");
    await fill("travelerCount", "2");
    assert.equal(clientErrors(new FormData(form)).budgetScope, "This field is required.");
    await actOn(() => form.querySelector('[name="budgetScope"][value="group"]').click());
    await actOn(() => form.querySelector("summary").click());
    await fill("characteristics", "older adult");
    await fill("diningPreferred", "seafood");
    await actOn(() => field("diningPreferred").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await actOn(() => form.querySelector('[name="interest"][value="nature"]').click());
    await fill("maxDistanceKm", "50");
    await fill("appliesTo", "daily");

    // Optional errors reopen Describe more and focus the visible invalid field.
    await fill("maxDistanceKm", "0");
    await actOn(() => form.querySelector("summary").click());
    assert.equal(form.querySelector("details").open, false);
    const beforeOptional = globalThis.fetch;
    let optionalCalls = 0;
    globalThis.fetch = () => { optionalCalls += 1; throw new Error("Invalid optional values must not call the API"); };
    try { await click("Create itinerary"); } finally { globalThis.fetch = beforeOptional; }
    assert.equal(optionalCalls, 0);
    assert.equal(form.querySelector("details").open, true);
    assert.equal(dom.window.document.activeElement.id, "maxDistanceKm");
    await fill("maxDistanceKm", "50");
    // Both panels stay mounted: preserve form values, Describe answers and draft.
    await click("Switch to describing");
    assert.equal(dom.window.document.querySelector("#trip-form-panel").hidden, true);
    assert.equal(dom.window.document.activeElement.id, "describe-draft");
    await fill("describe-draft", "A quiet coastal place");
    await click("Send");
    await fill("describe-draft", "Two adults");
    await click("Switch to the form");
    assert.equal(dom.window.document.activeElement.id, "departureLocation");
    assert.equal(field("budgetAmount").value, "7,654,321");
    assert.equal(field("budgetSlider").value, "7654321");
    assert.equal(field("characteristics").value, "older adult");
    assert.equal(form.querySelector("details").open, true);
    assert.equal(form.querySelector('[name="diningPreferred"][type="hidden"]').value, "seafood");
    await click("Switch to describing");
    assert.equal(field("describe-draft").value, "Two adults");
    assert.equal(dom.window.document.querySelector(".describe-answer").textContent, "A quiet coastal place");
    await click("Switch to the form");
    const payload = buildPayload(new FormData(form));
    assert.deepEqual(payload.travelers, { count: 2, characteristics: ["older adult"] });
    assert.deepEqual(payload.budget, { amount: 7654321, currency: "VND", scope: "group" });
    assert.equal(payload.durationDays, 3);
    assert.deepEqual(payload.preferences.interests, [{ type: "nature" }]);
    assert.deepEqual(payload.preferences.dining, { preferred: ["seafood"], avoid: [] });
    assert.deepEqual(payload.limits, { maxDistanceKm: 50, appliesTo: "daily" });
    assert.equal("prompt" in payload || "description" in payload || "budgetSlider" in payload, false);
    const oldFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ valid: true, data: payload }) }; };
    try { await click("Create itinerary"); } finally { globalThis.fetch = oldFetch; }
    assert.deepEqual(requests, [{ url: "/api/v1/requests/validate", payload }]);
    await click("Clear form");
    assert.equal(dom.window.document.activeElement.id, "departureLocation");
    assert.equal(field("travelerCount").value, "");
    assert.equal(field("budgetAmount").value, "");
    assert.equal(field("budgetSlider").value, "0");
    assert.equal(field("budgetSlider").max, "20000000");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "Budget not set");
    assert.equal(field("characteristics").value, "");
    assert.equal(form.isConnected, false);
    const clean = dom.window.document.querySelector("form");
    assert.equal(clean.querySelector("details").open, false);
    assert.equal(clean.querySelector('[name="diningPreferred"][type="hidden"]'), null);
    assert.equal(clean.querySelector(".completion-label").textContent, "0% finding");
    await actOn(() => { field("periodMode").value = "month"; field("periodMode").dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await fill("departureLocation", "Hue");
    await fill("month", "2030-07");
    await fill("durationDays", "3");
    await fill("travelerCount", "6");
    await fill("budgetAmount", "70123456");
    await actOn(() => clean.querySelector('[name="budgetScope"][value="perPerson"]').click());
    const custom = buildPayload(new FormData(clean));
    assert.deepEqual(custom.travelPeriod, { month: "2030-07" });
    assert.equal(custom.durationDays, 3);
    assert.equal(custom.travelers.count, 6);
    assert.equal(custom.budget.amount, 70123456);
    assert.equal(custom.budget.scope, "perPerson");
    assert.equal(field("budgetSlider").value, "70123456");
    assert.deepEqual(clientErrors(new FormData(clean)), {});
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
