import ActivityCard from './ActivityCard.jsx'

export default function ItineraryTimeline({ days }) {
  if (!days || days.length === 0) return <p className="muted">No itinerary details available.</p>

  return (
    <div className="timeline-container">
      <div className="timeline">
        {days.map((d) => (
          <div key={d.day || d.dayNumber} className="timeline-day-group">
            <div className="timeline-node"></div>
            <div className="tl-day">Day {d.day || d.dayNumber}</div>
            <div className="timeline-activities">
              {d.activities.map((act, idx) => {
                const leg = d.travelLegs?.[idx] || (act.travelMin != null ? { durationMin: act.travelMin } : null)
                return (
                  <ActivityCard
                    key={act.activityId || idx}
                    activity={act}
                    travelLeg={idx > 0 ? leg : null}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
