import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  candidateStatusLabel,
  createNameResolver,
  formatReason,
  getCandidateCost,
  getCandidateRanking,
  getCandidateWarnings,
  getRoutingEvidence,
  normalizeCandidateStatus,
  resolveDestinationName,
} from '../../services/api.js'
import {
  getDestinationImage,
  getDestinationLabel,
} from '../../services/destinationImages.js'
import { fmtMoney } from '../../services/mockData.js'
import ItineraryTimeline from '../itinerary/ItineraryTimeline.jsx'
import CostSummary from '../itinerary/CostSummary.jsx'
import CostProjection from '../itinerary/CostProjection.jsx'
import EvaluationChecks from '../itinerary/EvaluationChecks.jsx'
import Icon from '../common/Icon.jsx'

const WARNING_LIMIT = 4

function money(value) {
  return value == null ? 'Chưa xác minh' : fmtMoney(value)
}

function statusClass(status) {
  return `badge badge-${normalizeCandidateStatus(status)}`
}

function RankingLine({ ranking }) {
  if (ranking.kind === 'ranked') {
    return (
      <p className="plan-note">
        <Icon name="star" size={15} />
        <span>
          Xếp hạng #{ranking.position}
          {ranking.score100 != null ? ` · ${Number(ranking.score100).toFixed(1)}/100` : ''}
        </span>
      </p>
    )
  }
  if (ranking.kind === 'unscored') {
    return (
      <p className="plan-note plan-note--warn">
        <Icon name="info" size={15} />
        <span>Đủ điều kiện nhưng thiếu dữ liệu để chấm điểm xếp hạng.</span>
      </p>
    )
  }
  if (ranking.kind === 'excluded') {
    return (
      <p className="plan-note plan-note--warn">
        <Icon name="alert" size={15} />
        <span>Bị loại khỏi xếp hạng vì trạng thái không đạt.</span>
      </p>
    )
  }
  return null
}

function CostLine({ cost, resolveName }) {
  return (
    <>
      <div className="card-cost-row">
        <span className="cost-label">{cost.complete ? 'Tổng chi phí' : 'Tổng đã biết'}</span>
        <strong className="card-cost">{money(cost.knownTotal)}</strong>
      </div>
      {cost.missing.length > 0 && (
        <p className="plan-note plan-note--warn">
          <Icon name="alert" size={15} />
          <span>
            Chưa xác minh {cost.missing.length} mục (không tính là 0): {cost.missing.map(resolveName).join(', ')}
          </span>
        </p>
      )}
      <CostProjection projection={cost.projection} compact />
    </>
  )
}

function RoutingLine({ evidence }) {
  if (!evidence.available || evidence.total === 0) {
    return (
      <p className="plan-note">
        <Icon name="route" size={15} />
        <span>Chưa có bằng chứng lộ trình cho lịch này.</span>
      </p>
    )
  }
  const kind = evidence.unverified > 0 ? 'plan-note plan-note--warn' : 'plan-note'
  return (
    <p className={kind}>
      <Icon name="route" size={15} />
      <span>
        Lộ trình: {evidence.verified}/{evidence.total} chặng đã xác minh
        {evidence.unverified > 0 ? ` · ${evidence.unverified} chặng cần kiểm tra` : ''}
      </span>
    </p>
  )
}

