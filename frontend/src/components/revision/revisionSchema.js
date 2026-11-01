/**
 * Client-side schema builder and validator for RevisionRequest (TPVA-31)
 * Conforms strictly to backend/app/schemas/revision.py and travel_request.py
 */

export const REVISION_TYPES = [
  { id: 'budget', label: 'Budget', icon: '💰' },
  { id: 'durationDays', label: 'Duration (Days)', icon: '⏱️' },
  { id: 'travelPeriod', label: 'Travel Dates', icon: '📅' },
  { id: 'travelers', label: 'Travelers', icon: '👥' },
  { id: 'preferences', label: 'Preferences & Dining', icon: '🎯' },
  { id: 'limits', label: 'Travel Limits', icon: '🚗' },
  { id: 'departureLocation', label: 'Departure', icon: '📍' },
]

export const INTEREST_OPTIONS = [
  { id: 'sightseeing', label: 'Sightseeing' },
  { id: 'culture', label: 'Culture & Heritage' },
  { id: 'nature', label: 'Nature & Landscape' },
  { id: 'relaxation', label: 'Relaxation' },
]

export const TRANSPORT_OPTIONS = [
  { id: 'car', label: 'Car / Private Vehicle' },
  { id: 'taxi', label: 'Taxi / Ride-hailing' },
  { id: 'motorbike', label: 'Motorbike' },
  { id: 'walking', label: 'Walking' },
  { id: 'publicTransport', label: 'Public Transport' },
]

/**
 * Validates a revision payload against contract rules.
 * @param {object} payload
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateRevision(payload) {
  const errors = {}

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: { form: 'Invalid revision payload.' } }
  }

  if (!payload.planId || !String(payload.planId).trim()) {
    errors.planId = 'Plan ID is required.'
  }

  const validTypes = [
    'budget',
    'travelPeriod',
    'durationDays',
    'departureLocation',
    'travelers',
    'limits',
    'preferences',
  ]

  if (!validTypes.includes(payload.changeType)) {
    errors.changeType = `Unknown revision changeType "${payload.changeType}".`
    return { valid: false, errors }
  }

  // Ensure only the named field is present in payload
  const typeFieldMap = {
    budget: 'budget',
    travelPeriod: 'travelPeriod',
    durationDays: 'durationDays',
    departureLocation: 'departureLocation',
    travelers: 'travelers',
    limits: 'limits',
    preferences: 'preferences',
  }

  const expectedField = typeFieldMap[payload.changeType]
  const presentFields = Object.keys(typeFieldMap).filter(
    (t) => payload[typeFieldMap[t]] !== undefined
  )

  if (presentFields.length !== 1 || presentFields[0] !== payload.changeType) {
    errors.changeType = `changeType "${payload.changeType}" requires only the "${expectedField}" field.`
  }

  // Validate the specific changeType contents
  switch (payload.changeType) {
    case 'budget': {
      const b = payload.budget
      if (!b || typeof b !== 'object') {
        errors.budget = 'Budget object is required.'
      } else {
        if (typeof b.amount !== 'number' || isNaN(b.amount) || b.amount < 0) {
          errors.budgetAmount = 'Budget amount must be a number of VND >= 0.'
        }
        if (b.currency !== 'VND') {
          errors.budgetCurrency = 'Currency must be "VND".'
        }
        if (!['perPerson', 'group'].includes(b.scope)) {
          errors.budgetScope = 'Scope must be "perPerson" or "group".'
        }
      }
      break
    }

    case 'durationDays': {
      const days = payload.durationDays
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
        errors.durationDays = 'Duration must be an integer >= 1.'
      }
      break
    }

    case 'travelPeriod': {
      const p = payload.travelPeriod
      if (!p || typeof p !== 'object') {
        errors.travelPeriod = 'Travel period object is required.'
      } else if (p.month) {
        if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(p.month)) {
          errors.month = 'Month must follow YYYY-MM format.'
        }
      } else if (p.startDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) {
          errors.startDate = 'Start date must be YYYY-MM-DD.'
        }
        if (p.endDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(p.endDate)) {
            errors.endDate = 'End date must be YYYY-MM-DD.'
          } else if (p.endDate < p.startDate) {
            errors.endDate = 'End date must be on or after start date.'
          }
        }
      } else {
        errors.travelPeriod = 'Must specify dates (startDate) or month (YYYY-MM).'
      }
      break
    }

    case 'departureLocation': {
      const loc = payload.departureLocation
      if (!loc || typeof loc !== 'string' || !loc.trim()) {
        errors.departureLocation = 'Departure location is required.'
      } else if (loc.length > 200) {
        errors.departureLocation = 'Departure location must be under 200 characters.'
      }
      break
    }

    case 'travelers': {
      const tr = payload.travelers
      if (!tr || typeof tr !== 'object') {
        errors.travelers = 'Travelers object is required.'
      } else {
        if (typeof tr.count !== 'number' || !Number.isInteger(tr.count) || tr.count < 1) {
          errors.travelerCount = 'Traveler count must be an integer >= 1.'
        }
      }
      break
    }

    case 'limits': {
      const lim = payload.limits
      if (!lim || typeof lim !== 'object') {
        errors.limits = 'Limits object is required.'
      } else {
        const hasDist = typeof lim.maxDistanceKm === 'number' && lim.maxDistanceKm > 0
        const hasTime = typeof lim.maxTravelTimeMinutes === 'number' && lim.maxTravelTimeMinutes > 0
        if (!hasDist && !hasTime) {
          errors.limits = 'Limits need maxDistanceKm (> 0) or maxTravelTimeMinutes (> 0).'
        }
        if (!['daily', 'betweenActivities', 'fromDeparture'].includes(lim.appliesTo)) {
          errors.appliesTo = 'appliesTo must be "daily", "betweenActivities", or "fromDeparture".'
        }
      }
      break
    }

    case 'preferences': {
      const pref = payload.preferences
      if (!pref || typeof pref !== 'object') {
        errors.preferences = 'Preferences object is required.'
      }
      break
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Builds a strict RevisionRequest payload with only the named change field.
 * @param {string} planId
 * @param {string} changeType
 * @param {object} values
 * @returns {object}
 */
