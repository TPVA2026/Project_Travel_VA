import { useState } from "react";
import { validateTravelRequest } from "../../services/api";
import { INTERESTS, buildPayload, clientErrors, serverFieldErrors, valueErrors } from "./travelRequest";

const TRANSPORT = [
  ["taxi", "Taxi"],
  ["walking", "Walking"],
  ["motorbike", "Motorbike"],
  ["car", "Car"],
  ["publicTransport", "Public transport"],
];

function progressOf(data) {
  const keys = data.get("periodMode") === "month"
    ? ["month", "durationDays", "departureLocation", "travelerCount", "budgetAmount", "budgetScope"]
    : ["startDate", "endDate", "departureLocation", "travelerCount", "budgetAmount", "budgetScope"];
  const filled = keys.filter((key) => String(data.get(key) ?? "").trim()).length;
  return Math.round((filled / keys.length) * 100);
}

function Field({ label, name, error, bad, children }) {
  const wrong = Boolean(bad?.[name]);
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
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
  const [formKey, setFormKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [bad, setBad] = useState({});
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState("dates");
  const [progress, setProgress] = useState(0);

  function refresh(form) {
    const data = new FormData(form);
    const wrong = valueErrors(data);
    setBad(wrong);
    setErrors(wrong);
    setProgress(progressOf(data));
  }

  function onInput(event) {
    setDone(false);
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
    setErrors({});
    setBad({});
    setDone(false);
    setProgress(0);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setDone(false);
    const data = new FormData(event.currentTarget);
    const found = clientErrors(data);
    const wrong = valueErrors(data);
    setBad(wrong);
    setProgress(progressOf(data));
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    try {
      await validateTravelRequest(buildPayload(data));
      setErrors({});
      setBad({});
      setDone(true);
    } catch (error) {
      const serverErrors = error.status === 422
        ? serverFieldErrors(error.body)
        : { form: "Could not send the request." };
      setErrors(serverErrors);
      setBad(serverErrors);
    }
  }

  const described = (name) => (bad[name]
    ? { className: "invalid", "aria-invalid": true, "aria-describedby": `${name}-error` }
    : {});

  return (
    <form key={formKey} className="planner" onSubmit={onSubmit} onInput={onInput} noValidate>
      <section className="card">
        <h2><CalendarIcon /> Trip dates</h2>
        <Field label="Trip timing" name="periodMode" error={errors.periodMode} bad={bad}>
          <select id="periodMode" name="periodMode" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="dates">By dates</option>
            <option value="month">By month</option>
          </select>
        </Field>
        <div className="grid-2">
          {mode === "dates" ? (
            <>
              <Field label="Start date" name="startDate" error={errors.startDate} bad={bad}>
                <input id="startDate" name="startDate" type="date" required {...described("startDate")} />
              </Field>
              <Field label="End date" name="endDate" error={errors.endDate} bad={bad}>
                <input id="endDate" name="endDate" type="date" required {...described("endDate")} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Month" name="month" error={errors.month} bad={bad}>
                <input id="month" name="month" type="month" required {...described("month")} />
              </Field>
              <Field label="Number of days" name="durationDays" error={errors.durationDays} bad={bad}>
                <input id="durationDays" name="durationDays" type="number" min="1" step="1" required {...described("durationDays")} />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Trip details</h2>
        <div className="grid-2">
          <Field label="Departure" name="departureLocation" error={errors.departureLocation} bad={bad}>
            <input id="departureLocation" name="departureLocation" required {...described("departureLocation")} />
          </Field>
          <Field label="Destination" name="destination" error={errors.destination} bad={bad}>
            <input id="destination" name="destination" maxLength={200} {...described("destination")} />
          </Field>
          <Field label="Travelers" name="travelerCount" error={errors.travelerCount} bad={bad}>
            <input id="travelerCount" name="travelerCount" type="number" min="1" step="1" required {...described("travelerCount")} />
          </Field>
          <Field label="Budget (VND)" name="budgetAmount" error={errors.budgetAmount} bad={bad}>
            <input id="budgetAmount" name="budgetAmount" type="number" min="0" step="1" required {...described("budgetAmount")} />
          </Field>
        </div>
        <div className="field">
          <span id="budget-label">Budget applies to</span>
          <div className="pills" role="radiogroup" aria-labelledby="budget-label">
            <label className="pill">
              <input type="radio" name="budgetScope" value="group" />
              Whole group
            </label>
            <label className="pill">
              <input type="radio" name="budgetScope" value="perPerson" />
              Per person
            </label>
          </div>
          {errors.budgetScope && (
            <span className={bad.budgetScope ? "error" : undefined} id="budgetScope-error">{errors.budgetScope}</span>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Travel interests</h2>
        <div className="choices">
          {INTERESTS.map(([type, label]) => (
            <div className="choice" key={type}>
              <label>
                <input type="checkbox" name="interest" value={type} />
                <span>{label}</span>
              </label>
              <div className="priorities" role="radiogroup" aria-label={`${label} priority`}>
                {[1, 2, 3, 4].map((level) => (
                  <label className="priority" key={level}>
                    <input type="radio" name={`${type}Priority`} value={level} />
                    {level}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {errors.interests && <span className={bad.interests ? "error" : undefined}>{errors.interests}</span>}
      </section>

      <section className="card">
        <h2>Food</h2>
        <div className="grid-2">
          <Tags name="diningPreferred" label="Foods you like" placeholder="Type a dish, then press Enter. Example: seafood" />
          <Tags name="diningAvoid" label="Foods to avoid" placeholder="Example: spicy food" />
        </div>
      </section>

      <details className="card">
        <summary>Advanced options</summary>
        <div className="grid-2">
          <Field label="Group notes" name="characteristics" error={errors.characteristics} bad={bad}>
            <input id="characteristics" name="characteristics" placeholder="Example: children, older adults" />
          </Field>
          <Field label="Max distance (km)" name="maxDistanceKm" error={errors.maxDistanceKm} bad={bad}>
            <input id="maxDistanceKm" name="maxDistanceKm" type="number" min="0" step="any" {...described("maxDistanceKm")} />
          </Field>
          <Field label="Max travel time (minutes)" name="maxTravelTimeMinutes" error={errors.maxTravelTimeMinutes} bad={bad}>
            <input id="maxTravelTimeMinutes" name="maxTravelTimeMinutes" type="number" min="1" step="1" {...described("maxTravelTimeMinutes")} />
          </Field>
          <Field label="Limit applies to" name="appliesTo" error={errors.appliesTo} bad={bad}>
            <select id="appliesTo" name="appliesTo" defaultValue="" {...described("appliesTo")}>
              <option value="">No limit</option>
              <option value="fromDeparture">From departure</option>
              <option value="betweenActivities">Between stops</option>
              <option value="daily">Within one day</option>
            </select>
          </Field>
        </div>
      </details>

      <section className="card">
        <h2>Transportation</h2>
        <div className="pills">
          {TRANSPORT.map(([value, label]) => (
            <label className="pill" key={value}>
              <input type="checkbox" name="transportation" value={value} />
              {label}
            </label>
          ))}
        </div>
      </section>

      <div className="actions">
        <div className="progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>{progress}% complete</p>
        {errors.form && <p className="error">{errors.form}</p>}
        {done && <p className="success">Request received.</p>}
        <div className="action-row">
          <button className="primary" type="submit">Create itinerary</button>
          <button className="secondary" type="button" onClick={clearForm}>Clear form</button>
        </div>
      </div>
    </form>
  );
}
