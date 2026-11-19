import Icon from '../common/Icon.jsx'

export default function TripChecklist({ items, checked, onToggle, sectionRef, id = 'trip-checklist' }) {
  const total = items.length

  return (
    <section
      id={id}
      ref={sectionRef}
      className="trip-checklist selected-wide"
      aria-labelledby="trip-checklist-title"
    >
      <div className="checklist-head">
        <p className="page-eyebrow">04 / Your pre-trip checklist</p>
        <h2 id="trip-checklist-title">A few checks for a smoother trip</h2>
        <p>Before you leave, review each item and tick it off. Click again to undo.</p>
      </div>

      {total === 0 ? (
        <p className="checklist-empty">No preparation checks apply to this plan.</p>
      ) : (
        <ul className="checklist-list">
          {items.map((item) => {
            const isChecked = Boolean(checked[item.key])
            return (
              <li key={item.key}>
                <label className={`checklist-item${isChecked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    className="checklist-input"
                    checked={isChecked}
                    onChange={() => onToggle(item.key)}
                  />
                  <span className="checklist-box" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="checklist-copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                  <span className={`checklist-state${isChecked ? ' is-checked' : ''}`}>
                    {isChecked ? 'Checked' : 'To do'}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <p className="checklist-footnote">
        Your checkmarks track personal preparation only. They do not verify prices, schedules, or
        travel routes.
      </p>
    </section>
  )
}
