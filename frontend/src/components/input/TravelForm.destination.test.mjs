import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";

// DOM-level integration for TPVA-41/42/43: the destination is sent as typed or left out;
// the form never shows a suggestion screen or the backend's supported-city list.
// (The static province suggestions are covered in TravelForm.provinces.test.mjs.)
test("M1 destination: plain input, skipped destination goes straight to results, one short message for a destination 422", async () => {
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
      if (url === "/api/v1/requests/validate") return validateImpl(options);
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "SuggestionHarness.mjs");
  await build({
    stdin: { contents: 'export { default } from "./TravelForm.jsx";\n', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "js" },
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
    const { default: TravelForm } = await import(output);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter, Routes, Route } = await import("react-router-dom");
    const mount = async () => {
      if (root) await act(async () => root.unmount());
      sessionStorage.clear();
      fetchCalls = [];
      root = createRoot(doc.querySelector("#root"));
      await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(Routes, null,
        React.createElement(Route, { path: "/", element: React.createElement(TravelForm) }),
        React.createElement(Route, { path: "/results", element: React.createElement("p", { id: "results-probe" }, "results") }),
      ))));
    };
    // Answers every question; the destination is typed or skipped as given.
    const answer = async destination => {
      await fill("departureLocation", "  Ha Noi ");
      await click("Next");
      if (destination) { await fill("destination", destination); await click("Next"); }
      else { await fill("destination", "Typed then skipped"); await click("Not sure yet"); }
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
    };

    // Plain destination input: example placeholder, no supported-city dropdown, no city fetch.
    await mount();
    await fill("departureLocation", "Ha Noi");
    await click("Next");
    assert.deepEqual(visible(), [1]);
    assert.equal(field("destination").placeholder, "e.g. Da Nang, Da Lat");
    assert.equal(field("destination").getAttribute("role"), "combobox", "Province suggestions, not a required pick");
    assert.equal(field("destination").hasAttribute("required"), false);
    assert.equal(doc.getElementById("request-step-1-hint").textContent, "Optional. Skip it and we'll suggest destinations based on your trip.");
    assert.equal(fetchCalls.some(call => call.url === "/api/v1/destinations"), false, "The form does not load the supported-city list");

    // Skipped destination: sent without preferences.destination, straight to results.
    await mount();
    await answer("");
    assert.equal(doc.querySelector(".request-review > div:nth-child(2) dd").textContent, "Not chosen. We'll suggest destinations based on your trip.");
    assert.equal(doc.querySelectorAll(".request-step").length, 7, "Seven questions, no suggestion screen");
    assert.doesNotMatch(doc.body.textContent, /Pick a destination/);
    await click("Create itinerary");
    assert.deepEqual(validateCalls().map(call => call.payload), [BASE], "Skipped destination is validated without preferences.destination");
    assert.deepEqual(JSON.parse(sessionStorage.getItem("tpva-travel-request")), BASE);
    assert.equal(onResults(), true, "Navigates to results without a suggestion screen");
    assert.equal(doc.querySelector('[name="suggestedDestination"]'), null);
    assert.equal(generateCalls().length, 0, "The form itself never calls generate");

    // Unsupported destination: the backend 422 (long list of cities) becomes one short message.
    await mount();
    await answer("dasd");
    const longMessage = "Destination is not supported by the current dataset. Choose one of: Đà Nẵng, Huế, Nha Trang.";
    validateImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: {
      errors: [{ loc: ["preferences", "destination"], msg: longMessage, type: "value_error.destination_not_supported" }],
      missing: [], conflicts: [], messages: [longMessage],
    } }) });
    await click("Create itinerary");
    assert.equal(validateCalls().at(-1).payload.preferences.destination, "dasd", "The typed destination is sent as typed");
    assert.deepEqual(visible(), [6], "Stays on review");
    assert.equal(doc.getElementById("destination-error"), null, "No error under the destination field");
    assert.equal(field("destination").hasAttribute("aria-invalid"), false);
    const shown = [...doc.querySelectorAll(".error")].map(node => node.textContent);
    assert.deepEqual(shown, ["We couldn't plan a trip to that destination. Edit it or skip it to get suggestions."], "Shown once, at form level");
    assert.doesNotMatch(doc.body.textContent, /Choose one of|Nha Trang/, "The supported-city list is never rendered");
    assert.equal(onResults(), false);
    assert.equal(sessionStorage.getItem("tpva-travel-request"), null);

    // Skipping the destination afterwards submits without it.
    validateImpl = async () => ({ ok: true, json: async () => ({ valid: true }) });
    await click("Edit destination");
    await click("Not sure yet");
    assert.deepEqual(visible(), [6]);
    await click("Create itinerary");
    assert.deepEqual(validateCalls().at(-1).payload, BASE);
    assert.equal(onResults(), true);
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
