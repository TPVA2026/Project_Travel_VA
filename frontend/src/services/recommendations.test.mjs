import assert from 'node:assert/strict'
import test from 'node:test'
import { MOCK_PLANS } from './mockData.js'
import { getCandidatePresentation, getTopFeasiblePlans } from './recommendations.js'

test('mock recommendations provide three feasible results with the best match first', () => {
  const topPlans = getTopFeasiblePlans(MOCK_PLANS)

  assert.equal(topPlans.length, 3)
  assert.equal(topPlans[0].id, 'p1')
  assert.ok(topPlans.every((plan) => plan.status === 'FEASIBLE'))
})

test('getTopFeasiblePlans excludes unverified and infeasible plans', () => {
  const plans = [
    { id: 'feasible', status: 'FEASIBLE' },
    { id: 'unverified', status: 'UNVERIFIED' },
    { id: 'infeasible', status: 'INFEASIBLE' },
  ]

  assert.deepEqual(getTopFeasiblePlans(plans).map((plan) => plan.id), ['feasible'])
})

test('getTopFeasiblePlans ranks matches and limits results to three', () => {
  const plans = [
    { id: 'lower-match', status: 'FEASIBLE', fit: ['a'], notFit: [] },
    { id: 'best', status: 'FEASIBLE', fit: ['a', 'b'], notFit: [] },
    { id: 'more-mismatches', status: 'FEASIBLE', fit: ['a', 'b'], notFit: ['c'] },
    { id: 'fourth', status: 'FEASIBLE', fit: ['a'], notFit: [] },
    { id: 'not-feasible', status: 'UNVERIFIED', fit: ['a', 'b', 'c'] },
  ]

  assert.deepEqual(
    getTopFeasiblePlans(plans).map((plan) => plan.id),
    ['best', 'more-mismatches', 'lower-match']
  )
})

test('getTopFeasiblePlans does not reorder the source array', () => {
  const plans = [
    { id: 'lower-match', status: 'FEASIBLE', fit: [] },
    { id: 'best', status: 'FEASIBLE', fit: ['a'] },
  ]

  getTopFeasiblePlans(plans)

  assert.deepEqual(plans.map((plan) => plan.id), ['lower-match', 'best'])
})

test('candidate presentation marks a plan recommended only when ranking confirms it', () => {
  const presentation = getCandidatePresentation(
    'FEASIBLE', { reasons: [] }, { ranked: [{ planId: 'p1' }] }, 'p1'
  )

  assert.deepEqual(presentation, { status: 'FEASIBLE', reasons: [], recommended: true })
  assert.equal(
    getCandidatePresentation('FEASIBLE', { reasons: [] }, { ranked: [] }, 'p1').recommended,
    false
  )
})

test('candidate presentation keeps unverified reasons and removes duplicates', () => {
  const reason = { code: 'MISSING_COST', path: 'cost.transport', message: 'Transport cost is missing.' }
  const presentation = getCandidatePresentation(
    'UNVERIFIED',
    { reasons: [reason] },
    { ranked: [], excluded: [{ planId: 'p1', reasons: [reason] }] },
    'p1'
  )

  assert.equal(presentation.status, 'UNVERIFIED')
  assert.deepEqual(presentation.reasons, [reason])
  assert.equal(presentation.recommended, false)
})

test('candidate presentation does not display an unknown server status as feasible', () => {
  assert.equal(getCandidatePresentation('SUCCESS', null, null, 'p1').status, 'UNVERIFIED')
})
