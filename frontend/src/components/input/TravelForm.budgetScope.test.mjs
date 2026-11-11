import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";

// DOM-level integration: the budget scope defaults to per person for one traveler,
// following the traveler count only until the user picks a scope.
test("M1 budget scope: 1 traveler defaults to per person, a user-picked scope is never overridden", async () => {
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
  const generateCalls = () => fetchCalls.filter(call => /\/itineraries\//.test(call.url));
  const onResults = () => Boolean(doc.querySelector("#results-probe"));
  const scope = () => doc.querySelector('[name="budgetScope"]:checked')?.value ?? null;
  const toTravelers = async () => {
    await fill("departureLocation", "Ha Noi");
    await click("Next");
    await click("Not sure yet");
    await fill("startDate", "2031-03-02");
    await fill("endDate", "2031-03-04");
    await click("Next");
    assert.deepEqual(visible(), [3]);
  };
  try {
    const { default: TravelForm } = await import(output);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router-dom");
    const mount = async () => {
      if (root) await act(async () => root.unmount());
      root = createRoot(doc.querySelector("#root"));
      await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(TravelForm))));
    };

    // 1 traveler (quick pick): per person is preselected; Back/Next keep it.
    await mount();
    await toTravelers();
    assert.equal(scope(), null, "No scope before a traveler count");
    await click("1 traveler");
    assert.equal(scope(), "perPerson");
    await click("Next");
    assert.deepEqual(visible(), [4]);
    assert.equal(scope(), "perPerson");
    await click("Back");
    await click("Next");
    assert.equal(scope(), "perPerson", "Back/Next keeps the scope");
    await fill("budgetAmount", "3000000");
    await click("Next");
    assert.deepEqual(visible(), [5], "No scope error for a solo traveler");
    await click("Skip for now");
    assert.match(doc.querySelector(".request-review > div:nth-child(5) dd").textContent, /per person/);

    // Changing to a group clears the automatic choice; going back to 1 sets it again.
    await click("Edit travelers");
    await click("2 travelers");
    assert.equal(scope(), null, "An automatic per-person choice does not stick for a group");
    await fill("travelerCount", "1");
    assert.equal(scope(), "perPerson", "Typed 1 works like the quick pick");

    // Once the user picks a scope, traveler changes never override it.
    await click("Back to review");
    await click("Edit budget");
    await radio("budgetScope", "group");
    assert.equal(scope(), "group");
    await click("Back to review");
    await click("Edit travelers");
    await click("3 travelers");
    await click("1 traveler");
    assert.equal(scope(), "group", "The user's own choice is kept");
    await click("Back to review");
    assert.match(doc.querySelector(".request-review > div:nth-child(5) dd").textContent, /whole group/);

    // A group never gets an automatic scope; the existing "choose a scope" rule still applies.
    await click("Clear form");
    await toTravelers();
    await click("4 travelers");
    await click("Next");
    assert.equal(scope(), null);
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
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
