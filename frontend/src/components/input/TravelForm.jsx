import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BusIllustration } from "../common/Illustrations.jsx";
import { fetchDestinations, saveTripForResults, validateTravelRequest } from "../../services/api";
import { INTERESTS, buildPayload, clientErrors, serverFieldErrors, valueErrors, progressOf, formatBudgetInput, normalizeBudgetInput, inclusiveDays } from "./travelRequest";

// A starting viewport for the slider, not a limit on valid budget input.
const BUDGET_SLIDER_MAX = 20_000_000;
const QUICK_TRAVELERS = [1, 2, 3, 4];
const REVIEW = 5;
const STEP_COUNT = 6;
const OPTIONAL_FIELDS = ["maxDistanceKm", "maxTravelTimeMinutes", "appliesTo", "interests", "characteristics", "transportation"];
// Which question owns each field, for step validation and error routing.
const FIELD_STEP = {
  departureLocation: 0,
  destination: 1,
  startDate: 2, endDate: 2, month: 2, durationDays: 2,
  travelerCount: 3,
  budgetAmount: 4, budgetScope: 4,
};
const CONTROL_NAME = { interests: "interest" };

const TRANSPORT = [
  ["taxi", "Taxi"],
  ["walking", "Walking"],
  ["motorbike", "Motorbike"],
  ["car", "Car"],
  ["publicTransport", "Public transport"],
];

const EMPTY_VALUES = { periodMode: "dates" };

function stepOf(name) {
  return FIELD_STEP[name] ?? REVIEW;
}

function fieldsOf(step, mode) {
  if (step === 2) return mode === "month" ? ["month", "durationDays"] : ["startDate", "endDate"];
  return Object.keys(FIELD_STEP).filter(name => FIELD_STEP[name] === step);
}

// Formats ISO calendar values in UTC so a local timezone never shifts the day.
function showDate(iso, withYear = true) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

function showMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || "")) return value || "";
  return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
}

function days(count) {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

function Field({ label, name, error, bad, required, children }) {
  const wrong = Boolean(bad?.[name]);
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && (
        <span className={wrong ? "error" : undefined} id={`${name}-error`}>{error}</span>
      )}
    </div>
  );
}

function StepError({ name, error }) {
  return error ? <span className="error" id={`${name}-error`}>{error}</span> : null;
}

function Tags({ name, label, placeholder }) {
  const [tags, setTags] = useState([]);
  const [draft, setDraft] = useState("");

  function add(value) {
    const next = value.trim();
    if (!next || tags.includes(next)) return;
    setTags([...tags, next]);
    setDraft("");
  }

  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <div className="tag-box">
        {tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => setTags(tags.filter((item) => item !== tag))}>×</button>
            <input type="hidden" name={name} value={tag} />
          </span>
        ))}
        <input
          id={name}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => add(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(draft);
            }
          }}
        />
      </div>
    </div>
  );
}

// Small line-art marks for each question; decorative only.
const ART = {
  departure: <><path d="M32 52S18 38.5 18 27a14 14 0 0 1 28 0c0 11.5-14 25-14 25Z" /><circle cx="32" cy="27" r="5" /><path d="M14 56c6-3 30-3 36 0" /></>,
  destination: <><circle cx="21" cy="17" r="5" /><path d="M6 52 26 27l9 11 7-8 16 22" /></>,
  calendar: <><rect x="10" y="14" width="44" height="38" rx="5" /><path d="M10 24h44M21 9v9M43 9v9M19 32h4M30 32h4M41 32h4M19 41h4M30 41h4M41 41h4" /></>,
  travelers: <><rect x="12" y="22" width="34" height="28" rx="5" /><path d="M24 22v-5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v5M20 22v28M38 22v28" /><circle cx="51" cy="40" r="5" /><path d="M46 52a5 5 0 0 1 10 0" /></>,
  budget: <><path d="M12 20h34a6 6 0 0 1 6 6v20a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V24a4 4 0 0 1 4-4Z" /><path d="M14 20l26-8 3 8" /><path d="M42 31h10v10H42a5 5 0 0 1 0-10Z" /><circle cx="43" cy="36" r="1.2" /></>,
  review: <><rect x="14" y="22" width="22" height="30" rx="4" /><path d="M21 22v-6h8v6M20 52v4M30 52v4M25 28v18" /><circle cx="48" cy="18" r="5" /><path d="M48 7v3M48 26v3M37 18h3M56 18h3M40.5 10.5l2 2M53.5 23.5l2 2M55.5 10.5l-2 2" /></>,
};

