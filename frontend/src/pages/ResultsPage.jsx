import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchDestinationRecommendations,
  generateItinerary,
  getSelectedPlanId,
  selectPlan,
  clearSelectedPlan,
} from '../services/api.js'
import { getTopFeasiblePlans } from '../services/recommendations.js'
import PlanComparison from '../components/comparison/PlanComparison.jsx'
import Loading from '../components/common/Loading.jsx'
import ErrorMessage from '../components/common/ErrorMessage.jsx'
import Icon from '../components/common/Icon.jsx'

const REQUEST_KEY = 'tpva-travel-request'
const PLAN_KEY = 'tpva-ai-plan'

function readPendingRequest() {
  try {
    const raw = sessionStorage.getItem(REQUEST_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function money(value) {
  if (value == null) return 'Unverified'
  return `${Number(value).toLocaleString('en-US')} VND`
}

function periodLabel(period) {
  if (!period) return null
  if (period.month) return period.month
  if (period.startDate && period.endDate) return `${period.startDate} → ${period.endDate}`
  return period.startDate || null
}

function RequestSummary({ request }) {
  if (!request) return null

  if (Array.isArray(request.notes)) {
    return (
      <div className="trip-chips" aria-label="Your trip brief">
        <span className="trip-chip">
          <Icon name="sparkle" size={16} />
          Described in your own words
        </span>
        <span className="trip-chip trip-chip--muted">
          {request.notes.length} {request.notes.length === 1 ? 'answer' : 'answers'} received
        </span>
      </div>
    )
  }

  const chips = []
  if (request.departureLocation) {
    chips.push({ icon: 'mapPin', label: `From ${request.departureLocation}` })
  }
  const period = periodLabel(request.travelPeriod)
  if (period) chips.push({ icon: 'calendar', label: period })
  if (request.durationDays) {
    chips.push({ icon: 'clock', label: `${request.durationDays} days` })
  }
  if (request.travelers?.count) {
    chips.push({
      icon: 'users',
      label: `${request.travelers.count} ${request.travelers.count === 1 ? 'traveler' : 'travelers'}`,
    })
  }
  if (request.budget?.amount != null) {
    const scope = request.budget.scope === 'perPerson' ? 'per person' : 'whole group'
    chips.push({ icon: 'wallet', label: `${money(request.budget.amount)} · ${scope}` })
  }

  if (chips.length === 0) return null

  return (
    <div className="trip-chips" aria-label="Your trip details">
      {chips.map((chip) => (
        <span key={chip.label} className="trip-chip">
          <Icon name={chip.icon} size={16} />
          {chip.label}
        </span>
      ))}
    </div>
  )
}

function CandidatePlanView({ status, plan }) {
  return (
    <article className="ai-plan">
      <header className="ai-plan-head">
        <div>
          <p className="page-eyebrow">Assistant draft</p>
          <h2>{plan.title}</h2>
          <p className="muted">Destination: {plan.destinationId}</p>
        </div>
        <span className="badge badge-UNVERIFIED">{status || 'UNVERIFIED'}</span>
      </header>

      <div className="ai-plan-days">
        {plan.days.map((day) => (
          <section key={day.dayNumber} className="ai-day">
            <h3>
              <span className="ai-day-number">Day {day.dayNumber}</span>
              <span className="ai-day-date">{day.date}</span>
            </h3>
            <ul className="ai-activity-list">
              {day.activities.map((activity) => (
                <li key={activity.activityId} className="ai-activity">
                  <span className="ai-activity-time">
                    {activity.startTime}–{activity.endTime}
                  </span>
                  <div className="ai-activity-body">
                    <strong>{activity.placeId}</strong>
                    <span className="muted small">
                      {activity.type} · {money(activity.estimatedCostVnd)}
                    </span>
                    {activity.reason && <p>{activity.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {plan.assumptions?.length > 0 && (
        <p className="ai-plan-note">
          <Icon name="info" size={16} />
          Assumptions: {plan.assumptions.join(' ')}
        </p>
      )}
    </article>
  )
}

export default function ResultsPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPlanId, setSelectedPlanId] = useState(() => getSelectedPlanId())
  const [shouldSimulateError, setShouldSimulateError] = useState(false)
  const [shouldSimulateEmpty, setShouldSimulateEmpty] = useState(false)
  const [pendingRequest] = useState(readPendingRequest)
  const [aiPlan, setAiPlan] = useState(null)
  const [aiStatus, setAiStatus] = useState(null)
  const [aiLoading, setAiLoading] = useState(Boolean(readPendingRequest()))
  const [aiError, setAiError] = useState(null)

  const loadAiPlan = useCallback(async () => {
    if (!pendingRequest) return
    const requestKey = JSON.stringify(pendingRequest)
    setAiLoading(true)
    setAiError(null)
    try {
      const body = await generateItinerary(pendingRequest)
      sessionStorage.setItem(PLAN_KEY, JSON.stringify({ requestKey, status: body.status, plan: body.plan }))
      setAiStatus(body.status)
      setAiPlan(body.plan)
    } catch (err) {
      setAiError(err?.message || 'The assistant could not build an itinerary.')
      setAiPlan(null)
    } finally {
      setAiLoading(false)
    }
  }, [pendingRequest])

  const loadRecommendations = useCallback(async (opts = {}) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchDestinationRecommendations({
        delay: opts.delay ?? 350,
        shouldFail: opts.shouldFail ?? shouldSimulateError,
        empty: opts.empty ?? shouldSimulateEmpty,
      })
      setPlans(response.data || [])
    } catch (err) {
      setError(err?.message || 'Failed to load destination recommendations.')
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [shouldSimulateError, shouldSimulateEmpty])

  useEffect(() => {
    if (pendingRequest) return
    loadRecommendations()
  }, [loadRecommendations, pendingRequest])

  useEffect(() => {
    if (!pendingRequest) return
    const requestKey = JSON.stringify(pendingRequest)
    try {
      const saved = JSON.parse(sessionStorage.getItem(PLAN_KEY) || 'null')
      if (saved?.requestKey === requestKey && saved.plan) {
        setAiStatus(saved.status)
        setAiPlan(saved.plan)
        setAiLoading(false)
        return
      }
    } catch {
      // A bad cache just means we ask again.
    }
    loadAiPlan()
  }, [pendingRequest, loadAiPlan])

  // Sync selection state if modified elsewhere
  useEffect(() => {
    const handler = (e) => {
      setSelectedPlanId(e.detail?.id || null)
    }
    window.addEventListener('tpva-plan-selected', handler)
    return () => window.removeEventListener('tpva-plan-selected', handler)
  }, [])

  const handleSelectPlan = async (plan) => {
    if (selectedPlanId === plan.id || selectedPlanId === plan.planId) {
      // Toggle off / clear
      clearSelectedPlan()
      setSelectedPlanId(null)
    } else {
      await selectPlan(plan)
      setSelectedPlanId(plan.id || plan.planId)
    }
  }

  const feasiblePlans = getTopFeasiblePlans(plans)
  const selectedPlanObj = plans.find(
    (p) =>
      p.status === 'FEASIBLE' &&
      (p.id === selectedPlanId || p.planId === selectedPlanId)
  )

  return (
    <section className="results-page">
      <header className="results-head">
        <div className="results-intro-copy">
          <p className="page-eyebrow">Step 2 of 3 · Results</p>
          <h1 className="results-title">Choose the itinerary that fits your trip</h1>
          <p className="results-subtitle muted">
            Compare verified plans side by side. Open one to see the day-by-day schedule, or save it as your trip.
          </p>
        </div>

        {!pendingRequest && (
          <details className="dev-panel">
            <summary>
              <Icon name="refresh" size={15} />
              Demo controls
            </summary>
            <div className="dev-panel-body" title="M5 Acceptance criteria testing controls">
              <span className="demo-controls-label">Test states</span>
              <button
                type="button"
                className="btn btn-sm btn-outline demo-btn"
                onClick={() => {
                  setShouldSimulateError(false)
                  setShouldSimulateEmpty(false)
                  loadRecommendations({ shouldFail: false, empty: false, delay: 500 })
                }}
              >
                Reload
              </button>
              <button
                type="button"
                className={`btn btn-sm demo-btn ${shouldSimulateError ? 'btn-danger-active' : 'btn-outline'}`}
                onClick={() => {
                  const next = !shouldSimulateError
                  setShouldSimulateError(next)
                  setShouldSimulateEmpty(false)
                  loadRecommendations({ shouldFail: next, delay: 200 })
                }}
              >
                {shouldSimulateError ? 'Error simulated' : 'Simulate error'}
              </button>
              <button
                type="button"
                className={`btn btn-sm demo-btn ${shouldSimulateEmpty ? 'btn-danger-active' : 'btn-outline'}`}
                onClick={() => {
                  const next = !shouldSimulateEmpty
                  setShouldSimulateEmpty(next)
                  setShouldSimulateError(false)
                  loadRecommendations({ empty: next, delay: 200 })
                }}
              >
                {shouldSimulateEmpty ? 'Empty simulated' : 'Simulate empty'}
              </button>
            </div>
          </details>
        )}
      </header>

      <RequestSummary request={pendingRequest} />

      {/* Selected Plan Notification Banner */}
      {selectedPlanObj && (
        <div className="chosen-plan-banner" role="status">
          <div className="chosen-banner-info">
            <span className="chosen-star-icon" aria-hidden="true">
              <Icon name="star" size={20} />
            </span>
            <div>
              <strong>Saved to your trip</strong>
              <span className="chosen-banner-destination">
                {selectedPlanObj.destination} <span aria-hidden="true">·</span> {selectedPlanObj.title}
              </span>
              <div className="muted small">
                {selectedPlanObj.days?.length} days · Status:{' '}
                <span className={`badge badge-${selectedPlanObj.status}`}>{selectedPlanObj.status}</span>
              </div>
            </div>
          </div>
          <div className="chosen-banner-actions">
            <Link to={`/selected?id=${selectedPlanObj.id}`} className="btn btn-sm btn-primary">
              Open chosen plan
              <Icon name="arrowRight" size={15} />
            </Link>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => handleSelectPlan(selectedPlanObj)}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {pendingRequest && aiLoading && (
        <Loading message="Waiting for the assistant to build your itinerary..." />
      )}

      {pendingRequest && !aiLoading && aiError && (
        <ErrorMessage
          title="The assistant did not return an itinerary"
          message={aiError}
          onRetry={loadAiPlan}
        />
      )}

      {pendingRequest && !aiLoading && !aiError && aiPlan && (
        <CandidatePlanView status={aiStatus || 'UNVERIFIED'} plan={aiPlan} />
      )}

      {!pendingRequest && loading && (
        <Loading message="Analyzing travel requirements and loading destination recommendations..." />
      )}

      {!pendingRequest && !loading && error && (
        <ErrorMessage
          title="Unable to load recommendations"
          message={error}
          onRetry={() => {
            setShouldSimulateError(false)
            loadRecommendations({ shouldFail: false, delay: 350 })
          }}
        />
      )}

      {!pendingRequest && !loading && !error && plans.length === 0 && (
        <div className="empty-results-box">
          <span className="empty-icon" aria-hidden="true">
            <Icon name="compass" size={26} />
          </span>
          <h2>No matching destination plans found</h2>
          <p className="muted">Try adjusting your travel dates, budget, or preferences.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShouldSimulateEmpty(false)
              loadRecommendations({ empty: false, delay: 350 })
            }}
          >
            Reset recommendations
          </button>
        </div>
      )}

      {!pendingRequest && !loading && !error && plans.length > 0 && feasiblePlans.length === 0 && (
        <div className="empty-results-box">
          <span className="empty-icon" aria-hidden="true">
            <Icon name="alert" size={26} />
          </span>
          <h2>No verified feasible itineraries found</h2>
          <p className="muted">
            Plans that are unverified or violate constraints are not shown as feasible.
          </p>
          <Link to="/" className="btn btn-primary">
            Adjust your trip
          </Link>
        </div>
      )}

      {!pendingRequest && !loading && !error && feasiblePlans.length > 0 && (
        <section className="results-list" aria-labelledby="results-heading">
          <div className="section-head">
            <div>
              <h2 id="results-heading">
                {feasiblePlans.length} {feasiblePlans.length === 1 ? 'itinerary' : 'itineraries'} to explore
              </h2>
              <p className="muted">
                Look for the <span className="suggested-inline">Suggested</span> tag to see the closest match to your preferences.
              </p>
            </div>
            <span className="count-pill">
              <Icon name="route" size={15} />
              {feasiblePlans.length} plans
            </span>
          </div>
          <PlanComparison
            plans={feasiblePlans}
            selectedPlanId={selectedPlanId}
            suggestedPlanId={feasiblePlans[0].id || feasiblePlans[0].planId}
            onSelectPlan={handleSelectPlan}
          />
        </section>
      )}
    </section>
  )
}
