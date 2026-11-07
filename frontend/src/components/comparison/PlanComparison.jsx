import { Link } from 'react-router-dom'
import { fmtMoney, knownTotal } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

const STATUS_LABEL = {
  FEASIBLE: 'Fits your trip',
  INFEASIBLE: 'Not feasible',
  UNVERIFIED: 'Needs checking',
}

export default function PlanComparison({ plans, selectedPlanId, suggestedPlanId, onSelectPlan }) {
  if (!plans || plans.length === 0) {
    return <p className="muted">No candidate plans found.</p>
  }

  return (
    <div className="cards plan-comparison-grid">
      {plans.map((p, i) => {
        const isSelected = selectedPlanId && (selectedPlanId === p.id || selectedPlanId === p.planId)
        const isSuggested = suggestedPlanId === p.id || suggestedPlanId === p.planId
        const { total, missing } = knownTotal(p)
        const totalAttractions = p.days?.reduce(
          (acc, d) =>
            acc +
            (d.activities?.filter(
              (a) => a.type === 'sightseeing' || a.type === 'attraction'
            ).length || 0),
          0
        ) || 0
        const totalDining = p.days?.reduce(
          (acc, d) =>
            acc +
            (d.activities?.filter((a) => a.type === 'dining' || a.type === 'meal').length ||
              0),
          0
        ) || 0
        const statusLabel = STATUS_LABEL[p.status] || p.status

        return (
          <article
            key={p.id}
            className={`card plan-card ${isSelected ? 'plan-card--selected' : ''}`}
          >
            <div className="img-wrap">
              {p.image && (
                <img
                  src={p.image}
                  alt={`${p.destination} landscape`}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              <div className="card-badges">
                {isSuggested && (
                  <span className="badge badge-suggested">
                    <Icon name="sparkle" size={13} />
                    Suggested
                  </span>
                )}
                <span className={`badge badge-${p.status}`}>{statusLabel}</span>
              </div>
              {isSelected && (
                <div className="card-selected-ribbon">
                  <Icon name="check" size={14} />
                  Chosen
                </div>
              )}
            </div>

            <div className="card-body">
              <span className="card-index-label">Option {i + 1}</span>
              <h3 className="card-destination">{p.destination}</h3>
              {p.title && <p className="card-title">{p.title}</p>}

              <div className="card-meta" aria-label="Trip summary">
                <span>
                  <Icon name="calendar" size={16} />
                  {p.days?.length || 0} days
                </span>
                <span>
                  <Icon name="landmark" size={16} />
                  {totalAttractions} {totalAttractions === 1 ? 'attraction' : 'attractions'}
                </span>
                <span>
                  <Icon name="utensils" size={16} />
                  {totalDining} dining
                </span>
              </div>

              <div className="card-details">
                {p.status === 'INFEASIBLE' ? (
                  <p className="plan-note plan-note--danger">
                    <Icon name="alert" size={16} />
                    <span>{p.failReason || p.notFit?.join(', ') || 'Constraints violated'}</span>
                  </p>
                ) : (
                  <>
                    <ul className="fit-list">
                      {(p.fit?.length ? p.fit : ['Matches your preferences']).slice(0, 3).map((reason) => (
                        <li key={reason}>
                          <Icon name="check" size={15} />
                          {reason}
                        </li>
                      ))}
                    </ul>
                    {p.notFit?.length > 0 && (
                      <p className="plan-note">
                        <Icon name="info" size={15} />
                        <span>Heads up: {p.notFit.join(', ')}</span>
                      </p>
                    )}
                    {missing.length > 0 && (
                      <p className="plan-note plan-note--warn">
                        <Icon name="alert" size={15} />
                        <span>Unverified: {missing.join(', ')}</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="card-cost-row">
                <span className="cost-label">Estimated total</span>
                <strong className="card-cost">{fmtMoney(total)}</strong>
              </div>

              <div className="card-footer-action">
                <div className="card-action-buttons">
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      isSelected
                        ? 'btn-selected-active'
                        : p.status === 'INFEASIBLE'
                        ? 'btn-disabled'
                        : 'btn-outline'
                    }`}
                    disabled={p.status === 'INFEASIBLE'}
                    title={
                      p.status === 'INFEASIBLE'
                        ? 'Cannot select an infeasible plan. Revise the constraints first.'
                        : isSelected
                        ? 'This plan is currently selected'
                        : 'Select this plan for your trip'
                    }
                    onClick={() => onSelectPlan && onSelectPlan(p)}
                  >
                    {isSelected ? (
                      <>
                        <Icon name="check" size={15} />
                        Selected
                      </>
                    ) : (
                      'Select'
                    )}
                  </button>

                  <Link className="btn btn-sm btn-primary" to={`/selected?id=${p.id}`}>
                    {isSelected ? 'Open plan' : 'View plan'}
                    <Icon name="arrowRight" size={15} />
                  </Link>
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
