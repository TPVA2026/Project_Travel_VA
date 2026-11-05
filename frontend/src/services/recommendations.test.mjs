import assert from 'node:assert/strict'
import test from 'node:test'
import { MOCK_PLANS } from './mockData.js'
import { getTopFeasiblePlans } from './recommendations.js'

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
