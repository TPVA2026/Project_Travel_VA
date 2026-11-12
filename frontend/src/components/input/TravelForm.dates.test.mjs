import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import {
  MAX_TRIP_DAYS, buildPayload, localTodayIso, localYearMonth, addDaysIso, addMonthsYm, addYearsIso,
  tripLimitHint, formatReturnLabel,
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
  return new Date(`${iso}T12:00:00+07:00`).toLocaleDateString("en-GB", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric",
  });
}

test("M1 date limits: start date, 1–3 day cards, computed return date, start change keeps length", async () => {
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
    assert.equal(doc.querySelector('[name="periodMode"]'), null);
    assert.equal(doc.body.textContent.includes("By month"), false);
    assert.equal(field("month"), null);
    assert.equal(field("startDate").min, today);
    assert.equal(field("startDate").max, startMax);
    assert.equal(field("endDate").type, "hidden");
    assert.equal(doc.querySelector('#request-step-2 input[type="number"]'), null);

    await fill("startDate", yesterday);
    await actOn(() => dayCards()[0].click());
    await click("Next");
    assert.deepEqual(visible(), [2]);
    assert.equal(doc.getElementById("startDate-error").textContent, "Start date can't be in the past.");

    await fill("startDate", addDaysIso(startMax, 1));
    await click("Next");
    assert.deepEqual(visible(), [2]);
    assert.equal(doc.getElementById("startDate-error").textContent, "Start date must be within 1 year from today.");

    // Length cards compute the end date. Changing start keeps the chosen length.
    await fill("startDate", today);
    await actOn(() => dayCards()[0].click());
    assert.equal(field("durationDays").value, "1");
    assert.equal(field("endDate").value, today);
    assert.equal(doc.querySelector("#request-step-2 .request-question-hint.request-span").textContent, formatReturnLabel(today));
    await actOn(() => dayCards()[2].click());
    assert.equal(field("durationDays").value, "3");
    assert.equal(field("endDate").value, addDaysIso(today, 2));
    await fill("startDate", addDaysIso(today, 5));
    assert.equal(field("durationDays").value, "3", "Chosen length is kept when the start date changes");
    assert.equal(field("endDate").value, addDaysIso(today, 7));
    assert.equal(doc.querySelector("#request-step-2 .request-question-hint.request-span").textContent, formatReturnLabel(addDaysIso(today, 7)));

    // A trip may cross a month boundary.
    await fill("startDate", startCross);
    await actOn(() => dayCards()[MAX_TRIP_DAYS - 1].click());
    assert.ok(startCross.slice(0, 7) !== endCross.slice(0, 7));
    assert.equal(field("endDate").value, endCross);
    assert.equal(doc.querySelector("#request-step-2 .request-question-hint.request-span").textContent, formatReturnLabel(endCross));
    await click("Next");
    assert.deepEqual(visible(), [3]);
    await fill("travelerCount", "2");
    await click("Next");
    await fill("budgetAmount", "1000000");
    await radio("budgetScope", "group");
    await click("Next");
    await click("Skip for now");
    assert.deepEqual(visible(), [6]);
    assert.equal(when(), `${showDate(startCross)} – ${showDate(endCross)} · ${MAX_TRIP_DAYS} days`);
    const payload = buildPayload(new FormData(doc.querySelector("form")));
    assert.deepEqual(payload.travelPeriod, { startDate: startCross, endDate: endCross });
    assert.equal(payload.durationDays, MAX_TRIP_DAYS);
    assert.ok(payload.travelPeriod.startDate >= today);
    assert.ok(payload.durationDays <= MAX_TRIP_DAYS);
    assert.equal("month" in payload.travelPeriod, false);
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
