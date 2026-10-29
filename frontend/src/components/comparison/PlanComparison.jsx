import { Link } from 'react-router-dom'
import { fmtMoney, knownTotal } from '../../services/mockData.js'

export default function PlanComparison({ plans, onSelectPlan }) {
  if (!plans || plans.length === 0) {
    return <p className="muted">No candidate plans found.</p>
  }

  return (
    <div className="cards plan-comparison-grid">
      {plans.map((p, i) => {
        const { total, missing } = knownTotal(p)
        return (
          <article key={p.id} className="card plan-card">
            <div className="img-wrap">
              <img
                src={p.image}
                alt={p.destination}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
            <div className="card-body">
              <h3 className="card-title">Destination {i + 1}</h3>
              <div className="card-destination">{p.destination}</div>

              <div className={`badge badge-${p.status}`}>{p.status}</div>

              <div className="card-details">
                {p.status === 'INFEASIBLE' ? (
                  <>
                    <p className="fit-text">
                      <strong>Fit:</strong> {p.fit?.join(', ') || 'None'}
                    </p>
                    <p className="fail-text">
                      <strong>Not fit / Fail:</strong> {p.failReason || p.notFit?.join(', ') || 'Constraints violated'}
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
                <Link
                  className={`btn ${p.status === 'FEASIBLE' ? 'btn-primary' : 'btn-outline'}`}
                  to={`/selected?id=${p.id}`}
                  onClick={() => onSelectPlan && onSelectPlan(p)}
                >
                  View plan
                </Link>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
