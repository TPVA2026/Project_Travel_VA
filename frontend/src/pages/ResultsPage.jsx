import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchDestinationRecommendations,
  getSelectedPlanId,
  selectPlan,
  clearSelectedPlan,
} from '../services/api.js'
import PlanComparison from '../components/comparison/PlanComparison.jsx'
import Loading from '../components/common/Loading.jsx'
import ErrorMessage from '../components/common/ErrorMessage.jsx'

export default function ResultsPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPlanId, setSelectedPlanId] = useState(() => getSelectedPlanId())
  const [shouldSimulateError, setShouldSimulateError] = useState(false)
  const [shouldSimulateEmpty, setShouldSimulateEmpty] = useState(false)

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
    loadRecommendations()
  }, [loadRecommendations])

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

  const selectedPlanObj = plans.find(
    (p) => p.id === selectedPlanId || p.planId === selectedPlanId
  )

  return (
    <section className="results-page">
      <div className="results-header-row">
        <div>
          <h1 className="results-title">Related results</h1>
          <p className="results-subtitle muted">
            Destination recommendations and daily schedules based on your travel request.
          </p>
        </div>

        {/* Development / Reviewer controls to verify loading and error states */}
        <div className="demo-controls-bar" title="M5 Acceptance criteria testing controls">
          <span className="demo-controls-label">Test States:</span>
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
      </div>

      {/* Selected Plan Notification Banner */}
      {selectedPlanObj && (
        <div className="chosen-plan-banner" role="status">
          <div className="chosen-banner-info">
            <span className="chosen-star-icon">⭐</span>
            <div>
              <strong>Current Chosen Plan:</strong> {selectedPlanObj.destination} — {selectedPlanObj.title}
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
              Clear
            </button>
          </div>
        </div>
      )}

      {loading && (
        <Loading message="Analyzing travel requirements and loading destination recommendations..." />
      )}

      {!loading && error && (
        <ErrorMessage
          title="Unable to load recommendations"
          message={error}
          onRetry={() => {
            setShouldSimulateError(false)
            loadRecommendations({ shouldFail: false, delay: 350 })
          }}
        />
      )}

      {!loading && !error && plans.length === 0 && (
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

      {!loading && !error && plans.length > 0 && (
        <PlanComparison
          plans={plans}
          selectedPlanId={selectedPlanId}
          onSelectPlan={handleSelectPlan}
        />
      )}
    </section>
  )
}
