import { displayPlaceName } from './api.js'

export function candidateKey(candidate) {
  return String(candidate?.planId || candidate?.plan?.planId || '')
}

function orderedActivities(day) {
  return (Array.isArray(day?.activities) ? [...day.activities] : []).sort((a, b) =>
    String(a?.startTime || '').localeCompare(String(b?.startTime || ''))
  )
}

function orderedDays(plan) {
  return (Array.isArray(plan?.days) ? [...plan.days] : []).sort(
    (a, b) => (Number(a?.dayNumber) || 0) - (Number(b?.dayNumber) || 0)
  )
}

export function planStops(plan) {
  return orderedDays(plan).flatMap((day, dayIndex) => {
    const dayNumber = Number(day?.dayNumber) || dayIndex + 1
    return orderedActivities(day).map((activity, index) => ({
      dayNumber,
      activityId: activity?.activityId || `${dayNumber}-${index}`,
      placeId: activity?.placeId == null ? '' : String(activity.placeId),
      type: activity?.type || 'activity',
      startTime: activity?.startTime || '',
      endTime: activity?.endTime || '',
    }))
  })
}

export function planRoutes(plan, placesById) {
  const byDay = new Map()
  for (const stop of planStops(plan)) {
    if (!byDay.has(stop.dayNumber)) byDay.set(stop.dayNumber, [])
    byDay.get(stop.dayNumber).push({
      ...stop,
      name: displayPlaceName(stop.placeId, placesById) || 'Unnamed stop',
      unique: false,
    })
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayNumber, stops]) => ({ dayNumber, stops }))
}

export function routeSequence(plan) {
  return planStops(plan)
    .map((stop) => stop.placeId)
    .filter(Boolean)
}

export function planDayStats(plan) {
  return orderedDays(plan).map((day, index) => {
    const stops = orderedActivities(day)
    return {
      dayNumber: Number(day?.dayNumber) || index + 1,
      count: stops.length,
      firstStart: stops[0]?.startTime || '',
      lastEnd: stops[stops.length - 1]?.endTime || '',
    }
  })
}

export function planMix(plan) {
  const stops = planStops(plan)
  return {
    sights: stops.filter((stop) => stop.type === 'sightseeing').length,
    meals: stops.filter((stop) => stop.type === 'dining').length,
    total: stops.length,
  }
}

function listWithLimit(items, max = 3) {
  if (items.length <= max) return items.join(', ')
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`
}

function differenceCopy(entry, others) {
  if (entry.uniqueNames.length > 0) {
    const count = entry.uniqueNames.length
    return {
      type: 'unique',
      text: `Adds ${count === 1 ? 'a stop' : `${count} stops`} no other plan includes: ${listWithLimit(entry.uniqueNames)}.`,
    }
  }

  const sameRoute = others.find((other) => other.sequence === entry.sequence)
  if (sameRoute) {
    return {
      type: 'same',
      text: `Follows the same route as Option ${sameRoute.index + 1}; check the day timing and warnings.`,
    }
  }

  const sameStops = others.find((other) => other.placeSet === entry.placeSet)
  if (sameStops) {
    return {
      type: 'order',
      text: `Uses the same stops as Option ${sameStops.index + 1}, but in a different order.`,
    }
  }

  return {
    type: 'mix',
    text: 'Uses a different mix of stops from the other plans.',
  }
}

export function compareCandidatePlans(candidates, placesById) {
  const entries = (Array.isArray(candidates) ? candidates : []).map((candidate, index) => {
    const plan = candidate?.plan || {}
    const stops = planStops(plan)
    const placeIds = [...new Set(stops.map((stop) => stop.placeId).filter(Boolean))]
    const dayStats = planDayStats(plan)
    return {
      index,
      id: candidateKey(candidate) || `candidate-${index}`,
      candidate,
      plan,
      routes: planRoutes(plan, placesById),
      dayStats,
      mix: planMix(plan),
      placeIds,
      placeNames: placeIds.map((id) => displayPlaceName(id, placesById) || id),
      placeSet: placeIds.slice().sort().join('|'),
      sequence: stops.map((stop) => stop.placeId).filter(Boolean).join(' > '),
      uniquePlaceIds: [],
      uniqueNames: [],
      difference: '',
      differenceType: '',
      stops,
      totalStops: stops.length,
    }
  })

  for (const entry of entries) {
    const others = entries.filter((other) => other !== entry)
    if (others.length === 0) continue

    const otherSets = others.map((other) => new Set(other.placeIds))
    const uniquePlaceIds = entry.placeIds.filter(
      (id) => !otherSets.some((set) => set.has(id))
    )
    entry.uniquePlaceIds = uniquePlaceIds
    entry.uniqueNames = uniquePlaceIds.map(
      (id) => displayPlaceName(id, placesById) || id
    )
    const difference = differenceCopy(entry, others)
    entry.difference = difference.text
    entry.differenceType = difference.type

    const unique = new Set(uniquePlaceIds)
    entry.routes = entry.routes.map((day) => ({
      ...day,
      stops: day.stops.map((stop) => ({ ...stop, unique: unique.has(stop.placeId) })),
    }))
  }

  return entries
}

export function sharedDestination(entries) {
  const ids = [
    ...new Set(
      entries
        .map((entry) => entry.plan?.destinationId)
        .filter((id) => id != null && String(id).trim())
    ),
  ]
  return ids.length === 1 ? String(ids[0]) : ''
}
