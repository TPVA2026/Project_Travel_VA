import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React, { act } from "react";
import { localTodayIso, addDaysIso, MAX_TRIP_DAYS } from "./travelRequest.js";

const today = localTodayIso();
const startSoon = today;
const endSoon = addDaysIso(today, MAX_TRIP_DAYS - 1);

// The form budget is always per person. There is no whole-group choice.
test("M1 budget scope: the form only offers per person", async () => {
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
  const output = join(temp, "BudgetScopeHarness.mjs");
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
  const visible = () => [...doc.querySelectorAll(".request-step")].filter(node => !node.hidden).map(node => Number(node.dataset.step));
  const validateCalls = () => fetchCalls.filter(call => call.url === "/api/v1/requests/validate");
  const toParty = async () => {
    await fill("departureLocation", "Ha Noi");
    await click("Next");
    await fill("startDate", startSoon);
    await fill("endDate", endSoon);
    await click("Next");
    assert.deepEqual(visible(), [2]);
  };
  try {
    const { default: TravelForm } = await import(pathToFileURL(output).href);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter, Routes, Route } = await import("react-router-dom");
    const mount = async () => {
      if (root) await act(async () => root.unmount());
      root = createRoot(doc.querySelector("#root"));
      await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(Routes, null,
        React.createElement(Route, { path: "/", element: React.createElement(TravelForm) }),
        React.createElement(Route, { path: "/results", element: React.createElement("p", { id: "results-probe" }, "results") }),
      ))));
    };

    await mount();
    await toParty();
    const toggle = () => doc.querySelector(".request-scope-toggle");
    assert.equal(toggle().textContent.trim(), "Per person");
    assert.equal(toggle().getAttribute("aria-pressed"), "true");
    assert.equal(field("budgetScope").value, "perPerson");
    assert.equal(doc.querySelector('[name="budgetScope"][value="group"]'), null);
    await click("Per person");
    assert.equal(toggle().getAttribute("aria-pressed"), "false");
    assert.equal(field("budgetScope").value, "");
    await click("4 travelers");
    await fill("budgetAmount", "3000000");
    await click("Next");
    assert.deepEqual(visible(), [2]);
    assert.equal(doc.getElementById("budgetScope-error").textContent, "This field is required.");
    await click("Per person");
    assert.equal(field("budgetScope").value, "perPerson");
    await click("Next");
    await click("Next");
    await click("Next");
    assert.deepEqual(visible(), [5]);
    assert.match(doc.querySelector(".request-review > div:nth-child(5) dd").textContent, /per person/);
    assert.doesNotMatch(doc.querySelector(".request-review > div:nth-child(5) dd").textContent, /whole group/);
    await click("Create itinerary");
    assert.equal(validateCalls().at(-1).payload.travelers.count, 4);
    assert.equal(validateCalls().at(-1).payload.budget.scope, "perPerson");
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
