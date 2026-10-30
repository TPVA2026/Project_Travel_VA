import { fmtMoney } from '../../services/mockData.js'

export default function ActivityCard({ activity, travelLeg }) {
  if (!activity) return null

  const isSightseeing = activity.type === 'sightseeing' || activity.type === 'attraction'
  const isDining = activity.type === 'dining' || activity.type === 'meal'
  const rawCost = activity.cost ?? activity.estimatedCostVnd
  const isUnknownCost =
    rawCost == null ||
    activity.costStatus === 'NO_DATA' ||
    activity.costStatus === 'UNVERIFIED'

  const typeLabel = isDining ? 'Dining' : isSightseeing ? 'Attraction' : activity.type || 'Activity'
  const typeIcon = isDining ? '🍽️' : isSightseeing ? '🏛️' : '📍'
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
  const name = activity.name || activity.placeId || 'Unnamed Activity'

  const formattedCost = isUnknownCost
    ? 'Unverified'
    : rawCost === 0
      ? '0 VND (Free)'
      : fmtMoney(rawCost)

  return (
    <div className="activity-item">
      {travelLeg && (
        <div className="tl-leg">
          <span className="tl-leg-icon" aria-hidden="true">🚌</span>
          <span className="tl-leg-text">
            {travelLeg.durationMin != null ? `${travelLeg.durationMin} min` : 'Travel time unverified'}
            {travelLeg.distanceKm != null && ` (${travelLeg.distanceKm} km)`}
          </span>
        </div>
      )}

      <div className={`activity-card ${cardTypeClass}`}>
        <div className="activity-header">
          <span className="activity-time" title="Activity Time">
            <span className="time-icon" aria-hidden="true">⏰</span>
            <span className="time-text">{startTime} – {endTime}</span>
          </span>
          <span className={`activity-type ${badgeClass}`}>
            <span className="type-icon" aria-hidden="true">{typeIcon}</span>
            <span className="type-label">{typeLabel}</span>
          </span>
        </div>

        <div className="activity-name">{name}</div>

        {activity.reason && (
          <div className="activity-desc muted small">{activity.reason}</div>
        )}

        <div className="activity-cost">
          <span className="muted small">Cost: </span>
          <span className={isUnknownCost ? 'unverified' : 'cost-value'}>
            {formattedCost}
          </span>
        </div>
      </div>
    </div>
  )
}
