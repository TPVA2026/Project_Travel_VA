import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

function Amount({ value, emptyLabel = 'Not included' }) {
  if (value == null) return <span className="estimate-missing">{emptyLabel}</span>
  return <span>{fmtMoney(value)}</span>
}

function Row({ label, value, emptyLabel, emphasis = false }) {
  return (
    <div className={`estimate-row${emphasis ? ' estimate-row--emphasis' : ''}`}>
      <span>{label}</span>
      {typeof value === 'string' ? <strong>{value}</strong> : <strong><Amount value={value} emptyLabel={emptyLabel} /></strong>}
    </div>
  )
}

export default function EstimatedTripTotal({ estimate, dayCount }) {
  const total = estimate?.estimatedTotal
  const meta = []
  if (estimate?.travelers != null) {
    meta.push(`${estimate.travelers} ${estimate.travelers === 1 ? 'traveler' : 'travelers'}`)
  }
  if (dayCount > 0) meta.push(`${dayCount} ${dayCount === 1 ? 'day' : 'days'}`)

  return (
    <section className="trip-estimate selected-wide" aria-labelledby="trip-estimate-title">
      <div className="trip-estimate-total">
        <p className="trip-estimate-kicker">
          <Icon name="wallet" size={15} />
          Planning estimate
        </p>
        <h2 id="trip-estimate-title">Estimated trip total</h2>
        {total != null ? (
          <p className="trip-estimate-amount">
            {Number(total).toLocaleString('en-US')}
            <small>VND</small>
          </p>
        ) : (
          <p className="trip-estimate-amount trip-estimate-amount--unavailable">Estimate unavailable</p>
        )}
        {meta.length > 0 && <p className="trip-estimate-meta">For {meta.join(' · ')}</p>}
        <p className="trip-estimate-note">
          Planning estimate, not a confirmed price. Some costs may be excluded.
        </p>
      </div>

      <div className="trip-estimate-breakdown">
        <h3>What’s in the estimate</h3>
        <div className="estimate-rows">
          <Row label="Stay" value={estimate?.stay} />
          <Row label="Transport" value={estimate?.transport} />
          <Row label={estimate?.diningLabel || 'Dining'} value={estimate?.dining} />
          <Row label={estimate?.knownLabel || 'Known costs · partial'} value={estimate?.knownTotal} emptyLabel="Not available" emphasis />
          <Row
            label="Your budget"
            value={estimate?.budget != null ? estimate.budget : 'Not set'}
          />
        </div>
        {!estimate?.complete && (
          <p className="estimate-caveat">
            <Icon name="alert" size={14} />
            Some costs are not included yet. Missing data is not treated as free.
          </p>
        )}
      </div>
    </section>
  )
}
