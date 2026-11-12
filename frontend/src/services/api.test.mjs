import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectPlaceIds,
  createNameResolver,
  displayPlaceName,
  evaluateItinerary,
  fetchDestinations,
  fetchPlaceCatalog,
  formatReason,
  generateItinerary,
  getCheckStatus,
  groupEvaluationReasons,
  indexPlaces,
  rankItineraries,
  runItineraryPipeline,
  VERIFICATION_CHECKS,
} from './api.js'

const request = {
  travelPeriod: { month: '2026-12' }, durationDays: 1,
  departureLocation: 'Hue', travelers: { count: 1 },
  budget: { amount: 1000000, currency: 'VND', scope: 'group' },
}
const plan = {
  planId: 'p1', title: 'Trip', destinationId: 'H', days: [],
  missingData: [], assumptions: [],
}

test('runItineraryPipeline runs generation, evaluation and ranking in order', async () => {
  const calls = []
  const replies = [
    { status: 'UNVERIFIED', plan },
    { status: 'UNVERIFIED', reasons: [{ code: 'TRAVEL_DATA', message: 'Missing route' }] },
    { ranked: [], unscored: [], excluded: [{ planId: 'p1', status: 'UNVERIFIED' }] },
  ]
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    return new Response(JSON.stringify(replies.shift()), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  const result = await runItineraryPipeline(request)
  assert.deepEqual(calls.map((item) => item.url), [
    '/itineraries/generate', '/itineraries/evaluate', '/itineraries/rank',
  ])
  assert.equal(result.status, 'UNVERIFIED')
  assert.equal(result.plan.planId, 'p1')
  assert.equal(result.evaluation.reasons[0].code, 'TRAVEL_DATA')
})

test('runItineraryPipeline surfaces a backend error and stops the pipeline', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ message: 'Gemini unavailable' }), {
      status: 502, headers: { 'content-type': 'application/json' },
    })
  }
  const nonDemoRequest = {
    ...request,
    preferences: { destination: 'Da Nang' },
  }
  await assert.rejects(() => runItineraryPipeline(nonDemoRequest), (error) => {
    assert.equal(error.status, 502)
    assert.equal(error.message, 'Gemini unavailable')
    return true
  })
  assert.equal(calls, 1)
})

test('API helpers use their individual endpoint contracts', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  await generateItinerary(request)
  await evaluateItinerary(request, plan)
  await rankItineraries(request, [plan])
  assert.deepEqual(calls.map((item) => item.url), [
    '/itineraries/generate', '/itineraries/evaluate', '/itineraries/rank',
  ])
  assert.deepEqual(calls[1].body, { request, plan })
  assert.deepEqual(calls[2].body, { request, plans: [plan] })
})

test('HTTP status without a message gets a useful user-facing error', async () => {
  globalThis.fetch = async () => new Response('', { status: 501 })
  await assert.rejects(() => rankItineraries(request, [plan]), (error) => {
    assert.equal(error.status, 501)
    assert.match(error.message, /not available/i)
    return true
  })
})

test('fetchDestinations returns the backend-supported destination list', async () => {
  const destinations = [{ id: 'H', city: 'Huế' }, { id: 'NT', city: 'Nha Trang' }]
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/destinations')
    assert.equal(options, undefined)
    return new Response(JSON.stringify({ total: 2, destinations }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }

  assert.deepEqual(await fetchDestinations(), destinations)
})


test('fetchPlaceCatalog resolves curated place metadata and never guesses unknown ids', async () => {
  const places = await fetchPlaceCatalog({
    ids: ['ATTR_H_03', 'REST_H_05', 'ATTR_UNKNOWN'],
  })

  assert.deepEqual(places.map((place) => place.name), ['Đại Nội', 'Bún bò mệ Kéo'])
  assert.equal(places[0].openingHours, '07:00 - 17:30')
  assert.equal(places[0].priceVnd, 200000)
  assert.equal(places[1].openingHours, '06:00 - 10:00')
  assert.equal(places[1].priceDisplay, '20.000 - 30.000 VND')
  assert.equal(places[1].costStatus, 'NO_DATA')
})


test('Results helpers group backend reasons into Vietnamese topics', () => {
  const evaluation = {
    reasons: [
      { status: 'UNVERIFIED', code: 'BUDGET', message: 'Known costs exceed budget.' },
      { status: 'UNVERIFIED', code: 'UNSUPPORTED_LEG', path: 'days.0.travelLegs', message: 'Missing leg.' },
      { status: 'INFEASIBLE', code: 'DESTINATION_ID', message: 'Unknown destination.' },
    ],
    components: {
      cost: { reasons: ['Required costs are missing or invalid: transport, accommodation.'] },
      travel: { reasons: [{ status: 'UNVERIFIED', code: 'UNSUPPORTED_LEG', path: 'days.0.travelLegs', message: 'Missing leg.' }] },
    },
  }
  const ranking = {
    excluded: [{ planId: 'p1', reasons: [{ status: 'UNVERIFIED', code: 'TRIP_TIME_LIMIT', message: 'Too long.' }] }],
  }

  const groups = groupEvaluationReasons(evaluation, ranking, 'p1')

  assert.deepEqual(groups.map((group) => group.key), ['budget', 'travelTime', 'routing', 'plan'])
  assert.deepEqual(groups.map((group) => group.label), ['Ngân sách', 'Thời gian di chuyển', 'Đường đi chưa xác minh', 'Thông tin chuyến đi'])
  assert.equal(groups[2].reasons.length, 1)
})

test('Results helpers map ids to names, resolve activity ids and keep unknown ids', () => {
  const placesById = indexPlaces([
    { id: 'ATTR_H_03', name: 'Đại Nội', openingHours: '07:00 - 17:30' },
    { id: 'REST_H_05', name: 'Bún bò mệ Kéo', openingHours: '06:00 - 10:00' },
  ])
  const plan = {
    days: [{
      activities: [
        { activityId: 'act-001', placeId: 'ATTR_H_03' },
        { activityId: 'act-002', placeId: 'REST_H_05' },
      ],
      travelLegs: [{ fromPlaceId: 'ATTR_H_03', toPlaceId: 'REST_H_05' }],
    }],
  }

  assert.deepEqual(collectPlaceIds(plan).sort(), ['ATTR_H_03', 'REST_H_05'])
  assert.equal(displayPlaceName('ATTR_H_03', placesById), 'Đại Nội')
  assert.equal(displayPlaceName('ATTR_UNKNOWN', placesById), 'ATTR_UNKNOWN')
  assert.equal(createNameResolver(plan, placesById)('act-002'), 'Bún bò mệ Kéo')
  assert.equal(
    formatReason({ code: 'TRANSFER_GAP', status: 'INFEASIBLE', message: 'Thời gian giữa act-001 và act-002.' }, { plan, placesById }),
    'Không đủ thời gian di chuyển giữa Đại Nội và Bún bò mệ Kéo.'
  )
})

test('Evaluation checks use Vietnamese labels and never invent a status', () => {
  assert.deepEqual(VERIFICATION_CHECKS.map((check) => check.label), ['Ngân sách', 'Lịch trình', 'Di chuyển'])
  assert.equal(getCheckStatus({ components: { cost: { status: 'UNVERIFIED' } } }, 'cost'), 'UNVERIFIED')
  assert.equal(getCheckStatus({ components: { cost: { status: 'SUCCESS' } } }, 'cost'), null)
  assert.equal(getCheckStatus(null, 'cost'), null)
})
