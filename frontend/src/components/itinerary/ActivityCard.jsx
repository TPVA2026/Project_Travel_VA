import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

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
  const name = activity.name || activity.placeId || 'Unnamed Activity'

  const formattedCost = isUnknownCost
    ? 'Unverified'
    : rawCost === 0
      ? 'Free'
      : fmtMoney(rawCost)

  return (
    <div className="activity-item">
      {travelLeg && (
        <div className="tl-leg">
          <Icon name="bus" size={14} />
          <span className="tl-leg-text">
            {travelLeg.durationMin != null ? `${travelLeg.durationMin} min` : 'Travel time unverified'}
            {travelLeg.distanceKm != null && ` · ${travelLeg.distanceKm} km`}
          </span>
        </div>
      )}

      <div className={`activity-card ${cardTypeClass}`}>
        <div className="activity-header">
          <span className="activity-time" title="Activity time">
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

        <div className="activity-cost">
          <span className="muted small">Cost</span>
          <span className={isUnknownCost ? 'unverified' : 'cost-value'}>{formattedCost}</span>
        </div>
      </div>
    </div>
  )
}
