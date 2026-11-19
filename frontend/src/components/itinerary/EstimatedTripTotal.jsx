import { fmtMoney } from '../../services/mockData.js'
import { formatMissingCostItem } from '../../services/tripEstimate.js'
import Icon from '../common/Icon.jsx'

const SOURCE_BADGE = {
  known: { label: 'Known', className: 'cost-status--known' },
  estimate: { label: 'Estimated', className: 'cost-status--unverified' },
  missing: { label: 'No data', className: 'cost-status--no-data' },
}

function Amount({ value, emptyLabel = 'Not enough data' }) {
  if (value == null) return <span className="estimate-missing">{emptyLabel}</span>
  return <span>{fmtMoney(value)}</span>
}

function SourceBadge({ source }) {
  const badge = SOURCE_BADGE[source]
  if (!badge) return null
  return <span className={`cost-status ${badge.className}`}>{badge.label}</span>
}

function Row({ label, value, emptyLabel, source, emphasis = false }) {
  return (
    <div className={`estimate-row${emphasis ? ' estimate-row--emphasis' : ''}`}>
      <span className="estimate-row-label">
        {label}
        <SourceBadge source={source} />
      </span>
      {typeof value === 'string' ? (
        <strong>{value}</strong>
      ) : (
        <strong>
          <Amount value={value} emptyLabel={emptyLabel} />
        </strong>
      )}
    </div>
  )
}

export default function EstimatedTripTotal({ estimate, dayCount, resolveName }) {
  const total = estimate?.estimatedTotal
  const known = estimate?.knownTotal
  const complete = Boolean(estimate?.complete)
  const missing = (estimate?.missingCombined || [])
    .map((item) => formatMissingCostItem(item, resolveName))
    .filter(Boolean)
  const shownMissing = missing.slice(0, 4)
  const extraMissing = missing.length - shownMissing.length

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
          <span className={`estimate-status ${complete ? 'is-complete' : 'is-partial'}`}>
            {complete ? 'Complete' : 'Partial'}
          </span>
        </p>
        <h2 id="trip-estimate-title">Estimated trip total</h2>
        {total != null ? (
          <p className="trip-estimate-amount">
            {Number(total).toLocaleString('en-US')}
            <small>VND</small>
          </p>
        ) : (
          <p className="trip-estimate-amount trip-estimate-amount--unavailable">
            Not enough data
          </p>
        )}
        {total == null && known != null && (
          <p className="trip-estimate-meta">
            Known so far: {fmtMoney(known)} — the rest is missing, not zero.
          </p>
        )}
        {meta.length > 0 && <p className="trip-estimate-meta">For {meta.join(' · ')}</p>}
        <p className="trip-estimate-note">
          Known costs and clearly labelled estimates are added together. This is a planning
          estimate, not a confirmed price.
        </p>
      </div>

      <div className="trip-estimate-breakdown">
        <h3>What’s in the estimate</h3>
        <div className="estimate-rows">
          <Row label="Stay" value={estimate?.stay} source={estimate?.staySource} />
          <Row label="Transport" value={estimate?.transport} source={estimate?.transportSource} />
          <Row
            label={estimate?.diningLabel || 'Dining'}
            value={estimate?.dining}
            source={estimate?.diningSource}
          />
          <Row
            label={estimate?.knownLabel || 'Known costs · partial'}
            value={estimate?.knownTotal}
            source="known"
            emptyLabel="Not available"
            emphasis
          />
          <Row
            label="Your budget"
            value={estimate?.budget != null ? estimate.budget : 'Not set'}
          />
        </div>

        <p className="estimate-legend">
          <span className="cost-status cost-status--known">Known</span>
          <span>confirmed from sources</span>
          <span className="cost-status cost-status--unverified">Estimated</span>
          <span>from source ranges</span>
          <span className="cost-status cost-status--no-data">No data</span>
          <span>not counted as zero</span>
        </p>

        {!complete && (
          <p className="estimate-caveat">
            <Icon name="alert" size={14} />
            <span>
              Not enough data for a full total.
              {shownMissing.length > 0 && (
                <>
                  {' '}Missing: {shownMissing.join(', ')}
                  {extraMissing > 0 ? ` and ${extraMissing} more` : ''}.
                </>
              )}{' '}
              Missing amounts are never treated as zero.
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
