import { getPlaceCatalog } from './api.js'

const SIGHTSEEING_TYPES = new Set(['sightseeing', 'attraction'])
const DINING_TYPES = new Set(['dining', 'meal'])

function categoryOfType(type) {
  if (SIGHTSEEING_TYPES.has(type)) return 'sightseeing'
  if (DINING_TYPES.has(type)) return 'dining'
  return 'other'
}

export function activityCategory(activity) {
  return categoryOfType(activity?.type)
}

export function placeCategory(place) {
  return categoryOfType(place?.type)
}

function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function isPlaceOpenAt(place, startTime) {
  const start = toMinutes(startTime)
  if (start == null) return true
  const range = /(\d{1,2}:\d{2})\s*[-\u2013]\s*(\d{1,2}:\d{2})/.exec(String(place?.openingHours || ''))
  if (!range) return true
  const open = toMinutes(range[1])
  const close = toMinutes(range[2])
  if (open == null || close == null) return true
  if (close < open) return start >= open || start <= close
  return start >= open && start <= close
}

export function findDay(plan, dayNumber) {
  const days = Array.isArray(plan?.days) ? plan.days : []
  return (
    days.find((day, index) => (Number(day?.dayNumber ?? day?.day) || index + 1) === Number(dayNumber)) ||
    null
  )
}

export function findActivity(day, activityId) {
  const activities = Array.isArray(day?.activities) ? day.activities : []
  return (
    activities.find((activity) => String(activity?.activityId) === String(activityId)) || null
  )
}

function scheduledPlaceIds(plan) {
  const ids = new Set()
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    for (const activity of Array.isArray(day?.activities) ? day.activities : []) {
      if (activity?.placeId != null) ids.add(String(activity.placeId))
    }
  }
  return ids
}

function sameDestination(plan, place) {
  const destination = plan?.destinationId
  if (!destination || !place?.destinationId) return true
  return String(place.destinationId) === String(destination)
}

export function getValidAlternatives(plan, dayNumber, activityId, catalog = getPlaceCatalog()) {
  const day = findDay(plan, dayNumber)
  const activity = day ? findActivity(day, activityId) : null
  if (!activity) return []
  const category = activityCategory(activity)
  if (category === 'other') return []
  const used = scheduledPlaceIds(plan)
  const currentId = String(activity.placeId)
  const startTime = activity.startTime || activity.start

  return (Array.isArray(catalog) ? catalog : [])
    .filter((place) => place && place.id != null)
    .filter((place) => String(place.id) !== currentId)
    .filter((place) => placeCategory(place) === category)
    .filter((place) => sameDestination(plan, place))
    .filter((place) => !used.has(String(place.id)))
    .filter((place) => isPlaceOpenAt(place, startTime))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
}

export function applyStopChange(plan, dayNumber, activityId, alternative) {
  if (!plan || !Array.isArray(plan.days)) {
    return { ok: false, error: 'This itinerary cannot be edited.' }
  }
  const day = findDay(plan, dayNumber)
  if (!day) {
    return { ok: false, error: `Day ${dayNumber} was not found in the itinerary.` }
  }
  const activity = findActivity(day, activityId)
  if (!activity) {
    return { ok: false, error: 'That stop was not found in the itinerary.' }
  }
  if (!alternative || alternative.id == null) {
    return { ok: false, error: 'Choose an alternative place first.' }
  }
  const category = activityCategory(activity)
  if (category === 'other' || placeCategory(alternative) !== category) {
    return { ok: false, error: 'That place is not a valid replacement for this stop.' }
  }
  if (!sameDestination(plan, alternative)) {
    return { ok: false, error: 'That place is outside this trip’s destination.' }
  }
  const used = scheduledPlaceIds(plan)
  used.delete(String(activity.placeId))
  if (used.has(String(alternative.id))) {
    return { ok: false, error: 'That place is already in your itinerary.' }
  }

  const price = alternative.priceVnd
  const updatedActivity = {
    ...activity,
    placeId: alternative.id,
    name: alternative.name || activity.name,
    previousPlaceId: activity.placeId,
    cost: price ?? null,
    estimatedCostVnd: price ?? null,
    costStatus: price != null ? 'KNOWN' : alternative.costStatus || 'NO_DATA',
    reason: `Changed by you to ${alternative.name || 'another place'}.`,
  }

  const nextDays = plan.days.map((entry) => {
    if (entry !== day) return entry
    return {
      ...entry,
      activities: (Array.isArray(entry.activities) ? entry.activities : []).map((item) =>
        item === activity ? updatedActivity : item
      ),
    }
  })

  return { ok: true, plan: { ...plan, days: nextDays }, activity: updatedActivity }
}
