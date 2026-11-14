import {
  collectTravelLegs,
  displayPlaceName,
  getPlanServiceItems,
  safeSourceUrl,
} from '../../services/api.js'
import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

const TRANSPORT_KINDS = [
  { tokens: ['train', 'tàu', 'tau'], icon: 'train', label: 'Train' },
  { tokens: ['flight', 'plane', 'máy bay', 'may bay', 'hàng không'], icon: 'plane', label: 'Flight' },
  { tokens: ['bus', 'coach', 'xe khách', 'xe khach'], icon: 'bus', label: 'Coach' },
]

function transportKind(item) {
  const text = `${item?.name || ''} ${item?.kindOfTransport || ''}`.toLocaleLowerCase('vi')
  return (
    TRANSPORT_KINDS.find((kind) => kind.tokens.some((token) => text.includes(token))) || {
      icon: 'route',
      label: 'Transport',
    }
  )
}

function stayName(name) {
  if (!name) return { title: 'Stay', room: null }
  const [title, room] = String(name).split(' — ')
  return { title: title || 'Stay', room: room || null }
}

function serviceTitle(name) {
  return String(name || 'Main transport').replace(/\s*\((?:bus|train|flight)\)\s*$/i, '')
}

function money(value) {
  return value == null ? 'Not available' : fmtMoney(value)
}

