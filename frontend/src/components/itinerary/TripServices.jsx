import { getPlanServiceItems, safeSourceUrl } from '../../services/api.js'
import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

const TRANSPORT_KINDS = [
  { tokens: ['train', 'tàu', 'tau'], icon: 'train', label: 'Train' },
  { tokens: ['flight', 'plane', 'máy bay', 'may bay', 'hàng không'], icon: 'plane', label: 'Flight' },
  { tokens: ['bus', 'coach', 'xe khách', 'xe khach'], icon: 'bus', label: 'Coach' },
]

const EXCLUDED_LABELS = {
  terminalTransfers: 'airport, station, or terminal transfers',
  return: 'return travel',
  meals: 'meals',
  taxes: 'taxes',
  fees: 'fees',
}

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

function countLabel(value, singular, plural = `${singular}s`) {
  if (value == null) return 'Not available'
  return `${value} ${Number(value) === 1 ? singular : plural}`
}

function tripTypeLabel(value) {
  if (!value) return 'Not specified'
  const labels = {
    oneWay: 'One way',
    roundTrip: 'Round trip',
    return: 'Return',
  }
  return labels[value] || String(value)
}

function excludedLabels(item) {
  if (!Array.isArray(item?.excludedCosts)) return []
  return item.excludedCosts.map((value) => EXCLUDED_LABELS[value] || String(value))
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

function StayCard({ item }) {
  const { title, room } = stayName(item?.name)
  const nights = Number(item?.nights)
  const isDayTrip = Number.isFinite(nights) && nights === 0
  const taxNote = item?.taxesIncluded === true
    ? 'Taxes and fees are included in this reference price.'
    : item?.taxesIncluded === false
      ? 'Taxes and fees are not included.'
      : 'Taxes and fees are not confirmed.'

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
            <Stat label="Rooms" value={countLabel(item.rooms, 'room')} />
            <Stat label="Nights" value={countLabel(item.nights, 'night')} />
            <Stat label="Price/night" value={money(item.unitPriceVnd)} />
            <Stat label="Estimated stay subtotal" value={money(item.amountVnd)} />
          </div>
          {isDayTrip && (
            <p className="service-hint">Day trip, so no overnight stay is added.</p>
          )}
          <p className="service-note">
            {taxNote} Availability is not confirmed for your travel dates.
          </p>
        </>
      ) : (
        <p className="service-note">
          No matching stay was found for this plan. Stay costs are not included; this is not treated
          as free.
        </p>
      )}
    </article>
  )
}

function TransportCard({ item }) {
  const kind = transportKind(item)
  const title = serviceTitle(item?.name)
  const excluded = excludedLabels(item)
  const fareNote = item?.serviceFeesIncluded === true
    ? 'Service fees are included in this reference fare.'
    : item?.serviceFeesIncluded === false
      ? 'Service fees are not included.'
      : 'Check whether service fees are included.'

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
            title={item ? title : 'No transport data'}
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
            <Stat label="Travelers" value={countLabel(item.travelers, 'person', 'people')} />
            <Stat label="Direction" value={tripTypeLabel(item.tripType)} />
            <Stat label="Per person" value={money(item.perPersonVnd)} />
            <Stat label="Estimated transport subtotal" value={money(item.amountVnd)} />
          </div>
          <p className="service-note">
            {fareNote}
            {excluded.length > 0 ? ` Not included: ${excluded.join(', ')}.` : ''}
            {' '}Availability is not confirmed for your travel dates.
          </p>
        </>
      ) : (
        <p className="service-note">
          No primary fare was found for this plan. Transport costs are not included; this is not
          treated as free.
        </p>
      )}
    </article>
  )
}

export default function TripServices({ plan }) {
  if (!plan) return null
  const { stay, transport } = getPlanServiceItems(plan)

  return (
    <section className="trip-services selected-wide" aria-labelledby="trip-services-heading">
      <div className="services-head">
        <div>
          <p className="page-eyebrow">Stay &amp; transport</p>
          <h2 id="trip-services-heading" className="services-title">
            Where you stay and how you get there
          </h2>
          <p className="muted small">
            These are reference details for this plan. Confirm prices and availability with the
            provider before booking.
          </p>
        </div>
      </div>
      <div className="services-grid">
        <StayCard item={stay} />
        <TransportCard item={transport} />
      </div>
    </section>
  )
}
