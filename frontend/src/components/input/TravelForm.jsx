import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BusIllustration } from "../common/Illustrations.jsx";
import ProvinceInput from "./ProvinceInput.jsx";
import { saveTripForResults, validateTravelRequest } from "../../services/api";
import { buildPayload, clientErrors, serverFieldErrors, valueErrors, progressOf, formatBudgetInput, normalizeBudgetInput, inclusiveDays, isSoloTravelerCount, ADDITIONAL_REQUIREMENTS_MAX, MAX_TRIP_DAYS, tripLimitHint, startDateBounds, addDaysIso, isValidTripDays, endDateFromLength, formatReturnLabel, formatBangkokDate, isIsoDate, MIN_BUDGET_VND, INTERESTS } from "./travelRequest";

// The slider's standard range is 2,000,000..80,000,000 VND. It is not a limit on valid budget
// input: a larger exact amount typed by hand widens the range so the slider can show it.
export const BUDGET_SLIDER_MAX = 80_000_000;
const QUICK_TRAVELERS = [1, 2, 3, 4];
const PLACES = 0;
const DATES = 1;
const PARTY = 2;
const STYLE = 3;
const DESCRIBE = 4;
const REVIEW = 5;
const DESCRIPTION_PLACEHOLDER = [
  "For example:",
  "We love seafood but would rather avoid spicy food.",
  "We prefer taxis and short walks over motorbikes.",
  "We enjoy culture, nature and slow mornings.",
  "One of us is an older adult, so an easy pace helps.",
  "Ideally no more than 50 km or about an hour of travel per day.",
].join("\n");
// Which question owns each field, for step validation and error routing.
const FIELD_STEP = {
  departureLocation: PLACES,
  destination: PLACES,
  startDate: DATES, endDate: DATES, durationDays: DATES,
  travelerCount: PARTY,
  budgetAmount: PARTY, budgetScope: PARTY,
  interests: STYLE,
  additionalRequirements: DESCRIBE,
};
// Shown on review when the destination is skipped; destinations are suggested downstream.
export const NO_DESTINATION = "Not chosen. We'll suggest destinations based on your trip.";
export const DESTINATION_HINT = "Skip it and we'll suggest destinations based on your trip.";
// One short request-level message when the server cannot plan the typed destination.
export const DESTINATION_UNAVAILABLE = "We couldn't plan a trip to that destination. Edit it or skip it to get suggestions.";
const CONTROL_NAME = { interests: "interest" };

const INITIAL_VALUES = {};

// Server errors for the destination are not shown on the field (no long city list);
// they become one short request-level message instead.
export function hideDestinationErrors(errors) {
  if (!errors.destination) return errors;
  const { destination: _hidden, ...rest } = errors;
  return { ...rest, form: DESTINATION_UNAVAILABLE };
}

// Errors for fields this form no longer shows become one visible request-level message.
export function placeErrors(errors) {
  const placed = {};
  const loose = [];
  for (const [name, message] of Object.entries(errors)) {
    if (name === "form" || name in FIELD_STEP) placed[name] = message;
    else loose.push(message);
  }
  const form = [placed.form, ...loose].filter(Boolean).join(" ");
  if (form) placed.form = form;
  return placed;
}

function stepOf(name) {
  return FIELD_STEP[name] ?? REVIEW;
}

function fieldsOf(step) {
  if (step === DATES) return ["startDate", "durationDays"];
  return Object.keys(FIELD_STEP).filter(name => FIELD_STEP[name] === step);
}

