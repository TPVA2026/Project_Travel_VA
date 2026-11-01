import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchPlanById,
  getSelectedPlanId,
  selectPlan,
  clearSelectedPlan,
  knownTotal,
  fmtMoney,
} from '../services/api.js'
import ItineraryTimeline from '../components/itinerary/ItineraryTimeline.jsx'
import CostSummary from '../components/itinerary/CostSummary.jsx'
import RevisionForm from '../components/revision/RevisionForm.jsx'
import Loading from '../components/common/Loading.jsx'
import ErrorMessage from '../components/common/ErrorMessage.jsx'

export default function SelectedPlanPage() {
  const [params] = useSearchParams()
  const queryId = params.get('id')
  const storedId = getSelectedPlanId()

  // Use URL query id, or fallback to stored selected plan
  const activePlanId = queryId || storedId

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(Boolean(activePlanId))
  const [error, setError] = useState(null)
  const [isChosen, setIsChosen] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [shouldSimulateError, setShouldSimulateError] = useState(false)

  const loadPlan = useCallback(async (opts = {}) => {
    if (!activePlanId) {
      setLoading(false)
      setPlan(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetchPlanById(activePlanId, {
        delay: opts.delay ?? 300,
        shouldFail: opts.shouldFail ?? shouldSimulateError,
      })
      setPlan(response.data)
      // Check if this plan is the user's chosen plan
      const currentSelected = getSelectedPlanId()
      setIsChosen(currentSelected === response.data.id || currentSelected === response.data.planId)
    } catch (err) {
      setError(err?.message || `Failed to load itinerary details for ID "${activePlanId}".`)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [activePlanId, shouldSimulateError])

  useEffect(() => {
    loadPlan()
  }, [loadPlan])

  // Handle plan selection toggle
  const handleToggleChoose = async () => {
    if (!plan) return

    if (isChosen) {
      clearSelectedPlan()
      setIsChosen(false)
    } else {
      await selectPlan(plan)
      setIsChosen(true)
    }
  }

  // Handle itinerary summary copy
  const handleCopySummary = async () => {
    if (!plan) return
    const { total } = knownTotal(plan)
    const summaryText = [
      `Travel Plan: ${plan.destination} (${plan.title})`,
      `Status: ${plan.status}`,
      `Duration: ${plan.days?.length || 0} days`,
      `Estimated Known Cost: ${fmtMoney(total)}`,
      `Key Highlights: ${plan.fit?.join('; ') || 'N/A'}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(summaryText)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2500)
    } catch {
      // Fallback
    }
  }

  // When a revision is applied from RevisionForm
  const handlePlanRevised = (revisedPlan) => {
    setPlan(revisedPlan)
    // If this revised plan was chosen, update the stored data as well
    if (isChosen) {
      selectPlan(revisedPlan)
    }
  }

  // View when no plan has been selected and no ?id was provided in URL
  if (!activePlanId && !loading) {
    return (
      <div className="empty-chosen-view box">
        <div className="empty-chosen-icon">🗺️</div>
        <h2>No travel plan selected yet</h2>
        <p className="muted">
          Browse through our personalized destination recommendations based on your travel request, compare itineraries, and choose your favorite plan to review and customize.
        </p>
        <div className="empty-actions">
          <Link to="/results" className="btn btn-primary">
            Browse Recommended Plans →
          </Link>
          <Link to="/selected?id=p1" className="btn btn-outline">
            Preview Sample Plan (Ha Giang)
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="selected-page-container">
      {/* Reviewer / Test controls bar */}
      <div className="demo-controls-bar selected-demo-bar no-print">
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
        <>
          {/* Chosen Plan Banner View */}
          {isChosen && (
            <div className="chosen-header-banner" role="status">
              <div className="chosen-header-content">
                <span className="chosen-badge-icon">⭐</span>
                <div>
                  <h2 className="chosen-header-title">Your Chosen Trip Plan</h2>
                  <p className="chosen-header-sub muted small">
                    This itinerary is currently selected for your journey. You can request revisions below, print/save the schedule, or switch destinations.
                  </p>
                </div>
              </div>

              <div className="chosen-header-tools no-print">
                <button
                  type="button"
                  className="btn btn-sm btn-outline tool-btn"
                  onClick={() => window.print()}
                  title="Print or save as PDF"
                >
                  🖨️ Print / Save PDF
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline tool-btn"
                  onClick={handleCopySummary}
                  title="Copy text summary to clipboard"
                >
                  {copyFeedback ? '✓ Copied!' : '📋 Copy Summary'}
                </button>
                <Link to="/results" className="btn btn-sm btn-outline tool-btn">
                  🔄 Switch Plan
                </Link>
              </div>
            </div>
          )}

          <section className="selected">
            {/* Left Column: Overview, Fit Criteria, Selection Actions */}
            <div className="selected-left">
              <div className="img-wrap selected-img-wrap">
                <img
                  src={plan.image}
                  alt={plan.destination}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                {isChosen && (
                  <div className="card-selected-ribbon">
                    ✓ Selected Plan
                  </div>
                )}
              </div>

              <h1 className="selected-title">{plan.destination}</h1>
              <p className="selected-plan-subtitle muted">{plan.title}</p>
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
                  <div className="small-tip">
                    Tip: Use the revision form below to adjust your budget or constraints to make this plan feasible.
                  </div>
                </div>
              )}

              {plan.status === 'UNVERIFIED' && (
                <div className="plan-alert-box alert-unverified">
                  <strong>Unverified items:</strong> {plan.missing?.join(', ')} (not counted as 0)
                </div>
              )}

              {/* Primary Selection Actions Block */}
              <div className="actions-block no-print">
                <button
                  type="button"
                  className={`btn btn-choose ${
                    isChosen
                      ? 'btn-selected-active'
                      : plan.status === 'INFEASIBLE'
                      ? 'btn-disabled'
                      : 'btn-primary'
                  }`}
                  disabled={plan.status === 'INFEASIBLE'}
                  onClick={handleToggleChoose}
                >
                  {isChosen ? '✓ Selected as your plan (Click to unselect)' : 'Choose this plan'}
                </button>

                {isChosen && (
                  <div className="ok chosen-notice">
                    ✓ This plan is currently selected for your trip!
                  </div>
                )}

                <div className="back-link-wrap">
                  <Link to="/results" className="back-link">
                    ← Back to results
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Column: Timeline Schedule & Cost Breakdown */}
            <div className="selected-right">
              <div className="schedule-header">
                <div>
                  <h3 className="itinerary-heading">Daily Schedule</h3>
                  <span className="muted small">
                    Timeline shows attractions, dining stops, time windows, and travel legs.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline no-print print-schedule-btn"
                  onClick={() => window.print()}
                >
                  🖨️ Print schedule
                </button>
              </div>

              <ItineraryTimeline days={plan.days} />
              <CostSummary plan={plan} />
            </div>

            {/* Revision Section (TPVA-31) */}
            <details className="box selected-wide revision-accordion no-print" open>
              <summary className="revision-summary-header">
                <span className="summary-title">✏️ Request a change or revise this plan</span>
                <span className="muted small">(Adjust budget, duration, dates, travelers, preferences)</span>
              </summary>
              <div className="revision-panel-body">
                <RevisionForm
                  plan={plan}
                  onPlanRevised={handlePlanRevised}
                />
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  )
}
