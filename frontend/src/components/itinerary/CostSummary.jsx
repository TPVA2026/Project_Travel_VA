import { fmtMoney, knownTotal } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

export default function CostSummary({ plan }) {
  if (!plan) return null

  const { total, missing } = knownTotal(plan)

  return (
    <section className="cost-summary" aria-labelledby="cost-summary-title">
      <h3 id="cost-summary-title" className="cost-summary-title">
        Estimated cost
      </h3>

      <div className="total-box">
        <span className="cost-total-label">Known total</span>
        <strong className="cost-total-value">
          {total.toLocaleString('en-US')} <small>VND</small>
        </strong>
      </div>

      {missing.length > 0 && (
        <p className="cost-warning">
          <Icon name="alert" size={15} />
          <span>
            Known costs only. Unverified: {missing.join(', ')} (not counted as 0).
          </span>
        </p>
      )}

      {plan.costs && (
        <div className="cost-breakdown">
          {Object.entries(plan.costs).map(([category, amount]) => (
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
