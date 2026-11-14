import { Link } from 'react-router-dom'
import {
  candidateStatusLabel,
  getCandidateCost,
  getCandidateRanking,
  getCandidateWarnings,
  getRoutingEvidence,
  groupEvaluationReasons,
  normalizeCandidateStatus,
  resolveDestinationName,
} from '../../services/api.js'
import {
  getDestinationImage,
  getDestinationLabel,
} from '../../services/destinationImages.js'
import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

function money(value) {
  return value == null ? 'Unverified' : fmtMoney(value)
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
          Rank #{ranking.position}
          {ranking.score100 != null ? ` · ${Number(ranking.score100).toFixed(1)}/100` : ''}
        </span>
      </p>
    )
  }
  if (ranking.kind === 'unscored') {
    return (
      <p className="plan-note plan-note--warn">
        <Icon name="info" size={15} />
        <span>Eligible, but missing data to score the ranking.</span>
      </p>
    )
  }
  if (ranking.kind === 'excluded') {
    return (
      <p className="plan-note plan-note--warn">
        <Icon name="alert" size={15} />
        <span>Excluded from ranking because the status did not pass.</span>
      </p>
    )
  }
  return null
}

function CostLine({ cost }) {
  return (
    <>
      <div className="card-cost-row">
        <span className="cost-label">{cost.complete ? 'Total cost' : 'Known total'}</span>
        <strong className="card-cost">{money(cost.knownTotal)}</strong>
      </div>
      {cost.missing.length > 0 && (
        <p className="unverified-line" role="status">
          <Icon name="alert" size={15} />
          <span>Unverified {cost.missing.length} cost {cost.missing.length === 1 ? 'item' : 'items'}</span>
        </p>
      )}
    </>
  )
}

function RoutingLine({ evidence }) {
  if (!evidence.available || evidence.total === 0) return null
  const kind = evidence.unverified > 0 ? 'plan-note plan-note--warn' : 'plan-note'
  return (
    <p className={kind}>
      <Icon name="route" size={15} />
      <span>
        Route: {evidence.verified}/{evidence.total} legs verified
        {evidence.unverified > 0 ? ` · ${evidence.unverified} legs need checking` : ''}
      </span>
    </p>
  )
}

function CandidateCard({
  candidate,
  index,
  ranking,
  selected,
  placesById,
  onSelect,
}) {
  const status = normalizeCandidateStatus(candidate.status)
  const plan = candidate.plan || {}
  const cost = getCandidateCost(candidate)
  const routing = getRoutingEvidence(candidate)
  const warnings = getCandidateWarnings(candidate, ranking)
  const rank = getCandidateRanking(ranking, candidate.planId || plan.planId)
  const groups = groupEvaluationReasons(candidate.evaluation, ranking, candidate.planId || plan.planId)
  const unresolved = groups
    .filter((group) => group.key !== 'cost' && group.key !== 'routing')
    .reduce((count, group) => count + group.reasons.length, 0)
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
  const detailUrl = `/selected?id=${encodeURIComponent(candidate.planId || plan.planId)}`

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
              Suggested
            </span>
          )}
        </div>
        {selected && (
          <div className="card-selected-ribbon">
            <Icon name="check" size={14} />
            Selected
          </div>
        )}
      </div>

      <div className="card-body">
        <span className="card-index-label">Option {index + 1}</span>
        <h3 className="card-destination">{destination || plan.destinationId}</h3>
        {plan.title && <p className="card-title">{plan.title}</p>}

        <div className="card-meta" aria-label="Trip summary">
          <span>
            <Icon name="calendar" size={16} />
            {plan.days?.length || 0} {plan.days?.length === 1 ? 'day' : 'days'}
          </span>
          <span>
            <Icon name="landmark" size={16} />
            {activityCount} {activityCount === 1 ? 'activity' : 'activities'}
          </span>
        </div>

        <div className="card-details">
          <RankingLine ranking={rank} />
          <CostLine cost={cost} />
          <RoutingLine evidence={routing} />

          {isInfeasible && warnings.length > 0 && (
            <p className="plan-note plan-note--danger">
              <Icon name="alert" size={15} />
              <span>Breaks trip constraints</span>
            </p>
          )}
          {!isInfeasible && unresolved > 0 && (
            <p className="unverified-line" role="status">
              <Icon name="alert" size={15} />
              <span>{unresolved} unverified {unresolved === 1 ? 'item' : 'items'}</span>
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
                  ? 'Cannot choose an infeasible plan. Adjust your request first.'
                  : selected
                    ? 'This plan is selected for your trip'
                    : 'Choose this plan for your trip'
              }
              onClick={() => onSelect?.(candidate)}
            >
              {selected ? (
                <>
                  <Icon name="check" size={15} />
                  Selected
                </>
              ) : (
                'Choose this plan'
              )}
            </button>
            <Link className="btn btn-sm btn-primary" to={detailUrl}>
              {selected ? 'Open details' : 'View details'}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </div>
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
    return <p className="muted">No itineraries to compare.</p>
  }

  return (
    <section className="results-list" aria-labelledby="candidate-results-heading">
      <div className="section-head">
        <div>
          <h2 id="candidate-results-heading">
            {candidates.length} itineraries from the assistant
          </h2>
          <p className="muted">
            Choose a plan and open its details to see the full backend checks and warnings.
          </p>
        </div>
        <span className="count-pill">
          <Icon name="route" size={15} />
          {candidates.length} {candidates.length === 1 ? 'plan' : 'plans'}
        </span>
      </div>

      <div className="cards plan-comparison-grid">
        {candidates.map((candidate, index) => {
          const id = candidate.planId || candidate.plan?.planId
          return (
            <CandidateCard
              key={id}
              candidate={candidate}
              index={index}
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
