import {
  collectTravelLegs,
  getRoutingEvidence,
  resolvePlaceName,
} from '../../services/api.js'
import Icon from '../common/Icon.jsx'

function placeName(placeId, placesById) {
  return resolvePlaceName(placeId, placesById) || 'Unknown place'
}

function dayNumber(day, index) {
  return Number(day?.dayNumber ?? day?.day) || index + 1
}

export default function RouteOverview({ plan, placesById }) {
  const days = (Array.isArray(plan?.days) ? plan.days : [])
    .map((day, index) => ({
      day,
      number: dayNumber(day, index),
      stops: (Array.isArray(day?.activities) ? day.activities : [])
        .map((activity) => placeName(activity?.placeId, placesById)),
    }))
    .filter((day) => day.stops.length > 0)

  if (days.length === 0) return null

  const evidence = getRoutingEvidence(plan)
  const legs = collectTravelLegs(plan)
  const total = evidence.available && evidence.total > 0 ? evidence.total : legs.length
  const verified = evidence.available && evidence.total > 0
    ? evidence.verified
    : legs.filter((leg) => leg.durationMin != null || leg.distanceKm != null).length
  const unverified = Math.max(0, total - verified)
  const status = !evidence.available
    ? 'Route verification not available'
    : total === 0
      ? 'No travel legs to verify'
      : `${verified} of ${total} legs verified`

  return (
    <details className="route-overview selected-wide">
      <summary className="route-overview-summary">
        <span className="route-overview-icon" aria-hidden="true">
          <Icon name="route" size={19} />
        </span>
        <span className="route-overview-copy">
          <span className="route-overview-title">Route overview</span>
          <span className="route-overview-sub">Travel legs by day</span>
        </span>
        <span className={`route-overview-status${unverified > 0 ? ' is-unverified' : ''}`}>
          {status}
        </span>
        <Icon name="chevronDown" size={17} className="route-overview-chevron" />
      </summary>

      <div className="route-overview-body">
        <p className="route-overview-note">
          A short stop sequence only. Times, prices, and activity details stay in the itinerary
          above.
        </p>

        <div className="route-days">
          {days.map(({ number, stops }) => (
            <div className="route-day" key={number}>
              <div className="route-day-head">
                <h3>Day {number}</h3>
                <span>{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span>
              </div>
              <ol className="route-overview-stops">
                {stops.map((name, index) => (
                  <li className="route-overview-stop" key={`${number}-${index}-${name}`}>
                    <span className="route-overview-stop-index" aria-hidden="true">{index + 1}</span>
                    <span>{name}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        {unverified > 0 && (
          <p className="route-overview-warning">
            <Icon name="alert" size={14} />
            Unverified legs do not have confirmed travel time or distance. Check them on the map
            before you go.
          </p>
        )}
      </div>
    </details>
  )
}
