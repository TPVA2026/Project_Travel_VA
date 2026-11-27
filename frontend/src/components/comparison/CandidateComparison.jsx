import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  candidateStatusLabel,
  getCandidateCost,
  getCandidateRanking,
  getCandidateWarnings,
  getRoutingEvidence,
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

function columnClass(index, activeIndex) {
  if (activeIndex == null) return ''
  return index === activeIndex ? 'compare-col--active' : 'compare-col--dim'
}

function ComparisonViewControl({ differencesOnly, onChange, disabled }) {
  const containerRef = useRef(null)
  const buttonsRef = useRef([])
  const [thumb, setThumb] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    const activeButton = buttonsRef.current[differencesOnly ? 1 : 0]
    if (!container || !activeButton) return undefined

    const updateThumb = () => {
      setThumb({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }

    updateThumb()
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(updateThumb)
      observer.observe(container)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', updateThumb)
    return () => window.removeEventListener('resize', updateThumb)
  }, [differencesOnly, disabled])

  return (
    <div
      ref={containerRef}
      className="compare-view-toggle"
      role="group"
      aria-label="Comparison details"
    >
      <span
        className="compare-view-thumb"
        aria-hidden="true"
        style={{ width: `${thumb.width}px`, transform: `translateX(${thumb.left}px)` }}
      />
      <button
        ref={(node) => {
          buttonsRef.current[0] = node
        }}
        type="button"
        aria-pressed={!differencesOnly}
        onClick={() => onChange(false)}
      >
        All details
      </button>
      <button
        ref={(node) => {
          buttonsRef.current[1] = node
        }}
        type="button"
        data-testid="compare-differences-only"
        aria-pressed={differencesOnly}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        Differences only
      </button>
    </div>
  )
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
    <div className="card-cost-row">
      <span className="cost-label">
        {cost.complete ? 'Total cost' : 'Known costs · partial'}
      </span>
      <strong className="card-cost">{money(cost.knownTotal)}</strong>
    </div>
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



function BackRoutePanel({ routes, uniqueNames }) {
  const days = Array.isArray(routes) ? routes.slice(0, 2) : []
  return (
    <div className="plan-back-route" data-plan-no-flip>
      <div className="plan-back-route-head">
        <span className="plan-back-route-label">Route at a glance</span>
        {uniqueNames.length > 0 && (
          <span className="plan-back-route-count">
            {uniqueNames.length} only here
          </span>
        )}
      </div>
      {days.length > 0 ? (
        <div className="plan-back-route-days">
          {days.map((day) => (
            <div className="plan-back-day" key={day.dayNumber}>
              <span className="plan-back-day-label">Day {day.dayNumber}</span>
              <ol>
                {day.stops.slice(0, 3).map((stop) => (
                  <li key={stop.activityId} className={stop.unique ? 'is-unique' : ''}>
                    <span className="plan-back-stop-time">{stop.startTime}</span>
                    <span className="plan-back-stop-name">{stop.name}</span>
                    {stop.unique && <small>Only here</small>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <p className="plan-back-route-empty">
          Full stop-by-stop timing is in the plan details.
        </p>
      )}
    </div>
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
  active,
  focused,
  flipped,
  canFlip,
  onHover,
  onToggleFocus,
  onToggleFlip,
}) {
  const status = normalizeCandidateStatus(candidate.status)
  const plan = candidate.plan || {}
  const cost = getCandidateCost(candidate)
  const routing = getRoutingEvidence(candidate)
  const warnings = getCandidateWarnings(candidate, ranking)
  const rank = getCandidateRanking(ranking, candidate.planId || plan.planId)
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
  const uniqueNames = entry.uniqueNames || []
  const flipLabel = flipped ? 'Show plan details' : 'Show what is different'
  const frontTabIndex = flipped ? -1 : undefined
  const backTabIndex = flipped ? undefined : -1
  const handleCardClick = (event) => {
    if (!canFlip) return
    if (event.target.closest('button, a, summary, input, select, textarea, [data-plan-no-flip]')) {
      return
    }
    onToggleFlip?.()
  }
  const handleCardKeyDown = (event) => {
    if (!canFlip || event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggleFlip?.()
    }
  }

  return (
    <article
      className={`card plan-card plan-flip-card ${selected ? 'plan-card--selected' : ''} ${
        active ? 'plan-card--active' : ''
      } ${active === false ? 'plan-card--dim' : ''} ${flipped ? 'is-flipped' : ''}`}
      style={{ '--plan-flip-index': entry.index }}
      id={`compare-card-${entry.index + 1}`}
      data-testid={`plan-card-${entry.index + 1}`}
      role={canFlip ? 'group' : undefined}
      tabIndex={canFlip ? 0 : undefined}
      aria-label={canFlip ? `${destination || plan.destinationId}, option ${entry.index + 1}. ${flipLabel}.` : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={() => onHover?.(entry.index)}
      onMouseLeave={() => onHover?.(null)}
      onFocusCapture={() => onHover?.(entry.index)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHover?.(null)
      }}
    >
      <div className="plan-flip-scene">
        <div className={`plan-flip-inner ${flipped ? 'is-flipped' : ''}`}>
          <div className="plan-face plan-face-front" aria-hidden={flipped} inert={flipped ? '' : undefined}>
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
              <div className="card-index-row">
                <span className="card-index-label">Option {entry.index + 1}</span>
                <button
                  type="button"
                  className={`card-focus-button ${focused ? 'is-focused' : ''}`}
                  data-testid={`card-focus-${entry.index + 1}`}
                  aria-pressed={focused}
                  tabIndex={frontTabIndex}
                  onClick={() => onToggleFocus?.(entry.index)}
                >
                  <Icon name={focused ? 'check' : 'compass'} size={12} />
                  {focused ? 'Focused' : 'Focus'}
                </button>
              </div>
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
              </div>

              {canFlip && (
                <button
                  type="button"
                  className="plan-flip-trigger"
                  data-testid={`card-flip-${entry.index + 1}`}
                  aria-pressed={flipped}
                  aria-label={`Show what is different for option ${entry.index + 1}`}
                  tabIndex={frontTabIndex}
                  onClick={onToggleFlip}
                >
                  <span className="plan-flip-trigger-icon" aria-hidden="true">
                    <Icon name="swap" size={16} />
                  </span>
                  <span className="plan-flip-trigger-text">
                    <strong>What&apos;s different</strong>
                    <small>Compare this plan</small>
                  </span>
                  <Icon name="arrowRight" size={15} className="plan-flip-trigger-arrow" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {canFlip && (
            <div className="plan-face plan-face-back" aria-hidden={!flipped} inert={flipped ? undefined : ''}>
              <div className="plan-back-media">
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
                <div className="plan-back-media-copy">
                  <span className="card-index-label">Option {entry.index + 1} · compared</span>
                  <strong>{destination || plan.destinationId}</strong>
                  <span className={statusClass(status)}>{candidateStatusLabel(status)}</span>
                </div>
              </div>

              <div className="plan-back-body">
                <div className="plan-back-intro">
                  <span className="plan-back-kicker">What’s different</span>
                  <p>{entry.difference}</p>
                </div>

                <div className="plan-diff-grid">
                  <div>
                    <span>Only here</span>
                    <strong>{uniqueNames.length}</strong>
                    <small>extra stops</small>
                  </div>
                  <div>
                    <span>Pace</span>
                    <strong>{plan.days?.length || 0}</strong>
                    <small>{countLabel(activityCount, 'activity', 'activities')}</small>
                  </div>
                  <div>
                    <span>Known cost</span>
                    <strong>{money(cost.knownTotal)}</strong>
                    <small>{cost.complete ? 'verified total' : 'partial total'}</small>
                  </div>
                </div>

                <BackRoutePanel routes={entry.routes} uniqueNames={uniqueNames} />

                <button
                  type="button"
                  className="plan-flip-back"
                  data-testid={`card-flip-back-${entry.index + 1}`}
                  aria-label={`Back to full details for option ${entry.index + 1}`}
                  tabIndex={backTabIndex}
                  onClick={onToggleFlip}
                >
                  <Icon name="arrowLeft" size={15} />
                  <span>Back to full details</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
    </article>
  )
}

function ComparisonMatrix({
  entries,
  activeIndex,
  focusedIndex,
  onHover,
  onToggleFocus,
}) {
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
      makeRow('cost', 'Known costs', costValues),
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

  useEffect(() => {
    if (differentRowCount === 0) setDifferencesOnly(false)
  }, [differentRowCount])

  return (
    <div className="compare-matrix-block">
      <div className="compare-matrix-head">
        <h3>Compare details</h3>
        <div className="compare-matrix-tools">
          <p className="muted small" aria-live="polite">
            {focusedIndex != null
              ? `Focused on Option ${focusedIndex + 1} · ${differentRowCount} ${
                  differentRowCount === 1 ? 'row differs' : 'rows differ'
                }.`
              : differentRowCount === 1
                ? '1 row differs.'
                : `${differentRowCount} rows differ.`}
          </p>
          {focusedIndex != null && (
            <button
              type="button"
              className="compare-focus-clear"
              onClick={() => onToggleFocus?.(focusedIndex)}
            >
              Clear focus
            </button>
          )}
          <ComparisonViewControl
            differencesOnly={differencesOnly}
            onChange={setDifferencesOnly}
            disabled={differentRowCount === 0}
          />
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
                <th
                  scope="col"
                  key={`${entry.id}-${entry.index}`}
                  className={columnClass(entry.index, activeIndex)}
                >
                  <button
                    type="button"
                    className="compare-plan-focus"
                    data-testid={`compare-focus-${entry.index + 1}`}
                    aria-pressed={focusedIndex === entry.index}
                    title={`Focus Option ${entry.index + 1}`}
                    onMouseEnter={() => onHover?.(entry.index)}
                    onMouseLeave={() => onHover?.(null)}
                    onFocus={() => onHover?.(entry.index)}
                    onBlur={() => onHover?.(null)}
                    onClick={() => onToggleFocus?.(entry.index)}
                  >
                    <span>Option {entry.index + 1}</span>
                    <span className="compare-matrix-title">
                      {entry.plan.title || entry.plan.destinationId}
                    </span>
                    <span className="compare-plan-focus-hint">
                      {focusedIndex === entry.index ? 'Focused' : 'Focus'}
                    </span>
                  </button>
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
                  <td
                    key={`${entries[index].id}-${entries[index].index}-${row.key}`}
                    className={columnClass(entries[index].index, activeIndex)}
                  >
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
        Hover a plan to highlight its column. Swipe to compare every option.
      </p>
    </div>
  )
}

function DayByDayComparison({ entries, activeIndex, onHover }) {
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
                  <div
                    className={`route-compare-column ${columnClass(
                      entry.index,
                      activeIndex
                    )}`}
                    key={`${entry.id}-${entry.index}-${selectedDay}`}
                    onMouseEnter={() => onHover?.(entry.index)}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    <span className="route-compare-column-label">
                      Option {entry.index + 1}
                    </span>
                    {route && route.stops.length > 0 ? (
                      <ol className="route-stop-list">
                        {route.stops.map((stop) => (
                          <li
                            className={stop.unique ? 'route-stop route-stop--unique' : 'route-stop'}
                            key={`${entry.id}-${entry.index}-${stop.activityId}`}
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
  notice,
}) {
  const entries = useMemo(
    () => compareCandidatePlans(candidates, placesById),
    [candidates, placesById]
  )
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [flippedIndexes, setFlippedIndexes] = useState(() => new Set())

  useEffect(() => {
    setHoveredIndex(null)
    setFocusedIndex(null)
    setFlippedIndexes(new Set())
  }, [candidates])

  const safeFocusedIndex =
    focusedIndex != null && entries[focusedIndex] ? focusedIndex : null
  const activeIndex = hoveredIndex ?? safeFocusedIndex
  const canFlip = entries.length > 1
  const allFlipped = canFlip && entries.every((_, index) => flippedIndexes.has(index))
  const toggleCardFlip = (index) => {
    if (!canFlip) return
    setFlippedIndexes((previous) => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }
  const toggleAllFlips = () => {
    if (!canFlip) return
    setFlippedIndexes(allFlipped ? new Set() : new Set(entries.map((_, index) => index)))
  }
  const toggleFocus = (index) => {
    setFocusedIndex((previous) => (previous === index ? null : index))
    setHoveredIndex(null)
    if (safeFocusedIndex !== index) {
      const scroll = () => {
        document
          .getElementById(`compare-card-${index + 1}`)
          ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      }
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scroll)
      else setTimeout(scroll, 0)
    }
  }

  if (entries.length === 0) {
    return <p className="muted">No itineraries to compare.</p>
  }

  const sameDestination = sharedDestination(entries)
  const destinationName = sameDestination
    ? getDestinationLabel(sameDestination) || sameDestination
    : ''
  const sameDestinationPlans = sameDestination && entries.length > 1

  return (
    <section className="results-list" aria-labelledby="candidate-results-heading">
      <div className="section-head">
        <div>
          <h2 id="candidate-results-heading">Find the plan that feels like you</h2>
          <p className="muted">
            Compare recommended destinations, stops, and daily pace to find your best fit.
          </p>
        </div>
        <div className="plan-compare-actions">
          <span className="count-pill">
            <Icon name="route" size={15} />
            {entries.length} {entries.length === 1 ? 'plan' : 'plans'}
            {sameDestinationPlans ? ` · ${destinationName}` : ''}
          </span>
          {canFlip && (
            <button
              type="button"
              className="plan-flip-all"
              data-testid="compare-flip-all"
              aria-pressed={allFlipped}
              onClick={toggleAllFlips}
            >
              <span className="plan-flip-all-icon" aria-hidden="true">
                <Icon name="swap" size={18} />
              </span>
              <span className="plan-flip-all-text">
                <strong>{allFlipped ? 'Show plan details' : 'Show differences'}</strong>
                <small>{allFlipped ? 'Return to front of all cards' : 'Tap to flip and compare plans'}</small>
              </span>
            </button>
          )}
        </div>
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

      <div className="results-verification">
        <p className="results-verification-note">
          <Icon name="info" size={15} />
          <span>
            Statuses, costs, and route checks reflect the verification results available for
            each plan. Unverified details stay labeled and are never counted as confirmed.
          </span>
        </p>
        {notice}
      </div>

      <div className="cards plan-comparison-grid">
        {entries.map((entry) => (
          <CandidateCard
            key={`${entry.id}-${entry.index}`}
            candidate={entry.candidate}
            entry={entry}
            ranking={ranking}
            selected={Boolean(selectedPlanId && selectedPlanId === entry.id)}
            placesById={placesById}
            onSelect={onSelectPlan}
            showDifference={entries.length > 1}
            active={activeIndex == null ? null : activeIndex === entry.index}
            focused={safeFocusedIndex === entry.index}
            flipped={flippedIndexes.has(entry.index)}
            canFlip={canFlip}
            onHover={setHoveredIndex}
            onToggleFocus={toggleFocus}
            onToggleFlip={() => toggleCardFlip(entry.index)}
          />
        ))}
      </div>

      {entries.length > 1 && (
        <>
          <ComparisonMatrix
            entries={entries}
            activeIndex={activeIndex}
            focusedIndex={safeFocusedIndex}
            onHover={setHoveredIndex}
            onToggleFocus={toggleFocus}
          />
          <DayByDayComparison
            entries={entries}
            activeIndex={activeIndex}
            onHover={setHoveredIndex}
          />
        </>
      )}
    </section>
  )
}
