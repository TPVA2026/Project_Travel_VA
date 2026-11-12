import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { ADDITIONAL_REQUIREMENTS_MAX, MAX_TRIP_DAYS, buildPayload, clientErrors, localTodayIso, localYearMonth, addDaysIso, addMonthsYm, addYearsIso, tripLimitHint, formatReturnLabel } from "./travelRequest.js";

const today = localTodayIso();
const currentMonth = localYearMonth();
const nextMonth = addMonthsYm(currentMonth, 1);
const lastThisMonth = addDaysIso(`${nextMonth}-01`, -1);
const startCross = lastThisMonth >= today ? lastThisMonth : addDaysIso(`${addMonthsYm(currentMonth, 2)}-01`, -1);
const endCross = addDaysIso(startCross, MAX_TRIP_DAYS - 1);
const startMax = addYearsIso(today, 1);
function showDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}
function showMonth(value) {
  return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
}
const monthWindowMax = addMonthsYm(currentMonth, 12);
const pickMonth = addMonthsYm(currentMonth, 4) <= monthWindowMax ? addMonthsYm(currentMonth, 4) : monthWindowMax;
const pickMonthPart = pickMonth.slice(5, 7);
const pickYearPart = pickMonth.slice(0, 4);

// DOM-level integration, not a browser visual or screen-reader test.
test("M1 one-question request flow: steps, validation, budget, dates, review and submit", async () => {
  const runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => runtimeErrors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", virtualConsole });
  const doc = dom.window.document;
  let fetchCalls = [];
  let fetchImpl = async url => {
    if (url === "/api/v1/destinations") return { ok: true, json: async () => ({ destinations: [{ id: "dn", city: "Da Nang" }, { id: "hue", name: "Hue" }] }) };
    throw new Error(`Unexpected fetch ${url}`);
  };
  const replacements = {
    window: dom.window, document: doc, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData,
    sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    requestAnimationFrame: callback => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, options) => { fetchCalls.push({ url, payload: options?.body ? JSON.parse(options.body) : undefined }); return fetchImpl(url, options); },
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "HomePage.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../../pages/HomePage.jsx", import.meta.url))], outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external", loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" }, define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  const field = name => doc.getElementById(name) ?? doc.querySelector(`[name="${name}"]`);
  const fill = async (name, value) => actOn(() => { const control = field(name); assert.ok(control, name); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set.call(control, value); control.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  const button = label => [...doc.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label || node.textContent.replace("‹", "").trim() === label);
  const click = async label => actOn(() => { assert.ok(button(label), label); button(label).click(); });
  const radio = async (name, value) => actOn(() => doc.querySelector(`[name="${name}"][value="${value}"]`).click());
  const enter = async name => actOn(() => field(name).form.requestSubmit());
  const visible = () => [...doc.querySelectorAll(".request-step")].filter(node => !node.hidden).map(node => Number(node.dataset.step));
  const assertStep = (index, message) => {
    assert.deepEqual(visible(), [index], message);
    assert.equal(doc.querySelector(".request-step-count").textContent, `Question ${index + 1} of 7`);
  };
  const active = () => doc.activeElement?.id || doc.activeElement?.textContent;
  const apiCalls = () => fetchCalls.filter(call => call.url === "/api/v1/requests/validate").length;
  try {
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router-dom");
    const { default: HomePage } = await import(output);
    root = createRoot(doc.querySelector("#root"));
    await actOn(() => root.render(React.createElement(MemoryRouter, null, React.createElement(HomePage))));
    const form = doc.querySelector("form");
    // The surrounding page is unchanged. Start planning lands on the first form question; no chooser.
    assert.ok(doc.querySelector(".plan-intro"));
    assert.ok(doc.querySelector(".plan-layout .plan-aside"));
    assert.equal(doc.querySelector("#plan-prep-title").textContent, "Three things make the first draft easier.");
    assert.equal(doc.querySelector(".plan-outcomes h2").textContent, "What you get");
    assert.equal(doc.querySelector(".entry-choice"), null, "Chooser is not rendered");
    assert.equal(doc.querySelector("#trip-describe-panel"), null, "Describe-the-trip panel is not rendered");
    assert.equal(button("Fill in the form"), undefined);
    assert.equal(button("Describe the trip"), undefined);
    assert.equal(button("Switch to describing"), undefined);
    assert.ok(form, "The form is visible immediately");
    assert.equal(doc.querySelector("#trip-form-panel").hidden, false);

    // Six screens, one visible question, Back only after the first.
    assert.equal(form.querySelectorAll(".request-step").length, 7);
    assertStep(0);
    assert.equal(active(), "departureLocation");
    assert.equal(doc.querySelector("#request-step-0 h2").textContent, "Where are you leaving from?");
    assert.equal(button("Back"), undefined);
    assert.equal(button("Next").type, "submit");

    // Current-step validation only; no API until the final review.
    await click("Next");
    assertStep(0, "Empty departure stays on the first question");
    assert.equal(field("departureLocation").getAttribute("aria-invalid"), "true");
    assert.equal(doc.getElementById("departureLocation-error").textContent, "This field is required.");
    assert.equal(doc.querySelector("#travelerCount-error"), null, "Later steps are not validated yet");
    await fill("departureLocation", "Hue");
    await enter("departureLocation");
    assertStep(1, "Enter acts as Next");
    assert.equal(active(), "destination");
    assert.equal(field("destination").placeholder, "e.g. Da Nang, Da Lat");
    assert.equal(field("destination").hasAttribute("list"), false, "No supported-city dropdown on the destination input");
    assert.equal(doc.querySelector("datalist"), null);

    // Destination is optional and can be skipped on purpose.
    assert.equal(doc.getElementById("request-step-1-hint").textContent, "Optional. Skip it and we'll suggest destinations based on your trip.");
    assert.doesNotMatch(form.textContent, /we will suggest places/i, "Old destination copy is gone");
    await fill("destination", "Somewhere");
    await click("Not sure yet");
    assertStep(2);
    assert.equal(field("destination").value, "");
    await click("Back");
    assertStep(1);
    await click("Next");
    assertStep(2, "Blank destination is allowed");

    // Start date picker plus 1..maxDays length cards; the end date is computed.
    assert.equal(field("startDate").type, "date");
    assert.equal(field("endDate").type, "hidden");
    assert.equal(doc.querySelector('label[for="startDate"]').textContent.replace("*", ""), "Start date");
    assert.equal(doc.querySelector('[name="periodMode"]'), null, "The By month option is removed");
    assert.equal(field("month"), null);
    assert.equal(field("startDate").min, today);
    assert.equal(field("startDate").max, startMax);
    assert.equal(doc.getElementById("request-step-2-hint").textContent, tripLimitHint());
    assert.equal(active(), "startDate");
    let pickerCalls = 0;
    field("startDate").showPicker = () => { pickerCalls += 1; };
    await click("Open calendar for Start date");
    assert.equal(pickerCalls, 1);
    assert.equal(active(), "startDate");
    await click("Next");
    assertStep(2);
    assert.equal(doc.getElementById("startDate-error").textContent, "This field is required.");
    await fill("startDate", startCross);
    await click("Next");
    assertStep(2, "Trip length is required");
    assert.equal(doc.getElementById("durationDays-error").textContent, "This field is required.");
    const dayCards = [...doc.querySelectorAll("#request-step-2 .request-choice")];
    assert.deepEqual(dayCards.map(node => node.textContent.replace(/\s+/g, " ").trim()), ["1 day", "2 days", "3 days"]);
    await actOn(() => dayCards[MAX_TRIP_DAYS - 1].click());
    assert.equal(field("durationDays").value, String(MAX_TRIP_DAYS));
    assert.equal(field("endDate").value, endCross, "End date is start + (n-1) days");
    assert.equal(doc.querySelector("#request-step-2 .request-question-hint.request-span").textContent, formatReturnLabel(endCross));
    // Changing the start date keeps the chosen length and recomputes the end date.
    const laterStart = addDaysIso(startCross, 1);
    await fill("startDate", laterStart);
    assert.equal(field("durationDays").value, String(MAX_TRIP_DAYS));
    assert.equal(field("endDate").value, addDaysIso(laterStart, MAX_TRIP_DAYS - 1));
    await fill("startDate", startCross);
    assert.equal(field("endDate").value, endCross);
    await click("Next");
    assertStep(3);

    // Travelers: no default, quick picks and any other whole number.
    assert.equal(field("travelerCount").value, "");
    assert.deepEqual([...doc.querySelectorAll("#request-step-3 .request-choice")].map(node => node.getAttribute("aria-pressed")), ["false", "false", "false", "false"]);
    await click("Next");
    assertStep(3);
    assert.equal(active(), "travelerCount");
    await actOn(() => [...doc.querySelectorAll("#request-step-3 .request-choice")][1].click());
    assert.equal(field("travelerCount").value, "2");
    assert.equal([...doc.querySelectorAll("#request-step-3 .request-choice")][1].getAttribute("aria-pressed"), "true");
    await fill("travelerCount", "7");
    assert.deepEqual([...doc.querySelectorAll("#request-step-3 .request-choice")].map(node => node.getAttribute("aria-pressed")), ["false", "false", "false", "false"]);
    await click("Next");
    assertStep(4);
    assert.equal(active(), "budgetAmount");

    // Budget: unset vs zero, exact typed amounts, slider both ways, explicit scope.
    assert.equal(field("budgetAmount").value, "");
    assert.equal(field("budgetScope").checked, false);
    assert.equal(field("budgetSlider").value, "0");
    assert.equal(field("budgetSlider").name, "");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "Budget not set");
    assert.equal(new FormData(form).has("budgetSlider"), false);
    await click("Next");
    assertStep(4);
    assert.equal(doc.getElementById("budgetAmount-error").textContent, "This field is required.");
    await actOn(() => field("budgetSlider").dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "Home", bubbles: true })));
    assert.equal(field("budgetAmount").value, "0");
    await fill("budgetAmount", "");
    await actOn(() => field("budgetSlider").dispatchEvent(new dom.window.Event("pointerup", { bubbles: true })));
    assert.equal(field("budgetAmount").value, "0");
    await fill("budgetSlider", "7500000");
    assert.equal(field("budgetAmount").value, "7,500,000");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "7,500,000 VND");
    await fill("budgetAmount", "1234567");
    assert.equal(field("budgetSlider").value, "1234567");
    // Standard slider range is 0..80,000,000 VND.
    assert.equal(field("budgetSlider").min, "0");
    assert.equal(field("budgetSlider").max, "80000000");
    assert.equal(doc.querySelector(".budget-range-labels").textContent, "0 VND80,000,000 VND");
    await fill("budgetAmount", "45,678,901");
    assert.equal(field("budgetSlider").max, "80000000");
    assert.equal(field("budgetSlider").value, "45678901");
    await fill("budgetSlider", "80000000");
    assert.equal(field("budgetAmount").value, "80,000,000");
    assert.equal(buildPayload(new FormData(form)).budget.amount, 80000000);
    await fill("budgetAmount", "79,999,999");
    assert.equal(field("budgetSlider").value, "79999999");
    // A larger exact amount is still valid and widens the range instead of being capped.
    await fill("budgetAmount", "123,456,789");
    assert.equal(field("budgetSlider").max, "123456789");
    assert.equal(field("budgetSlider").value, "123456789");
    assert.equal(buildPayload(new FormData(form)).budget.amount, 123456789);
    await fill("budgetSlider", "12345678");
    assert.equal(field("budgetAmount").value, "12,345,678");
    assert.equal(field("budgetSlider").max, "123456789", "Sliding must not shrink its own range");
    await fill("budgetAmount", "");
    assert.equal(field("budgetSlider").max, "80000000", "Clearing the amount returns to the standard range");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "Budget not set");
    for (const invalid of ["-1", "1.5", "abc", "1,00", "9007199254740992"]) {
      await fill("budgetAmount", invalid);
      assert.equal(field("budgetAmount").value, invalid, "Invalid input is kept, not rewritten");
      assert.ok(clientErrors(new FormData(form)).budgetAmount);
    }
    await click("Next");
    assertStep(4, "Invalid budget blocks Next");
    await fill("budgetAmount", "0");
    assert.equal(field("budgetSlider").value, "0");
    assert.equal(clientErrors(new FormData(form)).budgetAmount, undefined);
    await click("Next");
    assertStep(4, "Scope must be chosen");
    assert.equal(doc.getElementById("budgetScope-error").textContent, "This field is required.");
    assert.equal(doc.activeElement, form.querySelector('[name="budgetScope"][value="group"]'));
    await fill("budgetAmount", "7654321");
    await actOn(() => { field("budgetAmount").focus(); field("budgetAmount").blur(); });
    assert.equal(field("budgetAmount").value, "7,654,321", "Formatting happens on blur");
    assert.equal(field("budgetSlider").max, "80000000");
    await radio("budgetScope", "perPerson");
    assert.equal(apiCalls(), 0, "No API call before the final review");
    await click("Next");

    // Optional describe step: message icon, white textarea with example placeholder, sent when non-empty.
    assertStep(5);
    assert.equal(doc.querySelector("#request-step-5 h2").textContent, "Is there anything else you’d like to describe?");
    assert.ok(doc.querySelector("#request-step-5 svg.request-art"));
    const draft = field("tripDescription");
    assert.equal(draft.tagName, "TEXTAREA");
    assert.equal(active(), "tripDescription");
    assert.equal(draft.name, "additionalRequirements");
    assert.equal(draft.maxLength, ADDITIONAL_REQUIREMENTS_MAX);
    assert.equal(draft.value, "");
    assert.equal(doc.getElementById("request-describe-count").textContent, `0/${ADDITIONAL_REQUIREMENTS_MAX}`);
    for (const hint of ["seafood", "spicy", "taxis", "culture", "older adult", "50 km", "per day"]) assert.ok(draft.placeholder.includes(hint), hint);
    assert.equal(doc.querySelector(".request-draft-note"), null, "No draft-only note");
    await click("Next");
    assertStep(6, "Empty description is allowed");
    await click("Back");
    assertStep(5);
    await fill("tripDescription", "We love seafood.\nOne of us is an older adult.");
    assert.equal(doc.getElementById("request-describe-count").textContent, `${"We love seafood.\nOne of us is an older adult.".length}/${ADDITIONAL_REQUIREMENTS_MAX}`);
    assert.ok(draft.getAttribute("aria-describedby").includes("request-describe-count"));
    assert.equal(doc.querySelector(".request-draft-note"), null);
    await click("Skip for now");
    assertStep(6, "Skip goes to review");
    assert.equal(field("tripDescription").value, "", "Skip discards typed text");
    assert.equal(doc.activeElement, doc.querySelector("#request-step-6 h2"));
    assert.equal(doc.querySelector(".request-draft-note"), null, "No draft-only note after skip");
    const skippedRow = () => [...doc.querySelectorAll(".request-review > div")].find(row => row.querySelector("dt").textContent === "Extra description").querySelector("dd").textContent;
    assert.equal(skippedRow(), "Nothing added");
    // Back and Edit do not bring skipped text back.
    await click("Back");
    assertStep(5);
    assert.equal(field("tripDescription").value, "");
    assert.equal(doc.querySelector(".request-draft-note"), null);
    assert.equal(doc.getElementById("request-describe-count").textContent, `0/${ADDITIONAL_REQUIREMENTS_MAX}`);
    await click("Next");
    assertStep(6);
    assert.equal(skippedRow(), "Nothing added");
    await click("Edit description");
    assert.equal(field("tripDescription").value, "");
    // Regular Next keeps the text; skipping while editing clears it again.
    await fill("tripDescription", "Typed by mistake");
    await click("Skip for now");
    assertStep(6, "Skip while editing returns to review");
    assert.equal(skippedRow(), "Nothing added");
    await click("Back");
    await fill("tripDescription", "We love seafood.\nOne of us is an older adult.");
    await click("Next");
    assertStep(6);
    assert.equal(field("tripDescription").value, "We love seafood.\nOne of us is an older adult.", "Next keeps the draft");
    await click("Back");
    assert.equal(field("tripDescription").value, "We love seafood.\nOne of us is an older adult.", "Back keeps the draft");
    await click("Next");

    // Review summary with the draft shown as prose, no structured drawer, Edit returns to the right step.
    const rows = () => Object.fromEntries([...doc.querySelectorAll(".request-review > div")].map(row => [row.querySelector("dt").textContent, row.querySelector("dd").textContent]));
    assert.deepEqual(rows(), {
      "Leaving from": "Hue",
      "Going to": "Not chosen. We'll suggest destinations based on your trip.",
      When: `${showDate(startCross)} – ${showDate(endCross)} · ${MAX_TRIP_DAYS} days`,
      Travelers: "7 travelers",
      Budget: "7,654,321 VND · per person",
      "Extra description": "We love seafood.\nOne of us is an older adult.",
    });
    assert.equal(doc.querySelector(".request-draft-note, #request-review-draft-note"), null, "Draft-only note is removed");
    assert.equal(form.querySelector("details"), null, "Advanced options drawer is removed");
    for (const name of ["characteristics", "maxDistanceKm", "maxTravelTimeMinutes", "appliesTo", "interest", "transportation", "diningPreferred"]) assert.equal(field(name), null, name);
    assert.equal(form.querySelector("[name='description'], [name='prompt'], [name='tripDescription']"), null);
    assert.equal(new FormData(form).get("additionalRequirements"), "We love seafood.\nOne of us is an older adult.");
    await click("Edit description");
    assertStep(5);
    await fill("tripDescription", "We love seafood and prefer taxis.");
    await click("Back to review");
    assertStep(6);
    assert.equal(rows()["Extra description"], "We love seafood and prefer taxis.");
    await click("Edit travelers");
    assertStep(3);
    assert.equal(field("travelerCount").value, "7");
    assert.equal(button("Back to review").type, "submit");
    await click("Back to review");
    assertStep(6);
    await click("Edit dates");
    await click("Back to review");
    assert.equal(rows().When, `${showDate(startCross)} – ${showDate(endCross)} · ${MAX_TRIP_DAYS} days`);
    // Back/Next keeps every earlier answer, including the draft.
    for (let index = 5; index >= 0; index -= 1) { await click("Back"); assertStep(index); }
    assert.equal(field("departureLocation").value, "Hue");
    for (let index = 1; index <= 6; index += 1) { await click("Next"); assertStep(index); }
    assert.equal(field("budgetAmount").value, "7,654,321");
    assert.equal(field("budgetSlider").value, "7654321");
    assert.equal(field("tripDescription").value, "We love seafood and prefer taxis.");

    // Editing from review still validates the edited question before returning.
    await click("Edit departure");
    assertStep(0);
    assert.equal(active(), "departureLocation");
    await fill("departureLocation", "   ");
    await click("Back to review");
    assertStep(0, "Whitespace departure is rejected");
    assert.equal(field("departureLocation").getAttribute("aria-invalid"), "true");
    await fill("departureLocation", "Hue");
    await click("Back to review");
    assertStep(6);
    assert.equal(apiCalls(), 0);

    // A destination 422 stays on review with one short message: no field error, no city list.
    const longMessage = "Destination is not supported by the current dataset. Choose one of: Da Nang, Hue.";
    fetchImpl = async url => ({ ok: false, status: 422, json: async () => ({ detail: { errors: [{ loc: ["preferences", "destination"], msg: longMessage }], missing: [], conflicts: [], messages: [longMessage] } }) });
    await click("Edit destination");
    await fill("destination", "Atlantis");
    await click("Back to review");
    await click("Create itinerary");
    assert.equal(apiCalls(), 1);
    assertStep(6, "Unsupported destination stays on review");
    assert.equal(doc.getElementById("destination-error"), null, "No destination error under the field");
    assert.equal(field("destination").hasAttribute("aria-invalid"), false);
    assert.equal(doc.getElementById("request-form-error").textContent, "We couldn't plan a trip to that destination. Edit it or skip it to get suggestions.");
    assert.equal(doc.querySelectorAll(".error").length, 1, "The message is shown once");
    assert.doesNotMatch(form.textContent, /Choose one of/, "The supported-city list is never rendered");
    assert.equal(active(), "request-form-error");
    await click("Edit destination");
    await click("Not sure yet");
    assertStep(6, "Skipping while editing returns to review");
    fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: { errors: [{ loc: ["body", "budget", "amount"], msg: "Budget too large." }] } }) });
    await click("Create itinerary");
    assertStep(4);
    assert.equal(active(), "budgetAmount");
    await click("Back to review");

    fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: { missing: ["travelers.count"] } }) });
    await click("Create itinerary");
    assertStep(3, "Server-missing traveler count returns to travelers");
    assert.equal(active(), "travelerCount");
    await click("Back to review");
    fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: { messages: ["Dates conflict with the destination season."] } }) });
    await click("Create itinerary");
    assertStep(6, "Form-level errors stay on review");
    assert.equal(active(), "request-form-error");
    assert.equal(doc.getElementById("request-form-error").textContent, "Dates conflict with the destination season.");
    fetchImpl = async () => { throw new TypeError("network down"); };
    await click("Create itinerary");
    assertStep(6);
    assert.equal(doc.getElementById("request-form-error").textContent, "Could not send the request.");
    // Server errors for fields the form does not show become a visible request-level message.
    fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: { errors: [{ loc: ["body", "limits", "maxDistanceKm"], msg: "Distance must be positive." }] } }) });
    await click("Create itinerary");
    assertStep(6);
    assert.equal(doc.getElementById("request-form-error").textContent, "Distance must be positive.");
    assert.equal(active(), "request-form-error");

    fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: { errors: [{ loc: ["body", "additionalRequirements"], msg: "Extra description must be 500 characters or fewer." }] } }) });
    await click("Create itinerary");
    assertStep(5, "additionalRequirements errors return to the describe question");
    assert.equal(doc.getElementById("additionalRequirements-error").textContent, "Extra description must be 500 characters or fewer.");
    assert.equal(active(), "tripDescription");
    await click("Back to review");

    // Successful final submit sends the exact contract payload once.
    const payload = buildPayload(new FormData(form));
    assert.deepEqual(payload, {
      travelPeriod: { startDate: startCross, endDate: endCross },
      durationDays: MAX_TRIP_DAYS,
      departureLocation: "Hue",
      travelers: { count: 7 },
      budget: { amount: 7654321, currency: "VND", scope: "perPerson" },
      additionalRequirements: "We love seafood and prefer taxis.",
    });
    fetchImpl = async () => ({ ok: true, json: async () => ({ valid: true, data: payload }) });
    fetchCalls = [];
    await click("Create itinerary");
    assert.deepEqual(fetchCalls, [{ url: "/api/v1/requests/validate", payload }]);
    assert.deepEqual(JSON.parse(sessionStorage.getItem("tpva-travel-request")), payload);
    assert.equal(JSON.parse(sessionStorage.getItem("tpva-travel-request")).additionalRequirements, "We love seafood and prefer taxis.");

    // Clear resets to the first question with empty values.
    await click("Clear form");
    assert.equal(form.isConnected, false);
    const clean = doc.querySelector("form");
    assertStep(0);
    assert.equal(active(), "departureLocation");
    for (const name of ["departureLocation", "destination", "startDate", "endDate", "durationDays", "travelerCount", "budgetAmount", "tripDescription"]) assert.equal(field(name).value, "", name);
    assert.equal(field("budgetSlider").value, "0");
    assert.equal(field("budgetSlider").max, "80000000");
    assert.equal(field("budgetSlider").getAttribute("aria-valuetext"), "Budget not set");
    assert.equal(clean.querySelector('[name="periodMode"]'), null);
    assert.equal(clean.querySelector(".request-draft-note"), null);
    assert.equal(doc.getElementById("request-describe-count").textContent, `0/${ADDITIONAL_REQUIREMENTS_MAX}`);
    assert.equal(clean.querySelector(".completion-label").textContent, "0% finding");
    assert.equal(button("Back"), undefined);

    // Group scope and a high custom amount on a dates trip.
    await fill("departureLocation", "Ha Noi");
    await click("Next");
    await click("Next");
    await fill("startDate", startCross);
    await actOn(() => [...doc.querySelectorAll("#request-step-2 .request-choice")][MAX_TRIP_DAYS - 1].click());
    await click("Next");
    await fill("travelerCount", "6");
    await click("Next");
    await fill("budgetAmount", "70123456");
    await radio("budgetScope", "group");
    await click("Next");
    await click("Next");
    assertStep(6);
    const custom = buildPayload(new FormData(clean));
    assert.deepEqual(custom, { travelPeriod: { startDate: startCross, endDate: endCross }, durationDays: MAX_TRIP_DAYS, departureLocation: "Ha Noi", travelers: { count: 6 }, budget: { amount: 70123456, currency: "VND", scope: "group" } });
    assert.equal(custom.preferences?.destination, undefined, "Skipped destination is omitted, never filled in");
    assert.equal(field("budgetSlider").value, "70123456");
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test("Start planning goes straight to the first form question; old describe routes redirect", async () => {
  const runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => runtimeErrors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", virtualConsole });
  const doc = dom.window.document;
  const replacements = {
    window: dom.window, document: doc, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, Image: dom.window.Image,
    sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    matchMedia: query => ({ matches: /prefers-reduced-motion:\s*reduce/.test(query), media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }),
    requestAnimationFrame: callback => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => ({ ok: true, json: async () => ({ destinations: [] }) }),
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  if (replacements.matchMedia) dom.window.matchMedia = replacements.matchMedia;
  dom.window.scrollTo = () => {};
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "App.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../../App.jsx", import.meta.url))],
    outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" },
    define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  try {
    const { default: App } = await import(output);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router-dom");
    root = createRoot(doc.querySelector("#root"));

    await actOn(() => root.render(React.createElement(MemoryRouter, { initialEntries: ["/welcome"] }, React.createElement(App))));
    const start = [...doc.querySelectorAll("a")].find(node => node.textContent.includes("Start planning"));
    assert.ok(start, "Welcome has Start planning");
    assert.equal(start.getAttribute("href"), "/");
    await actOn(() => start.click());
    assert.equal(doc.querySelector(".entry-choice"), null, "Chooser is not rendered after Start planning");
    assert.equal(doc.querySelector("#trip-describe-panel"), null);
    assert.ok(doc.getElementById("departureLocation"), "First form question is visible");
    assert.equal(doc.querySelector("#request-step-0 h2")?.textContent, "Where are you leaving from?");
    assert.equal(doc.activeElement?.id, "departureLocation");

    for (const path of ["/describe", "/describe/anything"]) {
      await actOn(() => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App))));
      assert.equal(doc.querySelector(".welcome-page"), null, `${path} does not 404 or stay on welcome`);
      assert.equal(doc.querySelector(".entry-choice"), null, `${path} does not show the chooser`);
      assert.ok(doc.getElementById("departureLocation"), `${path} redirects to the form`);
      assert.equal(doc.querySelector("#request-step-0 h2")?.textContent, "Where are you leaving from?");
    }
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test("Start planning goes straight to the first form question; old describe routes redirect", async () => {
  const runtimeErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => runtimeErrors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", virtualConsole });
  const doc = dom.window.document;
  const replacements = {
    window: dom.window, document: doc, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, Image: dom.window.Image,
    sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    matchMedia: query => ({ matches: /prefers-reduced-motion:\s*reduce/.test(query), media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }),
    requestAnimationFrame: callback => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => ({ ok: true, json: async () => ({ destinations: [] }) }),
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  if (replacements.matchMedia) dom.window.matchMedia = replacements.matchMedia;
  dom.window.scrollTo = () => {};
  const temp = await mkdtemp(fileURLToPath(new URL("../../../node_modules/.request-form-test-", import.meta.url)));
  const output = join(temp, "App.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../../App.jsx", import.meta.url))],
    outfile: output, bundle: true, format: "esm", platform: "node", jsx: "automatic", packages: "external",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" },
    define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  let root;
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const actOn = async callback => { await act(async () => { callback(); await tick(); }); };
  try {
    const { default: App } = await import(output);
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router-dom");
    root = createRoot(doc.querySelector("#root"));

    await actOn(() => root.render(React.createElement(MemoryRouter, { initialEntries: ["/welcome"] }, React.createElement(App))));
    const start = [...doc.querySelectorAll("a")].find(node => node.textContent.includes("Start planning"));
    assert.ok(start, "Welcome has Start planning");
    assert.equal(start.getAttribute("href"), "/");
    await actOn(() => start.click());
    assert.equal(doc.querySelector(".entry-choice"), null, "Chooser is not rendered after Start planning");
    assert.equal(doc.querySelector("#trip-describe-panel"), null);
    assert.ok(doc.getElementById("departureLocation"), "First form question is visible");
    assert.equal(doc.querySelector("#request-step-0 h2")?.textContent, "Where are you leaving from?");
    assert.equal(doc.activeElement?.id, "departureLocation");

    for (const path of ["/describe", "/describe/anything"]) {
      await actOn(() => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App))));
      assert.equal(doc.querySelector(".welcome-page"), null, `${path} does not 404 or stay on welcome`);
      assert.equal(doc.querySelector(".entry-choice"), null, `${path} does not show the chooser`);
      assert.ok(doc.getElementById("departureLocation"), `${path} redirects to the form`);
      assert.equal(doc.querySelector("#request-step-0 h2")?.textContent, "Where are you leaving from?");
    }
    assert.deepEqual(runtimeErrors, [], "Uncaught DOM runtime errors must fail this test");
  } finally {
    if (root) await act(async () => root.unmount());
    await rm(temp, { recursive: true, force: true });
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
