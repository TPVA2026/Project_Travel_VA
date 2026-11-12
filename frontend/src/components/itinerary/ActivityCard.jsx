import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

const TYPE_LABEL = {
  dining: 'Ăn uống',
  meal: 'Ăn uống',
  sightseeing: 'Tham quan',
  attraction: 'Tham quan',
}

const COST_STATUS_LABEL = {
  KNOWN: 'Đã xác minh',
  UNVERIFIED: 'Chưa xác minh',
  NO_DATA: 'Chưa có dữ liệu',
}

function costStatusClass(status) {
  return String(status || 'NO_DATA').toLowerCase().replace('_', '-')
}

function travelLegLabel(travelLeg) {
  const duration =
    travelLeg?.durationMin != null ? `${travelLeg.durationMin} phút` : 'Chưa rõ thời gian'
  const distance = travelLeg?.distanceKm != null ? `${travelLeg.distanceKm} km` : null
  return [duration, distance].filter(Boolean).join(' · ')
}

export default function ActivityCard({ activity, place, travelLeg }) {
  if (!activity) return null

  const isSightseeing = activity.type === 'sightseeing' || activity.type === 'attraction'
  const isDining = activity.type === 'dining' || activity.type === 'meal'
  const rawCost = activity.cost ?? activity.estimatedCostVnd
  const costStatus = activity.costStatus || (rawCost == null ? 'NO_DATA' : 'KNOWN')
  const costStatusLabel = COST_STATUS_LABEL[costStatus] || costStatus

  const typeLabel = TYPE_LABEL[activity.type] || activity.type || 'Hoạt động'
  const typeIcon = isDining ? 'utensils' : isSightseeing ? 'landmark' : 'mapPin'
  const cardTypeClass = isDining
    ? 'activity-card-dining'
    : isSightseeing
      ? 'activity-card-attraction'
      : ''
  const badgeClass = isDining
    ? 'badge-dining'
    : isSightseeing
      ? 'badge-sightseeing'
      : 'badge-general'

  const startTime = activity.start || activity.startTime || '--:--'
  const endTime = activity.end || activity.endTime || '--:--'
  const name = place?.name || activity.name || 'Địa điểm chưa có tên'
  const openingHours = place?.openingHours || null
  const referencePrice = place?.priceDisplay || null
  const formattedCost =
    rawCost == null
      ? referencePrice
        ? `${referencePrice} (tham khảo)`
        : 'Chưa có dữ liệu'
      : costStatus === 'KNOWN' && rawCost === 0
        ? 'Miễn phí'
        : fmtMoney(rawCost)

  return (
    <div className="activity-item">
      {travelLeg && (
        <div className="tl-leg">
          <Icon name="bus" size={14} />
          <span className="tl-leg-text">{travelLegLabel(travelLeg)}</span>
        </div>
      )}

      <div
        className={`activity-card ${cardTypeClass}`}
        data-place-id={activity.placeId}
      >
        <div className="activity-header">
          <span className="activity-time" title="Giờ hoạt động">
            <Icon name="clock" size={14} />
            {startTime}–{endTime}
          </span>
          <span className={`activity-type ${badgeClass}`}>
            <Icon name={typeIcon} size={13} />
            {typeLabel}
          </span>
        </div>

        <div className="activity-name">{name}</div>

        {activity.reason && <p className="activity-desc muted small">{activity.reason}</p>}

        <div className="activity-meta">
          <span className="activity-meta-item">
            <Icon name="clock" size={13} />
            {openingHours ? `Mở cửa ${openingHours}` : 'Chưa có giờ mở cửa'}
          </span>
          <span className="activity-meta-item">
            <Icon name="wallet" size={13} />
            {formattedCost}
            <span className={`cost-status cost-status--${costStatusClass(costStatus)}`}>
              {costStatusLabel}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
