import assert from 'node:assert/strict'
import test from 'node:test'

import {
  candidateKey,
  compareCandidatePlans,
  planDayStats,
  planMix,
  planStops,
  sharedDestination,
} from './planComparison.js'

const placesById = new Map(
  ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((id, index) => [
    id,
    { id, name: `Place ${index + 1}` },
  ])
)

function activity(placeId, startTime, type = 'sightseeing') {
  return {
    activityId: `${placeId}-${startTime}`,
    placeId,
    type,
    startTime,
    endTime: startTime,
  }
}

function candidate(planId, days, destinationId = 'H') {
  return {
    planId,
    status: 'UNVERIFIED',
    plan: { planId, destinationId, title: planId, days },
  }
}

const candidateA = candidate('a', [
  { dayNumber: 1, activities: [activity('P1', '08:00'), activity('P2', '10:00', 'dining'), activity('P3', '12:00')] },
  { dayNumber: 2, activities: [activity('P4', '08:00')] },
])
const candidateB = candidate('b', [
  { dayNumber: 1, activities: [activity('P1', '08:00'), activity('P3', '10:00'), activity('P2', '12:00', 'dining')] },
  { dayNumber: 2, activities: [activity('P4', '08:00')] },
])
const candidateC = candidate('c', [
  { dayNumber: 1, activities: [activity('P1', '08:00'), activity('P5', '10:00')] },
  { dayNumber: 2, activities: [activity('P4', '08:00'), activity('P6', '10:00', 'dining')] },
])

test('planStops keeps days and activities in schedule order', () => {
  const stops = planStops(candidateB.plan)
  assert.deepEqual(stops.map((stop) => stop.placeId), ['P1', 'P3', 'P2', 'P4'])
  assert.deepEqual(stops.map((stop) => stop.dayNumber), [1, 1, 1, 2])
})

test('planDayStats and planMix summarise the route shape', () => {
  assert.deepEqual(planDayStats(candidateA.plan), [
    { dayNumber: 1, count: 3, firstStart: '08:00', lastEnd: '12:00' },
    { dayNumber: 2, count: 1, firstStart: '08:00', lastEnd: '08:00' },
  ])
  assert.deepEqual(planMix(candidateA.plan), { sights: 3, meals: 1, total: 4 })
})

test('same stops in a different order are described as an order change', () => {
  const entries = compareCandidatePlans([candidateA, candidateB], placesById)
  assert.equal(entries[0].uniqueNames.length, 0)
  assert.equal(entries[1].uniqueNames.length, 0)
  assert.equal(
    entries[1].difference,
    'Uses the same stops as Option 1, but in a different order.'
  )
  assert.equal(entries[1].differenceType, 'order')
})

test('unique stops are named and flagged in the route preview', () => {
  const entries = compareCandidatePlans([candidateA, candidateB, candidateC], placesById)
  const third = entries[2]
  assert.deepEqual(third.uniqueNames, ['Place 5', 'Place 6'])
  assert.equal(
    third.difference,
    'Adds 2 stops no other plan includes: Place 5, Place 6.'
  )
  const uniqueStops = third.routes.flatMap((day) => day.stops).filter((stop) => stop.unique)
  assert.deepEqual(uniqueStops.map((stop) => stop.placeId), ['P5', 'P6'])
})

test('sharedDestination only returns one id when every plan matches', () => {
  assert.equal(sharedDestination(compareCandidatePlans([candidateA, candidateB], placesById)), 'H')
  const [single] = compareCandidatePlans([candidateA], placesById)
  assert.equal(single.difference, '')
  assert.deepEqual(single.uniqueNames, [])
  assert.ok(single.routes.flatMap((day) => day.stops).every((stop) => !stop.unique))

  const other = candidate('d', [{ dayNumber: 1, activities: [activity('P1', '08:00')] }], 'N')
  assert.equal(sharedDestination(compareCandidatePlans([candidateA, other], placesById)), '')
})

test('candidateKey accepts both candidate and legacy plan shapes', () => {
  assert.equal(candidateKey(candidateA), 'a')
  assert.equal(candidateKey({ plan: { planId: 'legacy' } }), 'legacy')
})
