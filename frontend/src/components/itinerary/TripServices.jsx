import {
  collectTravelLegs,
  displayPlaceName,
  getPlanServiceItems,
  safeSourceUrl,
} from '../../services/api.js'
import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

const TRANSPORT_KINDS = [
  { tokens: ['train', 'tàu', 'tau'], icon: 'train', label: 'Tàu hỏa' },
  { tokens: ['flight', 'plane', 'máy bay', 'may bay', 'hàng không'], icon: 'plane', label: 'Máy bay' },
  { tokens: ['bus', 'coach', 'xe khách', 'xe khach'], icon: 'bus', label: 'Xe khách' },
]

function transportKind(item) {
  const text = `${item?.name || ''} ${item?.kindOfTransport || ''}`.toLocaleLowerCase('vi')
  return (
    TRANSPORT_KINDS.find((kind) => kind.tokens.some((token) => text.includes(token))) || {
      icon: 'route',
      label: 'Di chuyển',
    }
  )
}

function stayName(name) {
  if (!name) return { title: 'Chỗ nghỉ', room: null }
  const [title, room] = String(name).split(' — ')
  return { title: title || 'Chỗ nghỉ', room: room || null }
}

function serviceTitle(name) {
  return String(name || 'Di chuyển chính').replace(/\s*\((?:bus|train|flight)\)\s*$/i, '')
}

function money(value) {
  return value == null ? 'Chưa có' : fmtMoney(value)
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
  const label = sourceLabel || 'nguồn tham khảo'
  return (
    <h3 id={id} className="service-title">
      {safeUrl ? (
        <a
          className="source-name-link"
          href={safeUrl}
          target="_blank"
          rel="noreferrer noopener"
          title={`Mở nguồn: ${label}`}
          aria-label={`${title} — mở nguồn ${label}`}
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
      Đã xác minh
    </span>
  ) : (
    <span className="service-leg-status service-leg-status--unverified">
      <Icon name="alert" size={12} />
      Chưa xác minh
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
          <p className="service-kicker">Lưu trú</p>
          <ServiceTitle
            id="trip-stay-heading"
            title={item ? title : 'Chưa có dữ liệu lưu trú'}
            sourceUrl={item?.sourceUrl}
            sourceLabel={item?.source}
          />
          {item && (room || item.status) && (
            <div className="service-subline">
              {room && <span className="service-room">{room}</span>}
              {item.status === 'ESTIMATED' && (
                <span className="service-badge">Ước tính</span>
              )}
            </div>
          )}
        </div>
      </div>

      {item ? (
        <>
          <div className="service-stats">
            <Stat label="Số phòng" value={item.rooms == null ? 'Chưa có' : `${item.rooms} phòng`} />
            <Stat label="Số đêm" value={item.nights == null ? 'Chưa có' : `${item.nights} đêm`} />
            <Stat label="Đơn giá/đêm" value={money(item.unitPriceVnd)} />
            <Stat label="Tạm tính" value={money(item.amountVnd)} />
          </div>
          {isDayTrip && (
            <p className="service-hint">Chuyến trong ngày nên chưa phát sinh đêm lưu trú.</p>
          )}
          <p className="service-note">
            Giá phòng tham khảo, chưa gồm thuế/phụ phí và chưa xác nhận tình trạng phòng cho
            ngày bạn đi.
          </p>
        </>
      ) : (
        <p className="service-note">
          Backend chưa trả về chỗ nghỉ phù hợp cho lịch này. Phần chi phí lưu trú được tính là
          chưa xác minh, không phải 0.
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
          <p className="service-kicker">Di chuyển</p>
          <ServiceTitle
            id="trip-transport-heading"
            title={item ? title : 'Các chặng trong lịch trình'}
            sourceUrl={item?.sourceUrl}
            sourceLabel={item?.source}
          />
          <div className="service-subline">
            <span className="service-room">{kind.label}</span>
            {item?.status === 'ESTIMATED' && <span className="service-badge">Ước tính</span>}
          </div>
        </div>
      </div>

      {item ? (
        <>
          <div className="service-stats">
            <Stat label="Hành khách" value={item.travelers == null ? 'Chưa có' : `${item.travelers} người`} />
            <Stat label="Chiều đi" value="Một chiều" />
            <Stat label="Mỗi người" value={money(item.perPersonVnd)} />
            <Stat label="Tạm tính" value={money(item.amountVnd)} />
          </div>
          <p className="service-note">
            Giá tham khảo đã gồm phí dịch vụ; chưa gồm chiều về và trung chuyển sân bay, ga,
            bến xe.
          </p>
        </>
      ) : (
        <p className="service-note">
          Backend chưa trả về giá vé chính cho lịch này. Các chặng bên dưới chỉ là khoảng cách
          và thời gian di chuyển trong ngày, không phải giá vé.
        </p>
      )}

      <div className="service-legs-block">
        <div className="service-legs-head">
          <h4 className="service-legs-title">Các chặng trong ngày</h4>
          {legs.length > 0 && (
            <span className="service-legs-count">
              {verifiedLegs}/{legs.length} chặng đã xác minh
            </span>
          )}
        </div>

        {legs.length === 0 ? (
          <p className="service-note">
            Lịch này chưa có chặng di chuyển giữa các hoạt động.
          </p>
        ) : (
          <ul className="service-legs-list">
            {legs.map((leg, index) => {
              const verified = leg.durationMin != null || leg.distanceKm != null
              const duration =
                leg.durationMin != null ? `${leg.durationMin} phút` : 'Chưa rõ thời gian'
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
                      {leg.dayNumber != null && `Ngày ${leg.dayNumber} · `}
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
          <p className="page-eyebrow">Lưu trú & di chuyển</p>
          <h2 id="trip-services-heading" className="services-title">
            Chỗ nghỉ và cách di chuyển
          </h2>
          <p className="muted small">
            Thông tin backend trả về cho đúng lịch này. Giá và tình trạng còn cần xác nhận trước
            khi đặt.
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
