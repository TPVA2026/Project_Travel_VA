import { useState } from 'react'
import {
  REVISION_TYPES,
  INTEREST_OPTIONS,
  TRANSPORT_OPTIONS,
  buildRevisionPayload,
  validateRevision,
} from './revisionSchema.js'
import { revisePlan, fmtMoney, knownTotal } from '../../services/api.js'

export default function RevisionForm({ plan, onPlanRevised }) {
  const [activeType, setActiveType] = useState('budget')
  const [submitting, setSubmitting] = useState(false)
  const [clientErrors, setClientErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [shouldSimulateError, setShouldSimulateError] = useState(false)

  // Current plan statistics for reference
  const { total: knownCost } = knownTotal(plan)

  // Form field state pre-populated with sensible defaults from current plan
  const [formData, setFormData] = useState({
    // Budget
    amount: plan?.status === 'INFEASIBLE' ? 7000000 : 5000000,
    scope: 'group',
    // Duration
    durationDays: plan?.days?.length || 3,
    // Travel Period
    periodMode: 'dates',
    startDate: plan?.days?.[0]?.date || '2026-11-15',
    endDate: plan?.days?.[plan?.days?.length - 1]?.date || '2026-11-18',
    month: '2026-12',
    // Departure
    departureLocation: plan?.departureLocation || 'Ho Chi Minh City',
    // Travelers
    travelerCount: 2,
    characteristics: ['Adults'],
    // Limits
    maxTravelTimeMinutes: 60,
    maxDistanceKm: 50,
    appliesTo: 'daily',
    // Preferences
    interests: [{ type: 'nature', priority: 1 }],
    transportation: ['car'],
    diningPreferred: 'Local seafood, coffee',
    diningAvoid: 'Spicy',
    // Notes
    notes: '',
  })

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear field-specific error when user modifies it
    if (clientErrors[field]) {
      setClientErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    setSuccessMessage(null)
    setServerError(null)
  }

  const handleInterestToggle = (interestType) => {
    setFormData((prev) => {
      const exists = prev.interests.find((i) => i.type === interestType)
      let nextInterests
      if (exists) {
        nextInterests = prev.interests.filter((i) => i.type !== interestType)
      } else {
        nextInterests = [...prev.interests, { type: interestType, priority: 1 }]
      }
      return { ...prev, interests: nextInterests }
    })
  }

  const handleTransportToggle = (transportType) => {
    setFormData((prev) => {
      const exists = prev.transportation.includes(transportType)
      const nextTransport = exists
        ? prev.transportation.filter((t) => t !== transportType)
        : [...prev.transportation, transportType]
      return { ...prev, transportation: nextTransport }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setClientErrors({})
    setServerError(null)
    setSuccessMessage(null)

    // Build payload conforming strictly to backend/app/schemas/revision.py
    let valuesForType = {}
    switch (activeType) {
      case 'budget':
        valuesForType = {
          amount: formData.amount,
          scope: formData.scope,
        }
        break
      case 'durationDays':
        valuesForType = {
          durationDays: formData.durationDays,
        }
        break
      case 'travelPeriod':
        valuesForType = {
          periodMode: formData.periodMode,
          startDate: formData.startDate,
          endDate: formData.endDate,
          month: formData.month,
        }
        break
      case 'departureLocation':
        valuesForType = {
          departureLocation: formData.departureLocation,
        }
        break
      case 'travelers':
        valuesForType = {
          count: formData.travelerCount,
          characteristics: formData.characteristics,
        }
        break
      case 'limits':
        valuesForType = {
          maxTravelTimeMinutes: formData.maxTravelTimeMinutes,
          maxDistanceKm: formData.maxDistanceKm,
          appliesTo: formData.appliesTo,
        }
        break
      case 'preferences':
        valuesForType = {
          transportation: formData.transportation,
          interests: formData.interests,
          dining: {
            preferred: formData.diningPreferred
              ? formData.diningPreferred.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
            avoid: formData.diningAvoid
              ? formData.diningAvoid.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
          },
        }
        break
      default:
        break
    }

    const payload = buildRevisionPayload(plan.id || plan.planId, activeType, valuesForType)
    const { valid, errors } = validateRevision(payload)

    if (!valid) {
      setClientErrors(errors)
      return
    }

    setSubmitting(true)
    try {
      const res = await revisePlan(plan.id || plan.planId, payload, {
        delay: 450,
        shouldFail: shouldSimulateError,
      })

      if (res && res.data) {
        setSuccessMessage(`✓ Revision applied successfully! Itinerary updated and feasibility recalculated.`)
        if (onPlanRevised) {
          onPlanRevised(res.data)
        }
      }
    } catch (err) {
      setServerError(err?.message || 'Failed to submit revision request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="revision-container">
      {/* Test / Reviewer controls bar */}
      <div className="demo-controls-bar revision-demo-bar">
        <span className="demo-controls-label">Test Revision States:</span>
        <button
          type="button"
          className={`btn btn-sm demo-btn ${shouldSimulateError ? 'btn-danger-active' : 'btn-outline'}`}
          onClick={() => setShouldSimulateError((prev) => !prev)}
        >
          {shouldSimulateError ? '✓ Error simulated on submit' : 'Simulate revision error'}
        </button>
      </div>

      <div className="revision-intro">
        <h3 className="revision-heading">Request Itinerary Changes</h3>
        <p className="muted small">
          Select what you want to revise. The assistant will recalculate travel constraints, verify feasibility, and update the schedule.
        </p>
      </div>

      {/* Revision Category Tabs */}
      <div className="revision-tabs" role="tablist" aria-label="Revision categories">
        {REVISION_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            role="tab"
            aria-selected={activeType === type.id}
            className={`revision-tab ${activeType === type.id ? 'active' : ''}`}
            onClick={() => {
              setActiveType(type.id)
              setClientErrors({})
              setServerError(null)
              setSuccessMessage(null)
            }}
          >
            <span className="tab-icon">{type.icon}</span>
            <span className="tab-label">{type.label}</span>
          </button>
        ))}
      </div>

      {/* Revision Input Form */}
      <form onSubmit={handleSubmit} className="revision-form" noValidate>
        {/* Budget Change */}
        {activeType === 'budget' && (
          <div className="revision-field-group">
            <div className="field-info-banner">
              <span>💡 Current known itinerary cost: <strong>{fmtMoney(knownCost)}</strong></span>
              {plan?.status === 'INFEASIBLE' && (
                <span className="highlight-tip">
                  Tip: Increasing budget above {fmtMoney(knownCost)} will make this plan feasible!
                </span>
              )}
            </div>

            <div className="grid-2">
              <div className="input-field">
                <label htmlFor="budgetAmount">New Budget Amount (VND)</label>
                <input
                  id="budgetAmount"
                  type="number"
                  min="0"
                  step="500000"
                  value={formData.amount}
                  onChange={(e) => handleChange('amount', e.target.value)}
                  className={clientErrors.budgetAmount ? 'input-error' : ''}
                />
                {clientErrors.budgetAmount && (
                  <span className="field-error-text">{clientErrors.budgetAmount}</span>
                )}
              </div>

              <div className="input-field">
                <label htmlFor="budgetScope">Budget Scope</label>
                <select
                  id="budgetScope"
                  value={formData.scope}
                  onChange={(e) => handleChange('scope', e.target.value)}
                >
                  <option value="group">Total for Group</option>
                  <option value="perPerson">Per Person</option>
                </select>
                {clientErrors.budgetScope && (
                  <span className="field-error-text">{clientErrors.budgetScope}</span>
                )}
              </div>
            </div>

            <div className="quick-presets">
              <span className="muted small">Quick adjustments:</span>
              <button
                type="button"
                className="btn btn-sm btn-outline preset-btn"
                onClick={() => handleChange('amount', knownCost + 1000000)}
              >
                +1,000,000 VND above cost
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline preset-btn"
                onClick={() => handleChange('amount', 7000000)}
              >
                Set to 7,000,000 VND
              </button>
            </div>
          </div>
        )}

        {/* Duration Change */}
        {activeType === 'durationDays' && (
          <div className="revision-field-group">
            <div className="grid-2">
              <div className="input-field">
                <label htmlFor="durationDays">Number of Days</label>
                <input
                  id="durationDays"
                  type="number"
                  min="1"
                  max="14"
                  value={formData.durationDays}
                  onChange={(e) => handleChange('durationDays', parseInt(e.target.value, 10) || 1)}
                  className={clientErrors.durationDays ? 'input-error' : ''}
                />
                {clientErrors.durationDays && (
                  <span className="field-error-text">{clientErrors.durationDays}</span>
                )}
              </div>

              <div className="field-tip-box">
                <p className="muted small">
                  Current plan has <strong>{plan?.days?.length || 0} day(s)</strong>. Extending days adds activities and scales estimated costs. Shortening trims later days.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Travel Period Change */}
        {activeType === 'travelPeriod' && (
          <div className="revision-field-group">
            <div className="period-toggle-row">
              <label>
                <input
                  type="radio"
                  name="periodMode"
                  value="dates"
                  checked={formData.periodMode === 'dates'}
                  onChange={() => handleChange('periodMode', 'dates')}
                />
                Specific Dates
              </label>
              <label>
                <input
                  type="radio"
                  name="periodMode"
                  value="month"
                  checked={formData.periodMode === 'month'}
                  onChange={() => handleChange('periodMode', 'month')}
                />
                By Month
              </label>
            </div>

            {formData.periodMode === 'dates' ? (
              <div className="grid-2">
                <div className="input-field">
                  <label htmlFor="startDate">Start Date</label>
                  <input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                    className={clientErrors.startDate ? 'input-error' : ''}
                  />
                  {clientErrors.startDate && (
                    <span className="field-error-text">{clientErrors.startDate}</span>
                  )}
                </div>

                <div className="input-field">
                  <label htmlFor="endDate">End Date</label>
                  <input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                    className={clientErrors.endDate ? 'input-error' : ''}
                  />
                  {clientErrors.endDate && (
                    <span className="field-error-text">{clientErrors.endDate}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="input-field">
                <label htmlFor="revMonth">Travel Month</label>
                <input
                  id="revMonth"
                  type="month"
                  value={formData.month}
                  onChange={(e) => handleChange('month', e.target.value)}
                  className={clientErrors.month ? 'input-error' : ''}
                />
                {clientErrors.month && (
                  <span className="field-error-text">{clientErrors.month}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Departure Location */}
        {activeType === 'departureLocation' && (
          <div className="revision-field-group">
            <div className="input-field">
              <label htmlFor="departureLocation">Departure City / Location</label>
              <input
                id="departureLocation"
                type="text"
                value={formData.departureLocation}
                onChange={(e) => handleChange('departureLocation', e.target.value)}
                placeholder="e.g. Da Nang, Hanoi, Ho Chi Minh City"
                className={clientErrors.departureLocation ? 'input-error' : ''}
              />
              {clientErrors.departureLocation && (
                <span className="field-error-text">{clientErrors.departureLocation}</span>
              )}
            </div>
          </div>
        )}

        {/* Travelers */}
        {activeType === 'travelers' && (
          <div className="revision-field-group">
            <div className="input-field">
              <label htmlFor="travelerCount">Number of Travelers</label>
              <input
                id="travelerCount"
                type="number"
                min="1"
                value={formData.travelerCount}
                onChange={(e) => handleChange('travelerCount', parseInt(e.target.value, 10) || 1)}
                className={clientErrors.travelerCount ? 'input-error' : ''}
              />
              {clientErrors.travelerCount && (
                <span className="field-error-text">{clientErrors.travelerCount}</span>
              )}
            </div>
          </div>
        )}

        {/* Preferences & Dining */}
        {activeType === 'preferences' && (
          <div className="revision-field-group">
            <div className="preference-subsection">
              <label className="subheading-label">Interests & Focus</label>
              <div className="tags-selection-row">
                {INTEREST_OPTIONS.map((item) => {
                  const selected = formData.interests.some((i) => i.type === item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`tag-toggle-btn ${selected ? 'tag-selected' : ''}`}
                      onClick={() => handleInterestToggle(item.id)}
                    >
                      {selected ? '✓ ' : '+ '} {item.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="preference-subsection">
              <label className="subheading-label">Preferred Transportation</label>
              <div className="tags-selection-row">
                {TRANSPORT_OPTIONS.map((opt) => {
                  const selected = formData.transportation.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`tag-toggle-btn ${selected ? 'tag-selected' : ''}`}
                      onClick={() => handleTransportToggle(opt.id)}
                    >
                      {selected ? '✓ ' : '+ '} {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid-2">
              <div className="input-field">
                <label htmlFor="diningPreferred">Preferred Foods / Dishes</label>
                <input
                  id="diningPreferred"
                  type="text"
                  placeholder="e.g. Seafood, vegetarian, coffee"
                  value={formData.diningPreferred}
                  onChange={(e) => handleChange('diningPreferred', e.target.value)}
                />
              </div>

              <div className="input-field">
                <label htmlFor="diningAvoid">Dietary Restrictions to Avoid</label>
                <input
                  id="diningAvoid"
                  type="text"
                  placeholder="e.g. Peanuts, spicy food"
                  value={formData.diningAvoid}
                  onChange={(e) => handleChange('diningAvoid', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Travel Limits */}
        {activeType === 'limits' && (
          <div className="revision-field-group">
            <div className="grid-2">
              <div className="input-field">
                <label htmlFor="maxTravelTime">Max Travel Time (Minutes)</label>
                <input
                  id="maxTravelTime"
                  type="number"
                  min="1"
                  value={formData.maxTravelTimeMinutes}
                  onChange={(e) => handleChange('maxTravelTimeMinutes', parseInt(e.target.value, 10) || '')}
                />
              </div>

              <div className="input-field">
                <label htmlFor="limitsScope">Limit Applies To</label>
                <select
                  id="limitsScope"
                  value={formData.appliesTo}
                  onChange={(e) => handleChange('appliesTo', e.target.value)}
                >
                  <option value="daily">Daily travel total</option>
                  <option value="betweenActivities">Between each activity</option>
                  <option value="fromDeparture">From departure location</option>
                </select>
              </div>
            </div>
            {clientErrors.limits && (
              <span className="field-error-text">{clientErrors.limits}</span>
            )}
          </div>
        )}

        {/* Optional Notes for AI Assistant */}
        <div className="input-field notes-field">
          <label htmlFor="revisionNotes">Additional notes or requests (optional)</label>
          <textarea
            id="revisionNotes"
            rows="2"
            placeholder="e.g. Prefer relaxed pace with more free time in afternoons..."
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
          />
        </div>

        {/* Feedback messages */}
        {serverError && (
          <div className="alert-box alert-infeasible">
            <strong>Revision Error:</strong> {serverError}
          </div>
        )}

        {successMessage && (
          <div className="alert-box alert-success">
            {successMessage}
          </div>
        )}

        {/* Submit Actions */}
        <div className="revision-submit-row">
          <button
            type="submit"
            className="btn btn-primary btn-submit-revision"
            disabled={submitting}
          >
            {submitting ? 'Applying revision...' : 'Apply Revision'}
          </button>
        </div>
      </form>

      {/* Applied Revisions Log */}
      {plan?.revisions && plan.revisions.length > 0 && (
        <div className="revision-history-box">
          <h4 className="history-title">Revision History:</h4>
          <ul className="history-list">
            {plan.revisions.map((rev) => (
              <li key={rev.id} className="history-item">
                <span className="history-bullet">✓</span>
                <div className="history-info">
                  <span className="history-summary">{rev.summary}</span>
                  <span className="history-time muted small">
                    {new Date(rev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
