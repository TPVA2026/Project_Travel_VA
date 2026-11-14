import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  candidateStatusLabel,
  getCandidateCost,
  getCandidateRanking,
  getCandidateWarnings,
  getRoutingEvidence,
  groupEvaluationReasons,
  normalizeCandidateStatus,
  resolveDestinationName,
} from '../../services/api.js'
import {
  getDestinationImage,
  getDestinationLabel,
} from '../../services/destinationImages.js'
import { fmtMoney } from '../../services/mockData.js'
import { compareCandidatePlans, sharedDestination } from '../../services/planComparison.js'
import Icon from '../common/Icon.jsx'

function money(value) {
  return value == null ? 'Unverified' : fmtMoney(value)
}

function statusClass(status) {
  return `badge badge-${normalizeCandidateStatus(status)}`
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function RankingLine({ ranking }) {
  if (ranking.kind === 'ranked') {
    return (
      <p className="plan-note">
        <Icon name="star" size={15} />
        <span>
          Rank #{ranking.position}
          {ranking.score100 != null ? ` · ${Number(ranking.score100).toFixed(1)}/100` : ''}
        </span>
      </p>
    )
  }
  if (ranking.kind === 'unscored') {
    return (
      <p className="plan-note plan-note--warn">
        <Icon name="info" size={15} />
        <span>Eligible, but missing data to score the ranking.</span>
      </p>
    )
  }
  if (ranking.kind === 'excluded') {
    return (
      <p className="plan-note plan-note--warn">
        <Icon name="info" size={15} />
        <span>Not ranked yet — unverified plans are shown without a score.</span>
      </p>
    )
  }
  return null
}

function CostLine({ cost }) {
  return (
    <>
      <div className="card-cost-row">
        <span className="cost-label">{cost.complete ? 'Total cost' : 'Known total'}</span>
        <strong className="card-cost">{money(cost.knownTotal)}</strong>
      </div>
      {cost.missing.length > 0 && (
        <p className="unverified-line" role="status">
          <Icon name="alert" size={15} />
          <span>
            Unverified {countLabel(cost.missing.length, 'cost item')}
          </span>
        </p>
      )}
    </>
  )
}

function RoutingLine({ evidence }) {
  if (!evidence.available || evidence.total === 0) return null
  const kind = evidence.unverified > 0 ? 'plan-note plan-note--warn' : 'plan-note'
  return (
    <p className={kind}>
      <Icon name="route" size={15} />
      <span>
        Route: {evidence.verified}/{evidence.total} legs verified
        {evidence.unverified > 0 ? ` · ${evidence.unverified} legs need checking` : ''}
      </span>
    </p>
  )
}

function CardRoutePreview({ entry }) {
  if (entry.routes.length === 0) return null
  return (
    <details className="card-route">
      <summary className="card-route-summary">
        <Icon name="route" size={15} />
        <span>Route preview</span>
        <Icon name="chevronDown" size={15} className="card-route-chevron" />
      </summary>
      <div className="card-route-body">
        {entry.routes.map((day) => (
          <div className="card-route-day" key={day.dayNumber}>
            <span className="card-route-day-label">Day {day.dayNumber}</span>
            <ol className="card-route-stops">
              {day.stops.map((stop) => (
                <li key={`${day.dayNumber}-${stop.activityId}`}>
                  <span className="card-route-time">{stop.startTime}</span>
                  <span className="card-route-name">{stop.name}</span>
                  {stop.unique && <span className="card-route-unique">Only here</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </details>
  )
}

function CandidateCard({
  candidate,
  entry,
  ranking,
  selected,
  placesById,
  onSelect,
  showDifference,
}) {
  const status = normalizeCandidateStatus(candidate.status)
  const plan = candidate.plan || {}
  const cost = getCandidateCost(candidate)
  const routing = getRoutingEvidence(candidate)
  const warnings = getCandidateWarnings(candidate, ranking)
  const rank = getCandidateRanking(ranking, candidate.planId || plan.planId)
  const groups = groupEvaluationReasons(candidate.evaluation, ranking, candidate.planId || plan.planId)
  const unresolved = groups
    .filter((group) => group.key !== 'cost' && group.key !== 'routing')
    .reduce((count, group) => count + group.reasons.length, 0)
  const resolvedDestination = resolveDestinationName(plan.destinationId, placesById)
  const destination =
    getDestinationLabel(plan.destinationId, resolvedDestination, plan.title) ||
    resolvedDestination ||
    plan.destinationId
  const image =
    plan.image ||
    getDestinationImage(plan.destinationId, destination, plan.title)
  const isInfeasible = status === 'INFEASIBLE'
  const isRecommended = status === 'FEASIBLE' && rank.kind === 'ranked'
  const activityCount =
    plan.days?.reduce((count, day) => count + (day.activities?.length || 0), 0) || 0
  const detailUrl = `/selected?id=${encodeURIComponent(candidate.planId || plan.planId)}`

  return (
    <article className={`card plan-card ${selected ? 'plan-card--selected' : ''}`}>
      <div className="img-wrap candidate-img-wrap">
        {image && (
          <img
            src={image}
            alt={`${destination} landscape`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        <div className="card-badges">
          <span className={statusClass(status)} data-testid={`candidate-status-${candidate.planId}`}>
            {candidateStatusLabel(status)}
          </span>
          {isRecommended && (
            <span className="badge badge-suggested" data-testid={`candidate-recommended-${candidate.planId}`}>
              <Icon name="sparkle" size={13} />
              Suggested
            </span>
          )}
        </div>
        {selected && (
          <div className="card-selected-ribbon">
            <Icon name="check" size={14} />
            Selected
          </div>
        )}
      </div>

      <div className="card-body">
        <span className="card-index-label">Option {entry.index + 1}</span>
        <h3 className="card-destination">{destination || plan.destinationId}</h3>
        {plan.title && <p className="card-title">{plan.title}</p>}

        {showDifference && (
          <p className={`card-difference card-difference--${entry.differenceType}`}>
            <Icon name={entry.differenceType === 'unique' ? 'sparkle' : 'route'} size={14} />
            <span>{entry.difference}</span>
          </p>
        )}

        <div className="card-meta" aria-label="Trip summary">
          <span>
            <Icon name="calendar" size={16} />
            {plan.days?.length || 0} {plan.days?.length === 1 ? 'day' : 'days'}
          </span>
          <span>
            <Icon name="landmark" size={16} />
            {activityCount} {activityCount === 1 ? 'activity' : 'activities'}
          </span>
          <span>
            <Icon name="utensils" size={16} />
            {entry.mix.meals} {entry.mix.meals === 1 ? 'meal' : 'meals'}
          </span>
        </div>

        <div className="card-details">
          <RankingLine ranking={rank} />
          <CostLine cost={cost} />
          <RoutingLine evidence={routing} />

          {isInfeasible && warnings.length > 0 && (
            <p className="plan-note plan-note--danger">
              <Icon name="alert" size={15} />
              <span>Breaks trip constraints</span>
            </p>
          )}
          {!isInfeasible && unresolved > 0 && (
            <p className="unverified-line" role="status">
              <Icon name="alert" size={15} />
              <span>{unresolved} unverified {unresolved === 1 ? 'item' : 'items'}</span>
            </p>
          )}
        </div>

        <CardRoutePreview entry={entry} />

        <div className="card-footer-action">
          <div className="card-action-buttons">
            <button
              type="button"
              className={`btn btn-sm ${
                selected ? 'btn-selected-active' : isInfeasible ? 'btn-disabled' : 'btn-outline'
              }`}
              disabled={isInfeasible}
              title={
                isInfeasible
                  ? 'Cannot choose an infeasible plan. Adjust your request first.'
                  : selected
                    ? 'This plan is selected for your trip'
                    : 'Choose this plan for your trip'
              }
              onClick={() => onSelect?.(candidate)}
            >
              {selected ? (
                <>
                  <Icon name="check" size={15} />
                  Selected
                </>
              ) : (
                'Choose this plan'
              )}
            </button>
            <Link className="btn btn-sm btn-primary" to={detailUrl}>
              {selected ? 'Open details' : 'View details'}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

function ComparisonMatrix({ entries }) {
  const [differencesOnly, setDifferencesOnly] = useState(false)
  const rows = useMemo(() => {
    const status = entries.map((entry) =>
      candidateStatusLabel(normalizeCandidateStatus(entry.candidate.status))
    )
    const costValues = entries.map((entry) => {
      const cost = getCandidateCost(entry.candidate)
      return {
        display: money(cost.knownTotal),
        detail: cost.missing.length
          ? `${countLabel(cost.missing.length, 'cost item')} unverified`
          : 'All costs known',
        key: `${cost.knownTotal ?? 'unknown'}|${cost.missing.length}`,
      }
    })
    const stopValues = entries.map((entry) => ({
      display: countLabel(entry.totalStops, 'stop'),
      detail: entry.dayStats.length
        ? entry.dayStats
            .map((day) => `Day ${day.dayNumber}: ${countLabel(day.count, 'stop')}`)
            .join(' · ')
        : 'No days planned',
      key: `${entry.totalStops}|${entry.dayStats.map((day) => day.count).join(',')}`,
    }))
    const mixValues = entries.map((entry) => ({
      display: `${entry.mix.sights} sights`,
      detail: `${countLabel(entry.mix.meals, 'meal')}`,
      key: `${entry.mix.sights}|${entry.mix.meals}`,
    }))
    const legValues = entries.map((entry) => {
      const route = getRoutingEvidence(entry.candidate)
      const checked = route.available && route.total > 0
      return {
        display: checked ? `${route.verified}/${route.total} legs` : 'Not checked',
        detail: checked
          ? `${route.unverified} need checking`
          : 'Routing evidence unavailable',
        key: `${checked}|${route.verified}|${route.total}`,
      }
    })
    const routeValues = entries.map((entry) => {
      if (entry.uniqueNames.length > 0) {
        return {
          display: countLabel(entry.uniqueNames.length, 'unique stop'),
          detail:
            entry.uniqueNames.slice(0, 3).join(', ') +
            (entry.uniqueNames.length > 3 ? '…' : ''),
          key: `${entry.differenceType}|${entry.sequence}`,
        }
      }
      const sameStops = entries.find(
        (other) => other !== entry && other.placeSet === entry.placeSet
      )
      const display =
        entry.differenceType === 'order'
          ? 'Different order'
          : entry.differenceType === 'same'
            ? 'Same route'
            : 'Different stops'
      const detail =
        entry.differenceType === 'order' && sameStops
          ? `Same stops as Option ${sameStops.index + 1}`
          : entry.differenceType === 'same'
            ? 'Same sequence as another plan'
            : 'Different set of stops'
      return {
        display,
        detail,
        key: `${entry.differenceType}|${entry.sequence}`,
      }
    })

    const makeRow = (key, label, values) => ({
      key,
      label,
      values,
      differs: new Set(values.map((value) => value.key)).size > 1,
    })

    return [
      makeRow(
        'status',
        'Status',
        status.map((label) => ({ display: label, detail: '', key: label }))
      ),
      makeRow('cost', 'Known cost', costValues),
      makeRow('stops', 'Stops', stopValues),
      makeRow('mix', 'Sights & meals', mixValues),
      makeRow('legs', 'Route check', legValues),
      makeRow('route', 'Route difference', routeValues),
    ]
  }, [entries])
  const differentRowCount = rows.filter((row) => row.differs).length
  const visibleRows = differencesOnly
    ? rows.filter((row) => row.differs)
    : rows

  return (
    <div className="compare-matrix-block">
      <div className="compare-matrix-head">
        <h3>At a glance</h3>
        <div className="compare-matrix-tools">
          <p className="muted small" aria-live="polite">
            {differentRowCount === 1
              ? '1 row differs.'
              : `${differentRowCount} rows differ.`}
          </p>
          <div className="compare-view-toggle" role="group" aria-label="Comparison details">
            <button
              type="button"
              aria-pressed={!differencesOnly}
              onClick={() => setDifferencesOnly(false)}
            >
              All details
            </button>
            <button
              type="button"
              data-testid="compare-differences-only"
              aria-pressed={differencesOnly}
              disabled={differentRowCount === 0}
              onClick={() => setDifferencesOnly(true)}
            >
              Differences only
            </button>
          </div>
        </div>
      </div>
      <div
        className="compare-matrix-wrap"
        role="region"
        aria-label="Side-by-side plan comparison"
        tabIndex={0}
      >
        <table className="compare-matrix">
          <thead>
            <tr>
              <th scope="col">Compare</th>
              {entries.map((entry) => (
                <th scope="col" key={entry.id}>
                  Option {entry.index + 1}
                  <span className="compare-matrix-title">
                    {entry.plan.title || entry.plan.destinationId}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.key}
                className={row.differs ? 'compare-row--differs' : undefined}
              >
                <th scope="row">
                  <span className="compare-row-label">{row.label}</span>
                  {row.differs && <span className="compare-diff-tag">Differs</span>}
                </th>
                {row.values.map((value, index) => (
                  <td key={`${entries[index].id}-${row.key}`}>
                    <span className="compare-value">{value.display}</span>
                    {value.detail && (
                      <span className="compare-value-detail">{value.detail}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="compare-matrix-hint muted small">
        Swipe to compare every option.
      </p>
    </div>
  )
}

function DayByDayComparison({ entries }) {
  const dayNumbers = [
    ...new Set(entries.flatMap((entry) => entry.dayStats.map((day) => day.dayNumber))),
  ].sort((a, b) => a - b)
  const [activeDay, setActiveDay] = useState(dayNumbers[0] || 1)
  const selectedDay = dayNumbers.includes(activeDay) ? activeDay : dayNumbers[0]
  if (dayNumbers.length === 0) return null
  const hasUnique = entries.some((entry) =>
    entry.routes.some((day) => day.stops.some((stop) => stop.unique))
  )
  const selectedStopCount = entries.reduce(
    (total, entry) =>
      total + (entry.dayStats.find((day) => day.dayNumber === selectedDay)?.count || 0),
    0
  )

  return (
    <details className="route-compare" open>
      <summary className="route-compare-summary">
        <span className="route-compare-summary-main">
          <Icon name="route" size={16} />
          Routes by day
        </span>
        <span className="route-compare-summary-meta muted small">
          {entries.length} plans · {dayNumbers.length} {dayNumbers.length === 1 ? 'day' : 'days'}
        </span>
        <Icon name="chevronDown" size={18} className="route-compare-chevron" />
      </summary>
      <div className="route-compare-body">
        <div className="route-day-controls" role="group" aria-label="Choose a day to compare">
          {dayNumbers.map((dayNumber) => {
            const stopCount = entries.reduce(
              (total, entry) =>
                total +
                (entry.dayStats.find((day) => day.dayNumber === dayNumber)?.count || 0),
              0
            )
            return (
              <button
                type="button"
                key={dayNumber}
                data-day-number={dayNumber}
                aria-pressed={selectedDay === dayNumber}
                className="route-day-button"
                onClick={() => setActiveDay(dayNumber)}
              >
                <span>Day {dayNumber}</span>
                <span className="route-day-count">{countLabel(stopCount, 'stop')}</span>
              </button>
            )
          })}
        </div>
        <h4 className="route-compare-day-title">
          Day {selectedDay}
          <span>{countLabel(selectedStopCount, 'stop')} across all plans</span>
        </h4>
        {hasUnique && (
          <p className="route-compare-legend muted small">
            Stops marked <span className="route-stop-unique">Unique</span> appear in no
            other plan.
          </p>
        )}
        <div className="route-compare-days">
          <section className="route-compare-day" key={selectedDay}>
            <div className="route-compare-columns">
              {entries.map((entry) => {
                const route = entry.routes.find((day) => day.dayNumber === selectedDay)
                return (
                  <div className="route-compare-column" key={`${entry.id}-${selectedDay}`}>
                    <span className="route-compare-column-label">
                      Option {entry.index + 1}
                    </span>
                    {route && route.stops.length > 0 ? (
                      <ol className="route-stop-list">
                        {route.stops.map((stop) => (
                          <li
                            className={stop.unique ? 'route-stop route-stop--unique' : 'route-stop'}
                            key={`${entry.id}-${stop.activityId}`}
                          >
                            <span className="route-stop-time">{stop.startTime}</span>
                            <span className="route-stop-name">{stop.name}</span>
                            {stop.unique && (
                              <span className="route-stop-unique">Unique</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="route-stop-empty muted small">No stops planned.</p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </details>
  )
}

export default function CandidateComparison({
  candidates,
  ranking,
  selectedPlanId,
  placesById,
  onSelectPlan,
}) {
  const entries = useMemo(
    () => compareCandidatePlans(candidates, placesById),
    [candidates, placesById]
  )

  if (entries.length === 0) {
    return <p className="muted">No itineraries to compare.</p>
  }

  const sameDestination = sharedDestination(entries)
  const destinationName = sameDestination
    ? getDestinationLabel(sameDestination) || sameDestination
    : ''
  const sameDestinationPlans = sameDestination && entries.length > 1
  const heading = sameDestinationPlans
    ? `${entries.length} ways to see ${destinationName}`
    : entries.length === 1
      ? '1 itinerary from the assistant'
      : `${entries.length} itineraries to compare`
  const subcopy = sameDestinationPlans
    ? 'Every option covers the same destination. Compare the stops, route order, and pace to see how they differ.'
    : 'Choose a plan and open its details to see the full backend checks and warnings.'

  return (
    <section className="results-list" aria-labelledby="candidate-results-heading">
      <div className="section-head">
        <div>
          <h2 id="candidate-results-heading">{heading}</h2>
          <p className="muted">{subcopy}</p>
        </div>
        <span className="count-pill">
          <Icon name="route" size={15} />
          {entries.length} {entries.length === 1 ? 'plan' : 'plans'}
          {sameDestinationPlans ? ` · ${destinationName}` : ''}
        </span>
      </div>

      {sameDestinationPlans && (
        <p className="same-destination-note">
          <Icon name="info" size={15} />
          <span>
            Same destination, different plans — the route previews below show exactly which
            stops and days change.
          </span>
        </p>
      )}

      {entries.length > 1 && (
        <>
          <ComparisonMatrix entries={entries} />
          <DayByDayComparison entries={entries} />
        </>
      )}

      <div className="cards plan-comparison-grid">
        {entries.map((entry) => (
          <CandidateCard
            key={entry.id}
            candidate={entry.candidate}
            entry={entry}
            ranking={ranking}
            selected={Boolean(selectedPlanId && selectedPlanId === entry.id)}
            placesById={placesById}
            onSelect={onSelectPlan}
            showDifference={entries.length > 1}
          />
        ))}
      </div>
    </section>
  )
}
