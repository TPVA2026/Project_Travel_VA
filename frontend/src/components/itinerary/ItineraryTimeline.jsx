import ActivityCard from './ActivityCard.jsx'
import Icon from '../common/Icon.jsx'

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function ItineraryTimeline({ days, placesById, activitySources }) {
  if (!days || days.length === 0) {
    return (
      <div className="empty-timeline-box">
        <p className="muted">No schedule details yet.</p>
      </div>
    )
  }

  return (
    <div className="timeline-container">
      <div className="timeline">
        {days.map((d) => {
          const dayNumber = d.day || d.dayNumber
          const activities = d.activities || []
          const attractionsCount = activities.filter(
            (a) => a.type === 'sightseeing' || a.type === 'attraction'
          ).length
          const diningCount = activities.filter(
            (a) => a.type === 'dining' || a.type === 'meal'
          ).length
          const dateLabel = formatDate(d.date)

          return (
            <div key={dayNumber} className="timeline-day-group">
              <div className="timeline-node" aria-hidden="true" />

              <div className="timeline-day-header">
                <div className="tl-day-wrap">
                  <span className="tl-day">Day {dayNumber}</span>
                  {dateLabel && (
                    <>
                      <span className="tl-date-separator" aria-hidden="true">—</span>
                      <span className="tl-date">{dateLabel}</span>
                    </>
                  )}
                </div>

                <div className="tl-summary">
                  {attractionsCount > 0 && (
                    <span
                      className="tl-badge tl-badge-attraction"
                      title={`${attractionsCount} sightseeing stops`}
                    >
                      <Icon name="landmark" size={14} />
                      {attractionsCount}
                    </span>
                  )}
                  {diningCount > 0 && (
                    <span
                      className="tl-badge tl-badge-dining"
                      title={`${diningCount} dining stops`}
                    >
                      <Icon name="utensils" size={14} />
                      {diningCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="timeline-activities">
                {activities.length === 0 ? (
                  <p className="muted small">No activities for this day.</p>
                ) : (
                  activities.map((act, idx) => {
                    const leg =
                      d.travelLegs?.[idx - 1] ||
                      (act.travelMin != null ? { durationMin: act.travelMin } : null)

                    const place =
                      placesById?.get?.(String(act.placeId)) ||
                      placesById?.[act.placeId] ||
                      null
                    const placeSource = place?.sourceUrl
                      ? { url: place.sourceUrl, label: place.source }
                      : null
                    const source =
                      placeSource || activitySources?.get?.(String(act.activityId)) || null

                    return (
                      <ActivityCard
                        key={act.activityId || `${dayNumber}-${idx}`}
                        activity={act}
                        place={place}
                        travelLeg={idx > 0 ? leg : null}
                        source={source}
                      />
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
