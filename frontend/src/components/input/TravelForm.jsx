import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BusIllustration } from "../common/Illustrations.jsx";
import { saveTripForResults, validateTravelRequest } from "../../services/api";
import { INTERESTS, buildPayload, clientErrors, serverFieldErrors, valueErrors, progressOf, formatBudgetInput } from "./travelRequest";

const QUICK_CHOICES = {
  travelerCount: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]],
  budgetAmount: [["1000000", "1,000,000"], ["3000000", "3,000,000"], ["5000000", "5,000,000"], ["10000000", "10,000,000"]],
  durationDays: [["2", "2 days"], ["3", "3 days"], ["5", "5 days"], ["7", "7 days"]],
};

function QuickChoices({ name, value, onChoose }) {
  return <div className="quick-choices" role="group" aria-label={name === "travelerCount" ? "Choose number of travelers" : name === "budgetAmount" ? "Choose budget in VND" : "Choose number of days"}>
    {QUICK_CHOICES[name].map(([amount, label]) => <button type="button" key={amount} aria-pressed={String(value).replaceAll(",", "") === amount} onClick={() => onChoose(name, amount)}>{label}</button>)}
  </div>;
}

const TRANSPORT = [
  ["taxi", "Taxi"],
  ["walking", "Walking"],
  ["motorbike", "Motorbike"],
  ["car", "Car"],
  ["publicTransport", "Public transport"],
];

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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export default function TravelForm() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [step, setStep] = useState(0);
  const [choiceValues, setChoiceValues] = useState({});
  const [formKey, setFormKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [bad, setBad] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState("dates");
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (formKey > 0) formRef.current?.querySelector("#departureLocation")?.focus();
  }, [formKey]);

  function refresh(form) {
    const data = new FormData(form);
    const wrong = submitted ? clientErrors(data) : valueErrors(data);
    setBad(wrong);
    setErrors(wrong);
    setProgress(progressOf(data));
    setChoiceValues(Object.fromEntries(["travelerCount", "budgetAmount", "durationDays"].map(name => [name, data.get(name) ?? ""])));
  }

  function choose(name, value) {
    const field = formRef.current?.elements.namedItem(name);
    if (!field || !QUICK_CHOICES[name]?.some(([option]) => option === value)) return;
    field.value = name === "budgetAmount" ? formatBudgetInput(value) : value;
    refresh(formRef.current);
  }

  function focusError(form, found) {
    requestAnimationFrame(() => {
      Array.from(form.elements).find(control => found[control.name] && control.type !== "hidden")?.focus();
    });
  }

  function nextStep() {
    const form = formRef.current;
    const all = clientErrors(new FormData(form));
    const names = mode === "month" ? ["departureLocation", "destination", "month", "durationDays"] : ["departureLocation", "destination", "startDate", "endDate"];
    const found = Object.fromEntries(Object.entries(all).filter(([name]) => names.includes(name)));
    setErrors(found);
    setBad(found);
    if (Object.keys(found).length) { focusError(form, found); return; }
    setStep(1);
    requestAnimationFrame(() => form.querySelector("#travelerCount")?.focus());
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
    refresh(form);
  }

  function clearForm() {
    setFormKey((key) => key + 1);
    setMode("dates");
    setStep(0);
    setChoiceValues({});
    setErrors({});
    setBad({});
    setSubmitted(false);
    setProgress(0);
    setExpanded(false);
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (step === 0) { nextStep(); return; }
    const data = new FormData(event.currentTarget);
    const found = clientErrors(data);
    setSubmitted(true);
    setBad(found);
    setErrors(found);
    setProgress(progressOf(data));
    if (Object.keys(found).length) {
      if (["maxDistanceKm", "maxTravelTimeMinutes", "appliesTo", "interests", "characteristics"].some(key => found[key])) setExpanded(true);
      const form = event.currentTarget;
      if (["departureLocation", "destination", "startDate", "endDate", "month", "durationDays"].some(name => found[name])) setStep(0);
      focusError(form, found);
      return;
    }
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
      setErrors(serverErrors);
      setBad(serverErrors);
      if (["departureLocation", "destination", "startDate", "endDate", "month", "durationDays"].some(name => serverErrors[name])) setStep(0);
      if (["maxDistanceKm", "maxTravelTimeMinutes", "appliesTo", "interests", "characteristics"].some(name => serverErrors[name])) setExpanded(true);
      focusError(formRef.current, serverErrors);
    }
  }

  const described = (name) => (bad[name]
    ? { className: "invalid", "aria-invalid": true, "aria-describedby": `${name}-error` }
    : {});

  return (
    <form ref={formRef} key={formKey} className="planner compact-form quick-request-form" onSubmit={onSubmit} onInput={onInput} noValidate>
      <ol className="request-steps" aria-label="Request steps">
        <li aria-current={step === 0 ? "step" : undefined}>1. Where &amp; when</li>
        <li aria-current={step === 1 ? "step" : undefined}>2. Travelers &amp; budget</li>
      </ol>
      <section className="card request-step" hidden={step !== 0} aria-label="Where and when">
        <h2>Trip details</h2>
        <div className="compact-grid">
          <Field label="Departure" name="departureLocation" error={errors.departureLocation} bad={bad} required>
            <input id="departureLocation" name="departureLocation" maxLength={200} placeholder="e.g. Ho Chi Minh City" required {...described("departureLocation")} />
          </Field>
          <Field label="Destination" name="destination" error={errors.destination} bad={bad}>
            <input id="destination" name="destination" placeholder="e.g. Da Nang" maxLength={200} {...described("destination")} />
          </Field>
        </div>
        <div className="compact-timing">
          <h2><CalendarIcon /> Trip dates</h2>
          <select aria-label="Trip timing" id="periodMode" name="periodMode" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="dates">By dates</option><option value="month">By month</option>
          </select>
        </div>
        <div className="compact-grid">
          {mode === "dates" ? <>
            <Field label="Start date" name="startDate" error={errors.startDate} bad={bad} required>
              <input id="startDate" name="startDate" type="date" required {...described("startDate")} />
            </Field>
            <Field label="End date" name="endDate" error={errors.endDate} bad={bad} required>
              <input id="endDate" name="endDate" type="date" required {...described("endDate")} />
            </Field>
          </> : <>
            <Field label="Month" name="month" error={errors.month} bad={bad} required>
              <input id="month" name="month" type="month" required {...described("month")} />
            </Field>
            <Field label="Number of days" name="durationDays" error={errors.durationDays} bad={bad} required>
              <input id="durationDays" name="durationDays" type="number" min="1" step="1" placeholder="e.g. 3" required {...described("durationDays")} />
              <QuickChoices name="durationDays" value={choiceValues.durationDays ?? ""} onChoose={choose} />
            </Field>
          </>}
        </div>
      </section>
      <section className="card request-step" hidden={step !== 1} aria-label="Travelers and budget">
        <h2>Travelers &amp; budget</h2>
        <div className="compact-grid people-budget-grid">
          <Field label="Travelers" name="travelerCount" error={errors.travelerCount} bad={bad} required>
            <QuickChoices name="travelerCount" value={choiceValues.travelerCount ?? ""} onChoose={choose} />
            <input id="travelerCount" name="travelerCount" type="number" min="1" step="1" placeholder="e.g. 2" required {...described("travelerCount")} />
          </Field>
          <div>
            <Field label="Budget (VND)" name="budgetAmount" error={errors.budgetAmount} bad={bad} required>
              <QuickChoices name="budgetAmount" value={choiceValues.budgetAmount ?? ""} onChoose={choose} />
              <input id="budgetAmount" name="budgetAmount" type="text" inputMode="numeric" placeholder="e.g. 5,000,000" onBlur={event => { event.currentTarget.value = formatBudgetInput(event.currentTarget.value); }} required {...described("budgetAmount")} />
            </Field>
            <div className="compact-budget" role="radiogroup" aria-label="Budget applies to" aria-required="true" aria-describedby={errors.budgetScope ? "budgetScope-error" : undefined}>
              <label><input type="radio" name="budgetScope" value="group" /> Whole group</label>
              <label><input type="radio" name="budgetScope" value="perPerson" /> Per person</label>
            </div>
            {errors.budgetScope && <span className="error" id="budgetScope-error">{errors.budgetScope}</span>}
          </div>
        </div>
      </section>

      <details hidden={step !== 1} className="compact-options" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary>Describe more</summary>
        <div className="compact-options-body">
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
      <div className="actions">
        <BusIllustration progress={progress} />
        <p className="completion-label" aria-live="polite">{progress}% finding</p>
        {errors.form && <p className="error" role="alert">{errors.form}</p>}
        <div className="action-row">
          {step === 1 && <button className="secondary" type="button" onClick={() => { setStep(0); requestAnimationFrame(() => formRef.current?.querySelector("#departureLocation")?.focus()); }}>Back</button>}
          {step === 0 ? <button className="primary" type="submit">Continue</button> : <button className="primary" type="submit">Create itinerary</button>}
          <button className="secondary" type="button" onClick={clearForm}>Clear form</button>
        </div>
      </div>
    </form>
  );
}
