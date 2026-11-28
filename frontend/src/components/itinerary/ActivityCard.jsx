import { useRef, useState } from 'react'
import { fmtMoney } from '../../services/mockData.js'
import { safeSourceUrl } from '../../services/api.js'
import { getPlaceImageUrl } from '../../services/placeImages.js'
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

function formatConnectorMeta(travelLeg) {
  if (!travelLeg || typeof travelLeg !== 'object') return null
  const rawMinutes = travelLeg.durationMin ?? travelLeg.travel_minutes
  const rawDistance = travelLeg.distanceKm ?? travelLeg.distance_km
  const minutes = rawMinutes != null && Number.isFinite(Number(rawMinutes)) && Number(rawMinutes) >= 0
    ? Math.round(Number(rawMinutes))
    : null
  const distance = rawDistance != null && Number.isFinite(Number(rawDistance)) && Number(rawDistance) >= 0
    ? Number(rawDistance)
    : null
  const parts = []
  if (minutes != null) parts.push(`${minutes} min`)
  if (distance != null) parts.push(`${Number(distance.toFixed(1))} km`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function buildGoogleMapsUrl(name, place, activity, destinationLabel) {
  const lat = place?.lat ?? place?.latitude ?? activity?.lat ?? activity?.latitude
  const lng = place?.lng ?? place?.longitude ?? activity?.lng ?? activity?.longitude
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
  }
  const locationHint = place?.address || place?.city || destinationLabel || ''
  const query = [name, locationHint].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || 'Vietnam')}`
}

export default function ActivityCard({
  activity,
  place,
  travelLeg,
  showConnector = Boolean(travelLeg),
  destinationLabel,
  source,
  editMode,
  onEditStop,
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewAbove, setPreviewAbove] = useState(false)
  const nameAnchorRef = useRef(null)
  if (!activity) return null

  const isSightseeing = activity.type === 'sightseeing' || activity.type === 'attraction'
  const isDining = activity.type === 'dining' || activity.type === 'meal'
  const canEdit = Boolean(editMode && onEditStop && (isSightseeing || isDining))
  const previewImage = getPlaceImageUrl(activity.placeId)

  function openPreview() {
    if (!previewImage) return
    const rect = nameAnchorRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setPreviewAbove(spaceBelow < 260 && spaceAbove > spaceBelow)
    }
    setPreviewOpen(true)
  }
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
  const connectorMeta = formatConnectorMeta(travelLeg)
  const mapsUrl = buildGoogleMapsUrl(name, place, activity, destinationLabel)
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
      {showConnector && (
        <div className="tl-connector" aria-hidden={connectorMeta ? undefined : 'true'}>
          <span className="tl-connector-line" aria-hidden="true" />
          {connectorMeta && (
            <span className="tl-leg">
              <Icon name="bus" size={14} />
              <span className="tl-leg-text">{connectorMeta}</span>
            </span>
          )}
        </div>
      )}

      <div
        className={`activity-card ${cardTypeClass}${canEdit ? ' is-editable' : ''}`}
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
          <span
            ref={nameAnchorRef}
            className="activity-name-anchor"
            onMouseEnter={openPreview}
            onMouseLeave={() => setPreviewOpen(false)}
            onFocusCapture={openPreview}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setPreviewOpen(false)
            }}
          >
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
            {previewImage && previewOpen && (
              <div
                className={`activity-hover-preview${previewAbove ? ' is-above' : ''}`}
                aria-hidden="true"
              >
                <img
                  src={previewImage}
                  alt=""
                  loading="lazy"
                  onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
                />
                <span className="activity-hover-preview-name">{name}</span>
              </div>
            )}
          </span>
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
          <a
            className="activity-maps-link"
            href={mapsUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${name} in Google Maps`}
          >
            Maps <span aria-hidden="true">↗</span>
          </a>
        </div>

        {canEdit && (
          <div className="activity-edit-row">
            <button
              type="button"
              className="activity-edit-btn"
              onClick={() => onEditStop(activity)}
            >
              <Icon name="swap" size={14} />
              Change stop
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
