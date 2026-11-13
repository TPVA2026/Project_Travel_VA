import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  collectPlaceIds,
  fetchPlaceCatalog,
  getSelectedPlanId,
  indexPlaces,
  resolveDestinationName,
  streamItineraryPipeline,
  selectPlan,
  clearSelectedPlan,
  PIPELINE_MAX_CANDIDATES,
} from '../services/api.js'
import {
  getDestinationImage,
  getDestinationLabel,
} from '../services/destinationImages.js'
import CandidateComparison from '../components/comparison/CandidateComparison.jsx'
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
  if (code === 'RATE_LIMIT' || code === 'AI_BUSY') {
    return {
      title: 'Dịch vụ AI đang quá tải',
      message:
        'Nhà cung cấp AI đang giới hạn số yêu cầu hoặc đã hết hạn mức tạm thời. Hãy chờ một lúc rồi thử lại; không có dữ liệu mẫu nào được hiển thị thay thế.',
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
  const [selectedPlanId, setSelectedPlanId] = useState(() => getSelectedPlanId())
  const [pendingRequest] = useState(readPendingRequest)
  const [pipeline, setPipeline] = useState(null)
  const [aiLoading, setAiLoading] = useState(Boolean(readPendingRequest()))
  const [aiError, setAiError] = useState(null)
  const [streamProgress, setStreamProgress] = useState(null)
  const [placesById, setPlacesById] = useState(() => new Map())
  const [placeCatalogError, setPlaceCatalogError] = useState(null)
  const startedRequestRef = useRef(null)

  const loadAiPlan = useCallback(async () => {
    if (!pendingRequest) return
    const requestKey = JSON.stringify(pendingRequest)
    setAiLoading(true)
    setAiError(null)
    setStreamProgress(null)
    try {
      const body = await streamItineraryPipeline(pendingRequest, {
        count: PIPELINE_MAX_CANDIDATES,
        onEvent: (event) => {
          if (event.type === 'progress') setStreamProgress({
            candidateIndex: event.candidateIndex,
            requestedCount: event.requestedCount,
          })
          if (event.type === 'candidate') {
            setPipeline((current) => ({
              pipelineStatus: 'GENERATING',
              generator: 'ai',
              request: pendingRequest,
              candidates: [...(current?.candidates || []), event.candidate],
              ranking: { ranked: [], unscored: [], excluded: [] },
              warnings: [],
            }))
          }
        },
      })
      sessionStorage.setItem(PLAN_KEY, JSON.stringify({ requestKey, pipeline: body }))
      setPipeline(body)
    } catch (err) {
      setAiError(err)
      // Preserve already generated candidates if a later request fails.
    } finally {
      setAiLoading(false)
      setStreamProgress(null)
    }
  }, [pendingRequest])

  const aiCandidates = pipeline?.candidates || []

  useEffect(() => {
    if (aiCandidates.length === 0) return undefined
    let cancelled = false
    const ids = [...new Set(aiCandidates.flatMap((candidate) => collectPlaceIds(candidate.plan)))]
    if (ids.length === 0) return undefined
    setPlaceCatalogError(null)
    const destinations = [...new Set(aiCandidates.map((candidate) => candidate.plan?.destinationId).filter(Boolean))]
    fetchPlaceCatalog({ ids, destination: destinations.length === 1 ? destinations[0] : undefined })
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

  const handleSelectCandidate = async (candidate) => {
    const id = candidate.planId || candidate.plan?.planId
    if (selectedPlanId === id) {
      clearSelectedPlan()
      setSelectedPlanId(null)
      return
    }
    const plan = candidate.plan || {}
    const resolvedDestination = resolveDestinationName(plan.destinationId, placesById)
    const destination =
      getDestinationLabel(plan.destinationId, resolvedDestination, plan.title) ||
      resolvedDestination ||
      plan.destinationId
    const savedPlan = {
      ...plan,
      id: plan.planId,
      status: candidate.status,
      evaluation: candidate.evaluation,
      request: pendingRequest,
      destination,
      image:
        plan.image ||
        getDestinationImage(plan.destinationId, destination, plan.title) ||
        null,
      missing: (candidate.evaluation?.reasons || []).map(
        (reason) => reason.message || reason.code
      ),
      fit: [],
    }
    await selectPlan(savedPlan)
    setSelectedPlanId(id)
  }

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

      </header>

      <RequestSummary request={pendingRequest} />

      {pendingRequest && aiLoading && (
        <Loading message={streamProgress
          ? `Generating itinerary ${streamProgress.candidateIndex} of ${streamProgress.requestedCount}… You can review completed itineraries below.`
          : 'Generating itinerary 1 of 3…'} />
      )}

      {pendingRequest && !aiLoading && aiError && (
        <ErrorMessage
          title={errorCopy.title}
          message={errorCopy.message}
          onRetry={loadAiPlan}
        />
      )}

      {pendingRequest && pipeline && (
        <>
          <SelectedCandidateBanner
            candidate={selectedCandidate}
            onClear={() => handleSelectCandidate(selectedCandidate)}
          />
          {!aiLoading && <PartialResultsBanner pipeline={pipeline} />}
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

      {!pendingRequest && (
        <div className="empty-results-box">
          <span className="empty-icon" aria-hidden="true">
            <Icon name="compass" size={26} />
          </span>
          <h2>Start with your trip details</h2>
          <p className="muted">
            Lịch trình chỉ được tạo từ yêu cầu chuyến đi và backend AI, không dùng dữ liệu mẫu.
            Hãy nhập ngày đi, ngân sách và điểm đến để xem các lịch trình thật.
          </p>
          <Link to="/" className="btn btn-primary">
            Create your itinerary
            <Icon name="arrowRight" size={15} />
          </Link>
        </div>
      )}
    </section>
  )
}
