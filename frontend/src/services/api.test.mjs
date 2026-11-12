import assert from 'node:assert/strict'
import test from 'node:test'

import {
  candidateStatusLabel,
  collectPlaceIds,
  createNameResolver,
  displayPlaceName,
  evaluateItinerary,
  fetchDestinations,
  fetchPlaceCatalog,
  formatReason,
  generateItinerary,
  getCandidateCost,
  getCandidateRanking,
  getCandidateWarnings,
  getCheckStatus,
  getRoutingEvidence,
  groupEvaluationReasons,
  indexPlaces,
  normalizeCandidateStatus,
  planSignature,
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

function candidatePlan(planId, placeId) {
  return {
    planId,
    title: `Trip ${planId}`,
    destinationId: 'H',
    missingData: [],
    assumptions: [],
    days: [{
      dayNumber: 1,
      date: '2026-12-01',
      activities: [{ activityId: `${planId}-a1`, placeId, type: 'sightseeing', startTime: '09:00', endTime: '10:00', estimatedCostVnd: 0, costStatus: 'KNOWN', reason: 'Visit' }],
      travelLegs: [],
    }],
  }
}

function evaluation(planId, status = 'UNVERIFIED', reasons = []) {
  return {
    planId,
    status,
    reasons,
    components: {
      cost: {
        status,
        known_total: 100000,
        missing_costs: status === 'FEASIBLE' ? [] : ['transport'],
        total_cost: status === 'FEASIBLE' ? 100000 : null,
      },
      routing: { enabled: true, routes: [] },
    },
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('runItineraryPipeline returns three real candidates with evaluation and ranking', async () => {
  const calls = []
  const plans = [candidatePlan('p1', 'ATTR_H_01'), candidatePlan('p2', 'ATTR_H_03'), candidatePlan('p3', 'ATTR_H_09')]
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    calls.push({ url, body })
    if (url === '/itineraries/generate') {
      const index = calls.filter((call) => call.url === '/itineraries/generate').length - 1
      return jsonResponse({ status: 'UNVERIFIED', plan: plans[index] })
    }
    if (url === '/itineraries/evaluate') {
      return jsonResponse(evaluation(body.plan.planId))
    }
    if (url === '/itineraries/rank') {
      return jsonResponse({
        ranked: body.plans.map((plan, index) => ({ planId: plan.planId, score: 0.9 - index * 0.1, score100: 90 - index * 10 })),
        unscored: [],
        excluded: [],
      })
    }
    throw new Error(`Unexpected fetch ${url}`)
  }

  const result = await runItineraryPipeline(request, { count: 3 })

  assert.deepEqual(
    calls.map((call) => call.url),
    ['/itineraries/generate', '/itineraries/generate', '/itineraries/generate', '/itineraries/evaluate', '/itineraries/evaluate', '/itineraries/evaluate', '/itineraries/rank']
  )
  assert.equal(result.pipelineStatus, 'COMPLETE')
  assert.deepEqual(result.candidates.map((candidate) => candidate.planId), ['p1', 'p2', 'p3'])
  assert.equal(result.candidates[0].evaluation.components.cost.status, 'UNVERIFIED')
  assert.equal(result.ranking.ranked.length, 3)
  // Legacy single-plan fields stay available.
  assert.equal(result.status, 'UNVERIFIED')
  assert.equal(result.plan.planId, 'p1')
})

test('runItineraryPipeline returns two candidates and marks the batch partial', async () => {
  const plans = [candidatePlan('p1', 'ATTR_H_01'), candidatePlan('p2', 'ATTR_H_03')]
  let generateCount = 0
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    if (url === '/itineraries/generate') {
      const plan = plans[generateCount % plans.length]
      generateCount += 1
      return jsonResponse({ status: 'UNVERIFIED', plan })
    }
    if (url === '/itineraries/evaluate') return jsonResponse(evaluation(body.plan.planId))
    if (url === '/itineraries/rank') {
      return jsonResponse({ ranked: [{ planId: 'p1', score: 0.8, score100: 80 }], unscored: [], excluded: [{ planId: 'p2', status: 'UNVERIFIED', reasons: [] }] })
    }
    throw new Error(`Unexpected fetch ${url}`)
  }

  const result = await runItineraryPipeline(request, { count: 3, maxAttempts: 3 })

  assert.equal(result.candidates.length, 2)
  assert.equal(result.pipelineStatus, 'PARTIAL')
  assert.ok(result.warnings.some((warning) => warning.code === 'INSUFFICIENT_CANDIDATES'))
})

test('runItineraryPipeline returns one candidate when the assistant repeats itself', async () => {
  const plan = candidatePlan('p1', 'ATTR_H_01')
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    if (url === '/itineraries/generate') return jsonResponse({ status: 'UNVERIFIED', plan })
    if (url === '/itineraries/evaluate') return jsonResponse(evaluation(body.plan.planId, 'FEASIBLE'))
    if (url === '/itineraries/rank') return jsonResponse({ ranked: [{ planId: 'p1', score: 0.7, score100: 70 }], unscored: [], excluded: [] })
    throw new Error(`Unexpected fetch ${url}`)
  }

  const result = await runItineraryPipeline(request, { count: 3, maxAttempts: 2 })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.pipelineStatus, 'PARTIAL')
  assert.equal(result.candidates[0].status, 'FEASIBLE')
  assert.equal(result.ranking.ranked[0].planId, 'p1')
})

