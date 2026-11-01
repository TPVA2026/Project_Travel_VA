import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRevisionPayload,
  validateRevision,
} from './revisionSchema.js'
import { revisePlanMock } from '../../services/mockData.js'

test('revisionSchema - build and validate budget revision', () => {
  const payload = buildRevisionPayload('plan-1', 'budget', {
    amount: '6000000',
    scope: 'group',
  })

  assert.equal(payload.planId, 'plan-1')
  assert.equal(payload.changeType, 'budget')
  assert.deepEqual(payload.budget, {
    amount: 6000000,
    currency: 'VND',
    scope: 'group',
  })
  // Ensure no other fields are present
  assert.equal(payload.durationDays, undefined)
  assert.equal(payload.travelPeriod, undefined)

  const validation = validateRevision(payload)
  assert.equal(validation.valid, true)
  assert.equal(Object.keys(validation.errors).length, 0)
})

test('revisionSchema - build and validate duration revision', () => {
  const payload = buildRevisionPayload('plan-1', 'durationDays', {
    durationDays: '4',
  })

  assert.equal(payload.planId, 'plan-1')
  assert.equal(payload.changeType, 'durationDays')
  assert.equal(payload.durationDays, 4)

  const validation = validateRevision(payload)
  assert.equal(validation.valid, true)
})

test('revisionSchema - build and validate dates travelPeriod', () => {
  const payload = buildRevisionPayload('plan-1', 'travelPeriod', {
    periodMode: 'dates',
    startDate: '2026-12-01',
    endDate: '2026-12-05',
  })

  assert.equal(payload.changeType, 'travelPeriod')
  assert.deepEqual(payload.travelPeriod, {
    startDate: '2026-12-01',
    endDate: '2026-12-05',
  })

  const validation = validateRevision(payload)
  assert.equal(validation.valid, true)
})

test('revisionSchema - rejects invalid revision payloads', () => {
  // Missing planId
  const noPlan = validateRevision({ changeType: 'budget', budget: { amount: 1000, currency: 'VND', scope: 'group' } })
  assert.equal(noPlan.valid, false)
  assert.ok(noPlan.errors.planId)

  // End date before start date
  const badDates = validateRevision({
    planId: 'p1',
    changeType: 'travelPeriod',
    travelPeriod: { startDate: '2026-12-10', endDate: '2026-12-05' },
  })
  assert.equal(badDates.valid, false)
  assert.ok(badDates.errors.endDate)

  // Negative budget
  const negBudget = validateRevision({
    planId: 'p1',
    changeType: 'budget',
    budget: { amount: -500, currency: 'VND', scope: 'group' },
  })
  assert.equal(negBudget.valid, false)
  assert.ok(negBudget.errors.budgetAmount)
})

test('revisePlanMock - revising Hoi An budget from 4M to 7M makes it FEASIBLE', async () => {
  // Hoi An (p3) is INFEASIBLE with 5,700,000 VND known costs
  const revision = buildRevisionPayload('p3', 'budget', {
    amount: 7000000,
    scope: 'group',
  })

  const result = await revisePlanMock('p3', revision, { delay: 10 })
  assert.equal(result.status, 'SUCCESS')
  assert.equal(result.data.status, 'FEASIBLE')
  assert.equal(result.data.failReason, null)
  assert.ok(result.data.revisions.length >= 1)
})

test('revisePlanMock - revising duration extends plan days and recalculates title', async () => {
  const revision = buildRevisionPayload('p1', 'durationDays', {
    durationDays: 5,
  })

  const result = await revisePlanMock('p1', revision, { delay: 10 })
  assert.equal(result.status, 'SUCCESS')
  assert.equal(result.data.days.length, 5)
  assert.ok(result.data.title.includes('5-Day'))
})
