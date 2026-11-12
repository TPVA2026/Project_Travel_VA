import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import {
  MAX_TRIP_DAYS, buildPayload, localTodayIso, localYearMonth, addDaysIso, addMonthsYm, addYearsIso, tripLimitHint,
} from "./travelRequest.js";

const today = localTodayIso();
const yesterday = addDaysIso(today, -1);
const currentMonth = localYearMonth();
const nextMonth = addMonthsYm(currentMonth, 1);
const lastThisMonth = addDaysIso(`${nextMonth}-01`, -1);
const startCross = lastThisMonth >= today ? lastThisMonth : addDaysIso(`${addMonthsYm(currentMonth, 2)}-01`, -1);
const endCross = addDaysIso(startCross, MAX_TRIP_DAYS - 1);
const startMax = addYearsIso(today, 1);

function showDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

test("M1 date limits: supported window, trip length cards, clear invalid end, month may cross into the next month", async () => {
  const runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => runtimeErrors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", virtualConsole });
  const doc = dom.window.document;
  const replacements = {
    window: dom.window, document: doc, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData,
    sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    requestAnimationFrame: callback => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url) => {
      if (url === "/api/v1/destinations") return { ok: true, json: async () => ({ destinations: [] }) };
      return { ok: true, json: async () => ({ valid: true }) };
    },
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "TravelForm.dates.mjs");
  await build({
    stdin: { contents: 'export { default } from "./TravelForm.jsx";\n', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "js" },
    outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" }, define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  const field = name => doc.getElementById(name) ?? doc.querySelector(`[name="${name}"]`);
  const fill = async (name, value) => actOn(() => {
    const control = field(name);
    assert.ok(control, name);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set.call(control, value);
    control.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    control.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const button = label => [...doc.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label || node.textContent.replace("‹", "").trim() === label);
  const click = async label => actOn(() => { assert.ok(button(label), label); button(label).click(); });
  const radio = async (name, value) => actOn(() => doc.querySelector(`[name="${name}"][value="${value}"]`).click());
  const visible = () => [...doc.querySelectorAll(".request-step")].filter(node => !node.hidden).map(node => Number(node.dataset.step));
  const when = () => [...doc.querySelectorAll(".request-review > div")].find(row => row.querySelector("dt").textContent === "When").querySelector("dd").textContent;
  const dayCards = () => [...doc.querySelectorAll("#request-step-2 .request-choice")];
  try {
    const { default: TravelForm } = await import(output);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router-dom");
    root = createRoot(doc.querySelector("#root"));
    await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(TravelForm))));
    await fill("departureLocation", "Hue");
    await click("Next");
    await click("Not sure yet");
    assert.deepEqual(visible(), [2]);
    assert.equal(doc.getElementById("request-step-2-hint").textContent, tripLimitHint());
    assert.equal(field("startDate").min, today);
    assert.equal(field("startDate").max, startMax);

    // Past start is rejected; end stays within the inclusive maxDays window of the start.
    await fill("startDate", yesterday);
    await fill("endDate", today);
    await click("Next");
    assert.deepEqual(visible(), [2]);
    assert.equal(doc.getElementById("startDate-error").textContent, "Start date can't be in the past.");

    await fill("startDate", startCross);
    assert.equal(field("endDate").min, startCross);
    assert.equal(field("endDate").max, endCross);
    await fill("endDate", addDaysIso(startCross, MAX_TRIP_DAYS));
    await click("Next");
    assert.deepEqual(visible(), [2], "A 4th day is outside the supported length");
    assert.equal(doc.getElementById("endDate-error").textContent, `Choose an end date within ${MAX_TRIP_DAYS} days of the start date.`);

    // Changing start so the existing end is outside the window clears the end date.
    await fill("startDate", today);
    await fill("endDate", addDaysIso(today, MAX_TRIP_DAYS - 1));
    assert.equal(field("endDate").value, addDaysIso(today, MAX_TRIP_DAYS - 1));
    await fill("startDate", addDaysIso(today, MAX_TRIP_DAYS));
    assert.equal(field("endDate").value, "", "End date is cleared when the range becomes invalid");
    await fill("startDate", today);
    await fill("endDate", addDaysIso(today, MAX_TRIP_DAYS - 1));
    await fill("startDate", addDaysIso(today, 1));
    assert.equal(field("endDate").value, addDaysIso(today, MAX_TRIP_DAYS - 1), "A still-valid end date is kept");

    // A date range may cross a month boundary.
    await fill("startDate", startCross);
    await fill("endDate", endCross);
    assert.ok(startCross.slice(0, 7) !== endCross.slice(0, 7));
    assert.match(doc.querySelector(".request-span").textContent, new RegExp(`^${MAX_TRIP_DAYS} days`));
    await click("Next");
    assert.deepEqual(visible(), [3]);
    await click("Back");

    // By month: past months blocked, length is a card 1..maxDays, start month may overflow into the next month.
    await radio("periodMode", "month");
    assert.equal(field("month").min, currentMonth);
    assert.equal(field("month").max, addMonthsYm(currentMonth, 12));
    assert.equal(field("durationDays").type, "hidden");
    assert.equal(doc.querySelector('#request-step-2 input[type="number"]'), null, "Free number input is replaced by cards");
    assert.deepEqual(dayCards().map(node => node.textContent.replace(/\s+/g, " ").trim()), Array.from({ length: MAX_TRIP_DAYS }, (_, i) => `${i + 1} ${i + 1 === 1 ? "day" : "days"}`));
    await fill("month", addMonthsYm(currentMonth, -1));
    await actOn(() => dayCards()[MAX_TRIP_DAYS - 1].click());
    await click("Next");
    assert.deepEqual(visible(), [2]);
    assert.equal(doc.getElementById("month-error").textContent, "Choose this month or a later month.");
    await fill("month", currentMonth);
    await click("Next");
    assert.deepEqual(visible(), [3], "Current month + 3 days is allowed even if the trip would run into the next month");
    await fill("travelerCount", "2");
    await click("Next");
    await fill("budgetAmount", "1000000");
    await radio("budgetScope", "group");
    await click("Next");
    await click("Skip for now");
    assert.deepEqual(visible(), [6]);
    assert.match(when(), new RegExp(`${MAX_TRIP_DAYS} days`));
    const monthPayload = buildPayload(new FormData(doc.querySelector("form")));
    assert.deepEqual(monthPayload.travelPeriod, { month: currentMonth });
    assert.equal(monthPayload.durationDays, MAX_TRIP_DAYS);
    assert.ok(monthPayload.durationDays <= MAX_TRIP_DAYS);

    await click("Edit dates");
    await radio("periodMode", "dates");
    await click("Back to review");
    assert.equal(when(), `${showDate(startCross)} – ${showDate(endCross)} · ${MAX_TRIP_DAYS} days`);
    const datePayload = buildPayload(new FormData(doc.querySelector("form")));
    assert.deepEqual(datePayload.travelPeriod, { startDate: startCross, endDate: endCross });
    assert.equal(datePayload.durationDays, MAX_TRIP_DAYS);
    assert.ok(datePayload.travelPeriod.startDate >= today);
    assert.ok(datePayload.durationDays <= MAX_TRIP_DAYS);
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test("M1 month fallback disables past months and months more than 12 months ahead", async () => {
  const runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => runtimeErrors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", virtualConsole });
  const doc = dom.window.document;
  const replacements = {
    window: dom.window, document: doc, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData,
    sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    requestAnimationFrame: callback => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => ({ ok: true, json: async () => ({ valid: true, destinations: [] }) }),
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "TravelForm.monthFallback.mjs");
  await build({
    stdin: { contents: 'export { default } from "./TravelForm.jsx";\n', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "js" },
    outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" }, define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  const field = name => doc.getElementById(name) ?? doc.querySelector(`[name="${name}"]`);
  const fill = async (name, value) => actOn(() => {
    const control = field(name);
    assert.ok(control, name);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set.call(control, value);
    control.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    control.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const button = label => [...doc.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label || node.textContent.replace("‹", "").trim() === label);
  const click = async label => actOn(() => { assert.ok(button(label), label); button(label).click(); });
  const radio = async (name, value) => actOn(() => doc.querySelector(`[name="${name}"][value="${value}"]`).click());
  try {
    const { default: TravelForm } = await import(output);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router-dom");
    root = createRoot(doc.querySelector("#root"));
    await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(TravelForm, { monthInputSupported: false }))));
    await fill("departureLocation", "Hue");
    await click("Next");
    await click("Not sure yet");
    await radio("periodMode", "month");
    const minYm = currentMonth;
    const maxYm = addMonthsYm(currentMonth, 12);
    await fill("monthYear", minYm.slice(0, 4));
    const options = [...field("month").querySelectorAll("option")].filter(opt => opt.value);
    const disabled = options.filter(opt => opt.disabled).map(opt => `${minYm.slice(0, 4)}-${opt.value}`);
    const enabled = options.filter(opt => !opt.disabled).map(opt => `${minYm.slice(0, 4)}-${opt.value}`);
    for (const ym of disabled) assert.ok(ym < minYm || ym > maxYm, `${ym} should be outside the window`);
    for (const ym of enabled) assert.ok(ym >= minYm && ym <= maxYm, `${ym} should be inside the window`);
    if (minYm.slice(5, 7) !== "01") {
      assert.ok(disabled.includes(`${minYm.slice(0, 4)}-01`), "January of the current year is disabled when it is already past");
    }
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
