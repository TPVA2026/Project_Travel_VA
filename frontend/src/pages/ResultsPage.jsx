import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  collectPlaceIds,
  fetchDestinationRecommendations,
  fetchPlaceCatalog,
  getSelectedPlanId,
  indexPlaces,
  resolveDestinationName,
  runItineraryPipeline,
  selectPlan,
  clearSelectedPlan,
  PIPELINE_MAX_CANDIDATES,
} from '../services/api.js'
import {
  getTopFeasiblePlans,
} from '../services/recommendations.js'
import CandidateComparison from '../components/comparison/CandidateComparison.jsx'
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

function aiErrorCopy(error) {
  const code = error?.code
  if (code === 'NO_CANDIDATES') {
    return {
      title: 'Không có lịch trình nào được tạo',
      message:
        error?.message ||
        'Trợ lý không trả về lịch trình nào dùng được. Không có dữ liệu mẫu nào được thay thế.',
    }
  }
  if (code === 'TIMEOUT') {
    return {
      title: 'Trợ lý phản hồi quá lâu',
      message:
        'Yêu cầu tạo lịch trình đã quá thời gian chờ. Hãy thử lại; không có kết quả mẫu nào được hiển thị thay thế.',
    }
  }
  if (code === 'AI_UNAVAILABLE') {
    return {
      title: 'Trợ lý AI tạm thời không khả dụng',
      message:
        'Không thể tạo lịch trình thật lúc này. Hãy thử lại sau; hệ thống không tự chuyển sang dữ liệu mẫu.',
    }
  }
  if (code === 'INVALID_REQUEST') {
    return {
      title: 'Yêu cầu chuyến đi không hợp lệ',
      message: error?.message || 'Hãy kiểm tra lại thông tin chuyến đi và thử lại.',
    }
  }
  return {
    title: 'Trợ lý không trả về lịch trình',
    message: error?.message || 'Không thể hoàn tất yêu cầu tạo lịch trình.',
  }
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

function PartialResultsBanner({ pipeline }) {
  const warnings = Array.isArray(pipeline?.warnings) ? pipeline.warnings : []
  if (warnings.length === 0) return null
  const count = pipeline?.candidates?.length || 0
  return (
    <div className="plan-alert-box alert-unverified" role="status" data-testid="partial-results-banner">
      <Icon name="alert" size={16} />
      <div className="plan-alert-groups">
        <strong>Kết quả chưa đầy đủ</strong>
        <p className="muted small">
          Chỉ nhận được {count}/{PIPELINE_MAX_CANDIDATES} lịch trình. Không có lịch thay thế nào
          được lấy từ dữ liệu mẫu; các trạng thái bên dưới vẫn là kết quả kiểm tra thật.
        </p>
        <ul>
          {warnings.map((warning, index) => (
            <li key={`${warning.code || 'warning'}-${index}`}>
              <span>{warning.message}</span>
              {warning.code && <code className="reason-code">{warning.code}</code>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SelectedCandidateBanner({ candidate, onClear }) {
  if (!candidate) return null
  const plan = candidate.plan || {}
  return (
    <div className="chosen-plan-banner" role="status">
      <div className="chosen-banner-info">
        <span className="chosen-star-icon" aria-hidden="true">
          <Icon name="star" size={20} />
        </span>
        <div>
          <strong>Đã lưu vào chuyến đi</strong>
          <span className="chosen-banner-destination">{plan.title}</span>
          <div className="muted small">
            {plan.days?.length || 0} ngày · Trạng thái:{' '}
            <span className={`badge badge-${candidate.status}`}>{candidate.status}</span>
          </div>
        </div>
      </div>
      <div className="chosen-banner-actions">
        <Link to={`/selected?id=${candidate.planId}`} className="btn btn-sm btn-primary">
          Mở lịch đã chọn
          <Icon name="arrowRight" size={15} />
        </Link>
        <button type="button" className="btn btn-sm btn-outline" onClick={onClear}>
          Bỏ chọn
        </button>
      </div>
    </div>
  )
}

function migrateCachedPipeline(saved) {
  if (saved?.pipeline?.candidates) return saved.pipeline
  // Older cache stored a single plan; wrap it so the UI keeps working.
  if (saved?.plan) {
    const status = saved.status || saved.evaluation?.status || 'UNVERIFIED'
    const candidate = {
      planId: saved.plan.planId,
      status,
      plan: saved.plan,
      evaluation: saved.evaluation || null,
    }
    return {
      pipelineStatus: 'COMPLETE',
      generator: saved.generator || 'ai',
      candidates: [candidate],
      ranking: saved.ranking || { ranked: [], unscored: [], excluded: [] },
      warnings: [],
      request: null,
    }
  }
  return null
}

export default function ResultsPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPlanId, setSelectedPlanId] = useState(() => getSelectedPlanId())
  const [shouldSimulateError, setShouldSimulateError] = useState(false)
  const [shouldSimulateEmpty, setShouldSimulateEmpty] = useState(false)
  const [pendingRequest] = useState(readPendingRequest)
  const [pipeline, setPipeline] = useState(null)
  const [aiLoading, setAiLoading] = useState(Boolean(readPendingRequest()))
  const [aiError, setAiError] = useState(null)
  const [placesById, setPlacesById] = useState(() => new Map())
  const [placeCatalogError, setPlaceCatalogError] = useState(null)
  const startedRequestRef = useRef(null)

  const loadAiPlan = useCallback(async () => {
    if (!pendingRequest) return
    const requestKey = JSON.stringify(pendingRequest)
    setAiLoading(true)
    setAiError(null)
    try {
      const body = await runItineraryPipeline(pendingRequest, { count: PIPELINE_MAX_CANDIDATES })
      sessionStorage.setItem(PLAN_KEY, JSON.stringify({ requestKey, pipeline: body }))
      setPipeline(body)
    } catch (err) {
      setAiError(err)
      setPipeline(null)
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

  const aiCandidates = pipeline?.candidates || []

  useEffect(() => {
    if (aiCandidates.length === 0) return undefined
    let cancelled = false
    const ids = [...new Set(aiCandidates.flatMap((candidate) => collectPlaceIds(candidate.plan)))]
    if (ids.length === 0) return undefined
    setPlaceCatalogError(null)
    fetchPlaceCatalog({ ids })
      .then((places) => {
        if (cancelled) return
        const byId = indexPlaces(places)
        const missing = ids.filter((id) => !byId.has(String(id)))
        setPlacesById(byId)
        setPlaceCatalogError(
          missing.length > 0
            ? `Không tìm thấy tên cho: ${missing.join(', ')}`
            : null
        )
      })
      .catch(() => {
        if (cancelled) return
        setPlacesById(new Map())
        setPlaceCatalogError('Không đọc được danh mục tên địa điểm.')
      })
    return () => {
      cancelled = true
    }
  }, [aiCandidates])

  useEffect(() => {
    if (!pendingRequest) return
    const requestKey = JSON.stringify(pendingRequest)
    // React StrictMode re-runs effects in development; without this guard the
    // assistant would generate a whole extra batch of candidates.
    if (startedRequestRef.current === requestKey) return
    startedRequestRef.current = requestKey
    try {
      const saved = JSON.parse(sessionStorage.getItem(PLAN_KEY) || 'null')
      const cached = saved?.requestKey === requestKey ? migrateCachedPipeline(saved) : null
      if (cached) {
        setPipeline(cached)
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
      clearSelectedPlan()
      setSelectedPlanId(null)
    } else {
      await selectPlan(plan)
      setSelectedPlanId(plan.id || plan.planId)
    }
  }

  const handleSelectCandidate = async (candidate) => {
    const id = candidate.planId || candidate.plan?.planId
    if (selectedPlanId === id) {
      clearSelectedPlan()
      setSelectedPlanId(null)
      return
    }
    const plan = candidate.plan || {}
    const destination =
      resolveDestinationName(plan.destinationId, placesById) || plan.destinationId
    const savedPlan = {
      ...plan,
      id: plan.planId,
      status: candidate.status,
      evaluation: candidate.evaluation,
      request: pendingRequest,
      destination,
      missing: (candidate.evaluation?.reasons || []).map(
        (reason) => reason.message || reason.code
      ),
      fit: [],
    }
    await selectPlan(savedPlan)
    setSelectedPlanId(id)
  }

  const feasiblePlans = getTopFeasiblePlans(plans)
  const selectedPlanObj = plans.find(
    (p) =>
      p.status === 'FEASIBLE' &&
      (p.id === selectedPlanId || p.planId === selectedPlanId)
  )
  const selectedCandidate = aiCandidates.find(
    (candidate) =>
      (candidate.planId || candidate.plan?.planId) === selectedPlanId &&
      candidate.status !== 'INFEASIBLE'
  )
  const errorCopy = aiError ? aiErrorCopy(aiError) : null

  return (
    <section className="results-page">
      <header className="results-head">
        <div className="results-intro-copy">
          <p className="page-eyebrow">Step 2 of 3 · Results</p>
          <h1 className="results-title">Choose the itinerary that fits your trip</h1>
          <p className="results-subtitle muted">
            Review the assistant draft and the backend checks behind it. Statuses are shown exactly as returned, never upgraded to verified.
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

      {!pendingRequest && selectedPlanObj && (
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
        <Loading message="Waiting for the assistant to build your itineraries..." />
      )}

      {pendingRequest && !aiLoading && aiError && (
        <ErrorMessage
          title={errorCopy.title}
          message={errorCopy.message}
          onRetry={loadAiPlan}
        />
      )}

      {pendingRequest && !aiLoading && !aiError && pipeline && (
        <>
          <SelectedCandidateBanner
            candidate={selectedCandidate}
            onClear={() => handleSelectCandidate(selectedCandidate)}
          />
          <PartialResultsBanner pipeline={pipeline} />
          {placeCatalogError && (
            <p className="ai-plan-note ai-plan-note--warn">
              <Icon name="alert" size={16} />
              {placeCatalogError}. Đang hiển thị ID gốc cho các địa điểm này, không tự đoán tên.
            </p>
          )}
          {aiCandidates.length === 0 ? (
            <div className="empty-results-box">
              <span className="empty-icon" aria-hidden="true">
                <Icon name="compass" size={26} />
              </span>
              <h2>No candidate itineraries were returned</h2>
              <p className="muted">
                The assistant did not produce a usable schedule. Try adjusting your trip and retry.
              </p>
              <button type="button" className="btn btn-primary" onClick={loadAiPlan}>
                Retry
              </button>
            </div>
          ) : (
            <CandidateComparison
              candidates={aiCandidates}
              ranking={pipeline.ranking}
              selectedPlanId={selectedPlanId}
              placesById={placesById}
              onSelectPlan={handleSelectCandidate}
            />
          )}
        </>
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
