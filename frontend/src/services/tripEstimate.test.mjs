import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatMissingCostItem,
  getPlanEstimate,
  getTripChecklistItems,
} from './tripEstimate.js'

test('projected subtotal is the estimate and known partial costs are not added twice', () => {
  const plan = {
    evaluation: {
      components: {
        cost: {
          known_total: 100000,
          missing_costs: ['transport', 'accommodation'],
          budget: null,
          projection: {
            subtotalVnd: 3050476,
            totalVnd: null,
            uncovered: ['activities'],
            items: [
              { category: 'accommodation', amountVnd: 1190476 },
              { category: 'transport', amountVnd: 1000000 },
              { category: 'dining', name: 'Lunch', amountVnd: 360000 },
              { category: 'dining', name: 'Dinner', amountVnd: 400000 },
            ],
          },
        },
      },
    },
  }

  const estimate = getPlanEstimate(plan)
  assert.equal(estimate.estimatedTotal, 3050476)
  assert.equal(estimate.stay, 1190476)
  assert.equal(estimate.transport, 1000000)
  assert.equal(estimate.dining, 760000)
  assert.equal(estimate.diningLabel, 'Dining estimates')
  assert.equal(estimate.diningItems.length, 2)
  assert.equal(estimate.knownTotal, 100000)
  assert.equal(estimate.knownLabel, 'Known costs · partial')
  assert.deepEqual(estimate.missingCombined, ['activities'])
  assert.equal(estimate.complete, false)
  assert.equal(estimate.budget, null)
})

test('missing costs stay null or excluded instead of becoming zero', () => {
  const plan = {
    evaluation: {
      components: {
        cost: {
          known_total: 500000,
          missing_costs: ['accommodation', 'dining'],
          total_cost: null,
        },
      },
    },
  }

  const estimate = getPlanEstimate(plan)
  assert.equal(estimate.estimatedTotal, null)
  assert.equal(estimate.stay, null)
  assert.equal(estimate.transport, null)
  assert.equal(estimate.dining, null)
  assert.equal(estimate.diningLabel, 'Dining')
  assert.equal(estimate.knownTotal, 500000)
  assert.equal(estimate.knownLabel, 'Known costs · partial')
  assert.deepEqual(estimate.missingCombined, ['accommodation', 'dining'])
})

test('missing cost labels resolve categories and activity names without internal ids', () => {
  assert.equal(formatMissingCostItem('accommodation'), 'Stay')
  assert.equal(formatMissingCostItem('transport[1]', () => null), 'Transport #2')
  assert.equal(
    formatMissingCostItem('act-001', (id) => (id === 'act-001' ? 'Bún bò mệ Kéo' : id)),
    'Bún bò mệ Kéo'
  )
  assert.equal(formatMissingCostItem('ATTR_UNKNOWN', () => null), 'An activity')
  assert.equal(formatMissingCostItem(null), null)
})

test('checklist items follow the available stay, transport, and activity data', () => {
  assert.deepEqual(getTripChecklistItems(null), [])
  assert.deepEqual(getTripChecklistItems({ days: [] }), [])

  const stayOnly = {
    days: [{ activities: [{ activityId: 'a1' }] }],
    evaluation: {
      components: {
        cost: {
          projection: {
            items: [{ category: 'accommodation', amountVnd: 500000 }],
          },
        },
      },
    },
  }
  assert.deepEqual(
    getTripChecklistItems(stayOnly).map((item) => item.key),
    ['room-transport-prices', 'opening-hours']
  )
  assert.equal(getTripChecklistItems(stayOnly)[0].title, 'Confirm room price and availability')

  const transportOnly = {
    days: [{ activities: [{ activityId: 'a1' }, { activityId: 'a2' }] }],
    evaluation: {
      components: {
        cost: {
          projection: {
            items: [{ category: 'transport', amountVnd: 300000 }],
          },
        },
      },
    },
  }
  const transportItems = getTripChecklistItems(transportOnly)
  assert.deepEqual(
    transportItems.map((item) => item.key),
    ['room-transport-prices', 'opening-hours', 'travel-times']
  )
  assert.equal(transportItems[0].title, 'Confirm transport prices')
})
