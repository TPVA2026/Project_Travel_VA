import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtMoney } from '../../services/mockData.js'
import Icon from '../common/Icon.jsx'

function priceLabel(place) {
  if (place?.priceVnd != null) {
    return place.priceVnd === 0 ? 'Free' : fmtMoney(place.priceVnd)
  }
  if (place?.priceDisplay) return place.priceDisplay
  return 'Price unknown'
}

function costStatusClass(place) {
  const status =
    place?.priceVnd != null
      ? 'known'
      : String(place?.costStatus || 'NO_DATA').toLowerCase().replace('_', '-')
  return `cost-status--${status}`
}

function stopKindLabel(activity) {
  const type = activity?.type
  if (type === 'dining' || type === 'meal') return 'dining'
  return 'sightseeing'
}

export default function StopAlternativesDialog({
  dayNumber,
  activity,
  currentName,
  alternatives = [],
  status = 'idle',
  error = '',
  onConfirm,
  onClose,
}) {
  const [selectedId, setSelectedId] = useState(null)
  const dialogRef = useRef(null)
  const updating = status === 'updating'

  useEffect(() => {
    const previouslyFocused = document.activeElement
    dialogRef.current?.focus()
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !updating) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, updating])

  const selected = useMemo(
    () => alternatives.find((place) => String(place.id) === String(selectedId)) || null,
    [alternatives, selectedId]
  )

  const startLabel = activity?.startTime || activity?.start || ''
  const endLabel = activity?.endTime || activity?.end || ''

  return (
    <div
      className="stop-dialog-backdrop"
      onMouseDown={() => {
        if (!updating) onClose()
      }}
    >
      <div
        className="stop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stop-dialog-title"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="stop-dialog-head">
          <div>
            <p className="page-eyebrow">Edit stop · Day {dayNumber}</p>
            <h2 id="stop-dialog-title">Change this {stopKindLabel(activity)} stop</h2>
          </div>
          <button
            type="button"
            className="stop-dialog-close"
            aria-label="Close"
            onClick={onClose}
            disabled={updating}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="stop-dialog-current">
          <span className="stop-current-label">Current stop</span>
          <strong className="stop-current-name">{currentName || 'Unknown place'}</strong>
          {(startLabel || endLabel) && (
            <span className="stop-current-time">
              <Icon name="clock" size={14} />
              {startLabel}
              {endLabel ? `–${endLabel}` : ''}
            </span>
          )}
        </div>

        {alternatives.length === 0 ? (
          <p className="stop-dialog-empty">
            <Icon name="info" size={16} />
            No valid alternatives are open at this time. Your itinerary stays the same.
          </p>
        ) : (
          <fieldset className="stop-options">
            <legend className="stop-options-legend">
              Valid alternatives for this time slot
            </legend>
            {alternatives.map((place) => {
              const isSelected = String(place.id) === String(selectedId)
              return (
                <label
                  key={place.id}
                  className={`stop-option${isSelected ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="stop-alternative"
                    value={place.id}
                    checked={isSelected}
                    onChange={() => setSelectedId(place.id)}
                    disabled={updating}
                  />
                  <span className="stop-option-body">
                    <span className="stop-option-name">{place.name}</span>
                    {place.address && (
                      <span className="stop-option-address">{place.address}</span>
                    )}
                    <span className="stop-option-meta">
                      {place.openingHours && (
                        <span className="stop-option-meta-item">
                          <Icon name="clock" size={13} />
                          {place.openingHours}
                        </span>
                      )}
                      <span className={`cost-status ${costStatusClass(place)}`}>
                        {priceLabel(place)}
                      </span>
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>
        )}

        {error && (
          <p className="stop-dialog-error" role="alert">
            <Icon name="alert" size={15} />
            {error}
          </p>
        )}

        <footer className="stop-dialog-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={updating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(selected)}
            disabled={!selected || updating || alternatives.length === 0}
          >
            {updating ? (
              <>
                <Icon name="refresh" size={16} className="spin" />
                Updating…
              </>
            ) : (
              <>
                <Icon name="check" size={16} />
                Apply change
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