function Stat({ label, value }) {
  return (
    <div className="service-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ServiceTitle({ id, title, sourceUrl, sourceLabel }) {
  const safeUrl = safeSourceUrl(sourceUrl)
  const label = sourceLabel || 'source'
  return (
    <h3 id={id} className="service-title">
      {safeUrl ? (
        <a
          className="source-name-link"
          href={safeUrl}
          target="_blank"
          rel="noreferrer noopener"
          title={`Open source: ${label}`}
          aria-label={`${title} — open source ${label}`}
        >
          {title}
          <Icon name="external" size={13} />
        </a>
      ) : (
        title
      )}
    </h3>
  )
}

function LegStatus({ verified }) {
  return verified ? (
    <span className="service-leg-status service-leg-status--verified">
      <Icon name="check" size={12} />
      Verified
    </span>
  ) : (
    <span className="service-leg-status service-leg-status--unverified">
      <Icon name="alert" size={12} />
      Unverified
    </span>
  )
}

function StayCard({ item }) {
  const { title, room } = stayName(item?.name)
  const nights = Number(item?.nights)
  const isDayTrip = Number.isFinite(nights) && nights === 0
  return (
    <article className="service-card" aria-labelledby="trip-stay-heading">
      <div className="service-card-head">
        <span className="service-icon" aria-hidden="true">
          <Icon name="bed" size={19} />
        </span>
        <div className="service-heading">
          <p className="service-kicker">Stay</p>
          <ServiceTitle
            id="trip-stay-heading"
            title={item ? title : 'No stay data'}
            sourceUrl={item?.sourceUrl}
            sourceLabel={item?.source}
          />
          {item && (room || item.status) && (
            <div className="service-subline">
              {room && <span className="service-room">{room}</span>}
              {item.status === 'ESTIMATED' && (
                <span className="service-badge">Estimated</span>
              )}
            </div>
          )}
        </div>
      </div>

      {item ? (
        <>
          <div className="service-stats">
            <Stat label="Rooms" value={item.rooms == null ? 'Not available' : `${item.rooms} rooms`} />
            <Stat label="Nights" value={item.nights == null ? 'Not available' : `${item.nights} nights`} />
            <Stat label="Price/night" value={money(item.unitPriceVnd)} />
            <Stat label="Subtotal" value={money(item.amountVnd)} />
          </div>
          {isDayTrip && (
            <p className="service-hint">Day trip, so no overnight stay is added.</p>
          )}
          <p className="service-note">
            Reference room price. Taxes and fees are not included, and availability is not
            confirmed for your dates.
          </p>
        </>
      ) : (
        <p className="service-note">
          The backend did not return a matching stay for this plan. Stay costs are treated as
          unverified, not zero.
        </p>
      )}
    </article>
  )
}

function TransportCard({ item, legs, placesById }) {
  const kind = transportKind(item)
  const verifiedLegs = legs.filter(
    (leg) => leg.durationMin != null || leg.distanceKm != null
  ).length
  const title = serviceTitle(item?.name)
  return (
    <article className="service-card" aria-labelledby="trip-transport-heading">
      <div className="service-card-head">
        <span className="service-icon" aria-hidden="true">
          <Icon name={kind.icon} size={19} />
        </span>
        <div className="service-heading">
          <p className="service-kicker">Transport</p>
          <ServiceTitle
            id="trip-transport-heading"
            title={item ? title : 'Travel legs in this plan'}
            sourceUrl={item?.sourceUrl}
            sourceLabel={item?.source}
          />
          <div className="service-subline">
            <span className="service-room">{kind.label}</span>
            {item?.status === 'ESTIMATED' && <span className="service-badge">Estimated</span>}
          </div>
        </div>
      </div>

      {item ? (
        <>
          <div className="service-stats">
            <Stat label="Travelers" value={item.travelers == null ? 'Not available' : `${item.travelers} people`} />
            <Stat label="Direction" value="One way" />
            <Stat label="Per person" value={money(item.perPersonVnd)} />
            <Stat label="Subtotal" value={money(item.amountVnd)} />
          </div>
          <p className="service-note">
            Reference fare including service fees; the return leg and airport, station, or
            bus-terminal transfers are not included.
          </p>
        </>
      ) : (
        <p className="service-note">
          The backend did not return a primary fare for this plan. The legs below show daily
          distance and travel time only, not fares.
        </p>
      )}

      <div className="service-legs-block">
        <div className="service-legs-head">
          <h4 className="service-legs-title">Travel legs by day</h4>
          {legs.length > 0 && (
            <span className="service-legs-count">
              {verifiedLegs}/{legs.length} legs verified
            </span>
          )}
        </div>

        {legs.length === 0 ? (
          <p className="service-note">
            This plan has no travel legs between activities.
          </p>
        ) : (
          <ul className="service-legs-list">
            {legs.map((leg, index) => {
              const verified = leg.durationMin != null || leg.distanceKm != null
              const duration =
                leg.durationMin != null ? `${leg.durationMin} min` : 'Time unknown'
              const distance = leg.distanceKm != null ? `${leg.distanceKm} km` : null
              return (
                <li className="service-leg" key={`${leg.dayNumber || 'day'}-${index}`}>
                  <div className="service-leg-copy">
                    <span className="service-leg-route">
                      {displayPlaceName(leg.fromPlaceId, placesById)}
                      <span className="service-leg-arrow" aria-hidden="true">→</span>
                      {displayPlaceName(leg.toPlaceId, placesById)}
                    </span>
                    <span className="service-leg-meta">
                      {leg.dayNumber != null && `Day ${leg.dayNumber} · `}
                      {[duration, distance].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <LegStatus verified={verified} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </article>
  )
}

export default function TripServices({ plan, placesById }) {
  if (!plan) return null
  const { stay, transport } = getPlanServiceItems(plan)
  const legs = collectTravelLegs(plan)

  return (
    <section className="trip-services selected-wide" aria-labelledby="trip-services-heading">
      <div className="services-head">
        <div>
          <p className="page-eyebrow">Stay &amp; transport</p>
          <h2 id="trip-services-heading" className="services-title">
            Where you stay and how you get around
          </h2>
          <p className="muted small">
            Returned by the backend for this exact plan. Prices and availability still need
            confirming before you book.
          </p>
        </div>
      </div>
      <div className="services-grid">
        <StayCard item={stay} />
        <TransportCard item={transport} legs={legs} placesById={placesById} />
      </div>
    </section>
  )
}