function StepArt({ name }) {
  return (
    <svg className="request-art" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
      {ART[name]}
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTH_FALLBACK_ERROR = "Choose a month and enter a year from 1 to 9999.";

// Desktop Firefox and Safari turn type="month" into plain text, so detect it.
export function supportsMonthInput(doc = globalThis.document) {
  if (!doc?.createElement) return true;
  const probe = doc.createElement("input");
  probe.setAttribute("type", "month");
  return probe.type === "month";
}

// Canonical YYYY-MM only when both parts are complete and the year is 1..9999.
// Partial or out-of-range input yields a non-empty invalid value so validation blocks it.
export function monthFromParts(month, year) {
  const text = String(year ?? "").trim();
  if (!month && !text) return "";
  const number = Number(text);
  if (!month || !/^\d{1,4}$/.test(text) || number < 1 || number > 9999) return `incomplete:${text}-${month}`;
  return `${String(number).padStart(4, "0")}-${month}`;
}

/**
 * Month + year picker. Native type="month" where supported; otherwise an explicit
 * month select and year spin box writing one hidden canonical `month` field.
 * Only one enabled control is ever named "month".
 */
export function MonthField({ supported, disabled, error, invalid, focusFirst, onCommit }) {
  const hiddenRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const [focusYear, setFocusYear] = useState(false);
  const [canonical, setCanonical] = useState("");
  const errorId = invalid ? "month-error" : undefined;

  if (supported) {
    return (
      <div className="field">
        <label htmlFor="month">Month<span className="req" aria-hidden="true">*</span></label>
        <div className="request-date-control">
          <input id="month" name="month" type="month" required disabled={disabled} data-step-focus={focusFirst ? true : undefined} className={invalid ? "invalid" : undefined} aria-invalid={invalid || undefined} aria-describedby={errorId} />
          <button type="button" className="request-picker" aria-label="Open calendar for Month" disabled={disabled} onClick={() => {
            const input = document.getElementById("month");
            input.focus();
            try { if (typeof input.showPicker === "function") input.showPicker(); } catch { /* Focus is the fallback. */ }
          }}><CalendarIcon /></button>
        </div>
        {error && <span className={invalid ? "error" : undefined} id="month-error">{error}</span>}
      </div>
    );
  }

  // Runs on the control's own input event, before the form's onInput reads FormData.
  function sync() {
    const month = monthRef.current.value;
    const value = monthFromParts(month, yearRef.current.value);
    // Written to the DOM now so FormData is fresh; state keeps React's re-render in step.
    hiddenRef.current.value = value;
    setCanonical(value);
    setFocusYear(Boolean(month));
  }
  const fixClass = invalid ? "invalid" : undefined;
  const shown = error && error.startsWith("Use a month") ? MONTH_FALLBACK_ERROR : error;

  return (
    <fieldset className="field request-month-fallback" aria-describedby={errorId}>
      <legend>Month and year<span className="req" aria-hidden="true">*</span></legend>
      <input ref={hiddenRef} type="hidden" name="month" value={canonical} disabled={disabled} />
      <div className="request-month-parts">
        <div>
          <label htmlFor="month">Month</label>
          <select id="month" ref={monthRef} defaultValue="" disabled={disabled} required onInput={sync} onChange={() => { sync(); onCommit?.(); }} data-step-focus={focusFirst ? true : undefined} data-error-for={!focusYear ? "month" : undefined} className={fixClass} aria-invalid={invalid || undefined} aria-describedby={errorId}>
            <option value="">Choose month</option>
            {MONTH_NAMES.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="monthYear">Year</label>
          <input id="monthYear" ref={yearRef} type="number" min="1" max="9999" step="1" inputMode="numeric" placeholder="YYYY" defaultValue="" disabled={disabled} required onInput={sync} onChange={() => { sync(); onCommit?.(); }} data-error-for={focusYear ? "month" : undefined} className={fixClass} aria-invalid={invalid || undefined} aria-describedby={errorId} />
        </div>
      </div>
      {shown && <span className={invalid ? "error" : undefined} id="month-error">{shown}</span>}
    </fieldset>
  );
}

export default function TravelForm({ monthInputSupported }) {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [budgetSliderValue, setBudgetSliderValue] = useState(0);
  const [budgetSliderMax, setBudgetSliderMax] = useState(BUDGET_SLIDER_MAX);
  const [budgetIsSet, setBudgetIsSet] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [bad, setBad] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState("dates");
  const [nativeMonth] = useState(() => monthInputSupported ?? supportsMonthInput());
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [destinations, setDestinations] = useState([]);
  const [formErrorFocus, setFormErrorFocus] = useState(0);
  const [focusRequest, setFocusRequest] = useState(null);

  useEffect(() => {
    let active = true;
    fetchDestinations()
      .then((items) => { if (active) setDestinations(items); })
      .catch(() => { /* Server validation still prevents unsupported submissions. */ });
    return () => { active = false; };
  }, []);

  // Runs after the alert renders, so a request-level error is announced and focusable.
  useEffect(() => {
    if (formErrorFocus > 0) formRef.current?.querySelector("#request-form-error")?.focus();
  }, [formErrorFocus]);

  useEffect(() => {
    if (!focusRequest) return;
    const section = formRef.current?.querySelector(`[data-step="${focusRequest.step}"]`);
    const wanted = focusRequest.name ? CONTROL_NAME[focusRequest.name] ?? focusRequest.name : null;
    const control = wanted && [...(section?.querySelectorAll(`[data-error-for="${wanted}"], [name="${wanted}"]`) ?? [])].find(node => node.type !== "hidden" && !node.disabled);
    (control || section?.querySelector("[data-step-focus]:not([disabled])"))?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (formKey > 0) formRef.current?.querySelector("#departureLocation")?.focus();
  }, [formKey]);

  function refresh(form, resizeBudgetRange = false) {
    const data = new FormData(form);
    const wrong = submitted ? clientErrors(data) : valueErrors(data);
    setBad(wrong);
    setErrors(wrong);
    setProgress(progressOf(data));
    setValues(Object.fromEntries(["periodMode", "departureLocation", "destination", "startDate", "endDate", "month", "durationDays", "travelerCount", "budgetAmount", "budgetScope"].map(name => [name, String(data.get(name) ?? "")])));
    const amount = normalizeBudgetInput(data.get("budgetAmount"));
    const validBudget = /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount));
    setBudgetIsSet(validBudget);
    if (validBudget || amount === "") setBudgetSliderValue(validBudget ? Number(amount) : 0);
    if (resizeBudgetRange) setBudgetSliderMax(Math.max(BUDGET_SLIDER_MAX, validBudget ? Number(amount) : 0));
  }

  function setControl(name, value) {
    formRef.current.elements.namedItem(name).value = value;
    refresh(formRef.current);
  }

  // The slider writes the text field but never resizes its own range.
  function slideBudget(event) {
    setControl("budgetAmount", formatBudgetInput(event.currentTarget.value));
  }

  // Focus is applied after React commits, when the target question is no longer hidden.
  function focusStep(next, name) {
    setFocusRequest({ step: next, name });
  }

  function goToStep(next, { edit = false, name } = {}) {
    setStep(next);
    setEditing(edit);
    focusStep(next, name);
  }

  // Sends the user to the earliest question that still has a problem.
  function routeErrors(found) {
    const names = Object.keys(found).filter(name => name !== "form");
    if (!names.length) {
      setFormErrorFocus(count => count + 1);
      return;
    }
    const first = names.sort((a, b) => stepOf(a) - stepOf(b))[0];
    const target = stepOf(first);
    if (target === REVIEW && OPTIONAL_FIELDS.some(name => found[name])) setExpanded(true);
    goToStep(target, { edit: target !== REVIEW, name: first });
  }

  function next() {
    const form = formRef.current;
    const all = clientErrors(new FormData(form));
    const names = fieldsOf(step, mode);
    const found = Object.fromEntries(Object.entries(all).filter(([name]) => names.includes(name)));
    setErrors(found);
    setBad(found);
    if (Object.keys(found).length) {
      focusStep(step, names.find(name => found[name]));
      return;
    }
    goToStep(editing ? REVIEW : step + 1);
  }

  function back() {
    goToStep(Math.max(0, step - 1));
  }

  function skipDestination() {
    setControl("destination", "");
    goToStep(editing ? REVIEW : 2);
  }

  function openPicker(name) {
    const input = formRef.current.elements.namedItem(name);
    input.focus();
    try {
      // Called from the click handler, so the browser sees a user gesture.
      if (typeof input.showPicker === "function") input.showPicker();
    } catch { /* Focus is the fallback when the browser refuses the picker. */ }
  }

  function onInput(event) {
    const form = event.currentTarget;
    const target = event.target;
    if (target.name === "periodMode") setMode(target.value);
    if (target.name?.endsWith("Priority")) {
      const type = target.name.slice(0, -"Priority".length);
      const box = form.querySelector(`input[name="interest"][value="${type}"]`);
      if (box) box.checked = true;
    }
    refresh(form, target.name === "budgetAmount");
  }

  function clearForm() {
    setFormKey((key) => key + 1);
    setMode("dates");
    setStep(0);
    setEditing(false);
    setValues(EMPTY_VALUES);
    setBudgetSliderValue(0);
    setBudgetSliderMax(BUDGET_SLIDER_MAX);
    setBudgetIsSet(false);
    setErrors({});
    setBad({});
    setSubmitted(false);
    setProgress(0);
    setExpanded(false);
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (step !== REVIEW) { next(); return; }
    if (sending) return;
    const data = new FormData(event.currentTarget);
    const found = clientErrors(data);
    setSubmitted(true);
    setBad(found);
    setErrors(found);
    setProgress(progressOf(data));
    if (Object.keys(found).length) { routeErrors(found); return; }
    setSending(true);
    try {
      const payload = buildPayload(data);
      await validateTravelRequest(payload);
      saveTripForResults(payload);
      setErrors({});
      setBad({});
      navigate("/results");
    } catch (error) {
      const serverErrors = error.status === 422
        ? serverFieldErrors(error.body)
        : { form: "Could not send the request." };
      if (!Object.keys(serverErrors).length) serverErrors.form = "The request is invalid.";
      setErrors(serverErrors);
      setBad(serverErrors);
      routeErrors(serverErrors);
    } finally {
      setSending(false);
    }
  }

  const described = (name, extra, base) => {
    const ids = [extra, bad[name] ? `${name}-error` : null].filter(Boolean).join(" ");
    const className = [base, bad[name] ? "invalid" : null].filter(Boolean).join(" ");
    return {
      ...(className ? { className } : {}),
      ...(bad[name] ? { "aria-invalid": true } : {}),
      ...(ids ? { "aria-describedby": ids } : {}),
    };
  };

  const dayCount = mode === "dates" ? inclusiveDays(values.startDate, values.endDate) : null;
  const when = mode === "month"
    ? (values.month ? `${showMonth(values.month)}${values.durationDays ? ` · ${days(Number(values.durationDays))}` : ""}` : "")
    : (values.startDate && values.endDate ? `${showDate(values.startDate)} – ${showDate(values.endDate)}${dayCount ? ` · ${days(dayCount)}` : ""}` : "");
  const budget = values.budgetAmount
    ? `${formatBudgetInput(values.budgetAmount)} VND${values.budgetScope ? ` · ${values.budgetScope === "perPerson" ? "per person" : "whole group"}` : ""}`
    : "";
  const travelers = values.travelerCount ? `${values.travelerCount} ${values.travelerCount === "1" ? "traveler" : "travelers"}` : "";
  const review = [
    ["Leaving from", values.departureLocation?.trim(), 0, "departure"],
    ["Going to", values.destination?.trim() || "Not sure yet", 1, "destination"],
    ["When", when, 2, "dates"],
    ["Travelers", travelers, 3, "travelers"],
    ["Budget", budget, 4, "budget"],
  ];
  const nextLabel = editing ? "Back to review" : "Next";

  const question = (index, art, title, children, hint) => (
    <section id={`request-step-${index}`} data-step={index} className="request-step request-question" hidden={step !== index} aria-labelledby={`request-step-${index}-title`}>
      <StepArt name={art} />
      <h2 id={`request-step-${index}-title`} className="request-question-title">{title}</h2>
      {hint && <p className="request-question-hint" id={`request-step-${index}-hint`}>{hint}</p>}
      <div className="request-question-body">{children}</div>
    </section>
  );

  return (
    <form ref={formRef} key={formKey} className="planner compact-form simple-request-form question-form" onSubmit={onSubmit} onInput={onInput} noValidate>
      <div className="request-topbar">
        {step > 0
          ? <button className="request-back" type="button" onClick={back}><span aria-hidden="true">‹</span> Back</button>
          : <span />}
        <p className="request-step-count">Question {step + 1} of {STEP_COUNT}</p>
      </div>

      {question(0, "departure", <label htmlFor="departureLocation">Where are you leaving from?</label>, <>
        <input id="departureLocation" name="departureLocation" maxLength={200} placeholder="e.g. Ho Chi Minh City" autoComplete="address-level2" required data-step-focus {...described("departureLocation", null, "request-tile-input")} />
        <StepError name="departureLocation" error={errors.departureLocation} />
      </>)}

      {question(1, "destination", <label htmlFor="destination">Where do you want to go?</label>, <>
        <input id="destination" name="destination" list="supported-destinations" placeholder="Choose a supported destination" maxLength={200} data-step-focus {...described("destination", "request-step-1-hint", "request-tile-input")} />
        <datalist id="supported-destinations">
          {destinations.map((item) => {
            const label = item.city || item.city_name || item.name || item.id;
            return label ? <option key={item.id || label} value={label} /> : null;
          })}
        </datalist>
        <StepError name="destination" error={errors.destination} />
        <button type="button" className="request-link" onClick={skipDestination}>Not sure yet</button>
      </>, "Optional. Skip it and we will suggest places.")}

      {question(2, "calendar", "When are you going?", <>
        <div className="request-segmented" role="radiogroup" aria-label="Trip timing">
          <label><input type="radio" name="periodMode" value="dates" checked={mode === "dates"} onChange={() => setMode("dates")} />By dates</label>
          <label><input type="radio" name="periodMode" value="month" checked={mode === "month"} onChange={() => setMode("month")} />By month</label>
        </div>
        {/* Both branches stay mounted; the inactive one is disabled so it keeps its values but is not submitted. */}
        <div className="request-date-grid" hidden={mode !== "dates"}>
          <Field label="Start date" name="startDate" error={errors.startDate} bad={bad} required>
            <div className="request-date-control">
              <input id="startDate" name="startDate" type="date" required disabled={mode !== "dates"} data-step-focus={mode === "dates" ? true : undefined} {...described("startDate")} />
              <button type="button" className="request-picker" aria-label="Open calendar for Start date" disabled={mode !== "dates"} onClick={() => openPicker("startDate")}><CalendarIcon /></button>
            </div>
          </Field>
          <Field label="End date" name="endDate" error={errors.endDate} bad={bad} required>
            <div className="request-date-control">
              <input id="endDate" name="endDate" type="date" min={values.startDate || undefined} required disabled={mode !== "dates"} {...described("endDate")} />
              <button type="button" className="request-picker" aria-label="Open calendar for End date" disabled={mode !== "dates"} onClick={() => openPicker("endDate")}><CalendarIcon /></button>
            </div>
          </Field>
          {dayCount > 0 && <p className="request-question-hint request-span" aria-live="polite">{days(dayCount)}, including both dates</p>}
        </div>
        <div className="request-date-grid" hidden={mode !== "month"}>
          <MonthField supported={nativeMonth} disabled={mode !== "month"} error={errors.month} invalid={Boolean(bad.month)} focusFirst={mode === "month"} onCommit={() => refresh(formRef.current)} />
          <Field label="Number of days" name="durationDays" error={errors.durationDays} bad={bad} required>
            <input id="durationDays" name="durationDays" type="number" min="1" step="1" placeholder="e.g. 3" required disabled={mode !== "month"} {...described("durationDays")} />
          </Field>
        </div>
      </>)}

      {question(3, "travelers", <label htmlFor="travelerCount">How many travelers?</label>, <>
        <div className="request-choices" role="group" aria-label="Quick traveler choices">
          {QUICK_TRAVELERS.map(count => (
            <button key={count} type="button" className="request-choice" aria-pressed={values.travelerCount === String(count)} data-step-focus={count === 1 ? true : undefined} onClick={() => setControl("travelerCount", String(count))}>
              <strong>{count}</strong> {count === 1 ? "traveler" : "travelers"}
            </button>
          ))}
        </div>
        <input id="travelerCount" name="travelerCount" type="number" min="1" step="1" placeholder="Other number" required {...described("travelerCount", "request-step-3-hint", "request-tile-input")} />
        <StepError name="travelerCount" error={errors.travelerCount} />
      </>, "Pick one, or type another number.")}

      {question(4, "budget", <label htmlFor="budgetAmount">What is your budget?</label>, <>
        <div className="simple-budget request-budget">
          <input id="budgetAmount" name="budgetAmount" type="text" inputMode="numeric" placeholder="e.g. 5,000,000" onBlur={event => { event.currentTarget.value = formatBudgetInput(event.currentTarget.value); }} required data-step-focus {...described("budgetAmount", "request-step-4-hint", "request-tile-input")} />
          <StepError name="budgetAmount" error={errors.budgetAmount} />
          <input id="budgetSlider" type="range" min="0" max={budgetSliderMax} step="1" value={budgetSliderValue} onChange={slideBudget} onPointerUp={slideBudget} onKeyUp={event => { if (["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) slideBudget(event); }} aria-label="Budget slider (VND)" aria-valuetext={budgetIsSet ? `${formatBudgetInput(budgetSliderValue)} VND` : "Budget not set"} aria-describedby={errors.budgetAmount ? "budgetAmount-error" : undefined} />
          <div className="budget-range-labels" aria-hidden="true"><span>0 VND</span><span>{formatBudgetInput(budgetSliderMax)} VND</span></div>
          <div className="request-segmented" role="radiogroup" aria-label="Budget applies to" aria-required="true" aria-describedby={errors.budgetScope ? "budgetScope-error" : undefined}>
            <label><input type="radio" name="budgetScope" value="group" />Whole group</label>
            <label><input type="radio" name="budgetScope" value="perPerson" />Per person</label>
          </div>
          <StepError name="budgetScope" error={errors.budgetScope} />
        </div>
      </>, "In VND. Slide, or type an exact amount.")}

      <section id="request-step-5" data-step={REVIEW} className="request-step request-question" hidden={step !== REVIEW} aria-labelledby="request-step-5-title">
        <StepArt name="review" />
        <h2 id="request-step-5-title" className="request-question-title" tabIndex={-1} data-step-focus>Your trip, ready to review.</h2>
        <div className="request-question-body">
          <dl className="request-review">
            {review.map(([label, value, target, key]) => (
              <div key={key} className={value ? undefined : "missing"}>
                <dt>{label}</dt>
                <dd>{value || "Not set yet"}</dd>
                <button type="button" className="request-edit" aria-label={`Edit ${key}`} onClick={() => goToStep(target, { edit: true })}>Edit</button>
              </div>
            ))}
          </dl>
          <details className="compact-options" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
            <summary>Describe more</summary>
            <div className="compact-options-body">
              <p className="request-question-hint">Optional details. Leave them empty if they do not matter.</p>
              <h2>Travel interests</h2>
              <div className="pills compact-chips interest-choices">{INTERESTS.map(([type, label]) => <label className="pill" key={type}><input type="checkbox" name="interest" value={type} />{label}</label>)}</div>
              {errors.interests && <span className="error">{errors.interests}</span>}
              <h2>Food</h2>
              <div className="grid-2">
                <Tags name="diningPreferred" label="Foods you like" placeholder="e.g. seafood (Enter)" />
                <Tags name="diningAvoid" label="Foods to avoid" placeholder="e.g. spicy food (Enter)" />
              </div>
              <h2>Transportation</h2>
              <div className="pills compact-chips">{TRANSPORT.map(([value, label]) => <label className="pill" key={value}><input type="checkbox" name="transportation" value={value} />{label}</label>)}</div>
              <div className="grid-2">
                <Field label="Group notes" name="characteristics" error={errors.characteristics} bad={bad}>
                  <textarea id="characteristics" name="characteristics" rows="2" placeholder="e.g. 2 adults, 1 older adult" {...described("characteristics")} />
                </Field>
                <Field label="Max distance (km)" name="maxDistanceKm" error={errors.maxDistanceKm} bad={bad}>
                  <input id="maxDistanceKm" name="maxDistanceKm" type="number" min="0" step="any" placeholder="e.g. 50" {...described("maxDistanceKm")} />
                </Field>
                <Field label="Max travel time (minutes)" name="maxTravelTimeMinutes" error={errors.maxTravelTimeMinutes} bad={bad}>
                  <input id="maxTravelTimeMinutes" name="maxTravelTimeMinutes" type="number" min="1" step="1" placeholder="e.g. 60" {...described("maxTravelTimeMinutes")} />
                </Field>
                <Field label="Limit applies to" name="appliesTo" error={errors.appliesTo} bad={bad}>
                  <select id="appliesTo" name="appliesTo" defaultValue="" {...described("appliesTo")}>
                    <option value="">No limit</option><option value="fromDeparture">From departure</option><option value="betweenActivities">Between stops</option><option value="daily">Within one day</option>
                  </select>
                </Field>
              </div>
            </div>
          </details>
        </div>
      </section>

      <div className="actions request-actions">
        {errors.form && <p className="error" role="alert" id="request-form-error" tabIndex={-1}>{errors.form}</p>}
        <button className="primary request-next" type="submit" disabled={sending}>{step === REVIEW ? (sending ? "Checking…" : "Create itinerary") : nextLabel}</button>
        <BusIllustration progress={progress} />
        <div className="request-footer">
          <button className="request-link" type="button" onClick={clearForm}>Clear form</button>
          <p className="completion-label" aria-live="polite">{progress}% finding</p>
        </div>
      </div>
    </form>
  );
}