test('runItineraryPipeline surfaces zero candidates and never falls back to mock data', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    return jsonResponse({ error: 'EMPTY', message: 'Gemini returned no candidates' }, 502)
  }

  await assert.rejects(() => runItineraryPipeline(request, { count: 3 }), (error) => {
    assert.equal(error.status, 502)
    assert.equal(error.code, 'AI_UNAVAILABLE')
    assert.equal(error.message, 'Gemini returned no candidates')
    return true
  })
  assert.equal(calls.length, 1)
  assert.ok(calls.every((url) => url.startsWith('/itineraries/')))
})

test('runItineraryPipeline maps a timeout to a retryable TIMEOUT code', async () => {
  globalThis.fetch = async () =>
    jsonResponse({ error: 'TIMEOUT', message: 'Assistant timed out' }, 504)

  await assert.rejects(() => runItineraryPipeline(request), (error) => {
    assert.equal(error.code, 'TIMEOUT')
    assert.equal(error.status, 504)
    return true
  })
})

test('runItineraryPipeline keeps earlier candidates when a later one fails', async () => {
  const plan = candidatePlan('p1', 'ATTR_H_01')
  let generateCount = 0
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    if (url === '/itineraries/generate') {
      generateCount += 1
      if (generateCount === 1) return jsonResponse({ status: 'UNVERIFIED', plan })
      return jsonResponse({ error: 'API_ERROR', message: 'quota exceeded' }, 502)
    }
    if (url === '/itineraries/evaluate') return jsonResponse(evaluation(body.plan.planId))
    if (url === '/itineraries/rank') return jsonResponse({ ranked: [], unscored: [{ planId: 'p1' }], excluded: [] })
    throw new Error(`Unexpected fetch ${url}`)
  }

  const result = await runItineraryPipeline(request, { count: 3, allowPartial: true })

  assert.equal(result.pipelineStatus, 'PARTIAL')
  assert.deepEqual(result.candidates.map((candidate) => candidate.planId), ['p1'])
  assert.ok(result.warnings.some((warning) => warning.code === 'PARTIAL_GENERATION'))
})

test('runItineraryPipeline can refuse partial results', async () => {
  const plan = candidatePlan('p1', 'ATTR_H_01')
  let generateCount = 0
  globalThis.fetch = async (url) => {
    if (url === '/itineraries/generate') {
      generateCount += 1
      if (generateCount === 1) return jsonResponse({ status: 'UNVERIFIED', plan })
      return jsonResponse({ error: 'API_ERROR', message: 'quota exceeded' }, 502)
    }
    throw new Error(`Unexpected fetch ${url}`)
  }

  await assert.rejects(
    () => runItineraryPipeline(request, { count: 3, allowPartial: false }),
    (error) => {
      assert.equal(error.code, 'AI_UNAVAILABLE')
      return true
    }
  )
})

test('planSignature treats duplicate visits as the same candidate', () => {
  const a = candidatePlan('p1', 'ATTR_H_01')
  const b = candidatePlan('p2', 'ATTR_H_01')
  b.days[0].activities[0].startTime = '10:00'
  assert.equal(planSignature(a), planSignature(b))
  assert.notEqual(planSignature(a), planSignature(candidatePlan('p3', 'ATTR_H_03')))
})

