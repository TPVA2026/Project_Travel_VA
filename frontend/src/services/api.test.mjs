import assert from 'node:assert/strict'
import test from 'node:test'

import { generateItinerary } from './api.js'

const request = {
  travelPeriod: { month: '2026-12' }, durationDays: 1,
  departureLocation: 'Hue', travelers: { count: 1 },
  budget: { amount: 1000000, currency: 'VND', scope: 'group' },
}
const plan = {
  planId: 'p1', title: 'Trip', destinationId: 'H', days: [],
  missingData: [], assumptions: [],
}

test('generateItinerary runs generation, evaluation and ranking in order', async () => {
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
  const result = await generateItinerary(request)
  assert.deepEqual(calls.map((item) => item.url), [
    '/itineraries/generate', '/itineraries/evaluate', '/itineraries/rank',
  ])
  assert.equal(result.status, 'UNVERIFIED')
  assert.equal(result.plan.planId, 'p1')
  assert.equal(result.evaluation.reasons[0].code, 'TRAVEL_DATA')
})

test('generateItinerary surfaces a backend error and stops the pipeline', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ message: 'Gemini unavailable' }), {
      status: 502, headers: { 'content-type': 'application/json' },
    })
  }
  await assert.rejects(() => generateItinerary(request), (error) => {
    assert.equal(error.status, 502)
    assert.equal(error.message, 'Gemini unavailable')
    return true
  })
  assert.equal(calls, 1)
})