// Formats an ISO calendar date in Asia/Bangkok so the weekday and day never shift.
function showDate(iso, withYear = true) {
  if (!isIsoDate(iso)) return iso || "";
  return formatBangkokDate(iso, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
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

// Small line-art marks for each question; decorative only.
const ART = {
  departure: <><path d="M32 52S18 38.5 18 27a14 14 0 0 1 28 0c0 11.5-14 25-14 25Z" /><circle cx="32" cy="27" r="5" /><path d="M14 56c6-3 30-3 36 0" /></>,
  destination: <><circle cx="21" cy="17" r="5" /><path d="M6 52 26 27l9 11 7-8 16 22" /></>,
  calendar: <><rect x="10" y="14" width="44" height="38" rx="5" /><path d="M10 24h44M21 9v9M43 9v9M19 32h4M30 32h4M41 32h4M19 41h4M30 41h4M41 41h4" /></>,
  travelers: <><rect x="12" y="22" width="34" height="28" rx="5" /><path d="M24 22v-5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v5M20 22v28M38 22v28" /><circle cx="51" cy="40" r="5" /><path d="M46 52a5 5 0 0 1 10 0" /></>,
  budget: <><path d="M12 20h34a6 6 0 0 1 6 6v20a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V24a4 4 0 0 1 4-4Z" /><path d="M14 20l26-8 3 8" /><path d="M42 31h10v10H42a5 5 0 0 1 0-10Z" /><circle cx="43" cy="36" r="1.2" /></>,
  describe: <><path d="M12 14h40a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H30l-11 9v-9h-7a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5Z" /><path d="M19 25h26M19 33h18" /></>,
  style: <><circle cx="32" cy="32" r="8" /><path d="M32 10v8M32 46v8M10 32h8M46 32h8M16 16l6 6M42 42l6 6M48 16l-6 6M22 42l-6 6" /></>,
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

export default function TravelForm() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [budgetSliderValue, setBudgetSliderValue] = useState(MIN_BUDGET_VND);
  const [budgetSliderMax, setBudgetSliderMax] = useState(BUDGET_SLIDER_MAX);
  const [budgetIsSet, setBudgetIsSet] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [bad, setBad] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [reached, setReached] = useState(() => new Set());
  const [formErrorFocus, setFormErrorFocus] = useState(0);
  const [focusRequest, setFocusRequest] = useState(null);

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

  // One traveler is always per person, with no switch. Two or more start with the switch off.
  function syncBudgetScope(form) {
    const scope = form.elements.namedItem("budgetScope");
    if (!scope) return;
    const count = form.elements.namedItem("travelerCount")?.value;
    if (isSoloTravelerCount(count)) {
      scope.value = "perPerson";
      scope.dataset.forced = "solo";
      return;
    }
    if (scope.dataset.forced === "solo") {
      scope.value = "";
      delete scope.dataset.forced;
    }
  }

  function refresh(form, resizeBudgetRange = false) {
    syncBudgetScope(form);
    const data = new FormData(form);
    const wrong = submitted ? clientErrors(data) : valueErrors(data);
    setBad(wrong);
    setErrors(wrong);
    setProgress(progressOf(data));
    setValues({
      ...Object.fromEntries(["departureLocation", "destination", "startDate", "endDate", "durationDays", "travelerCount", "budgetAmount", "budgetScope"].map(name => [name, String(data.get(name) ?? "")])),
      interests: data.getAll("interest"),
    });
    const amount = normalizeBudgetInput(data.get("budgetAmount"));
    const validBudget = /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount));
    setBudgetIsSet(validBudget);
    if (validBudget || amount === "") {
      const snapped = validBudget ? Math.floor(Number(amount) / 1000) * 1000 : MIN_BUDGET_VND;
      setBudgetSliderValue(Math.max(MIN_BUDGET_VND, snapped));
    }
    if (resizeBudgetRange) setBudgetSliderMax(Math.max(BUDGET_SLIDER_MAX, validBudget ? Number(amount) : 0));
  }

  function syncComputedEnd(form) {
    const start = form.elements.namedItem("startDate")?.value;
    const length = form.elements.namedItem("durationDays")?.value;
    const endInput = form.elements.namedItem("endDate");
    if (!endInput) return;
    endInput.value = endDateFromLength(start, length);
  }

  function setControl(name, value) {
    formRef.current.elements.namedItem(name).value = value;
    if (name === "startDate" || name === "durationDays") syncComputedEnd(formRef.current);
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
    setReached(prev => {
      if (next <= step) return prev;
      const copy = new Set(prev);
      for (let index = step; index < next; index += 1) copy.add(index);
      return copy;
    });
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
    goToStep(target, { edit: target !== REVIEW, name: first });
  }

  function snapBudgetField(form) {
    const input = form.elements.namedItem("budgetAmount");
    if (!input) return;
    const shown = formatBudgetInput(input.value);
    if (shown === input.value) return;
    input.value = shown;
    refresh(form);
  }

  function next() {
    const form = formRef.current;
    snapBudgetField(form);
    const all = clientErrors(new FormData(form));
    const names = fieldsOf(step);
    const found = Object.fromEntries(Object.entries(all).filter(([name]) => names.includes(name)));
    setErrors(found);
    setBad(found);
    if (Object.keys(found).length) {
      focusStep(step, names.find(name => found[name]));
      return;
    }
    goToStep(editing || step === DESCRIBE ? REVIEW : step + 1);
  }

  function back() {
    goToStep(Math.max(0, step - 1));
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
    if (target.name === "startDate" || target.name === "durationDays") syncComputedEnd(form);
    refresh(form, target.name === "budgetAmount");
  }

  function clearForm() {
    setFormKey((key) => key + 1);
    setStep(0);
    setEditing(false);
    setValues(INITIAL_VALUES);
    setBudgetSliderValue(MIN_BUDGET_VND);
    setBudgetSliderMax(BUDGET_SLIDER_MAX);
    setBudgetIsSet(false);
    setErrors({});
    setBad({});
    setSubmitted(false);
    setProgress(0);
    setDescriptionDraft("");
    setReached(new Set());
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (step !== REVIEW) { next(); return; }
    if (sending) return;
    snapBudgetField(event.currentTarget);
    const data = new FormData(event.currentTarget);
    const found = placeErrors(clientErrors(data));
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
      const serverErrors = placeErrors(error.status === 422
        ? hideDestinationErrors(serverFieldErrors(error.body))
        : { form: "Could not send the request." });
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

  const { min: startMin, max: startMax } = startDateBounds();
  const dayCount = isValidTripDays(values.durationDays)
    ? Number(values.durationDays)
    : inclusiveDays(values.startDate, values.endDate);
  const computedEnd = isValidTripDays(values.durationDays) && isIsoDate(values.startDate)
    ? endDateFromLength(values.startDate, values.durationDays)
    : values.endDate;
  const when = values.startDate && computedEnd && dayCount
    ? `${showDate(values.startDate)} – ${showDate(computedEnd)} · ${days(dayCount)}`
    : "";
  const perPerson = values.budgetScope === "perPerson";
  const travelerNumber = Number(String(values.travelerCount ?? "").trim());
  const showPerPerson = Number.isInteger(travelerNumber) && travelerNumber >= 2;
  const budget = values.budgetAmount
    ? `${formatBudgetInput(values.budgetAmount)} VND${perPerson ? " · per person" : ""}`
    : "";
  const travelers = values.travelerCount ? `${values.travelerCount} ${values.travelerCount === "1" ? "traveler" : "travelers"}` : "";
  const styleNames = INTERESTS.filter(([type]) => (values.interests ?? []).includes(type)).map(([, label]) => label);
  const styleText = styleNames.length ? styleNames.join(", ") : "Nothing selected";
  const review = [
    ["Leaving from", values.departureLocation?.trim(), PLACES, "departure"],
    ["Going to", values.destination?.trim() || NO_DESTINATION, PLACES, "destination"],
    ["When", when, DATES, "dates"],
    ["Travelers", travelers, PARTY, "travelers"],
    ["Budget", budget, PARTY, "budget"],
    ["Travel style", styleText, STYLE, "style"],
  ];
  const hasDraft = descriptionDraft.trim() !== "";
  const nextLabel = editing ? "Back to review" : "Next";
  const thread = [
    { step: PLACES, question: "Where are you traveling?", answer: `${values.departureLocation?.trim() || ""} → ${values.destination?.trim() || "Not chosen"}` },
    { step: DATES, question: "When are you going?", answer: when },
    { step: PARTY, question: "Who is going, and what's the budget?", answer: [travelers, budget].filter(Boolean).join(" · ") },
    { step: STYLE, question: "What kind of trip should we prioritize?", answer: styleText },
    { step: DESCRIBE, question: "Is there anything else you’d like to describe?", answer: hasDraft ? descriptionDraft.trim() : "Nothing added" },
  ].filter(item => reached.has(item.step) && item.step !== step);

  const question = (index, art, title, children, hint, optional = false) => (
    <section id={`request-step-${index}`} data-step={index} className="request-step request-question" hidden={step !== index} aria-labelledby={`request-step-${index}-title`}>
      <StepArt name={art} />
      {optional ? <p className="request-optional">Optional</p> : null}
      <h2 id={`request-step-${index}-title`} className="request-question-title">{title}</h2>
      {hint && <p className="request-question-hint" id={`request-step-${index}-hint`}>{hint}</p>}
      <div className="request-question-body">{children}</div>
    </section>
  );

  return (
    <form ref={formRef} key={formKey} className="planner compact-form simple-request-form question-form" onSubmit={onSubmit} onInput={onInput} noValidate>
      {step > 0 && (
        <div className="request-topbar">
          <button className="request-back" type="button" onClick={back}><span aria-hidden="true">‹</span> Back</button>
        </div>
      )}

      {thread.length > 0 && (
        <ol className="request-thread">
          {thread.map(item => (
            <li key={item.step}>
              <button type="button" className="request-thread-item" onClick={() => goToStep(item.step, { edit: editing || step === REVIEW })}>
                <span className="request-thread-q">{item.question}</span>
                <span className="request-thread-a">{item.answer}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {question(PLACES, "departure", "Where are you traveling?", <>
        <Field label="Leaving from" name="departureLocation" error={errors.departureLocation} bad={bad} required>
          <ProvinceInput id="departureLocation" name="departureLocation" maxLength={200} placeholder="e.g. Ho Chi Minh City" required data-step-focus onPick={value => setControl("departureLocation", value)} {...described("departureLocation", null, "request-tile-input")} />
        </Field>
        <Field label="Going to" name="destination" error={errors.destination} bad={bad}>
          <ProvinceInput id="destination" name="destination" placeholder="e.g. Da Nang, Da Lat" maxLength={200} onPick={value => setControl("destination", value)} {...described("destination", "destination-hint", "request-tile-input")} />
          <p className="request-question-hint" id="destination-hint">{DESTINATION_HINT}</p>
        </Field>
      </>)}

      {question(DATES, "calendar", "When are you going?", <>
        <div className="request-date-grid">
          <Field label="Start date" name="startDate" error={errors.startDate} bad={bad} required>
            <div className="request-date-control">
              <input id="startDate" name="startDate" type="date" min={startMin} max={startMax} required data-step-focus {...described("startDate")} />
              <button type="button" className="request-picker" aria-label="Open calendar for Start date" onClick={() => openPicker("startDate")}><CalendarIcon /></button>
            </div>
          </Field>
          <div className="field request-span">
            <span id="durationDays-label">How many days?<span className="req" aria-hidden="true">*</span></span>
            <div className="request-choices request-choices-days" role="group" aria-labelledby="durationDays-label" aria-describedby={errors.durationDays ? "durationDays-error" : undefined}>
              {Array.from({ length: MAX_TRIP_DAYS }, (_, index) => index + 1).map((count) => (
                <button key={count} type="button" className="request-choice" aria-pressed={values.durationDays === String(count)} onClick={() => setControl("durationDays", String(count))}>
                  <strong>{count}</strong> {count === 1 ? "day" : "days"}
                </button>
              ))}
            </div>
            <input id="durationDays" name="durationDays" type="hidden" required />
            <input id="endDate" name="endDate" type="hidden" />
            <StepError name="durationDays" error={errors.durationDays} />
            <StepError name="endDate" error={errors.endDate} />
          </div>
          {isIsoDate(values.startDate) && isValidTripDays(values.durationDays) && (
            <p className="request-question-hint request-span" aria-live="polite">{formatReturnLabel(endDateFromLength(values.startDate, values.durationDays))}</p>
          )}
        </div>
      </>, tripLimitHint())}

      {question(PARTY, "travelers", "Who is going, and what's the budget?", <>
        <div className="field">
          <label htmlFor="travelerCount">How many travelers?<span className="req" aria-hidden="true">*</span></label>
          <div className="request-choices" role="group" aria-label="Quick traveler choices">
            {QUICK_TRAVELERS.map(count => (
              <button key={count} type="button" className="request-choice" aria-pressed={values.travelerCount === String(count)} data-step-focus={count === 1 ? true : undefined} onClick={() => setControl("travelerCount", String(count))}>
                <strong>{count}</strong> {count === 1 ? "traveler" : "travelers"}
              </button>
            ))}
          </div>
          <input id="travelerCount" name="travelerCount" type="number" min="1" step="1" placeholder="Other number" required {...described("travelerCount", null, "request-tile-input")} />
          <StepError name="travelerCount" error={errors.travelerCount} />
        </div>
        <div className="simple-budget request-budget">
          <label htmlFor="budgetAmount">What is your budget?<span className="req" aria-hidden="true">*</span></label>
          <input id="budgetAmount" name="budgetAmount" type="text" inputMode="numeric" placeholder="e.g. 5,000,000" onBlur={event => { const shown = formatBudgetInput(event.currentTarget.value); if (shown !== event.currentTarget.value) setControl("budgetAmount", shown); }} required data-step-focus {...described("budgetAmount", null, "request-tile-input")} />
          <StepError name="budgetAmount" error={errors.budgetAmount} />
          <input id="budgetSlider" type="range" min={MIN_BUDGET_VND} max={budgetSliderMax} step="1000" value={budgetSliderValue} onChange={slideBudget} onPointerUp={slideBudget} onKeyUp={event => { if (["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) slideBudget(event); }} aria-label="Budget slider (VND)" aria-valuetext={budgetIsSet ? `${formatBudgetInput(budgetSliderValue)} VND` : "Budget not set"} aria-describedby={errors.budgetAmount ? "budgetAmount-error" : undefined} />
          <div className="budget-range-labels" aria-hidden="true"><span>{formatBudgetInput(MIN_BUDGET_VND)} VND</span><span>{formatBudgetInput(budgetSliderMax)} VND</span></div>
          {showPerPerson && (
            <button type="button" className="request-scope-toggle" aria-pressed={perPerson} data-error-for="budgetScope" onClick={() => setControl("budgetScope", perPerson ? "" : "perPerson")}>
              <span className="request-scope-knob" aria-hidden="true" />
              Per person
            </button>
          )}
          <input type="hidden" name="budgetScope" value={perPerson ? "perPerson" : ""} readOnly />
          {showPerPerson && <StepError name="budgetScope" error={errors.budgetScope} />}
        </div>
      </>)}

      {question(STYLE, "style", "What kind of trip should we prioritize?", <>
        <div className="request-choices request-choices-style" role="group" aria-labelledby={`request-step-${STYLE}-title`}>
          {INTERESTS.map(([type, label], index) => (
            <label key={type} className="request-choice-check">
              <input type="checkbox" name="interest" value={type} data-step-focus={index === 0 ? true : undefined} />
              <strong>{label}</strong>
            </label>
          ))}
        </div>
      </>, "Choose any that fit. We'll treat them equally.", true)}

      {question(DESCRIBE, "describe", <label htmlFor="tripDescription">Is there anything else you’d like to describe?</label>, <>
        <textarea id="tripDescription" name="additionalRequirements" className="request-describe" rows="7" maxLength={ADDITIONAL_REQUIREMENTS_MAX} value={descriptionDraft} onChange={event => setDescriptionDraft(event.target.value)} placeholder={DESCRIPTION_PLACEHOLDER} data-step-focus {...described("additionalRequirements", `request-step-${DESCRIBE}-hint request-describe-count`, "request-describe")} />
        <p className="request-char-count" id="request-describe-count">{descriptionDraft.length}/{ADDITIONAL_REQUIREMENTS_MAX}</p>
        <StepError name="additionalRequirements" error={errors.additionalRequirements} />
      </>, "Food, transport, interests, your group or travel limits.", true)}

      <section id={`request-step-${REVIEW}`} data-step={REVIEW} className="request-step request-question" hidden={step !== REVIEW} aria-labelledby={`request-step-${REVIEW}-title`}>
        <StepArt name="review" />
        <h2 id={`request-step-${REVIEW}-title`} className="request-question-title" tabIndex={-1} data-step-focus>Your trip, ready to review.</h2>
        <div className="request-question-body">
          <dl className="request-review">
            {review.map(([label, value, target, key]) => (
              <div key={key} className={value ? undefined : "missing"}>
                <dt>{label}</dt>
                <dd>{value || "Not set yet"}</dd>
                <button type="button" className="request-edit" aria-label={`Edit ${key}`} onClick={() => goToStep(target, { edit: true })}>Edit</button>
              </div>
            ))}
            <div className="request-review-draft">
              <dt>Extra description</dt>
              <dd>{hasDraft ? descriptionDraft.trim() : "Nothing added"}</dd>
              <button type="button" className="request-edit" aria-label="Edit description" onClick={() => goToStep(DESCRIBE, { edit: true })}>Edit</button>
            </div>
          </dl>
        </div>
      </section>

      <div className="actions request-actions">
        {errors.form && <p className="error" role="alert" id="request-form-error" tabIndex={-1}>{errors.form}</p>}
        <button className="primary request-next" type="submit" disabled={sending}>{step === REVIEW ? (sending ? "Creating plans…" : "Create itinerary") : nextLabel}</button>
        <BusIllustration progress={progress} />
        <div className="request-footer">
          <button className="request-link" type="button" onClick={clearForm}>Clear form</button>
          <p className="completion-label" aria-live="polite">{progress}% complete</p>
        </div>
      </div>
    </form>
  );
}
