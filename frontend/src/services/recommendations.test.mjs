import assert from 'node:assert/strict'
import test from 'node:test'
import { MOCK_PLANS } from './mockData.js'
import { getCandidatePresentation, getCheckStatus, getTopFeasiblePlans, groupEvaluationReasons } from './recommendations.js'

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

test('getCheckStatus reads each component status and rejects unknown values', () => {
  const evaluation = { components: { cost: { status: 'UNVERIFIED' }, travel: { status: 'FEASIBLE' } } }
  assert.equal(getCheckStatus(evaluation, 'cost'), 'UNVERIFIED')
  assert.equal(getCheckStatus(evaluation, 'travel'), 'FEASIBLE')
  assert.equal(getCheckStatus(evaluation, 'schedule'), null)
  assert.equal(getCheckStatus(null, 'cost'), null)
})

test('groupEvaluationReasons groups reasons by check component', () => {
  const evaluation = {
    reasons: [
      { status: 'UNVERIFIED', code: 'BUDGET', path: 'costs', message: 'Known costs exceed nothing.' },
      { status: 'UNVERIFIED', code: 'UNSUPPORTED_LEG', path: 'days.0.travelLegs', message: 'Chưa có chặng đã xác minh.' },
      { status: 'INFEASIBLE', code: 'DESTINATION_ID', path: 'destinationId', message: 'Điểm đến không có trong dataset.' },
    ],
    components: {
      cost: { reasons: ['Required costs are missing or invalid: transport, accommodation.'] },
      schedule: { reasons: [{ status: 'FEASIBLE', code: 'DAY_SCHEDULE', path: 'days.0', message: 'ok' }] },
      travel: { reasons: [{ status: 'UNVERIFIED', code: 'UNSUPPORTED_LEG', path: 'days.0.travelLegs', message: 'Chưa có chặng đã xác minh.' }] },
    },
  }
  const ranking = { excluded: [{ planId: 'p1', reasons: [{ status: 'UNVERIFIED', code: 'TRIP_TIME_LIMIT', message: 'Tổng phút di chuyển vượt giới hạn cả chuyến.' }] }] }

  const groups = groupEvaluationReasons(evaluation, ranking, 'p1')

  assert.deepEqual(groups.map((group) => group.key), ['cost', 'travel', 'plan', 'ranking'])
  assert.equal(groups[0].reasons[0].message, 'Required costs are missing or invalid: transport, accommodation.')
  // The component reason and the duplicate top-level check appear once, under Travel.
  assert.equal(groups[1].reasons.length, 1)
  assert.equal(groups[2].reasons[0].code, 'DESTINATION_ID')
  assert.equal(groups[3].reasons[0].code, 'TRIP_TIME_LIMIT')
})

test('groupEvaluationReasons returns no empty groups and tolerates missing parts', () => {
  assert.deepEqual(groupEvaluationReasons(null, null, 'p1'), [])
  assert.deepEqual(groupEvaluationReasons({ reasons: [], components: {} }, { ranked: [] }, 'p1'), [])
  const scheduleOnly = { reasons: [{ status: 'UNVERIFIED', code: 'OPENING_HOURS', message: 'hours unclear' }] }
  const groups = groupEvaluationReasons(scheduleOnly, null, 'p1')
  assert.deepEqual(groups.map((group) => group.key), ['schedule'])
  assert.equal(groups[0].reasons[0].message, 'hours unclear')
})
