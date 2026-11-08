import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/common/Icon.jsx'
import DescribeChat from '../components/input/DescribeChat.jsx'
import TravelForm from '../components/input/TravelForm.jsx'
import { MOCK_PLANS, fmtMoney, knownTotal } from '../services/mockData.js'

const sample = MOCK_PLANS[0]
const sampleCost = knownTotal(sample).total

function SwitchMode({ label, onClick }) {
  return (
    <div className="mode-switch">
      <p>Change your mind?</p>
      <button type="button" onClick={onClick}>{label}</button>
    </div>
  )
}

export default function HomePage() {
  const [mode, setMode] = useState('choose')
  const formPanelRef = useRef(null)
  const describePanelRef = useRef(null)

  useEffect(() => {
    const panel = mode === 'form' ? formPanelRef.current : mode === 'describe' ? describePanelRef.current : null
    if (!panel) return
    const first = panel.querySelector('input:not([type="hidden"]), select, textarea, button')
    first?.focus({ preventScroll: true })
  }, [mode])

  return (
    <div className="plan-page">
      <header className="plan-intro">
        <p className="page-eyebrow">Step 1 of 3 · Plan</p>
        <h1 className="plan-title">Tell us the trip. We’ll build the plan.</h1>
        <p className="plan-lead">
          Share your dates, budget, and travel style. Compare verified itineraries, then keep
          the one that fits.
        </p>
        <ul className="plan-facts">
          <li>
            <Icon name="check" size={15} />
            No account needed
          </li>
          <li>
            <Icon name="check" size={15} />
            Saved in this browser
          </li>
          <li>
            <Icon name="check" size={15} />
            Unverified costs excluded
          </li>
        </ul>
      </header>

      <div className="plan-layout">
        <div className="plan-workspace">
          <div className="entry-choice" hidden={mode !== 'choose'}>
            <div className="entry-choice-head">
              <h2>How would you like to start?</h2>
              <p>Use the form for exact details, or describe the trip in your own words.</p>
            </div>
            <div className="entry-choice-actions">
              <button type="button" className="entry-choice-card" onClick={() => setMode('form')}>
                <span className="entry-choice-icon">
                  <Icon name="edit" size={20} />
                </span>
                <strong>Fill in the form</strong>
                <span>Set departure, dates, travelers, and budget.</span>
                <span className="entry-choice-meta">
                  Best for exact dates and costs
                  <Icon name="arrowRight" size={15} />
                </span>
              </button>
              <button type="button" className="entry-choice-card" onClick={() => setMode('describe')}>
                <span className="entry-choice-icon">
                  <Icon name="sparkle" size={20} />
                </span>
                <strong>Describe the trip</strong>
                <span>Answer four short questions in your own words.</span>
                <span className="entry-choice-meta">
                  Best when you are still deciding
                  <Icon name="arrowRight" size={15} />
                </span>
              </button>
            </div>
          </div>

          <div id="trip-form-panel" className="input-panel plan-panel" hidden={mode !== 'form'} ref={formPanelRef}>
            <TravelForm />
            <SwitchMode label="Switch to describing" onClick={() => setMode('describe')} />
          </div>
          <div id="trip-describe-panel" className="input-panel plan-panel" hidden={mode !== 'describe'} ref={describePanelRef}>
            <DescribeChat />
            <SwitchMode label="Switch to the form" onClick={() => setMode('form')} />
          </div>
        </div>

        <aside className="plan-aside" aria-label="What you get">
          <Link
            to={`/selected?id=${sample.id}`}
            className="preview-card preview-card-sm is-link"
          >
            <div className="preview-media">
              <img src={sample.image} alt={`${sample.destination} landscape`} />
              <span className="preview-fit">
                <Icon name="check" size={13} />
                Fits your trip
              </span>
            </div>
            <div className="preview-body">
              <p className="preview-kicker">Sample itinerary</p>
              <h2>{sample.title}</h2>
              <dl className="preview-stats">
                <div>
                  <dt>Known cost</dt>
                  <dd>{fmtMoney(sampleCost)}</dd>
                </div>
                <div>
                  <dt>Days</dt>
                  <dd>{sample.days.length}</dd>
                </div>
              </dl>
              <ul className="preview-days">
                {sample.days.slice(0, 2).map((day) => (
                  <li key={day.dayNumber}>
                    <span>Day {day.dayNumber}</span>
                    <strong>{day.activities?.[0]?.name ?? 'Open day'}</strong>
                  </li>
                ))}
              </ul>
              <span className="preview-link">
                Preview this sample
                <Icon name="arrowRight" size={15} />
              </span>
            </div>
          </Link>

          <section className="plan-outcomes">
            <h2>What you get</h2>
            <ul>
              <li>
                <Icon name="calendar" size={17} />
                <span><strong>Day-by-day schedule</strong> with travel times between stops.</span>
              </li>
              <li>
                <Icon name="wallet" size={17} />
                <span><strong>Known costs</strong>, with missing prices flagged, not counted as zero.</span>
              </li>
              <li>
                <Icon name="route" size={17} />
                <span><strong>A plan you can revise</strong>, print, or copy.</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
