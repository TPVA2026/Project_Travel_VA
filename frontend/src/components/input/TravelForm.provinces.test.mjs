import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { allProvincesSorted, POPULAR_PROVINCES } from "./provinces.js";

// DOM-level integration: departure and destination open a city picker on empty
// focus, suggest the 34 provinces as you type, and never require a list value.
test("M1 city picker: empty-focus panel, accent-insensitive matches, no wards, free text sent as typed", async () => {
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
  const output = join(temp, "ProvinceHarness.mjs");
  await build({
    stdin: { contents: 'export { default } from "./TravelForm.jsx";\n', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "js" },
    outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" }, define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  const field = name => doc.getElementById(name) ?? doc.querySelector(`[name="${name}"]`);
  const fill = async (name, value) => actOn(() => { const control = field(name); assert.ok(control, name); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set.call(control, value); control.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  const button = label => [...doc.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label || node.textContent.replace("‹", "").trim() === label);
  const click = async label => actOn(() => { assert.ok(button(label), label); button(label).click(); });
  const radio = async (name, value) => actOn(() => doc.querySelector(`[name="${name}"][value="${value}"]`).click());
  const visible = () => [...doc.querySelectorAll(".request-step")].filter(node => !node.hidden).map(node => Number(node.dataset.step));
  const validateCalls = () => fetchCalls.filter(call => call.url === "/api/v1/requests/validate");
  const key = async (name, k) => actOn(() => field(name).dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
  const optionNames = name => [...doc.querySelectorAll(`#${name}-suggestions [role="option"] .request-city-name`)].map(node => node.textContent);
  const sectionNames = (name, section) => [...doc.querySelectorAll(`#${name}-suggestions [data-section="${section}"] [role="option"] .request-city-name`)].map(node => node.textContent);
  const heading = (name, section) => doc.querySelector(`#${name}-suggestions [data-section="${section}"] .request-city-heading`)?.textContent;
  const listShown = name => !doc.getElementById(`${name}-suggestions`).hidden;
  const noWards = labels => assert.equal(labels.some(label => /phường|xã|đặc khu/i.test(label)), false, "No ward suggestions");
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

    await mount();
    const departure = field("departureLocation");
    assert.equal(departure.getAttribute("role"), "combobox");
    assert.equal(departure.getAttribute("aria-autocomplete"), "list");
    assert.equal(departure.getAttribute("aria-controls"), "departureLocation-suggestions");
    assert.equal(departure.getAttribute("autocomplete"), "off");
    assert.equal(departure.getAttribute("aria-expanded"), "false");
    assert.equal(listShown("departureLocation"), false);

    // Empty focus opens the browse panel: popular (5) then all 34, A–Z.
    await actOn(() => departure.focus());
    assert.equal(departure.getAttribute("aria-expanded"), "true");
    assert.equal(listShown("departureLocation"), true);
    assert.equal(heading("departureLocation", "popular"), "Popular destinations");
    assert.deepEqual(sectionNames("departureLocation", "popular"), [...POPULAR_PROVINCES]);
    assert.equal(heading("departureLocation", "all"), "All provinces & cities");
    assert.deepEqual(sectionNames("departureLocation", "all"), allProvincesSorted());
    assert.equal(sectionNames("departureLocation", "all").length, 34);
    const lamDongHint = [...doc.querySelectorAll("#departureLocation-suggestions [data-section=\"popular\"] [role=\"option\"]")]
      .find(node => node.querySelector(".request-city-name")?.textContent === "Lâm Đồng")
      ?.querySelector(".request-city-hint")?.textContent;
    assert.equal(lamDongHint, "Da Lat · Vietnam");

    // Escape closes the panel without changing the text.
    await key("departureLocation", "Escape");
    assert.equal(listShown("departureLocation"), false);
    assert.equal(departure.value, "");

    // "h": provinces including Huế, no wards, nothing is filled in.
    await fill("departureLocation", "h");
    assert.equal(departure.getAttribute("aria-expanded"), "true");
    const hOptions = optionNames("departureLocation");
    assert.ok(hOptions.includes("Huế"));
    noWards(hOptions);
    assert.equal(doc.getElementById("departureLocation-suggestions-popular"), null, "No section headers while typing");
    assert.equal(departure.value, "h", "Never auto-filled");
    assert.equal(departure.hasAttribute("aria-activedescendant"), false, "Nothing preselected");
    await fill("departureLocation", "HÀ");
    assert.deepEqual(optionNames("departureLocation"), ["Hà Nội", "Hà Tĩnh", "Hải Phòng"]);

    // Keyboard: ArrowDown highlights, Enter picks the highlighted option and stays on the question.
    await key("departureLocation", "ArrowDown");
    await key("departureLocation", "ArrowDown");
    assert.equal(departure.getAttribute("aria-activedescendant"), "departureLocation-suggestions-1");
    assert.equal(doc.getElementById("departureLocation-suggestions-1").getAttribute("aria-selected"), "true");
    await key("departureLocation", "Enter");
    assert.equal(departure.value, "Hà Tĩnh");
    assert.deepEqual(visible(), [0], "Picking does not submit the step");
    assert.equal(listShown("departureLocation"), false);

    // Escape closes a filtered list without changing the text.
    await fill("departureLocation", "da");
    assert.ok(optionNames("departureLocation").includes("Đà Nẵng"));
    noWards(optionNames("departureLocation"));
    await key("departureLocation", "Escape");
    assert.equal(listShown("departureLocation"), false);
    assert.equal(departure.value, "da");

    // Free text that matches nothing is kept as typed; Next works with no highlighted option.
    await fill("departureLocation", "Sa Pa town");
    assert.equal(listShown("departureLocation"), false);
    await click("Next");
    assert.deepEqual(visible(), [1]);

    // Destination: empty focus uses the same panel; mouse pick and aliases work.
    const destination = field("destination");
    assert.equal(destination.placeholder, "e.g. Da Nang, Da Lat");
    await actOn(() => destination.focus());
    assert.equal(listShown("destination"), true);
    assert.deepEqual(sectionNames("destination", "popular"), [...POPULAR_PROVINCES]);
    assert.equal(sectionNames("destination", "all").length, 34);

    await fill("destination", "hu");
    const huOptions = optionNames("destination");
    assert.deepEqual(huOptions.slice(0, 2), ["Huế", "Hưng Yên"]);
    noWards(huOptions);
    await actOn(() => doc.getElementById("destination-suggestions-0").click());
    assert.equal(destination.value, "Huế");

    // "thu" may match Huế via the Thua Thien Hue alias, but never a ward.
    await fill("destination", "thu");
    assert.deepEqual(optionNames("destination"), ["Huế"]);
    noWards(optionNames("destination"));

    await fill("destination", "da lat");
    assert.deepEqual(optionNames("destination"), ["Lâm Đồng"]);
    await actOn(() => doc.getElementById("destination-suggestions-0").click());
    assert.equal(destination.value, "Lâm Đồng");

    await fill("destination", "Da Lat town");
    assert.equal(listShown("destination"), false, "No match: no list and no error");
    assert.equal(doc.getElementById("destination-error"), null);
    await click("Next");
    assert.deepEqual(visible(), [2]);
    await fill("startDate", "2031-03-02");
    await fill("endDate", "2031-03-04");
    await click("Next");
    await click("2 travelers");
    await click("Next");
    await fill("budgetAmount", "9000000");
    await radio("budgetScope", "group");
    await click("Next");
    await click("Skip for now");
    await click("Create itinerary");
    const sent = validateCalls().at(-1).payload;
    assert.equal(sent.departureLocation, "Sa Pa town", "Free text is sent as typed");
    assert.equal(sent.preferences.destination, "Da Lat town", "A place outside the list is sent as typed");
    assert.equal(fetchCalls.some(call => call.url === "/api/v1/destinations"), false, "Static list, no destination API");

    // A selected province (including the Da Lat alias) is sent as the official name.
    await mount();
    await fill("departureLocation", "hanoi");
    assert.deepEqual(optionNames("departureLocation"), ["Hà Nội"]);
    await actOn(() => doc.getElementById("departureLocation-suggestions-0").click());
    await click("Next");
    await fill("destination", "da lat");
    assert.deepEqual(optionNames("destination"), ["Lâm Đồng"]);
    await actOn(() => doc.getElementById("destination-suggestions-0").click());
    await click("Next");
    await fill("startDate", "2031-03-02");
    await fill("endDate", "2031-03-04");
    await click("Next");
    await click("2 travelers");
    await click("Next");
    await fill("budgetAmount", "9000000");
    await radio("budgetScope", "group");
    await click("Next");
    await click("Skip for now");
    await click("Create itinerary");
    const selected = validateCalls().at(-1).payload;
    assert.equal(selected.departureLocation, "Hà Nội");
    assert.equal(selected.preferences.destination, "Lâm Đồng");
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
