import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyStopChange,
  getValidAlternatives,
  isPlaceOpenAt,
} from './itineraryEdit.js'

function makePlan() {
  return {
    planId: 'plan-hue-edit',
    destinationId: 'H',
    days: [
      {
        dayNumber: 1,
        date: '2026-12-19',
        travelLegs: [null, { durationMin: 10 }],
        activities: [
          {
            activityId: 'A1',
            placeId: 'ATTR_H_03',
            type: 'sightseeing',
            startTime: '08:00',
            endTime: '10:00',
            estimatedCostVnd: 200000,
            costStatus: 'KNOWN',
            reason: 'original stop',
          },
          {
            activityId: 'A2',
            placeId: 'REST_H_02',
            type: 'dining',
            startTime: '12:00',
            endTime: '13:00',
            estimatedCostVnd: 50000,
            costStatus: 'UNVERIFIED',
            reason: 'original lunch',
          },
        ],
      },
      {
        dayNumber: 2,
        date: '2026-12-20',
        travelLegs: [null],
        activities: [
          {
            activityId: 'A3',
            placeId: 'ATTR_H_01',
            type: 'sightseeing',
            startTime: '09:00',
            endTime: '11:00',
            estimatedCostVnd: 150000,
            costStatus: 'UNVERIFIED',
          },
        ],
      },
    ],
  }
}

const CATALOG = [
  { id: 'ATTR_H_03', name: 'Đại Nội', type: 'sightseeing', destinationId: 'H', openingHours: '07:00 - 17:30', priceVnd: 200000, costStatus: 'KNOWN' },
  { id: 'ATTR_H_04', name: 'Bến Xưa Vỹ Dạ', type: 'sightseeing', destinationId: 'H', openingHours: 'tự do', priceVnd: 0, costStatus: 'KNOWN' },
  { id: 'ATTR_H_05', name: 'chợ Đông Ba', type: 'sightseeing', destinationId: 'H', openingHours: '07:00 - 19:00', priceVnd: 0, costStatus: 'KNOWN' },
  { id: 'ATTR_H_06', name: 'làng nón Tây Hồ', type: 'sightseeing', destinationId: 'H', openingHours: '09:00 - 11:00', priceVnd: 0, costStatus: 'KNOWN' },
  { id: 'ATTR_H_01', name: 'lăng Khải Định', type: 'sightseeing', destinationId: 'H', openingHours: '07:00 - 17:30', priceVnd: 150000, costStatus: 'KNOWN' },
  { id: 'REST_H_02', name: 'Huyền Anh', type: 'dining', destinationId: 'H', priceVnd: null, priceDisplay: '35.000 VND', costStatus: 'NO_DATA' },
  { id: 'REST_H_05', name: 'Bún bò mệ Kéo', type: 'dining', destinationId: 'H', openingHours: '06:00 - 10:00', priceVnd: null, priceDisplay: '20.000 VND', costStatus: 'NO_DATA' },
  { id: 'ATTR_X_01', name: 'Place in another city', type: 'sightseeing', destinationId: 'X', priceVnd: 0, costStatus: 'KNOWN' },
]

test('isPlaceOpenAt reads time ranges and treats flexible hours as open', () => {
  assert.equal(isPlaceOpenAt({ openingHours: '07:00 - 17:30' }, '08:00'), true)
  assert.equal(isPlaceOpenAt({ openingHours: '07:00 - 17:30' }, '18:00'), false)
  assert.equal(isPlaceOpenAt({ openingHours: '24/7' }, '03:00'), true)
  assert.equal(isPlaceOpenAt({ openingHours: null }, '03:00'), true)
  assert.equal(isPlaceOpenAt({ openingHours: '22:00 - 02:00' }, '01:00'), true)
  assert.equal(isPlaceOpenAt({ openingHours: '22:00 - 02:00' }, '12:00'), false)
})

test('valid alternatives keep the same type and destination, skip used and closed places', () => {
  const plan = makePlan()
  const ids = getValidAlternatives(plan, 1, 'A1', CATALOG).map((place) => place.id).sort()
  assert.deepEqual(ids, ['ATTR_H_04', 'ATTR_H_05'])
})

test('a stop with no open alternative returns an empty list', () => {
  const plan = makePlan()
  assert.deepEqual(getValidAlternatives(plan, 1, 'A2', CATALOG), [])
})

test('changing one stop updates only that activity and leaves other days untouched', () => {
  const plan = makePlan()
  const snapshot = JSON.parse(JSON.stringify(plan))
  const alternative = CATALOG.find((place) => place.id === 'ATTR_H_04')

  const result = applyStopChange(plan, 1, 'A1', alternative)

  assert.equal(result.ok, true)
  assert.equal(result.plan.days.length, 2)
  assert.equal(result.plan.days[0].activities[0].placeId, 'ATTR_H_04')
  assert.equal(result.plan.days[0].activities[0].name, 'Bến Xưa Vỹ Dạ')

  // The other activity in the edited day is untouched.
  assert.equal(result.plan.days[0].activities[1], plan.days[0].activities[1])
  // Day 2 is exactly the same object reference, so nothing outside the edit scope moved.
  assert.equal(result.plan.days[1], plan.days[1])
  assert.deepEqual(result.plan.days[1], snapshot.days[1])

  // The source plan is not mutated.
  assert.deepEqual(plan, snapshot)
})

test('invalid changes are rejected and the itinerary is left unchanged', () => {
  const plan = makePlan()
  const snapshot = JSON.parse(JSON.stringify(plan))

  const wrongType = applyStopChange(plan, 1, 'A1', CATALOG.find((p) => p.id === 'REST_H_05'))
  assert.equal(wrongType.ok, false)
  assert.match(wrongType.error, /valid replacement/i)

  const alreadyUsed = applyStopChange(plan, 1, 'A1', CATALOG.find((p) => p.id === 'ATTR_H_01'))
  assert.equal(alreadyUsed.ok, false)
  assert.match(alreadyUsed.error, /already in your itinerary/i)

  const wrongCity = applyStopChange(plan, 1, 'A1', CATALOG.find((p) => p.id === 'ATTR_X_01'))
  assert.equal(wrongCity.ok, false)
  assert.match(wrongCity.error, /destination/i)

  const noChoice = applyStopChange(plan, 1, 'A1', null)
  assert.equal(noChoice.ok, false)

  const missingStop = applyStopChange(plan, 1, 'NOPE', CATALOG[1])
  assert.equal(missingStop.ok, false)
  assert.match(missingStop.error, /not found/i)

  assert.deepEqual(plan, snapshot)
})
