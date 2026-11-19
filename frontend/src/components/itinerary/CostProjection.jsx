import { fmtMoney } from '../../services/mockData.js'

export default function CostProjection({ projection, compact = false }) {
  if (!projection) return null
  const estimatedItems = (projection.items || []).filter(
    (item) => item.category !== 'accommodation' && item.category !== 'transport'
  )
  return (
    <div className="cost-breakdown" aria-label="Cost estimate">
      <p><strong>Estimated total: {fmtMoney(projection.subtotalVnd)}</strong></p>
      <p className="muted">
        Includes known costs and estimates; this is not a verified price. Source links sit next
        to each place in the schedule.
      </p>
      {!compact && estimatedItems.length > 0 && estimatedItems.map((item, index) => (
        <div className="cost-row" key={`${item.category}-${item.activityId || index}`}>
          <span>{item.name} · estimated</span>
          <span>{fmtMoney(item.amountVnd)}</span>
        </div>
      ))}
      {projection.uncovered?.length > 0 && <p className="cost-warning">Not included — missing data: {projection.uncovered.join(', ')}. Missing amounts are not counted as zero.</p>}
      {!compact && projection.assumptions?.length > 0 && <details><summary>Estimate assumptions</summary><ul>{projection.assumptions.map(note => <li key={note}>{note}</li>)}</ul></details>}
    </div>
  )
}
