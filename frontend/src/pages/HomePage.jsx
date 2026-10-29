import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const PREFS = ['Nature', 'Food', 'Culture', 'Beach', 'City', 'Relax']

export default function HomePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    start: '', month: '', days: '', people: '', budget: '', prefer: '',
  })
  const [errors, setErrors] = useState([])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Kiểm tra tạm ở client. TPVA-29 sẽ thay bằng validate của backend.
  function validate() {
    const errs = []
    if (!form.start.trim()) errs.push('Start location is required')
    if (!form.month) errs.push('Please choose a month')
    if (!(Number(form.days) >= 1)) errs.push('Days must be at least 1')
    if (!(Number(form.people) >= 1)) errs.push('People must be at least 1')
    if (form.budget === '' || Number(form.budget) < 0) errs.push('Budget not valid')
    return errs
  }

  function onSubmit(e) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (errs.length === 0) navigate('/results')
  }

  return (
    <section className="hero">
      <h1 className="hero-title">Choose your next destination</h1>
      <p className="muted">Few steps to choose more place</p>

      <form className="form-grid" onSubmit={onSubmit} noValidate>
        <label>Start
          <input value={form.start} onChange={set('start')} placeholder="e.g. Ho Chi Minh City" />
        </label>
        <label>Which month
          <select value={form.month} onChange={set('month')}>
            <option value="">Select month</option>
            {MONTHS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label>Days
          <input type="number" min="1" value={form.days} onChange={set('days')} />
        </label>
        <label>People
          <input type="number" min="1" value={form.people} onChange={set('people')} />
        </label>
        <label>Budget (VND)
          <input type="number" min="0" value={form.budget} onChange={set('budget')} />
        </label>
        <label>Prefer
          <select value={form.prefer} onChange={set('prefer')}>
            <option value="">Any</option>
            {PREFS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>

        <div className="form-footer">
          {errors.map((m) => <div key={m} className="field-error">{m}</div>)}
          <button type="submit" className="btn btn-primary">Make plan now</button>
        </div>
      </form>

      <details className="box">
        <summary>Or describe your trip in words</summary>
        <textarea rows="3" placeholder="3 days in the mountains in December, 2 people, 5 million VND" />
        <p className="muted small">Placeholder: PromptInput.jsx, connected in TPVA-29.</p>
      </details>
    </section>
  )
}