export function buildRevisionPayload(planId, changeType, values) {
  const payload = {
    planId: String(planId).trim(),
    changeType,
  }

  switch (changeType) {
    case 'budget':
      payload.budget = {
        amount: Math.max(0, parseInt(values.amount, 10) || 0),
        currency: 'VND',
        scope: values.scope === 'perPerson' ? 'perPerson' : 'group',
      }
      break

    case 'durationDays':
      payload.durationDays = Math.max(1, parseInt(values.durationDays, 10) || 1)
      break

    case 'travelPeriod':
      if (values.periodMode === 'month') {
        payload.travelPeriod = { month: values.month }
      } else {
        payload.travelPeriod = {
          startDate: values.startDate,
          ...(values.endDate ? { endDate: values.endDate } : {}),
        }
      }
      break

    case 'departureLocation':
      payload.departureLocation = String(values.departureLocation || '').trim()
      break

    case 'travelers':
      payload.travelers = {
        count: Math.max(1, parseInt(values.count, 10) || 1),
        characteristics: Array.isArray(values.characteristics) ? values.characteristics : [],
      }
      break

    case 'limits': {
      const limits = {
        appliesTo: values.appliesTo || 'daily',
      }
      if (values.maxDistanceKm) {
        limits.maxDistanceKm = Number(values.maxDistanceKm)
      }
      if (values.maxTravelTimeMinutes) {
        limits.maxTravelTimeMinutes = parseInt(values.maxTravelTimeMinutes, 10)
      }
      payload.limits = limits
      break
    }

    case 'preferences': {
      const preferences = {}
      if (values.destination) preferences.destination = values.destination
      if (Array.isArray(values.transportation)) preferences.transportation = values.transportation
      if (Array.isArray(values.interests)) preferences.interests = values.interests
      if (values.dining) preferences.dining = values.dining
      payload.preferences = preferences
      break
    }
  }

  return payload
}
