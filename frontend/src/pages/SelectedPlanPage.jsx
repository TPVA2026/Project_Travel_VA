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
import Icon from '../components/common/Icon.jsx'

const STATUS_LABEL = {
  FEASIBLE: 'Fits your trip',
  INFEASIBLE: 'Not feasible',
  UNVERIFIED: 'Needs checking',
}

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
      <div className="empty-chosen-view">
        <span className="empty-chosen-icon" aria-hidden="true">
          <Icon name="compass" size={34} />
        </span>
        <p className="page-eyebrow">Step 3 of 3 · Review</p>
        <h1>Your next trip starts here</h1>
        <p className="muted">
          Choose an itinerary to see its day-by-day schedule, review the estimated costs, and make it your own.
        </p>
        <div className="empty-actions">
          <Link to="/results" className="btn btn-primary">
            Explore recommended plans
            <Icon name="arrowRight" size={16} />
          </Link>
          <Link to="/selected?id=p1" className="btn btn-outline">
            Preview a sample itinerary
          </Link>
        </div>
      </div>
    )
  }

  const statusLabel = plan ? STATUS_LABEL[plan.status] || plan.status : null
  const dayCount = plan?.days?.length || 0
  const activityCount =
    plan?.days?.reduce((count, day) => count + (day.activities?.length || 0), 0) || 0
  const totalCost = plan ? knownTotal(plan).total : 0

  return (
    <div className="selected-page-container">
      <nav className="page-back no-print" aria-label="Breadcrumb">
        <Link to="/results" className="back-link">
          <Icon name="arrowLeft" size={16} />
          All plans
        </Link>
      </nav>

      <header className="selected-page-intro">
        <div className="results-intro-copy">
          <p className="page-eyebrow">Step 3 of 3 · Review</p>
          <h1>{plan?.destination || 'Review your itinerary'}</h1>
          <p className="selected-lead muted">
            {plan?.title || 'Loading your itinerary details…'}
          </p>
          {plan && (
            <div className="intro-badges">
              <span className={`badge badge-${plan.status}`}>{statusLabel}</span>
              <span className="muted small">
                <Icon name="calendar" size={15} />
                {dayCount} days
              </span>
              <span className="muted small">
                <Icon name="landmark" size={15} />
                {activityCount} activities
              </span>
            </div>
          )}
        </div>

        {plan && (
          <div className="intro-actions no-print">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => window.print()}
              title="Print or save as PDF"
            >
              <Icon name="printer" size={16} />
              Print
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleCopySummary}
              title="Copy a text summary to your clipboard"
            >
              <Icon name={copyFeedback ? 'check' : 'copy'} size={16} />
              {copyFeedback ? 'Copied' : 'Copy summary'}
            </button>
          </div>
        )}
      </header>

      {/* Demo / reviewer controls, kept out of the main reading flow */}
      <details className="dev-panel selected-dev-panel no-print">
        <summary>
          <Icon name="refresh" size={15} />
          Demo controls
        </summary>
        <div className="dev-panel-body">
          <span className="demo-controls-label">Test states</span>
          <button
            type="button"
            className="btn btn-sm btn-outline demo-btn"
            onClick={() => {
              setShouldSimulateError(false)
              loadPlan({ shouldFail: false, delay: 400 })
            }}
          >
            Reload timeline
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
            {shouldSimulateError ? 'Error simulated' : 'Simulate error'}
          </button>
        </div>
      </details>

      {loading && (
        <Loading message="Loading daily activity timeline, attractions, and dining..." />
      )}

      {!loading && error && (
        <div className="selected-error-wrapper">
          <ErrorMessage
            title="Itinerary not available"
            message={error}
            actionLink="/results"
            actionText="Back to results"
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
                <span className="chosen-badge-icon" aria-hidden="true">
                  <Icon name="star" size={22} />
                </span>
                <div>
                  <strong className="chosen-header-title">This is your chosen trip</strong>
                  <p className="chosen-header-sub">
                    It is saved for your journey. You can revise it below, print the schedule, or switch plans.
                  </p>
                </div>
              </div>

              <div className="chosen-header-tools no-print">
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => window.print()}
                  title="Print or save as PDF"
                >
                  <Icon name="printer" size={15} />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  className="tool-btn"
                  onClick={handleCopySummary}
                  title="Copy text summary to clipboard"
                >
                  <Icon name={copyFeedback ? 'check' : 'copy'} size={15} />
                  {copyFeedback ? 'Copied' : 'Copy summary'}
                </button>
                <Link to="/results" className="tool-btn">
                  <Icon name="swap" size={15} />
                  Switch plan
                </Link>
              </div>
            </div>
          )}

          <div className="selected">
            {/* Left Column: Overview, Fit Criteria, Selection Actions */}
            <aside className="selected-left" aria-label="Trip overview">
              <div className="img-wrap selected-img-wrap">
                <img
                  src={plan.image}
                  alt={`${plan.destination} landscape`}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                {isChosen && (
                  <div className="card-selected-ribbon">
                    <Icon name="check" size={14} />
                    Chosen
                  </div>
                )}
              </div>

              <div className="selected-summary-body">
                <div className="selected-summary-head">
                  <span className={`badge badge-${plan.status}`}>{statusLabel}</span>
                  <h2 className="selected-title">{plan.title}</h2>
                </div>

                <div className="selected-quick-facts" aria-label="Trip overview">
                  <div>
                    <Icon name="calendar" size={16} />
                    <span>Duration</span>
                    <strong>{dayCount} days</strong>
                  </div>
                  <div>
                    <Icon name="landmark" size={16} />
                    <span>Activities</span>
                    <strong>{activityCount}</strong>
                  </div>
                  <div>
                    <Icon name="wallet" size={16} />
                    <span>Estimated</span>
                    <strong>{fmtMoney(totalCost)}</strong>
                  </div>
                </div>

                <div className="reasons-block">
                  <h3 className="reasons-title">
                    <Icon name="sparkle" size={16} />
                    Why this plan fits
                  </h3>
                  <ul className="reasons-list">
                    {plan.fit?.map((r) => (
                      <li key={r}>
                        <Icon name="check" size={15} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.status === 'INFEASIBLE' && (
                  <div className="plan-alert-box alert-infeasible">
                    <Icon name="alert" size={16} />
                    <span>
                      <strong>Cannot be chosen:</strong> {plan.failReason}
                      <span className="small-tip">
                        Use the revision form below to adjust your budget or constraints.
                      </span>
                    </span>
                  </div>
                )}

                {plan.status === 'UNVERIFIED' && (
                  <div className="plan-alert-box alert-unverified">
                    <Icon name="info" size={16} />
                    <span>
                      <strong>Unverified items:</strong> {plan.missing?.join(', ')} (not counted as 0)
                    </span>
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
                    {isChosen ? (
                      <>
                        <Icon name="check" size={18} />
                        Selected — click to remove
                      </>
                    ) : (
                      'Choose this plan'
                    )}
                  </button>

                  {isChosen && (
                    <p className="chosen-notice">
                      <Icon name="check" size={15} />
                      Saved as your trip. Find it again under Selected.
                    </p>
                  )}

                  <Link to="/results" className="back-link">
                    <Icon name="arrowLeft" size={15} />
                    Back to all plans
                  </Link>
                </div>
              </div>
            </aside>

            {/* Right Column: Timeline Schedule & Cost Breakdown */}
            <div className="selected-right">
              <div className="schedule-header">
                <div>
                  <h2 className="itinerary-heading">Daily schedule</h2>
                  <p className="muted small">
                    Attractions, dining stops, time windows, and travel legs.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline no-print print-schedule-btn"
                  onClick={() => window.print()}
                >
                  <Icon name="printer" size={15} />
                  Print schedule
                </button>
              </div>

              <ItineraryTimeline days={plan.days} />
              <CostSummary plan={plan} />
            </div>
          </div>

          {/* Revision Section (TPVA-31) */}
          <details className="revision-accordion selected-wide no-print">
            <summary className="revision-summary-header">
              <span className="revision-summary-icon" aria-hidden="true">
                <Icon name="edit" size={18} />
              </span>
              <span className="revision-summary-copy">
                <strong className="summary-title">Request a change</strong>
                <span className="muted small">
                  Adjust budget, duration, dates, travelers, or preferences
                </span>
              </span>
              <Icon name="chevronDown" size={18} className="summary-chevron" />
            </summary>
            <div className="revision-panel-body">
              <RevisionForm plan={plan} onPlanRevised={handlePlanRevised} />
            </div>
          </details>
        </>
      )}
    </div>
  )
}
