import { fmtMoney, knownTotal } from '../../services/mockData.js'

export default function CostSummary({ plan }) {
  if (!plan) return null

  const { total, missing } = knownTotal(plan)

  return (
    <div className="cost-summary">
      <div className="total-box">
        TOTAL: {total.toLocaleString('en-US')} VND
      </div>
      {missing.length > 0 && (
        <p className="cost-warning muted small">
          ⚠️ Known costs only. Unverified: {missing.join(', ')} (not counted as 0).
        </p>
      )}
      {plan.costs && (
        <div className="cost-breakdown">
          {Object.entries(plan.costs).map(([category, amount]) => (
            <div key={category} className="cost-row">
              <span className="cost-category">{category}:</span>
              <span className={amount == null ? 'unverified' : ''}>
                {fmtMoney(amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
