import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchPlanById } from '../services/api.js'
import ItineraryTimeline from '../components/itinerary/ItineraryTimeline.jsx'
import CostSummary from '../components/itinerary/CostSummary.jsx'
import Loading from '../components/common/Loading.jsx'
import ErrorMessage from '../components/common/ErrorMessage.jsx'

export default function SelectedPlanPage() {
  const [params] = useSearchParams()
  const planId = params.get('id') || 'p1'

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chosen, setChosen] = useState(false)
  const [shouldSimulateError, setShouldSimulateError] = useState(false)

  const loadPlan = useCallback(async (opts = {}) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchPlanById(planId, {
        delay: opts.delay ?? 300,
        shouldFail: opts.shouldFail ?? shouldSimulateError,
      })
      setPlan(response.data)
    } catch (err) {
      setError(err?.message || `Failed to load itinerary details for ID "${planId}".`)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [planId, shouldSimulateError])

  useEffect(() => {
    setChosen(false)
    loadPlan()
  }, [loadPlan])

  return (
    <div className="selected-page-container">
      {/* Demo testing controls */}
      <div className="demo-controls-bar selected-demo-bar">
        <span className="demo-controls-label">Test States:</span>
        <button
          type="button"
          className="btn btn-sm btn-outline demo-btn"
          onClick={() => {
            setShouldSimulateError(false)
            loadPlan({ shouldFail: false, delay: 400 })
          }}
        >
          ↻ Reload timeline
        </button>
        <button
          type="button"
          className={`btn btn-sm demo-btn ${shouldSimulateError ? 'btn-danger-active' : 'btn-outline'}`}
          onClick={() => {
            const next = !shouldSimulateError
            setShouldSimulateError(next)
            loadPlan({ shouldFail: next, delay: 200 })
          }}
        >
          {shouldSimulateError ? '✓ Error simulated' : 'Simulate error'}
        </button>
      </div>

      {loading && (
        <Loading message="Loading daily activity timeline, attractions, and dining..." />
      )}

      {!loading && error && (
        <div className="selected-error-wrapper">
          <ErrorMessage
            title="Itinerary Not Available"
            message={error}
            actionLink="/results"
            actionText="← Back to results"
            onRetry={() => {
              setShouldSimulateError(false)
              loadPlan({ shouldFail: false, delay: 300 })
            }}
          />
        </div>
      )}

      {!loading && !error && plan && (
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
              <h4 className="reasons-title">Fit Criteria & Reasons:</h4>
              <ul className="reasons-list">
                {plan.fit?.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>

            {plan.status === 'INFEASIBLE' && (
              <div className="plan-alert-box alert-infeasible">
                <strong>Cannot be chosen:</strong> {plan.failReason}
              </div>
            )}
            {plan.status === 'UNVERIFIED' && (
              <div className="plan-alert-box alert-unverified">
                <strong>Unverified items:</strong> {plan.missing?.join(', ')} (not counted as 0)
              </div>
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

              {chosen && (
                <div className="ok chosen-notice">
                  ✓ This plan has been selected!
                </div>
              )}

              <div className="back-link-wrap">
                <Link to="/results" className="back-link">
                  ← Back to results
                </Link>
              </div>
            </div>
          </div>

          <div className="selected-right">
            <div className="schedule-header">
              <h3 className="itinerary-heading">Daily Schedule</h3>
              <span className="muted small">
                Timeline shows attractions, dining stops, time windows, and travel legs.
              </span>
            </div>

            <ItineraryTimeline days={plan.days} />
            <CostSummary plan={plan} />
          </div>

          <details className="box selected-wide">
            <summary>Request a change</summary>
            <p className="muted small">Placeholder: RevisionForm (TPVA-31).</p>
          </details>
        </section>
      )}
    </div>
  )
}
