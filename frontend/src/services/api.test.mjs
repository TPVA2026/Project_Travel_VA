import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateItinerary,
  generateItinerary,
  rankItineraries,
  runItineraryPipeline,
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
  await assert.rejects(() => runItineraryPipeline(request), (error) => {
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
