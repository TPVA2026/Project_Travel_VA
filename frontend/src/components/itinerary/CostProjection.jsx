import { fmtMoney } from '../../services/mockData.js'

export default function CostProjection({ projection, compact = false }) {
  if (!projection) return null
  const lodging = projection.items?.find(item => item.category === 'accommodation')
  return (
    <div className="cost-breakdown" aria-label="Dự toán tham khảo">
      <p><strong>Dự toán tham khảo: {fmtMoney(projection.subtotalVnd)}</strong></p>
      <p className="muted">Gồm chi phí đã biết và các khoản ước tính; chưa phải giá đã xác minh.</p>
      {lodging && <p>Lưu trú: {lodging.name} · {lodging.rooms} phòng × {lodging.nights} đêm = {fmtMoney(lodging.amountVnd)}</p>}
      {!compact && projection.items?.map((item, index) => (
        <div className="cost-row" key={`${item.category}-${item.activityId || index}`}>
          <span>{item.name} · ước tính {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Nguồn</a>}</span>
          <span>{fmtMoney(item.amountVnd)}</span>
        </div>
      ))}
      {projection.uncovered?.length > 0 && <p className="cost-warning">Chưa gồm các khoản thiếu dữ liệu: {projection.uncovered.join(', ')}. Không tính phần thiếu là 0.</p>}
      {!compact && <details><summary>Giả định dự toán</summary><ul>{projection.assumptions?.map(note => <li key={note}>{note}</li>)}</ul></details>}
      <p className="muted">Giá khách sạn chưa xác nhận theo ngày đi, thuế/phụ phí và phòng trống. Số đêm tạm tính = số ngày − 1.</p>
    </div>
  )
}
