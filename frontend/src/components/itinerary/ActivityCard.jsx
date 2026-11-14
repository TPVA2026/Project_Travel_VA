import { fmtMoney } from '../../services/mockData.js'
import { safeSourceUrl } from '../../services/api.js'
import Icon from '../common/Icon.jsx'

const TYPE_LABEL = {
  dining: 'Dining',
  meal: 'Dining',
  sightseeing: 'Sightseeing',
  attraction: 'Sightseeing',
}

const COST_STATUS_LABEL = {
  KNOWN: 'Verified',
  UNVERIFIED: 'Unverified',
  NO_DATA: 'No data',
}

function costStatusClass(status) {
  return String(status || 'NO_DATA').toLowerCase().replace('_', '-')
}

function travelLegLabel(travelLeg) {
  const duration =
    travelLeg?.durationMin != null ? `${travelLeg.durationMin} min` : 'Time unknown'
  const distance = travelLeg?.distanceKm != null ? `${travelLeg.distanceKm} km` : null
  return [duration, distance].filter(Boolean).join(' · ')
}

export default function ActivityCard({ activity, place, travelLeg, source }) {
  if (!activity) return null

  const isSightseeing = activity.type === 'sightseeing' || activity.type === 'attraction'
  const isDining = activity.type === 'dining' || activity.type === 'meal'
  const rawCost = activity.cost ?? activity.estimatedCostVnd
  const costStatus = activity.costStatus || (rawCost == null ? 'NO_DATA' : 'KNOWN')
  const costStatusLabel = COST_STATUS_LABEL[costStatus] || costStatus

  const typeLabel = TYPE_LABEL[activity.type] || activity.type || 'Activity'
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
  const name = place?.name || activity.name || 'Unnamed place'
  const sourceUrl = safeSourceUrl(source?.url)
  const sourceLabel = source?.label || 'source'
  const openingHours = place?.openingHours || null
  const referencePrice = place?.priceDisplay || null
  const formattedCost =
    rawCost == null
      ? referencePrice
        ? `${referencePrice} (reference)`
        : 'No data'
      : costStatus === 'KNOWN' && rawCost === 0
        ? 'Free'
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
          <span className="activity-time" title="Activity time">
            <Icon name="clock" size={14} />
            {startTime}–{endTime}
          </span>
          <span className={`activity-type ${badgeClass}`}>
            <Icon name={typeIcon} size={13} />
            {typeLabel}
          </span>
        </div>

        <div className="activity-name-row">
          {sourceUrl ? (
            <a
              className="activity-name source-name-link"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              title={`Open source: ${sourceLabel}`}
              aria-label={`${name} — open source ${sourceLabel}`}
            >
              {name}
              <Icon name="external" size={12} />
            </a>
          ) : (
            <span className="activity-name">{name}</span>
          )}
        </div>

        {activity.reason && <p className="activity-desc muted small">{activity.reason}</p>}

        <div className="activity-meta">
          <span className="activity-meta-item">
            <Icon name="clock" size={13} />
            {openingHours ? `Open ${openingHours}` : 'Opening hours unknown'}
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
