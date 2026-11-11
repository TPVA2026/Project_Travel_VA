import Icon from '../common/Icon.jsx'
import { getCheckStatus, VERIFICATION_CHECKS } from '../../services/api.js'

const CHECK_ICONS = {
  cost: 'wallet',
  schedule: 'calendar',
  travel: 'route',
}

function formatMeasure(value, unit) {
  return value == null ? null : `${Number(value).toLocaleString('en-US')} ${unit}`
}

function travelDaySummary(day) {
  if (!day || typeof day !== 'object') return null
  const minutes = formatMeasure(day.durationMin, 'min')
  const kilometers = formatMeasure(day.distanceKm, 'km')
  if (minutes == null && kilometers == null) return 'chưa xác minh dữ liệu di chuyển'
  return [minutes || 'chưa rõ thời gian', kilometers || 'chưa rõ khoảng cách']
    .filter(Boolean)
    .join(' · ')
}

export default function EvaluationChecks({ evaluation }) {
  if (!evaluation) return null

  const totals = evaluation?.components?.travel?.dailyTotals
  const showTotals = Array.isArray(totals) && totals.length > 0

  return (
    <div className="check-panel" aria-label="Verification status by check">
      <div className="check-chips" role="list">
        {VERIFICATION_CHECKS.map(({ key, label }) => {
          const status = getCheckStatus(evaluation, key) || 'UNVERIFIED'
          return (
            <div key={key} className="check-chip" role="listitem">
              <span className="check-chip-icon" aria-hidden="true">
                <Icon name={CHECK_ICONS[key]} size={15} />
              </span>
              <span className="check-chip-label">{label}</span>
              <span className={`badge badge-${status}`}>{status}</span>
            </div>
          )
        })}
      </div>

      {showTotals && (
        <ul className="check-travel-totals" aria-label="Verified travel totals per day">
          {totals.map((day) => (
            <li key={day?.dayNumber}>
              <Icon name="clock" size={13} />
              <span>
                <strong>Ngày {day?.dayNumber}</strong> {travelDaySummary(day)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
