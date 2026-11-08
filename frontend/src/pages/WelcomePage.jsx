import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/common/Icon.jsx'
import { MOCK_PLANS, fmtMoney, knownTotal } from '../services/mockData.js'

const sample = MOCK_PLANS[0]
const sampleCost = knownTotal(sample).total
const sampleStatus = sample.status === 'FEASIBLE' ? 'Feasible' : 'Review needed'

export default function WelcomePage() {
  useEffect(() => {
    try {
      localStorage.setItem('tpva-welcome-seen', '1')
    } catch {}
  }, [])

  return (
    <div className="welcome-page">
      <section className="welcome-hero" data-enter>
        <div className="welcome-copy">
          <p className="page-eyebrow">Travel planning assistant</p>
          <h1 className="welcome-title">Plan a trip that fits your dates and budget.</h1>
          <p className="welcome-lead">
            Share your dates, budget, and travel style. We build verified itineraries you can
            compare, then keep the one that works for you.
          </p>
          <div className="welcome-actions">
            <Link to="/" className="btn btn-primary">
              Start planning
              <Icon name="arrowRight" size={17} />
            </Link>
            <Link to={`/selected?id=${sample.id}`} className="btn btn-outline">
              See how a plan looks
            </Link>
          </div>
          <ul className="welcome-facts">
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
          <ol className="welcome-flow" aria-label="How it works">
            <li>
              <span>01</span>
              <strong>Tell us the trip</strong>
            </li>
            <li>
              <span>02</span>
              <strong>Compare plans</strong>
            </li>
            <li>
              <span>03</span>
              <strong>Keep your trip</strong>
            </li>
          </ol>
        </div>

        <div className="welcome-preview">
          <Link
            to={`/selected?id=${sample.id}`}
            className="preview-card preview-card-lg is-link"
          >
            <div className="preview-media">
              <img src={sample.image} alt={`${sample.destination} landscape`} />
              <span className="preview-fit">
                <Icon name="check" size={13} />
                Fits your trip
              </span>
            </div>
            <div className="preview-body">
              <p className="preview-kicker">Plan preview</p>
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
                <div>
                  <dt>Status</dt>
                  <dd>{sampleStatus}</dd>
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
                Open this plan
                <Icon name="arrowRight" size={15} />
              </span>
            </div>
          </Link>
        </div>
      </section>
    </div>
  )
}
