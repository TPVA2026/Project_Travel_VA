import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MOCK_PLANS } from '../services/mockData.js'
import ItineraryTimeline from '../components/itinerary/ItineraryTimeline.jsx'
import CostSummary from '../components/itinerary/CostSummary.jsx'

export default function SelectedPlanPage() {
  const [params] = useSearchParams()
  const [chosen, setChosen] = useState(false)
  const plan = MOCK_PLANS.find((p) => p.id === params.get('id')) ?? MOCK_PLANS[0]

  return (
    <section className="selected">
      <div className="selected-left">
        <div className="img-wrap selected-img-wrap">
          <img
            src={plan.image}
            alt={plan.destination}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <h1 className="selected-title">{plan.destination}</h1>
        <div className={`badge badge-${plan.status}`}>{plan.status}</div>

        <div className="reasons-block">
          <h4 className="reasons-title">Reasons:</h4>
          <ul className="reasons-list">
            {plan.fit.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        {plan.status === 'INFEASIBLE' && (
          <p className="field-error">Cannot be chosen: {plan.failReason}</p>
        )}
        {plan.status === 'UNVERIFIED' && (
          <p className="unverified">Unverified items: {plan.missing.join(', ')}</p>
        )}

        <div className="actions-block">
          <button
            type="button"
            className="btn btn-primary btn-choose"
            disabled={plan.status === 'INFEASIBLE'}
            onClick={() => setChosen(true)}
          >
            Choose this plan
          </button>

          {chosen && <div className="ok chosen-notice">✓ This plan has been selected!</div>}

          <div className="back-link-wrap">
            <Link to="/results" className="back-link">
              ← Back to results
            </Link>
          </div>
        </div>
      </div>

      <div className="selected-right">
        <h3 className="itinerary-heading">Daily Schedule</h3>
        <ItineraryTimeline days={plan.days} />
        <CostSummary plan={plan} />
      </div>

      <details className="box selected-wide">
        <summary>Request a change</summary>
        <p className="muted small">Placeholder: RevisionForm (TPVA-31).</p>
      </details>
    </section>
  )
}