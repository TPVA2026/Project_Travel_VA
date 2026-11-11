import { fmtMoney, knownTotal } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

function hasCostEvaluation(costEvaluation) {
  return Boolean(
    costEvaluation &&
    (costEvaluation.breakdown != null ||
      costEvaluation.known_total != null ||
      costEvaluation.missing_costs != null)
  )
}

export default function CostSummary({ plan, costEvaluation }) {
  const evaluation = hasCostEvaluation(costEvaluation) ? costEvaluation : null
  if (!plan && !evaluation) return null

  const fallback = plan ? knownTotal(plan) : { total: 0, missing: [] }
  const total = evaluation ? evaluation.known_total : fallback.total
  const missing = evaluation ? evaluation.missing_costs || [] : fallback.missing
  const breakdown = evaluation ? evaluation.breakdown : plan?.costs
  const budget = evaluation?.budget
  const remaining = evaluation?.remaining_budget
  const complete = evaluation
    ? evaluation.total_cost != null
    : missing.length === 0

  return (
    <section className="cost-summary" aria-labelledby="cost-summary-title">
      <h3 id="cost-summary-title" className="cost-summary-title">
        Estimated cost
      </h3>

      <div className="total-box">
        <span className="cost-total-label">{complete ? 'Total' : 'Known total'}</span>
        <strong className="cost-total-value">
          {total == null ? (
            'Unverified'
          ) : (
            <>
              {Number(total).toLocaleString('en-US')} <small>VND</small>
            </>
          )}
        </strong>
      </div>

      {budget != null && (
        <div className="cost-breakdown">
          <div className="cost-row">
            <span className="cost-category">Your budget</span>
            <span>{fmtMoney(budget)}</span>
          </div>
          {remaining != null && (
            <div className="cost-row">
              <span className="cost-category">
                {remaining >= 0 ? 'Remaining after known costs' : 'Over budget by'}
              </span>
              <span className={remaining < 0 ? 'unverified' : ''}>
                {fmtMoney(Math.abs(remaining))}
              </span>
            </div>
          )}
        </div>
      )}

      {missing.length > 0 && (
        <p className="cost-warning">
          <Icon name="alert" size={15} />
          <span>
            Known costs only. Unverified: {missing.join(', ')} (not counted as 0).
          </span>
        </p>
      )}

      {breakdown && (
        <div className="cost-breakdown">
          {Object.entries(breakdown).map(([category, amount]) => (
            <div key={category} className="cost-row">
              <span className="cost-category">{category}</span>
              <span className={amount == null ? 'unverified' : ''}>{fmtMoney(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
