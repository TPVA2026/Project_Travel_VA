import { Link } from 'react-router-dom'
import { fmtMoney, knownTotal } from '../../services/mockData.js'

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

        return (
          <article
            key={p.id}
            className={`card plan-card ${isSelected ? 'plan-card--selected' : ''}`}
          >
            <div className="img-wrap">
              {p.image && (
                <img
                  src={p.image}
                  alt={p.destination}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              {isSelected && (
                <div className="card-selected-ribbon">
                  ✓ Chosen Plan
                </div>
              )}
            </div>
            <div className="card-body">
              <div className="card-top-row">
                <span className="card-index-label">Destination {i + 1}</span>
                <div className="card-badges">
                  {isSuggested && <span className="badge badge-suggested">Suggest</span>}
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                </div>
              </div>
              <h3 className="card-destination">{p.destination}</h3>

              <div className="card-features-summary muted small">
                <span>📅 {p.days?.length || 0} days</span>
                <span>•</span>
                <span>🏛️ {totalAttractions} attraction{totalAttractions !== 1 ? 's' : ''}</span>
                <span>•</span>
                <span>🍽️ {totalDining} dining</span>
              </div>

              <div className="card-details">
                {p.status === 'INFEASIBLE' ? (
                  <>
                    <p className="fit-text">
                      <strong>Fit:</strong> {p.fit?.join(', ') || 'None'}
                    </p>
                    <p className="fail-text">
                      <strong>Not fit / Fail:</strong>{' '}
                      {p.failReason || p.notFit?.join(', ') || 'Constraints violated'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="fit-text">
                      <strong>Fit:</strong> {p.fit?.join(', ') || 'Matches preferences'}
                    </p>
                    {p.notFit?.length > 0 && (
                      <p className="not-fit-text">
                        <strong>Not fit:</strong> {p.notFit.join(', ')}
                      </p>
                    )}
                    {missing.length > 0 && (
                      <p className="unverified">
                        <strong>Unverified:</strong> {missing.join(', ')}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="card-footer-action">
                <div className="card-cost muted small">
                  Estimated: {fmtMoney(total)}
                </div>

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
                        ? 'Cannot select infeasible plan. Revise constraints first.'
                        : isSelected
                        ? 'This plan is currently selected'
                        : 'Select this plan for your trip'
                    }
                    onClick={() => onSelectPlan && onSelectPlan(p)}
                  >
                    {isSelected ? '✓ Selected' : 'Select plan'}
                  </button>

                  <Link
                    className="btn btn-sm btn-primary"
                    to={`/selected?id=${p.id}`}
                  >
                    {isSelected ? 'View chosen plan →' : 'View & edit →'}
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
