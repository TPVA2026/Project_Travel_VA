import ActivityCard from './ActivityCard.jsx'
import Icon from '../common/Icon.jsx'

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function ItineraryTimeline({ days, placesById }) {
  if (!days || days.length === 0) {
    return (
      <div className="empty-timeline-box">
        <p className="muted">Chưa có chi tiết lịch trình.</p>
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
                  <span className="tl-day">Ngày {dayNumber}</span>
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
                      title={`${attractionsCount} điểm tham quan`}
                    >
                      <Icon name="landmark" size={14} />
                      {attractionsCount}
                    </span>
                  )}
                  {diningCount > 0 && (
                    <span
                      className="tl-badge tl-badge-dining"
                      title={`${diningCount} điểm ăn uống`}
                    >
                      <Icon name="utensils" size={14} />
                      {diningCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="timeline-activities">
                {activities.length === 0 ? (
                  <p className="muted small">Ngày này chưa có hoạt động nào.</p>
                ) : (
                  activities.map((act, idx) => {
                    const leg =
                      d.travelLegs?.[idx - 1] ||
                      (act.travelMin != null ? { durationMin: act.travelMin } : null)

                    const place =
                      placesById?.get?.(String(act.placeId)) ||
                      placesById?.[act.placeId] ||
                      null

                    return (
                      <ActivityCard
                        key={act.activityId || `${dayNumber}-${idx}`}
                        activity={act}
                        place={place}
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
