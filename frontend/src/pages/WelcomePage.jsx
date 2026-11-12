import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/common/Icon.jsx'
import {
  INTRO_AIRPLANE,
  INTRO_CLOUD,
  INTRO_STORAGE_KEY,
} from '../components/intro/introAssets.js'
import { getDestinationImage } from '../services/destinationImages.js'

const previewImage = getDestinationImage('H')

export default function WelcomePage() {
  useEffect(() => {
    try {
      localStorage.setItem('tpva-welcome-seen', '1')
    } catch {}
  }, [])

  useEffect(() => {
    ;[INTRO_AIRPLANE, INTRO_CLOUD].forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  const handleStartPlanning = () => {
    try {
      sessionStorage.setItem(INTRO_STORAGE_KEY, '1')
    } catch {}
  }

  return (
    <div className="welcome-page">
      <section className="welcome-hero" data-enter>
        <div className="welcome-copy">
          <p className="welcome-eyebrow">
            <span className="welcome-eyebrow-dot" aria-hidden="true" />
            Travel planning assistant
          </p>
          <h1 className="welcome-title">
            A trip that fits your{' '}
            <span className="welcome-highlight">dates, budget, and pace.</span>
          </h1>
          <p className="welcome-lead">
            Tell us the rough shape of your trip. We turn it into a day-by-day plan with known
            costs, travel times, and the trade-offs written down — so you can compare and keep the
            one that works.
          </p>
          <div className="welcome-actions">
            <Link to="/" className="btn btn-primary" onClick={handleStartPlanning}>
              Start planning
              <Icon name="arrowRight" size={17} />
            </Link>
            <Link to="/results" className="welcome-link">
              View your results
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          <ul className="welcome-facts">
            <li>
              <Icon name="check" size={14} />
              No account needed
            </li>
            <li>
              <Icon name="check" size={14} />
              Saved in this browser
            </li>
            <li>
              <Icon name="check" size={14} />
              Missing costs flagged
            </li>
          </ul>
          <div className="welcome-steps">
            <p className="welcome-steps-label">How it works</p>
            <ol className="welcome-flow" aria-label="How it works">
              <li>
                <span className="welcome-flow-index">01</span>
                <strong>Tell us the trip</strong>
                <small>Dates, budget, pace</small>
              </li>
              <li>
                <span className="welcome-flow-index">02</span>
                <strong>Compare plans</strong>
                <small>Costs and trade-offs</small>
              </li>
              <li>
                <span className="welcome-flow-index">03</span>
                <strong>Keep your trip</strong>
                <small>Revise, print, or copy</small>
              </li>
            </ol>
          </div>
        </div>

        <div className="welcome-stage">
          <Link to="/" className="welcome-plan-card" onClick={handleStartPlanning}>
            <div className="welcome-plan-media">
              <img src={previewImage} alt="Huế landscape" />
              <span className="welcome-plan-badge">
                <Icon name="check" size={13} />
                Backend checked
              </span>
              <span className="welcome-plan-location">
                <span>Example destination</span>
                <strong>Huế</strong>
              </span>
            </div>
            <div className="welcome-plan-body">
              <div className="welcome-plan-head">
                <p className="welcome-plan-kicker">Day-by-day itinerary</p>
                <h2>Built from your real trip details</h2>
              </div>
              <dl className="welcome-plan-stats">
                <div>
                  <dt>Known cost</dt>
                  <dd>Verified places</dd>
                </div>
                <div>
                  <dt>Days</dt>
                  <dd>Your dates</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd className="is-good">Checked</dd>
                </div>
              </dl>
              <ol className="welcome-plan-days">
                <li>
                  <span className="welcome-plan-day">Day 1</span>
                  <span className="welcome-plan-activity">Arrival and neighbourhood walk</span>
                  <span className="welcome-plan-time">Your pace</span>
                </li>
                <li>
                  <span className="welcome-plan-day">Day 2</span>
                  <span className="welcome-plan-activity">Sights, food, and local transport</span>
                  <span className="welcome-plan-time">Your budget</span>
                </li>
              </ol>
              <p className="welcome-plan-more">The final route is generated from your request.</p>
              <span className="welcome-plan-link">
                Start planning
                <Icon name="arrowRight" size={15} />
              </span>
            </div>
          </Link>

          <div className="welcome-note">
            <span className="welcome-note-icon">
              <Icon name="sparkle" size={14} />
            </span>
            <p>
              <strong>Plans stay editable.</strong> Change the dates or budget and the itinerary
              updates with you.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
