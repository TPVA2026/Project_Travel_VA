import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { localTodayIso, addDaysIso, MAX_TRIP_DAYS } from "./travelRequest.js";

const today = localTodayIso();
const startSoon = today;
const endSoon = addDaysIso(today, MAX_TRIP_DAYS - 1);

// DOM-level integration: one traveler can only use a per-person budget.
// Whole group is disabled, and a previous group choice is switched to per person.
test("M1 budget scope: one traveler can only choose per person", async () => {
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
  const radio = async (name, value) => actOn(() => doc.querySelector(`[name="${name}"][value="${value}"]`).click());
  const visible = () => [...doc.querySelectorAll(".request-step")].filter(node => !node.hidden).map(node => Number(node.dataset.step));
  const validateCalls = () => fetchCalls.filter(call => call.url === "/api/v1/requests/validate");
  const scope = () => doc.querySelector('[name="budgetScope"]:checked')?.value ?? null;
  const groupRadio = () => doc.querySelector('[name="budgetScope"][value="group"]');
  const assertGroupEnabled = (enabled, message) => {
    const control = groupRadio();
    assert.equal(control.disabled, !enabled, message ?? `Group disabled=${!enabled}`);
    if (enabled) assert.notEqual(control.getAttribute("aria-disabled"), "true");
    else assert.equal(control.getAttribute("aria-disabled"), "true");
  };
  const toTravelers = async () => {
    await fill("departureLocation", "Ha Noi");
    await click("Next");
    await click("Not sure yet");
    await fill("startDate", startSoon);
    await fill("endDate", endSoon);
    await click("Next");
    assert.deepEqual(visible(), [3]);
  };
  try {
    const { default: TravelForm } = await import(output);
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

    // 1 traveler (quick pick): per person is selected; Whole group is disabled and cannot be chosen.
    await mount();
    await toTravelers();
    assert.equal(scope(), null, "No scope before a traveler count");
    assertGroupEnabled(true, "Group starts enabled before a count is chosen");
    await click("1 traveler");
    assert.equal(scope(), "perPerson");
    assertGroupEnabled(false);
    await radio("budgetScope", "group");
    assert.equal(scope(), "perPerson", "A disabled Whole group option cannot be selected");
    await click("Next");
    assert.deepEqual(visible(), [4]);
    assert.equal(scope(), "perPerson");
    assertGroupEnabled(false);
    await click("Back");
    await click("Next");
    assert.equal(scope(), "perPerson", "Back/Next keeps the scope");
    await fill("budgetAmount", "3000000");
    await click("Next");
    assert.deepEqual(visible(), [5], "No scope error for a solo traveler");
    await click("Skip for now");
    assert.match(doc.querySelector(".request-review > div:nth-child(5) dd").textContent, /per person/);

    // Changing to a group clears the automatic choice and re-enables Whole group.
    await click("Edit travelers");
    await click("2 travelers");
    assert.equal(scope(), null, "An automatic per-person choice does not stick for a group");
    assertGroupEnabled(true, "Whole group is enabled again for more than one traveler");
    await fill("travelerCount", "1");
    assert.equal(scope(), "perPerson", "Typed 1 works like the quick pick");
    assertGroupEnabled(false);

    // An explicit per-person choice is kept when the count changes, including back through 1.
    await click("Back to review");
    await click("Edit travelers");
    await click("3 travelers");
    await click("Back to review");
    await click("Edit budget");
    await radio("budgetScope", "perPerson");
    assert.equal(scope(), "perPerson");
    await click("Back to review");
    await click("Edit travelers");
    await click("1 traveler");
    assert.equal(scope(), "perPerson");
    assertGroupEnabled(false);
    await click("3 travelers");
    assert.equal(scope(), "perPerson", "The user's own per-person choice is kept");
    assertGroupEnabled(true);

    // A previous group choice is switched to per person when the count becomes 1.
    await click("Back to review");
    await click("Edit budget");
    await radio("budgetScope", "group");
    assert.equal(scope(), "group");
    await click("Back to review");
    assert.match(doc.querySelector(".request-review > div:nth-child(5) dd").textContent, /whole group/);
    await click("Edit travelers");
    await click("1 traveler");
    assert.equal(scope(), "perPerson", "Group is switched to per person for one traveler");
    assertGroupEnabled(false);
    await click("Back to review");
    assert.match(doc.querySelector(".request-review > div:nth-child(5) dd").textContent, /per person/);
    await click("Edit travelers");
    await click("3 travelers");
    assert.equal(scope(), null, "The forced per-person scope is cleared for a group");
    assertGroupEnabled(true);

    // A group never gets an automatic scope; the existing "choose a scope" rule still applies.
    await click("Clear form");
    await toTravelers();
    await click("4 travelers");
    await click("Next");
    assert.equal(scope(), null);
    assertGroupEnabled(true);
    await fill("budgetAmount", "3000000");
    await click("Next");
    assert.deepEqual(visible(), [4]);
    assert.equal(doc.getElementById("budgetScope-error").textContent, "This field is required.");

    // Clear form forgets that the user had picked a scope.
    await radio("budgetScope", "group");
    await click("Clear form");
    await toTravelers();
    await click("1 traveler");
    assert.equal(scope(), "perPerson");
    assertGroupEnabled(false);

    // The submitted request never has group scope with one traveler.
    await click("Next");
    await fill("budgetAmount", "3000000");
    await click("Next");
    await click("Skip for now");
    await click("Create itinerary");
    assert.equal(validateCalls().at(-1).payload.travelers.count, 1);
    assert.equal(validateCalls().at(-1).payload.budget.scope, "perPerson");
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