function CandidateCard({
  candidate,
  ranking,
  selected,
  placesById,
  onSelect,
}) {
  const [expanded, setExpanded] = useState(false)
  const status = normalizeCandidateStatus(candidate.status)
  const plan = candidate.plan || {}
  const cost = getCandidateCost(candidate)
  const routing = getRoutingEvidence(candidate)
  const warnings = getCandidateWarnings(candidate, ranking)
  const rank = getCandidateRanking(ranking, candidate.planId || plan.planId)
  const resolveName = createNameResolver(plan, placesById)
  const resolvedDestination = resolveDestinationName(plan.destinationId, placesById)
  const destination =
    getDestinationLabel(plan.destinationId, resolvedDestination, plan.title) ||
    resolvedDestination ||
    plan.destinationId
  const image =
    plan.image ||
    getDestinationImage(plan.destinationId, destination, plan.title)
  const isInfeasible = status === 'INFEASIBLE'
  const isRecommended = status === 'FEASIBLE' && rank.kind === 'ranked'
  const activityCount =
    plan.days?.reduce((count, day) => count + (day.activities?.length || 0), 0) || 0

  return (
    <article className={`card plan-card ${selected ? 'plan-card--selected' : ''}`}>
      <div className="img-wrap candidate-img-wrap">
        {image && (
          <img
            src={image}
            alt={`${destination} landscape`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        <div className="card-badges">
          <span className={statusClass(status)} data-testid={`candidate-status-${candidate.planId}`}>
            {candidateStatusLabel(status)}
          </span>
          {isRecommended && (
            <span className="badge badge-suggested" data-testid={`candidate-recommended-${candidate.planId}`}>
              <Icon name="sparkle" size={13} />
              Đề xuất đã xếp hạng
            </span>
          )}
          {selected && (
            <span className="badge badge-suggested">
              <Icon name="check" size={13} />
              Đã chọn
            </span>
          )}
        </div>
        {selected && (
          <div className="card-selected-ribbon">
            <Icon name="check" size={14} />
            Đã chọn
          </div>
        )}
      </div>

      <div className="card-body">
        <span className="card-index-label">{plan.planId}</span>
        <h3 className="card-destination">{destination || plan.destinationId}</h3>
        {plan.title && <p className="card-title">{plan.title}</p>}

        <div className="card-meta" aria-label="Trip summary">
          <span>
            <Icon name="calendar" size={16} />
            {plan.days?.length || 0} ngày
          </span>
          <span>
            <Icon name="landmark" size={16} />
            {activityCount} hoạt động
          </span>
        </div>

        <div className="card-details">
          <RankingLine ranking={rank} />
          <CostLine cost={cost} resolveName={resolveName} />
          <RoutingLine evidence={routing} />

          {warnings.length > 0 && (
            <ul className="fit-list" aria-label="Cảnh báo phù hợp và chất lượng">
              {warnings.slice(0, WARNING_LIMIT).map((reason, index) => (
                <li key={`${reason.code || 'reason'}-${index}`}>
                  <Icon name="alert" size={15} />
                  {formatReason(reason, { resolveName })}
                </li>
              ))}
            </ul>
          )}
          {warnings.length > WARNING_LIMIT && (
            <p className="muted small">
              +{warnings.length - WARNING_LIMIT} cảnh báo khác trong chi tiết.
            </p>
          )}
        </div>

        <div className="card-footer-action">
          <div className="card-action-buttons">
            <button
              type="button"
              className={`btn btn-sm ${
                selected ? 'btn-selected-active' : isInfeasible ? 'btn-disabled' : 'btn-outline'
              }`}
              disabled={isInfeasible}
              title={
                isInfeasible
                  ? 'Không thể chọn lịch không khả thi. Hãy chỉnh yêu cầu trước.'
                  : 'Chọn lịch này cho chuyến đi'
              }
              onClick={() => onSelect?.(candidate)}
            >
              {selected ? (
                <>
                  <Icon name="check" size={15} />
                  Đã chọn
                </>
              ) : (
                'Chọn lịch này'
              )}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
              <Icon name={expanded ? 'arrowUp' : 'chevronDown'} size={15} />
            </button>
            {selected && (
              <Link className="btn btn-sm btn-primary" to={`/selected?id=${candidate.planId}`}>
                Mở lịch đã chọn
                <Icon name="arrowRight" size={15} />
              </Link>
            )}
          </div>
        </div>

        {expanded && (
          <div className="candidate-detail">
            <EvaluationChecks evaluation={candidate.evaluation} />
            <ItineraryTimeline days={plan.days} placesById={placesById} />
            <CostSummary
              plan={plan}
              costEvaluation={candidate.evaluation?.components?.cost}
              resolveName={resolveName}
            />
          </div>
        )}
      </div>
    </article>
  )
}

export default function CandidateComparison({
  candidates,
  ranking,
  selectedPlanId,
  placesById,
  onSelectPlan,
}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return <p className="muted">Không có lịch trình nào để so sánh.</p>
  }

  return (
    <section className="results-list" aria-labelledby="candidate-results-heading">
      <div className="section-head">
        <div>
          <h2 id="candidate-results-heading">
            {candidates.length} AI-Generated Itineraries
          </h2>
          <p className="muted">
            Each itinerary is evaluated by the backend based on cost, scheduling, and travel constraints.
            Evaluation statuses are displayed exactly as returned by the system, without falsely marking unverified itineraries as verified.
          </p>
        </div>
        <span className="count-pill">
          <Icon name="route" size={15} />
          {candidates.length} itineraries
        </span>
      </div>

      <div className="cards plan-comparison-grid">
        {candidates.map((candidate) => {
          const id = candidate.planId || candidate.plan?.planId
          return (
            <CandidateCard
              key={id}
              candidate={candidate}
              ranking={ranking}
              selected={Boolean(selectedPlanId && selectedPlanId === id)}
              placesById={placesById}
              onSelect={onSelectPlan}
            />
          )
        })}
      </div>
    </section>
  )
}
