import assert from 'node:assert/strict'
import test from 'node:test'

test('estimated lodging remains separate from verified candidate totals', () => {
  const projection = { subtotalVnd: 2500000, totalVnd: null, uncovered: ['transport'],
    items: [{ category: 'accommodation', amountVnd: 2000000, nights: 2, rooms: 1 }] }
  const cost = getCandidateCost({ evaluation: { components: { cost: {
    known_total: 100000, total_cost: null, missing_costs: ['transport', 'accommodation'], projection,
  } } } })
  assert.equal(cost.knownTotal, 100000)
  assert.equal(cost.complete, false)
  assert.deepEqual(cost.projection, projection)
})

import {
  candidateStatusLabel,
  collectActivitySources,
  collectPlaceIds,
  collectTravelLegs,
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
  getPlanServiceItems,
  getRoutingEvidence,
  groupEvaluationReasons,
  indexPlaces,
  normalizeCandidateStatus,
  planSignature,
  safeSourceUrl,
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

function candidatePlan(planId, placeId, placeIds = null) {
  const ids = Array.isArray(placeIds) ? placeIds : [placeId]
  return {
    planId,
    title: `Trip ${planId}`,
    destinationId: 'H',
    missingData: [],
    assumptions: [],
    days: [{
      dayNumber: 1,
      date: '2026-12-01',
      activities: ids.map((id, index) => ({
        activityId: `${planId}-a${index + 1}`,
        placeId: id,
        type: index === 1 ? 'dining' : 'sightseeing',
        startTime: `${String(9 + index).padStart(2, '0')}:00`,
        endTime: `${String(10 + index).padStart(2, '0')}:00`,
        estimatedCostVnd: 0,
        costStatus: 'KNOWN',
        reason: 'Visit',
      })),
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

test('activity sources and trip services are read from backend fields safely', () => {
  assert.equal(safeSourceUrl('javascript:alert(1)'), null)
  assert.equal(safeSourceUrl('not a url'), null)
  assert.equal(safeSourceUrl('https://example.com/a'), 'https://example.com/a')

  const plan = {
    days: [
      {
        dayNumber: 1,
        activities: [{ activityId: 'a1', placeId: 'ATTR_H_01' }],
        travelLegs: [{ fromPlaceId: 'ATTR_H_01', toPlaceId: 'REST_H_01', durationMin: 12, distanceKm: 3.4 }],
      },
      { dayNumber: 2, activities: [], travelLegs: [{}] },
    ],
    evaluation: {
      components: {
        cost: {
          costEvidence: [{ activityId: 'a1', source: 'https://example.com/place' }],
          projection: {
            items: [
              { category: 'accommodation', name: 'Hotel demo — Deluxe', rooms: 1, nights: 2 },
              { category: 'transport', name: 'Hà Nội → Huế (bus)', travelers: 2 },
            ],
          },
        },
      },
    },
  }

  const sources = collectActivitySources(plan)
  assert.equal(sources.get('a1').url, 'https://example.com/place')
  assert.equal(sources.get('a1').label, 'example.com')

  const services = getPlanServiceItems(plan)
  assert.equal(services.stay.name, 'Hotel demo — Deluxe')
  assert.equal(services.transport.name, 'Hà Nội → Huế (bus)')

  const legs = collectTravelLegs(plan)
  assert.equal(legs.length, 2)
  assert.equal(legs[0].dayNumber, 1)
  assert.equal(legs[1].dayNumber, 2)
})

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('runItineraryPipeline delegates counts 1-3 to the backend pipeline', async () => {
  const calls = []
  const plans = [
    candidatePlan('p1', 'ATTR_H_01'),
    candidatePlan('p2', 'ATTR_H_03'),
    candidatePlan('p3', 'ATTR_H_09'),
  ]
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    const count = calls.at(-1).body.count
    const candidates = plans.slice(0, count).map((candidate) => ({
      planId: candidate.planId,
      plan: candidate,
      status: 'UNVERIFIED',
      evaluation: evaluation(candidate.planId),
    }))
    return jsonResponse({
      pipelineStatus: 'COMPLETE',
      generator: 'ai',
      candidates,
      ranking: {
        ranked: [{ planId: 'p1', score: 0.9, score100: 90 }],
        unscored: [],
        excluded: [],
      },
      warnings: [],
      status: 'UNVERIFIED',
      plan: candidates[0].plan,
      evaluation: candidates[0].evaluation,
    })
  }

  for (const count of [1, 2, 3]) {
    const result = await runItineraryPipeline(request, { count })
    assert.equal(result.candidates.length, count)
    assert.equal(result.pipelineStatus, 'COMPLETE')
    assert.equal(result.candidates[0].evaluation.components.cost.status, 'UNVERIFIED')
    assert.equal(result.ranking.ranked.length, 1)
    assert.equal(result.plan.planId, 'p1')
  }
  assert.deepEqual(calls.map(({ url }) => url), [
    '/itineraries/pipeline',
    '/itineraries/pipeline',
    '/itineraries/pipeline',
  ])
  assert.deepEqual(calls.map(({ body }) => body), [
    { request, count: 1 },
    { request, count: 2 },
    { request, count: 3 },
  ])
})

test('runItineraryPipeline surfaces zero candidates and never falls back to mock data', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    return jsonResponse({ error: 'NO_CANDIDATES', message: 'Gemini returned no candidates' }, 502)
  }

  await assert.rejects(() => runItineraryPipeline(request, { count: 3 }), (error) => {
    assert.equal(error.status, 502)
    assert.equal(error.code, 'NO_CANDIDATES')
    assert.equal(error.message, 'Gemini returned no candidates')
    return true
  })
  assert.deepEqual(calls, ['/itineraries/pipeline'])
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

test('runItineraryPipeline preserves the provider rate-limit code', async () => {
  globalThis.fetch = async () =>
    jsonResponse({ error: 'RATE_LIMIT', message: 'Gemini rate limit reached' }, 429)

  await assert.rejects(() => runItineraryPipeline(request), (error) => {
    assert.equal(error.code, 'RATE_LIMIT')
    assert.equal(error.status, 429)
    assert.match(error.message, /rate limit/i)
    return true
  })
})

test('runItineraryPipeline keeps backend partial results and legacy single-plan responses', async () => {
  const candidate = candidatePlan('p1', 'ATTR_H_01')
  globalThis.fetch = async () => jsonResponse({
    pipelineStatus: 'PARTIAL',
    candidates: [{
      planId: candidate.planId,
      plan: candidate,
      status: 'FEASIBLE',
      evaluation: evaluation(candidate.planId, 'FEASIBLE'),
    }],
    ranking: { ranked: [], unscored: [{ planId: 'p1' }], excluded: [] },
    warnings: [{ code: 'INSUFFICIENT_CANDIDATES', message: 'Only one candidate.' }],
  })
  const partial = await runItineraryPipeline(request)
  assert.equal(partial.pipelineStatus, 'PARTIAL')
  assert.equal(partial.candidates.length, 1)
  assert.equal(partial.candidates[0].status, 'FEASIBLE')
  assert.equal(partial.warnings[0].code, 'INSUFFICIENT_CANDIDATES')
  assert.equal(partial.plan.planId, 'p1')

  globalThis.fetch = async () => jsonResponse({
    status: 'UNVERIFIED',
    plan: candidate,
    evaluation: evaluation(candidate.planId),
  })
  const legacy = await runItineraryPipeline(request)
  assert.equal(legacy.candidates.length, 1)
  assert.equal(legacy.candidates[0].status, 'UNVERIFIED')
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

  assert.equal(candidateStatusLabel('SUCCESS'), 'Unverified')
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


test('fetchPlaceCatalog loads canonical names from backend including imported places', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url) => {
    const parsed = new URL(url, 'http://localhost')
    assert.equal(parsed.pathname, '/api/v1/places')
    assert.deepEqual(parsed.searchParams.getAll('ids'), ['ATTR_H_03', 'REST_H_05', 'OTM_VN_48_X', 'ATTR_UNKNOWN'])
    return Response.json({ places: [
      { id: 'ATTR_H_03', name: 'Đại Nội', openingHours: '07:00 - 17:30' },
      { id: 'REST_H_05', name: 'Bún bò mệ Kéo', openingHours: '06:00 - 10:00' },
      { id: 'OTM_VN_48_X', name: 'Địa điểm Đà Nẵng' },
    ] })
  }
  const places = await fetchPlaceCatalog({
    ids: ['ATTR_H_03', 'REST_H_05', 'OTM_VN_48_X', 'ATTR_UNKNOWN'],
  })

  assert.deepEqual(places.map((place) => place.name), ['Đại Nội', 'Bún bò mệ Kéo', 'Địa điểm Đà Nẵng'])
  assert.equal(places[0].openingHours, '07:00 - 17:30')
  assert.equal(places[1].openingHours, '06:00 - 10:00')
})

test('place lookup sends the selected destination to avoid loading other folders', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url) => {
    const parsed = new URL(url, 'http://localhost')
    assert.equal(parsed.searchParams.get('destination'), 'H')
    assert.deepEqual(parsed.searchParams.getAll('ids'), ['ATTR_H_03'])
    return Response.json({ places: [{ id: 'ATTR_H_03', name: 'Đại Nội' }] })
  }
  assert.equal((await fetchPlaceCatalog({ ids: ['ATTR_H_03'], destination: 'H' }))[0].name, 'Đại Nội')
})


test('Results helpers group backend reasons into topics', () => {
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
  assert.deepEqual(groups.map((group) => group.label), ['Budget', 'Travel time', 'Unverified route', 'Trip details'])
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
    'Not enough travel time between Đại Nội and Bún bò mệ Kéo.'
  )
})

test('Evaluation checks use clear labels and never invent a status', () => {
  assert.deepEqual(VERIFICATION_CHECKS.map((check) => check.label), ['Budget', 'Schedule', 'Travel'])
  assert.equal(getCheckStatus({ components: { cost: { status: 'UNVERIFIED' } } }, 'cost'), 'UNVERIFIED')
  assert.equal(getCheckStatus({ components: { cost: { status: 'SUCCESS' } } }, 'cost'), null)
  assert.equal(getCheckStatus(null, 'cost'), null)
})

async function renderCandidateComparison(candidates, ranking, selectedPlan = null) {
  const { JSDOM, VirtualConsole } = await import('jsdom')
  const { build } = await import('esbuild')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { fileURLToPath, pathToFileURL } = await import('node:url')

  const virtualConsole = new VirtualConsole()
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', virtualConsole })
  const replacements = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  if (selectedPlan) {
    dom.window.localStorage.setItem('tpva_selected_plan_id', selectedPlan.planId)
    dom.window.localStorage.setItem('tpva_selected_plan_data', JSON.stringify(selectedPlan))
    replacements.fetch = async (url) => {
      assert.match(String(url), /\/api\/v1\/places\?/)
      assert.equal(new URL(url, 'http://localhost').searchParams.get('destination'), selectedPlan.destinationId)
      return Response.json({ places: [
        { id: 'OTM_VN_48_X', name: 'Địa điểm Đà Nẵng', city: 'Đà Nẵng', destinationId: 'VN_48' },
      ] })
    }
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
      entryPoints: [fileURLToPath(new URL(selectedPlan ? '../pages/SelectedPlanPage.jsx' : '../components/comparison/CandidateComparison.jsx', import.meta.url))],
      outfile: output,
      bundle: true,
      format: 'esm',
      platform: 'node',
      jsx: 'automatic',
      packages: 'external',
      loader: { '.jpg': 'empty', '.png': 'empty' },
      define: { 'import.meta.env.VITE_API_BASE': 'undefined' },
    })
    const React = (await import('react')).default
    const { act } = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { MemoryRouter } = await import('react-router-dom')
    const { default: CandidateComparison } = await import(pathToFileURL(output).href)
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

test('SelectedPlanPage resolves saved place IDs from the backend after reopening', async () => {
  const selected = { ...candidatePlan('saved-plan', 'OTM_VN_48_X'), destinationId: 'VN_48', status: 'UNVERIFIED', missing: [] }
  const { dom, cleanup } = await renderCandidateComparison([], {}, selected)
  try {
    const { act } = await import('react')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.equal(dom.window.document.querySelector('.activity-name')?.textContent, 'Địa điểm Đà Nẵng')
    assert.equal(dom.window.document.querySelector('.activity-card')?.getAttribute('data-place-id'), 'OTM_VN_48_X')
  } finally {
    await cleanup()
  }
})

test('CandidateComparison keeps projected estimates off the compact card without promoting status', async () => {
  const result = evaluation('hotel-demo')
  result.components.cost.projection = {
    subtotalVnd: 2400000, totalVnd: null, uncovered: ['transport'],
    items: [{ category: 'accommodation', name: 'Hotel demo', rooms: 1, nights: 2, amountVnd: 2200000 }],
  }
  const { dom, cleanup } = await renderCandidateComparison([
    { planId: 'hotel-demo', status: 'UNVERIFIED', plan: candidatePlan('hotel-demo', 'ATTR_H_01'), evaluation: result },
  ], { ranked: [], unscored: [], excluded: [] })
  try {
    const body = dom.window.document.body.textContent
    assert.doesNotMatch(body, /Estimated total/)
    assert.match(body, /Unverified 1 cost item/)
    assert.equal(dom.window.document.querySelector('[data-testid="candidate-recommended-hotel-demo"]'), null)
  } finally {
    await cleanup()
  }
})

test('CandidateComparison keeps transport projection details for the detail page', async () => {
  const result = evaluation('transport-demo')
  result.components.cost.projection = {
    subtotalVnd: 800000, totalVnd: null, uncovered: [],
    items: [{ category: 'transport', name: 'Hà Nội → Huế (bus)', travelers: 2,
      perPersonVnd: 400000, amountVnd: 800000, status: 'ESTIMATED', sourceUrl: null }],
  }
  const { dom, cleanup } = await renderCandidateComparison([
    { planId: 'transport-demo', status: 'UNVERIFIED', plan: candidatePlan('transport-demo', 'ATTR_H_01'), evaluation: result },
  ], { ranked: [], unscored: [], excluded: [] })
  try {
    const body = dom.window.document.body.textContent
    assert.doesNotMatch(body, /2 people/)
    assert.doesNotMatch(body, /One way/)
    assert.match(body, /Unverified 1 cost item/)
  } finally { await cleanup() }
})

test('SelectedPlanPage shows projections and verification details for a plan', async () => {
  const result = evaluation('hotel-detail', 'UNVERIFIED', [
    { code: 'BUDGET', status: 'UNVERIFIED', message: 'Budget is missing or invalid.' },
  ])
  result.components.cost.costEvidence = [
    { activityId: 'hotel-detail-a1', category: 'activities', source: 'https://example.com/place' },
  ]
  result.components.cost.projection = {
    subtotalVnd: 3200000, totalVnd: null, uncovered: [],
    items: [
      {
        category: 'accommodation', name: 'Hotel demo — Deluxe', rooms: 1, nights: 2,
        unitPriceVnd: 1100000, amountVnd: 2200000, status: 'ESTIMATED',
        sourceUrl: 'https://example.com/hotel',
      },
      {
        category: 'transport', name: 'Hà Nội → Huế (bus)', travelers: 2,
        perPersonVnd: 400000, amountVnd: 800000, status: 'ESTIMATED',
        sourceUrl: 'https://example.com/bus',
      },
    ],
  }
  const selected = {
    ...candidatePlan('hotel-detail', 'ATTR_H_01'),
    days: [
      ...candidatePlan('hotel-detail', 'ATTR_H_01').days,
      {
        dayNumber: 2,
        date: '2026-12-02',
        activities: [{
          activityId: 'hotel-detail-a2',
          placeId: 'ATTR_H_02',
          type: 'sightseeing',
          startTime: '09:00',
          endTime: '10:00',
        }],
        travelLegs: [],
      },
    ],
    id: 'hotel-detail',
    status: 'UNVERIFIED',
    evaluation: result,
    missing: [],
  }
  const { dom, cleanup } = await renderCandidateComparison([], {}, selected)
  try {
    const body = dom.window.document.body.textContent
    assert.match(body, /Estimated trip total/)
    assert.match(body, /3,200,000/)
    assert.match(body, /Stay/)
    assert.match(body, /1 room/)
    assert.match(body, /2 nights/)
    assert.match(body, /Hotel demo/)
    assert.match(body, /Transport/)
    assert.match(body, /Hà Nội → Huế/)
    assert.match(body, /2 people/)
    assert.match(body, /800,000 VND/)
    assert.match(body, /Travel legs by day/)
    const serviceSources = dom.window.document.querySelectorAll('.service-card .source-name-link')
    assert.equal(serviceSources.length, 2)
    assert.equal(serviceSources[0].getAttribute('href'), 'https://example.com/hotel')
    assert.equal(serviceSources[1].getAttribute('href'), 'https://example.com/bus')
    const activitySource = dom.window.document.querySelector('.activity-card .source-name-link')
    assert.equal(activitySource.getAttribute('href'), 'https://example.com/place')
    assert.equal(activitySource.getAttribute('target'), '_blank')
    assert.match(activitySource.getAttribute('rel'), /noopener/)
    assert.equal(dom.window.document.querySelector('.activity-name-row .source-link'), null)
    assert.equal(dom.window.document.querySelector('.cost-row .source-link'), null)
    assert.doesNotMatch(body, /Request a change/)
    assert.match(body, /Verification checks/)
    assert.match(body, /Budget/)
    assert.equal(dom.window.document.querySelectorAll('.intro-actions button').length, 2)
    assert.ok(dom.window.document.querySelector('.selected-summary-actions'))
    assert.ok(dom.window.document.querySelector('.selected-summary-back'))
    assert.equal(dom.window.document.querySelectorAll('.chosen-header-tools button').length, 0)
    const { act } = await import('react')
    assert.equal(dom.window.document.querySelectorAll('.timeline-day-group').length, 2)
    await act(async () => {
      dom.window.document.querySelector('[data-testid="schedule-day-2"]').click()
    })
    assert.equal(dom.window.document.querySelectorAll('.timeline-day-group').length, 1)
    assert.match(dom.window.document.querySelector('.timeline-day-group').textContent, /Day 2/)
    await act(async () => {
      dom.window.document.querySelector('[data-testid="schedule-day-all"]').click()
    })
    assert.equal(dom.window.document.querySelectorAll('.timeline-day-group').length, 2)
    const checklistInput = dom.window.document.querySelector('.trip-checklist .checklist-input')
    assert.ok(checklistInput)
    assert.equal(dom.window.localStorage.getItem('tpva_trip_checklist:hotel-detail'), null)
    await act(async () => {
      checklistInput.click()
    })
    assert.deepEqual(
      JSON.parse(dom.window.localStorage.getItem('tpva_trip_checklist:hotel-detail')),
      { 'room-transport-prices': true }
    )

    assert.equal(dom.window.document.querySelector('.chosen-header-banner'), null)
    const removeButton = dom.window.document.querySelector('.selected-summary-actions .btn-remove')
    assert.match(removeButton.textContent, /Remove from your trip/)
    assert.match(
      dom.window.document.querySelector('.chosen-notice').textContent,
      /Saved as your trip\. Find it again under Selected\./
    )
    await act(async () => {
      removeButton.click()
    })
    assert.equal(dom.window.document.querySelector('.chosen-notice'), null)
    assert.match(
      dom.window.document.querySelector('.chosen-header-banner').textContent,
      /Removed from your trip/
    )
    const saveButton = dom.window.document.querySelector('.selected-summary-actions .btn-choose')
    assert.match(saveButton.textContent, /Save to your trip/)
    await act(async () => {
      saveButton.click()
    })
    assert.ok(dom.window.document.querySelector('.chosen-header-banner'))
    assert.match(
      dom.window.document.querySelector('.chosen-header-banner').textContent,
      /Saved to your trip/
    )
    assert.match(
      dom.window.document.querySelector('.chosen-notice').textContent,
      /Saved as your trip\. Find it again under Selected\./
    )
    assert.match(
      dom.window.document.querySelector('.selected-summary-actions .btn-remove').textContent,
      /Remove from your trip/
    )
  } finally {
    await cleanup()
  }
})

test('CandidateComparison renders 0-3 candidates and compares same-destination plans', async () => {
  for (const count of [0, 1, 2, 3]) {
    const routeSets = [
      ['ATTR_H_01', 'ATTR_H_02', 'ATTR_H_03'],
      ['ATTR_H_01', 'ATTR_H_03', 'ATTR_H_02'],
      ['ATTR_H_01', 'ATTR_H_04', 'ATTR_H_05'],
    ]
    const candidates = Array.from({ length: count }, (_, index) => {
      const id = `p-${count}-${index + 1}`
      const plan = candidatePlan(
        id,
        'ATTR_H_01',
        count === 3 ? routeSets[index] : null
      )
      if (count === 3) {
        plan.days.push({
          dayNumber: 2,
          date: '2026-12-02',
          activities: [{
            activityId: `${id}-day-2`,
            placeId: 'ATTR_H_06',
            type: 'sightseeing',
            startTime: '09:00',
            endTime: '10:00',
          }],
        })
      }
      return {
        planId: id,
        status: 'UNVERIFIED',
        plan,
        evaluation: evaluation(id),
      }
    })
    const { dom, cleanup } = await renderCandidateComparison(candidates, {
      ranked: [],
      unscored: [],
      excluded: [],
    })
    try {
      const cards = dom.window.document.querySelectorAll('.plan-card')
      assert.equal(cards.length, count)
      if (count === 0) {
        assert.match(dom.window.document.body.textContent, /No itineraries to compare/)
      } else {
        const sectionHeading = dom.window.document.querySelector('#candidate-results-heading')
        assert.equal(sectionHeading.textContent.trim(), 'Find the plan that feels like you')
        assert.equal(
          sectionHeading.nextElementSibling.textContent.trim(),
          'Compare recommended destinations, stops, and daily pace to find your best fit.'
        )
        assert.doesNotMatch(dom.window.document.body.textContent, /3 plan comparison/i)

        if (count === 1) {
          assert.equal(dom.window.document.querySelector('.compare-matrix'), null)
          assert.equal(dom.window.document.querySelector('.route-compare'), null)
          assert.equal(dom.window.document.querySelector('.same-destination-note'), null)
          assert.equal(dom.window.document.querySelector('.card-difference'), null)
          assert.doesNotMatch(
            dom.window.document.body.textContent,
            /1 itineraries|unique stop|Only here|Only in this plan|different mix of stops/i
          )
        }

        if (count === 3) {
          const doc = dom.window.document
          assert.match(doc.body.textContent, /3 plans · Huế/)
          assert.match(doc.body.textContent, /Same destination, different plans/)
          assert.match(
            doc.body.textContent,
            /Adds 2 stops no other plan includes: ATTR_H_04, ATTR_H_05\./
          )
          assert.match(
            doc.body.textContent,
            /Uses the same stops as Option 1, but in a different order\./
          )
          assert.ok(doc.querySelector('.compare-matrix'))
          assert.ok(doc.querySelector('.route-compare'))
          assert.equal(
            doc.querySelector('.compare-matrix-head h3').textContent,
            'Compare details'
          )
          const firstCard = doc.querySelector('.plan-card')
          assert.ok(
            firstCard.compareDocumentPosition(doc.querySelector('.compare-matrix-block')) &
              dom.window.Node.DOCUMENT_POSITION_FOLLOWING
          )
          assert.ok(
            doc.querySelector('.compare-matrix-block').compareDocumentPosition(
              doc.querySelector('.route-compare')
            ) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING
          )
          assert.ok(doc.querySelector('th[scope="row"] .compare-row-label'))
          assert.ok(
            [...doc.querySelectorAll('.compare-row-label')].some(
              (label) => label.textContent === 'Route difference'
            )
          )
          assert.match(doc.body.textContent, /Day 1: 3 stops · Day 2: 1 stop/)
          assert.equal(doc.querySelectorAll('.route-compare-column').length, 3)
          assert.equal(doc.querySelectorAll('.route-stop-list li').length, 9)
          assert.ok(doc.querySelectorAll('.compare-row--differs').length >= 1)

          const { act } = await import('react')
          const matrixRows = doc.querySelectorAll('.compare-matrix tbody tr')
          assert.equal(matrixRows.length, 6)
          assert.ok(doc.querySelector('.compare-view-thumb'))
          assert.equal(doc.querySelectorAll('.compare-view-toggle button').length, 2)
          await act(async () => {
            doc.querySelector('[data-testid="compare-differences-only"]').click()
          })
          assert.equal(
            doc.querySelector('[data-testid="compare-differences-only"]').getAttribute('aria-pressed'),
            'true'
          )
          assert.equal(doc.querySelectorAll('.compare-matrix tbody tr').length, 1)

          await act(async () => {
            doc.querySelectorAll('.compare-view-toggle button')[0].click()
          })
          assert.equal(doc.querySelectorAll('.compare-matrix tbody tr').length, 6)
          await act(async () => {
            doc.querySelector('[data-testid="compare-differences-only"]').click()
          })
          assert.equal(doc.querySelectorAll('.compare-matrix tbody tr').length, 1)
          assert.ok(doc.querySelector('.compare-view-thumb'))

          await act(async () => {
            doc.querySelector('[data-day-number="2"]').click()
          })
          assert.equal(doc.querySelectorAll('.route-stop-list li').length, 3)
          assert.match(doc.querySelector('.route-compare-day-title').textContent, /Day 2/)
          await act(async () => {
            doc.querySelector('[data-day-number="1"]').click()
          })
          assert.equal(doc.querySelectorAll('.route-stop-list li').length, 9)
        }
      }
    } finally {
      await cleanup()
    }
  }
})

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
    assert.equal(doc.querySelector('[data-testid="candidate-status-p-feasible"]').textContent, 'Feasible')
    assert.equal(doc.querySelector('[data-testid="candidate-status-p-unverified"]').textContent, 'Unverified')
    assert.equal(doc.querySelector('[data-testid="candidate-status-p-infeasible"]').textContent, 'Not feasible')

    // Only the ranked FEASIBLE candidate carries a verified recommendation tag.
    assert.ok(doc.querySelector('[data-testid="candidate-recommended-p-feasible"]'))
    assert.equal(doc.querySelector('[data-testid="candidate-recommended-p-unverified"]'), null)
    assert.equal(doc.querySelector('[data-testid="candidate-recommended-p-infeasible"]'), null)

    // Known vs unknown costs are never conflated.
    assert.match(doc.body.textContent, /Total cost/)
    assert.match(doc.body.textContent, /Known costs · partial/)
    assert.match(doc.body.textContent, /Unverified 1 cost item/)

    // Routing evidence is summarised per candidate on the card.
    assert.match(doc.body.textContent, /Route: 2\/2 legs verified/)

    // INFEASIBLE cannot be selected and is never called verified/recommended.
    const infeasibleCard = [...doc.querySelectorAll('.plan-card')].find((node) => node.textContent.includes('Not feasible'))
    const selectButton = [...infeasibleCard.querySelectorAll('button')].find((node) => node.textContent.includes('Choose this plan'))
    assert.equal(selectButton.disabled, true)
    assert.equal(infeasibleCard.textContent.includes('Suggested'), false)
    assert.match(infeasibleCard.textContent, /Breaks trip constraints/)
  } finally {
    await cleanup()
  }
})
