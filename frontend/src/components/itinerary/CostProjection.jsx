import { fmtMoney } from '../../services/mockData.js'

export default function CostProjection({ projection, compact = false }) {
  if (!projection) return null
  const estimatedItems = (projection.items || []).filter(
    (item) => item.category !== 'accommodation' && item.category !== 'transport'
  )
  return (
    <div className="cost-breakdown" aria-label="Dự toán tham khảo">
      <p><strong>Dự toán tham khảo: {fmtMoney(projection.subtotalVnd)}</strong></p>
      <p className="muted">
        Gồm chi phí đã biết và các khoản ước tính; chưa phải giá đã xác minh. Nguồn tham khảo
        được gắn cạnh tên địa điểm trong lịch trình.
      </p>
      {!compact && estimatedItems.length > 0 && estimatedItems.map((item, index) => (
        <div className="cost-row" key={`${item.category}-${item.activityId || index}`}>
          <span>{item.name} · ước tính</span>
          <span>{fmtMoney(item.amountVnd)}</span>
        </div>
      ))}
      {projection.uncovered?.length > 0 && <p className="cost-warning">Chưa gồm các khoản thiếu dữ liệu: {projection.uncovered.join(', ')}. Không tính phần thiếu là 0.</p>}
      {!compact && projection.assumptions?.length > 0 && <details><summary>Giả định dự toán</summary><ul>{projection.assumptions.map(note => <li key={note}>{note}</li>)}</ul></details>}
    </div>
  )
}
