import assert from 'node:assert/strict'
import test from 'node:test'
import { resetCurrentTrip, setSelectedPlan } from './planSelection.js'

test('Start New Trip clears only draft state and never calls a history API', () => {
  const local = new Map()
  const session = new Map([
    ['tpva-travel-request', 'request'],
    ['tpva-ai-plan', 'generated'],
    ['unrelated-saved-trip-id', 'server-trip-1'],
  ])
  let fetchCalls = 0
  globalThis.fetch = async () => { fetchCalls += 1 }
  globalThis.window = {
    localStorage: {
      getItem: (key) => local.get(key) || null,
      setItem: (key, value) => local.set(key, String(value)),
      removeItem: (key) => local.delete(key),
    },
    sessionStorage: {
      getItem: (key) => session.get(key) || null,
      setItem: (key, value) => session.set(key, String(value)),
      removeItem: (key) => session.delete(key),
    },
    dispatchEvent: () => {},
  }
  setSelectedPlan({ id: 'candidate-1' })

  resetCurrentTrip()

  assert.equal(session.has('tpva-travel-request'), false)
  assert.equal(session.has('tpva-ai-plan'), false)
  assert.equal(session.get('unrelated-saved-trip-id'), 'server-trip-1')
  assert.equal(local.has('tpva_selected_plan_id'), false)
  assert.equal(fetchCalls, 0)
})
