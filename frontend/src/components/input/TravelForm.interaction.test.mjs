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
test("M1 quick request: validation, exact choices, retention, clear and payload", async () => {
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
    // Preserve main's page shell and its separate non-M1 entry flow.
    assert.ok(dom.window.document.querySelector(".plan-intro"));
    assert.ok(dom.window.document.querySelector(".plan-layout .plan-aside"));
    assert.equal(dom.window.document.querySelector("#plan-prep-title").textContent, "Three things make the first draft easier.");
    assert.equal(dom.window.document.querySelector(".plan-outcomes h2").textContent, "What you get");
    assert.ok(dom.window.document.querySelector("#trip-describe-panel"));
    assert.equal(dom.window.document.querySelector("#trip-form-panel").hidden, true);
    await actOn(() => dom.window.document.querySelector(".entry-choice-card").click());
    assert.equal(dom.window.document.querySelector("#trip-form-panel").hidden, false);
    assert.equal(dom.window.document.activeElement.id, "departureLocation");
    assert.equal(button("Switch to describing"), undefined);
    assert.equal(form.querySelector("summary").textContent, "Describe more");
    assert.equal(field("travelerCount").value, "");
    assert.equal(field("budgetAmount").value, "");
    assert.equal(field("budgetScope").checked, false);
    await click("Continue");
    assert.equal(dom.window.document.activeElement.id, "departureLocation");
    assert.equal(form.querySelector('[aria-label="Travelers and budget"]').hidden, true);
    await fill("departureLocation", "Hue");
    await fill("startDate", "2030-06-01");
    await fill("endDate", "2030-06-03");
    await click("Continue");
    assert.equal(dom.window.document.activeElement.id, "travelerCount");
    for (const count of ["1", "3", "4", "2"]) {
      await click(count);
      assert.equal(field("travelerCount").value, count);
    }
    for (const amount of ["1,000,000", "3,000,000", "10,000,000", "5,000,000"]) {
      await click(amount);
      assert.equal(field("budgetAmount").value, amount);
    }
    assert.equal(field("travelerCount").value, "2");
    assert.equal(field("budgetAmount").value, "5,000,000");
    assert.equal(clientErrors(new FormData(form)).budgetScope, "This field is required.");
    await actOn(() => form.querySelector('[name="budgetScope"][value="group"]').click());
    await actOn(() => form.querySelector("summary").click());
    await fill("characteristics", "older adult");
    await fill("diningPreferred", "seafood");
    await actOn(() => field("diningPreferred").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(form.querySelector('[name="diningPreferred"][type="hidden"]').value, "seafood");
    await actOn(() => form.querySelector('[name="interest"][value="nature"]').click());
    await fill("maxDistanceKm", "50");
    await fill("appliesTo", "daily");
    await click("Back");
    await click("Continue");
    assert.equal(field("characteristics").value, "older adult");
    assert.equal(field("travelerCount").value, "2");
    const payload = buildPayload(new FormData(form));
    assert.deepEqual(payload.travelers, { count: 2, characteristics: ["older adult"] });
    assert.deepEqual(payload.budget, { amount: 5000000, currency: "VND", scope: "group" });
    assert.equal(payload.durationDays, 3);
    assert.deepEqual(payload.preferences.interests, [{ type: "nature" }]);
    assert.deepEqual(payload.preferences.dining, { preferred: ["seafood"], avoid: [] });
    assert.deepEqual(payload.limits, { maxDistanceKm: 50, appliesTo: "daily" });
    assert.equal("prompt" in payload || "description" in payload, false);
    const oldFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ valid: true, data: payload }) }; };
    try { await click("Create itinerary"); } finally { globalThis.fetch = oldFetch; }
    assert.deepEqual(requests, [{ url: "/api/v1/requests/validate", payload }]);
    await click("Clear form");
    assert.equal(dom.window.document.activeElement.id, "departureLocation");
    assert.equal(field("travelerCount").value, "");
    assert.equal(field("characteristics").value, "");
    assert.equal(form.isConnected, false); // React remount clears uncontrolled fields/tags.
    const clean = dom.window.document.querySelector("form");
    assert.equal(clean.querySelector("details").open, false);
    assert.equal(clean.querySelector('[name="diningPreferred"][type="hidden"]'), null);
    assert.equal(clean.querySelector(".completion-label").textContent, "0% finding");
    await actOn(() => { field("periodMode").value = "month"; field("periodMode").dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await fill("departureLocation", "Hue");
    await fill("month", "2030-07");
    for (const days of ["2", "5", "7", "3"]) {
      await click(`${days} days`);
      assert.equal(field("durationDays").value, days);
    }
    await click("Continue");
    await fill("travelerCount", "6");
    await fill("budgetAmount", "7000000");
    await actOn(() => clean.querySelector('[name="budgetScope"][value="perPerson"]').click());
    const custom = buildPayload(new FormData(clean));
    assert.deepEqual(custom.travelPeriod, { month: "2030-07" });
    assert.equal(custom.durationDays, 3);
    assert.equal(custom.travelers.count, 6);
    assert.equal(custom.budget.amount, 7000000);
    assert.equal(custom.budget.scope, "perPerson");
    assert.deepEqual(clientErrors(new FormData(clean)), {});
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
