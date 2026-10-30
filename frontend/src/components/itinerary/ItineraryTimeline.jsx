import ActivityCard from './ActivityCard.jsx'

export default function ItineraryTimeline({ days }) {
  if (!days || days.length === 0) {
    return (
      <div className="empty-timeline-box">
        <p className="muted">No itinerary details available.</p>
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

          return (
            <div key={dayNumber} className="timeline-day-group">
              <div className="timeline-node" aria-hidden="true" />

              <div className="timeline-day-header">
                <span className="tl-day">Day {dayNumber}</span>
                {d.date && <span className="tl-date muted small">({d.date})</span>}
                <div className="tl-summary">
                  {attractionsCount > 0 && (
                    <span className="tl-badge tl-badge-attraction" title={`${attractionsCount} attraction(s)`}>
                      🏛️ {attractionsCount} {attractionsCount === 1 ? 'attraction' : 'attractions'}
                    </span>
                  )}
                  {diningCount > 0 && (
                    <span className="tl-badge tl-badge-dining" title={`${diningCount} dining stop(s)`}>
                      🍽️ {diningCount} dining
                    </span>
                  )}
                </div>
              </div>

              <div className="timeline-activities">
                {activities.length === 0 ? (
                  <p className="muted small">No scheduled activities for this day.</p>
                ) : (
                  activities.map((act, idx) => {
                    const leg =
                      d.travelLegs?.[idx] ||
                      (act.travelMin != null ? { durationMin: act.travelMin } : null)

                    return (
                      <ActivityCard
                        key={act.activityId || `${dayNumber}-${idx}`}
                        activity={act}
                        travelLeg={idx > 0 ? leg : null}
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