test('comparison helpers separate known vs unknown costs and routing evidence', () => {
  const feasible = {
    planId: 'p1',
    status: 'FEASIBLE',
    evaluation: evaluation('p1', 'FEASIBLE'),
    ranking: { excluded: [] },
  }
  feasible.evaluation.components.routing.routes = [
    { status: 'ROUTE_AVAILABLE', evidenceStatus: 'VERIFIED' },
    { status: 'ROUTE_REVIEW_REQUIRED', evidenceStatus: 'UNVERIFIED' },
  ]
  const cost = getCandidateCost(feasible)
  assert.equal(cost.complete, true)
  assert.equal(cost.knownTotal, 100000)
  assert.deepEqual(cost.missing, [])

  const unverified = {
    planId: 'p2',
    status: 'UNVERIFIED',
    evaluation: evaluation('p2', 'UNVERIFIED', [{ code: 'UNSUPPORTED_LEG', status: 'UNVERIFIED', message: 'Missing leg' }]),
    ranking: { excluded: [] },
  }
  const unverifiedCost = getCandidateCost(unverified)
  assert.equal(unverifiedCost.complete, false)
  assert.deepEqual(unverifiedCost.missing, ['transport'])
  assert.equal(getRoutingEvidence(unverified).available, true)
  assert.equal(getRoutingEvidence(unverified).total, 0)

  const routing = getRoutingEvidence(feasible)
  assert.equal(routing.total, 2)
  assert.equal(routing.verified, 1)
  assert.equal(routing.unverified, 1)

  assert.equal(candidateStatusLabel('SUCCESS'), 'Chưa xác minh')
  assert.equal(normalizeCandidateStatus('FEASIBLE'), 'FEASIBLE')
  assert.equal(normalizeCandidateStatus('nope'), 'UNVERIFIED')

  const ranking = {
    ranked: [{ planId: 'p1', score: 0.5, score100: 50 }],
    unscored: [{ planId: 'p2' }],
    excluded: [{ planId: 'p3', reasons: [] }],
  }
  assert.equal(getCandidateRanking(ranking, 'p1').kind, 'ranked')
  assert.equal(getCandidateRanking(ranking, 'p1').position, 1)
  assert.equal(getCandidateRanking(ranking, 'p2').kind, 'unscored')
  assert.equal(getCandidateRanking(ranking, 'p3').kind, 'excluded')

  const warnings = getCandidateWarnings(unverified, ranking)
  assert.deepEqual(warnings.map((warning) => warning.code), ['UNSUPPORTED_LEG'])
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

async function renderCandidateComparison(candidates, ranking) {
  const { JSDOM, VirtualConsole } = await import('jsdom')
  const { build } = await import('esbuild')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')

  const virtualConsole = new VirtualConsole()
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', virtualConsole })
  const replacements = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const originals = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }

  const temp = await mkdtemp(fileURLToPath(new URL('../../node_modules/.candidate-comparison-test-', import.meta.url)))
  const output = join(temp, 'CandidateComparison.mjs')

  async function cleanup() {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    await rm(temp, { recursive: true, force: true })
  }

  try {
    await build({
      entryPoints: [fileURLToPath(new URL('../components/comparison/CandidateComparison.jsx', import.meta.url))],
      outfile: output,
      bundle: true,
      format: 'esm',
      platform: 'node',
      jsx: 'automatic',
      packages: 'external',
      define: { 'import.meta.env.VITE_API_BASE': 'undefined' },
    })
    const React = (await import('react')).default
    const { act } = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { MemoryRouter } = await import('react-router-dom')
    const { default: CandidateComparison } = await import(output)
    const root = createRoot(dom.window.document.querySelector('#root'))
    await act(async () => {
      root.render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(CandidateComparison, {
            candidates,
            ranking,
            selectedPlanId: null,
            placesById: new Map([
              ['ATTR_H_01', { id: 'ATTR_H_01', name: 'lăng Khải Định', city: 'Huế', destinationId: 'H' }],
            ]),
            onSelectPlan: () => {},
          })
        )
      )
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    return {
      dom,
      root,
      async cleanup() {
        await act(async () => {
          root.unmount()
        })
        dom.window.close()
        await cleanup()
      },
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

test('CandidateComparison UI separates FEASIBLE, UNVERIFIED and INFEASIBLE candidates', async () => {
  const feasiblePlan = candidatePlan('p-feasible', 'ATTR_H_01')
  const unverifiedPlan = candidatePlan('p-unverified', 'ATTR_H_01')
  const infeasiblePlan = candidatePlan('p-infeasible', 'ATTR_H_01')
  const candidates = [
    {
      planId: 'p-feasible',
      status: 'FEASIBLE',
      plan: feasiblePlan,
      evaluation: {
        planId: 'p-feasible',
        status: 'FEASIBLE',
        reasons: [],
        components: {
          cost: { status: 'FEASIBLE', known_total: 500000, missing_costs: [], total_cost: 500000, budget: 1000000 },
          schedule: { status: 'FEASIBLE', reasons: [] },
          travel: { status: 'FEASIBLE', reasons: [] },
          routing: { enabled: true, routes: [
            { status: 'ROUTE_AVAILABLE', evidenceStatus: 'VERIFIED' },
            { status: 'ROUTE_AVAILABLE', evidenceStatus: 'VERIFIED' },
          ] },
        },
      },
    },
    {
      planId: 'p-unverified',
      status: 'UNVERIFIED',
      plan: unverifiedPlan,
      evaluation: {
        planId: 'p-unverified',
        status: 'UNVERIFIED',
        reasons: [{ code: 'UNSUPPORTED_LEG', status: 'UNVERIFIED', message: 'Chặng đi chưa được xác minh.' }],
        components: {
          cost: { status: 'UNVERIFIED', known_total: 200000, missing_costs: ['transport'], total_cost: null, budget: 1000000 },
          schedule: { status: 'UNVERIFIED', reasons: [] },
          travel: { status: 'UNVERIFIED', reasons: [] },
          routing: { enabled: true, routes: [] },
        },
      },
    },
    {
      planId: 'p-infeasible',
      status: 'INFEASIBLE',
      plan: infeasiblePlan,
      evaluation: {
        planId: 'p-infeasible',
        status: 'INFEASIBLE',
        reasons: [{ code: 'BUDGET', status: 'INFEASIBLE', message: 'Known costs exceed budget.' }],
        components: {
          cost: { status: 'INFEASIBLE', known_total: 900000, missing_costs: [], total_cost: 900000, budget: 500000 },
          schedule: { status: 'FEASIBLE', reasons: [] },
          travel: { status: 'FEASIBLE', reasons: [] },
          routing: { enabled: true, routes: [] },
        },
      },
    },
  ]
  const ranking = {
    ranked: [{ planId: 'p-feasible', score: 0.8, score100: 80 }],
    unscored: [{ planId: 'p-unverified' }],
    excluded: [{ planId: 'p-infeasible', status: 'INFEASIBLE', reasons: [] }],
  }

  const { dom, cleanup } = await renderCandidateComparison(candidates, ranking)
  const doc = dom.window.document
  try {
    assert.equal(doc.querySelector('[data-testid="candidate-status-p-feasible"]').textContent, 'Đủ điều kiện')
    assert.equal(doc.querySelector('[data-testid="candidate-status-p-unverified"]').textContent, 'Chưa xác minh')
    assert.equal(doc.querySelector('[data-testid="candidate-status-p-infeasible"]').textContent, 'Không khả thi')

    // Only the ranked FEASIBLE candidate carries a verified recommendation tag.
    assert.ok(doc.querySelector('[data-testid="candidate-recommended-p-feasible"]'))
    assert.equal(doc.querySelector('[data-testid="candidate-recommended-p-unverified"]'), null)
    assert.equal(doc.querySelector('[data-testid="candidate-recommended-p-infeasible"]'), null)

    // Known vs unknown costs are never conflated.
    assert.match(doc.body.textContent, /Tổng chi phí/)
    assert.match(doc.body.textContent, /Tổng đã biết/)
    assert.match(doc.body.textContent, /Chưa xác minh 1 mục \(không tính là 0\): transport/)

    // Routing evidence is shown per candidate.
    assert.match(doc.body.textContent, /Lộ trình: 2\/2 chặng đã xác minh/)
    assert.match(doc.body.textContent, /Chưa có bằng chứng lộ trình/)

    // INFEASIBLE cannot be selected and is never called verified/recommended.
    const infeasibleCard = [...doc.querySelectorAll('.plan-card')].find((node) => node.textContent.includes('p-infeasible'))
    const selectButton = [...infeasibleCard.querySelectorAll('button')].find((node) => node.textContent.includes('Chọn lịch này'))
    assert.equal(selectButton.disabled, true)
    assert.equal(infeasibleCard.textContent.includes('Đề xuất đã xếp hạng'), false)
  } finally {
    await cleanup()
  }
})
