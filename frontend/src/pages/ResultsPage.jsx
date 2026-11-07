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

function CandidatePlanView({ status, plan }) {
  return (
    <article className="candidate-plan box">
      <p className="candidate-status">Status: {status}</p>
      <h2>{plan.title}</h2>
      <p className="muted">Destination: {plan.destinationId}</p>
      {plan.days.map((day) => (
        <section key={day.dayNumber} className="candidate-day">
          <h3>Day {day.dayNumber} · {day.date}</h3>
          <ul>
            {day.activities.map((activity) => (
              <li key={activity.activityId}>
                <strong>{activity.startTime}–{activity.endTime}</strong> {activity.placeId}
                <span className="muted"> · {activity.type} · {money(activity.estimatedCostVnd)}</span>
                {activity.reason && <div>{activity.reason}</div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {plan.assumptions?.length > 0 && (
        <p className="muted">Assumptions: {plan.assumptions.join(' ')}</p>
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
      <div className="results-header-row">
        <div className="results-intro-copy">
          <p className="page-eyebrow">YOUR TRAVEL PLAN · STEP 2 OF 3</p>
          <h1 className="results-title">Find your next getaway</h1>
          <p className="results-subtitle muted">
            Compare itineraries, see what fits your travel style, and choose the plan you love.
          </p>
        </div>

        {pendingRequest ? null : (
          <div className="demo-controls-bar" title="M5 Acceptance criteria testing controls">
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
              ↻ Reload
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
              {shouldSimulateError ? '✓ Error simulated' : 'Simulate error'}
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
              {shouldSimulateEmpty ? '✓ Empty simulated' : 'Simulate empty'}
            </button>
          </div>
        )}
      </div>

      {/* Selected Plan Notification Banner */}
      {selectedPlanObj && (
        <div className="chosen-plan-banner" role="status">
          <div className="chosen-banner-info">
            <span className="chosen-star-icon">⭐</span>
            <div>
              <strong>Your selected plan</strong>
              <span className="chosen-banner-destination">
                {selectedPlanObj.destination} <span aria-hidden="true">·</span> {selectedPlanObj.title}
              </span>
              <div className="muted small">
                {selectedPlanObj.days?.length} days • Status: <span className={`badge badge-${selectedPlanObj.status}`}>{selectedPlanObj.status}</span>
              </div>
            </div>
          </div>
          <div className="chosen-banner-actions">
            <Link to={`/selected?id=${selectedPlanObj.id}`} className="btn btn-sm btn-primary">
              View chosen plan details →
            </Link>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => handleSelectPlan(selectedPlanObj)}
            >
              Clear selection
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
        <div className="empty-results-box box">
          <h3>No matching destination plans found</h3>
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
        <div className="empty-results-box box">
          <h3>No verified feasible itineraries found</h3>
          <p className="muted">
            Plans that are unverified or violate constraints are not shown as feasible.
          </p>
        </div>
      )}

      {!pendingRequest && !loading && !error && feasiblePlans.length > 0 && (
        <div className="feasible-results">
          <div className="feasible-results-heading">
            <div>
              <p className="page-eyebrow">MADE FOR YOUR TRIP</p>
              <h2>{feasiblePlans.length} {feasiblePlans.length === 1 ? 'itinerary' : 'itineraries'} to explore</h2>
            </div>
            <p className="muted small">Look for “Suggested” to see the closest match to your preferences.</p>
          </div>
          <PlanComparison
            plans={feasiblePlans}
            selectedPlanId={selectedPlanId}
            suggestedPlanId={feasiblePlans[0].id || feasiblePlans[0].planId}
            onSelectPlan={handleSelectPlan}
          />
        </div>
      )}
    </section>
  )
}
