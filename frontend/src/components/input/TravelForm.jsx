import { useState } from "react";
import { validateTravelRequest } from "../../services/api";
import { INTERESTS, buildPayload, clientErrors, mapServerErrors, valueErrors } from "./travelRequest";

const TRANSPORT = [
  ["taxi", "Taxi"],
  ["walking", "Đi bộ"],
  ["motorbike", "Xe máy"],
  ["car", "Ô tô"],
  ["publicTransport", "Phương tiện công cộng"],
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
            <button type="button" aria-label={`Xóa ${tag}`} onClick={() => setTags(tags.filter((item) => item !== tag))}>×</button>
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
        ? mapServerErrors(error.body?.errors)
        : { form: "Không gửi được yêu cầu." };
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
        <h2><CalendarIcon /> Thời gian chuyến đi</h2>
        <div className="grid-2">
          <Field label="Danh mục chuyến đi" name="periodMode" error={errors.periodMode} bad={bad}>
            <select id="periodMode" name="periodMode" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="dates">Theo ngày</option>
              <option value="month">Theo tháng</option>
            </select>
          </Field>
          {mode === "dates" ? (
            <>
              <Field label="Ngày đi" name="startDate" error={errors.startDate} bad={bad}>
                <input id="startDate" name="startDate" type="date" required {...described("startDate")} />
              </Field>
              <Field label="Ngày về" name="endDate" error={errors.endDate} bad={bad}>
                <input id="endDate" name="endDate" type="date" required {...described("endDate")} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Tháng" name="month" error={errors.month} bad={bad}>
                <input id="month" name="month" type="month" required {...described("month")} />
              </Field>
              <Field label="Số ngày" name="durationDays" error={errors.durationDays} bad={bad}>
                <input id="durationDays" name="durationDays" type="number" min="1" step="1" required {...described("durationDays")} />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Thông tin chuyến đi</h2>
        <div className="grid-2">
          <Field label="Điểm đi" name="departureLocation" error={errors.departureLocation} bad={bad}>
            <input id="departureLocation" name="departureLocation" required {...described("departureLocation")} />
          </Field>
          <Field label="Điểm đến" name="destination" error={errors.destination} bad={bad}>
            <input id="destination" name="destination" maxLength={200} {...described("destination")} />
          </Field>
          <Field label="Số người" name="travelerCount" error={errors.travelerCount} bad={bad}>
            <input id="travelerCount" name="travelerCount" type="number" min="1" step="1" required {...described("travelerCount")} />
          </Field>
          <Field label="Ngân sách (VND)" name="budgetAmount" error={errors.budgetAmount} bad={bad}>
            <input id="budgetAmount" name="budgetAmount" type="number" min="0" step="1" required {...described("budgetAmount")} />
          </Field>
        </div>
        <div className="field">
          <span id="budget-label">Kiểu ngân sách</span>
          <div className="pills" role="radiogroup" aria-labelledby="budget-label">
            <label className="pill">
              <input type="radio" name="budgetScope" value="group" />
              Cả nhóm
            </label>
            <label className="pill">
              <input type="radio" name="budgetScope" value="perPerson" />
              Mỗi người
            </label>
          </div>
          {errors.budgetScope && (
            <span className={bad.budgetScope ? "error" : undefined} id="budgetScope-error">{errors.budgetScope}</span>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Sở thích du lịch</h2>
        <div className="choices">
          {INTERESTS.map(([type, label]) => (
            <div className="choice" key={type}>
              <label>
                <input type="checkbox" name="interest" value={type} />
                <span>{label}</span>
              </label>
              <div className="priorities" role="radiogroup" aria-label={`Mức ưu tiên ${label}`}>
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
        <h2>Ẩm thực</h2>
        <div className="grid-2">
          <Tags name="diningPreferred" label="Món ăn yêu thích" placeholder="Nhập món, nhấn Enter. Ví dụ: hải sản" />
          <Tags name="diningAvoid" label="Món ăn muốn tránh" placeholder="Ví dụ: món cay" />
        </div>
      </section>

      <details className="card">
        <summary>Tùy chọn nâng cao</summary>
        <div className="grid-2">
          <Field label="Đặc điểm nhóm" name="characteristics" error={errors.characteristics} bad={bad}>
            <input id="characteristics" name="characteristics" placeholder="Ví dụ: trẻ em, người lớn tuổi" />
          </Field>
          <Field label="Khoảng cách tối đa (km)" name="maxDistanceKm" error={errors.maxDistanceKm} bad={bad}>
            <input id="maxDistanceKm" name="maxDistanceKm" type="number" min="0" step="any" {...described("maxDistanceKm")} />
          </Field>
          <Field label="Thời gian di chuyển tối đa (phút)" name="maxTravelTimeMinutes" error={errors.maxTravelTimeMinutes} bad={bad}>
            <input id="maxTravelTimeMinutes" name="maxTravelTimeMinutes" type="number" min="1" step="1" {...described("maxTravelTimeMinutes")} />
          </Field>
          <Field label="Giới hạn áp dụng cho" name="appliesTo" error={errors.appliesTo} bad={bad}>
            <select id="appliesTo" name="appliesTo" defaultValue="" {...described("appliesTo")}>
              <option value="">Không đặt giới hạn</option>
              <option value="fromDeparture">Từ điểm xuất phát</option>
              <option value="betweenActivities">Giữa các điểm</option>
              <option value="daily">Trong một ngày</option>
            </select>
          </Field>
        </div>
      </details>

      <section className="card">
        <h2>Phương tiện di chuyển</h2>
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
        <p>{progress}% hoàn thành</p>
        {errors.form && <p className="error">{errors.form}</p>}
        {done && <p className="success">Đã nhận yêu cầu.</p>}
        <div className="action-row">
          <button className="primary" type="submit">Tạo lịch trình</button>
          <button className="secondary" type="button" onClick={clearForm}>Xóa biểu mẫu</button>
        </div>
      </div>
    </form>
  );
}
