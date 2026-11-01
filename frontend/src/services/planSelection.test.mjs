import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSelectedPlanId,
  getSelectedPlan,
  setSelectedPlan,
  clearSelectedPlan,
  isPlanSelected,
} from './planSelection.js'

// Mock browser localStorage and window in node environment
const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  },
  dispatchEvent: () => {},
}

test('planSelection - initial state is null', () => {
  store.clear()
  assert.equal(getSelectedPlanId(), null)
  assert.equal(getSelectedPlan(), null)
  assert.equal(isPlanSelected('p1'), false)
})

test('planSelection - set and get plan by ID', () => {
  store.clear()
  setSelectedPlan('p2')
  assert.equal(getSelectedPlanId(), 'p2')
  assert.equal(isPlanSelected('p2'), true)
  assert.equal(isPlanSelected('p1'), false)
})

test('planSelection - set plan with object', () => {
  store.clear()
  const planObj = { id: 'p1', destination: 'Ha Giang', title: 'Ha Giang Loop' }
  setSelectedPlan(planObj)
  assert.equal(getSelectedPlanId(), 'p1')
  assert.deepEqual(getSelectedPlan(), planObj)
  assert.equal(isPlanSelected('p1'), true)
})

test('planSelection - clear selected plan', () => {
  setSelectedPlan('p3')
  assert.equal(isPlanSelected('p3'), true)
  clearSelectedPlan()
  assert.equal(getSelectedPlanId(), null)
  assert.equal(getSelectedPlan(), null)
  assert.equal(isPlanSelected('p3'), false)
})
