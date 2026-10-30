import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AirplaneIllustration, BusIllustration } from '../components/common/Illustrations.jsx'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const PREFS = ['Nature', 'Food', 'Culture', 'Beach', 'City', 'Relax']

export default function HomePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    start: '',
    month: '',
    days: '',
    people: '',
    budget: '',
    prefer: '',
  })
  const [errors, setErrors] = useState({})

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value })
    if (errors[k]) {
      setErrors({ ...errors, [k]: undefined })
    }
  }

  function validate() {
    const errs = {}
    if (!form.start.trim()) errs.start = 'Start location is required'
    if (!form.month) errs.month = 'Please choose a month'
    if (!(Number(form.days) >= 1)) errs.days = 'Days must be at least 1'
    if (!(Number(form.people) >= 1)) errs.people = 'People must be at least 1'
    if (form.budget === '' || Number(form.budget) < 0) {
      errs.budget = 'Budget not valid'
    }
    return errs
  }

  function onSubmit(e) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      navigate('/results')
    }
  }

  return (
    <section className="home-hero">
      <div className="home-layout">
        <div className="hero-header">
          <h1 className="hero-title">Choose your next destination</h1>
          <p className="hero-subtitle">Few steps to choose more place</p>
        </div>

        <form className="destination-form" onSubmit={onSubmit} noValidate>
          <div className="form-columns">
            {/* Left Column: Start, Days, Budget */}
            <div className="form-col">
              <div className="form-group">
                <label htmlFor="field-start" className="form-label">Start:</label>
                <input
                  id="field-start"
                  className={`form-input ${errors.start ? 'input-error' : ''}`}
                  value={form.start}
                  onChange={set('start')}
                  placeholder="e.g. Ho Chi Minh City"
                />
                {errors.start && <span className="field-error">{errors.start}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="field-days" className="form-label">Days:</label>
                <input
                  id="field-days"
                  type="number"
                  min="1"
                  className={`form-input ${errors.days ? 'input-error' : ''}`}
                  value={form.days}
                  onChange={set('days')}
                  placeholder="e.g. 4"
                />
                {errors.days && <span className="field-error">{errors.days}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="field-budget" className="form-label">Budget:</label>
                <input
                  id="field-budget"
                  type="number"
                  min="0"
                  className={`form-input ${errors.budget ? 'input-error' : ''}`}
                  value={form.budget}
                  onChange={set('budget')}
                  placeholder="e.g. 5000000"
                />
                {errors.budget && <span className="field-error">{errors.budget}</span>}
              </div>
            </div>

            {/* Right Column: Which month, People, Prefer */}
            <div className="form-col">
              <div className="form-group">
                <label htmlFor="field-month" className="form-label">Which month:</label>
                <select
                  id="field-month"
                  className={`form-input ${errors.month ? 'input-error' : ''}`}
                  value={form.month}
                  onChange={set('month')}
                >
                  <option value="">Select month</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {errors.month && <span className="field-error">{errors.month}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="field-people" className="form-label">People:</label>
                <input
                  id="field-people"
                  type="number"
                  min="1"
                  className={`form-input ${errors.people ? 'input-error' : ''}`}
                  value={form.people}
                  onChange={set('people')}
                  placeholder="e.g. 2"
                />
                {errors.people && <span className="field-error">{errors.people}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="field-prefer" className="form-label">Prefer:</label>
                <select
                  id="field-prefer"
                  className="form-input"
                  value={form.prefer}
                  onChange={set('prefer')}
                >
                  <option value="">Any</option>
                  {PREFS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-action-row">
            <button type="submit" className="btn btn-primary btn-make-plan">
              Make plan now
            </button>
          </div>
        </form>

        <div className="home-illustration-pane">
          <AirplaneIllustration />
        </div>
      </div>

      <div className="home-bottom-bus">
        <BusIllustration />
      </div>

      <details className="box prompt-box">
        <summary>Or describe your trip in words</summary>
        <textarea
          rows="3"
          placeholder="e.g. 3 days in the mountains in December, 2 people, 5 million VND"
        />
        <p className="muted small">Placeholder: PromptInput.jsx, connected in TPVA-29.</p>
      </details>
    </section>
  )
}