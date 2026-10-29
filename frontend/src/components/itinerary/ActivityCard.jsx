import { fmtMoney } from '../../services/mockData.js'

export default function ActivityCard({ activity, travelLeg }) {
  if (!activity) return null

  const isUnknownCost = activity.cost == null || activity.costStatus === 'NO_DATA' || activity.costStatus === 'UNVERIFIED'

  return (
    <div className="activity-item">
      {travelLeg && (
        <div className="tl-leg">
          🚌 {travelLeg.durationMin != null ? `${travelLeg.durationMin} min` : 'Travel time unverified'}
          {travelLeg.distanceKm != null && ` (${travelLeg.distanceKm} km)`}
        </div>
      )}
      <div className="activity-card">
        <div className="activity-header">
          <span className="activity-time">{activity.start || activity.startTime} – {activity.end || activity.endTime}</span>
          <span className={`activity-type badge-${activity.type || 'sightseeing'}`}>{activity.type}</span>
        </div>
        <div className="activity-name">{activity.name || activity.placeId}</div>
        {activity.reason && <div className="activity-desc muted small">{activity.reason}</div>}
        <div className="activity-cost">
          <span className="muted small">Cost: </span>
          <span className={isUnknownCost ? 'unverified' : 'cost-value'}>
            {fmtMoney(activity.cost ?? activity.estimatedCostVnd)}
          </span>
        </div>
      </div>
    </div>
  )
}
