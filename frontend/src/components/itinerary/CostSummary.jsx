import { fmtMoney, knownTotal } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'
import CostProjection from './CostProjection.jsx'

const CATEGORY_LABEL = {
  transport: 'Di chuyển',
  accommodation: 'Lưu trú',
  dining: 'Ăn uống',
  activities: 'Hoạt động',
}

function categoryLabel(category) {
  return CATEGORY_LABEL[category] || category
}

function missingLabel(item, resolveName) {
  if (CATEGORY_LABEL[item]) return CATEGORY_LABEL[item]
  const indexed = String(item).match(/^([a-zA-Z]+)\[(\d+)\]$/)
  if (indexed) return `${categoryLabel(indexed[1])} #${Number(indexed[2]) + 1}`
  return resolveName ? resolveName(item) : item
}

function hasCostEvaluation(costEvaluation) {
  return Boolean(
    costEvaluation &&
    (costEvaluation.breakdown != null ||
      costEvaluation.known_total != null ||
      costEvaluation.missing_costs != null)
  )
}

export default function CostSummary({ plan, costEvaluation, resolveName }) {
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
        Chi phí dự kiến
      </h3>

      <div className="total-box">
        <span className="cost-total-label">{complete ? 'Tổng' : 'Tổng đã biết'}</span>
        <strong className="cost-total-value">
          {total == null ? (
            'Chưa xác minh'
          ) : (
            <>
              {Number(total).toLocaleString('en-US')} <small>VND</small>
            </>
          )}
        </strong>
      </div>

      <CostProjection projection={evaluation?.projection} />
      {budget != null && (
        <div className="cost-breakdown">
          <div className="cost-row">
            <span className="cost-category">Ngân sách của bạn</span>
            <span>{fmtMoney(budget)}</span>
          </div>
          {remaining != null && (
            <div className="cost-row">
              <span className="cost-category">
                {remaining >= 0 ? 'Còn lại sau chi phí đã biết' : 'Vượt ngân sách'}
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
            Chỉ hiển thị chi phí đã biết. Chưa xác minh: {missing.map((item) => missingLabel(item, resolveName)).join(', ')} (không tính là 0).
          </span>
        </p>
      )}

      {breakdown && (
        <div className="cost-breakdown">
          {Object.entries(breakdown).map(([category, amount]) => (
            <div key={category} className="cost-row">
              <span className="cost-category">{categoryLabel(category)}</span>
              <span className={amount == null ? 'unverified' : ''}>{fmtMoney(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
