// Mock data and API simulation for Travel Planning Virtual Assistant (M5)

const act = (start, end, name, type, cost, travelMin = null, reason = '') => ({
  activityId: `act-${Math.random().toString(36).slice(2, 8)}`,
  start,
  end,
  startTime: start,
  endTime: end,
  name,
  placeId: name,
  type, // 'sightseeing' | 'dining'
  cost,
  estimatedCostVnd: cost,
  costStatus: cost === null ? 'NO_DATA' : 'KNOWN',
  travelMin,
  reason,
})

export const MOCK_PLANS = [
  {
    id: 'p1',
    planId: 'plan-ha-giang-01',
    destination: 'Ha Giang',
    title: 'Ha Giang 4-Day Loop: Nature & Adventure',
    image: '/images/ha_giang.jpg',
    status: 'FEASIBLE',
    fit: ['Matches preference: Nature', 'Fits group size (2 travelers)', 'Within budget (4,500,000 VND < 6,000,000 VND)'],
    notFit: ['Long mountain road travel on day 2'],
    missing: [],
    failReason: null,
    costs: { transport: 1200000, accommodation: 900000, dining: 600000, activities: 400000 },
    days: [
      {
        day: 1,
        dayNumber: 1,
        date: '2026-11-12',
        travelLegs: [
          null,
          { fromPlaceId: 'Quan Ba Heaven Gate', toPlaceId: 'Local lunch', durationMin: 20, distanceKm: 12 }
        ],
        activities: [
          act('08:00', '11:00', 'Quan Ba Heaven Gate', 'sightseeing', 0, null, 'Scenic vantage point overlooking Twin Mountains; free public access.'),
          act('12:00', '13:00', 'Local lunch in Tam Son', 'dining', 80000, 20, 'Traditional highland specialties including buckwheat pancakes and pork.')
        ]
      },
      {
        day: 2,
        dayNumber: 2,
        date: '2026-11-13',
        travelLegs: [
          null,
          { fromPlaceId: 'Lung Cu Flag Tower', toPlaceId: 'Lunch', durationMin: 45, distanceKm: 32 }
        ],
        activities: [
          act('08:00', '12:00', 'Lung Cu Flag Tower', 'sightseeing', 25000, null, 'Northernmost landmark of Vietnam with panoramic valley vistas.'),
          act('13:00', '14:00', 'Lunch at Dong Van market', 'dining', 90000, 45, 'Local specialty hotpot and steamed rice rolls (bánh cuốn).')
        ]
      },
      {
        day: 3,
        dayNumber: 3,
        date: '2026-11-14',
        travelLegs: [
          null,
          { fromPlaceId: 'Ma Pi Leng Pass', toPlaceId: 'Tu San Canyon Cafe', durationMin: 30, distanceKm: 18 }
        ],
        activities: [
          act('08:00', '12:00', 'Ma Pi Leng Pass', 'sightseeing', 0, null, 'Spectacular road pass overlooking the Nho Que River; free admission.'),
          act('12:30', '13:45', 'Tu San Canyon Riverside Lunch', 'dining', 85000, 30, 'Riverside dining with fresh grilled river fish.')
        ]
      },
      {
        day: 4,
        dayNumber: 4,
        date: '2026-11-15',
        travelLegs: [null],
        activities: [
          act('08:00', '10:30', 'Dong Van Old Quarter', 'sightseeing', 0, null, 'Historic stone architecture and morning ethnic minority market.')
        ]
      },
    ],
  },
  {
    id: 'p2',
    planId: 'plan-hcmc-02',
    destination: 'Ho Chi Minh City',
    title: 'Ho Chi Minh City 2-Day Urban Discovery',
    image: '/images/ho_chi_minh.jpg',
    status: 'UNVERIFIED',
    fit: ['Matches preference: City & History', 'Fits group size'],
    notFit: [],
    missing: ['accommodation cost', 'lunch price on day 2'],
    failReason: null,
    costs: { transport: 700000, accommodation: null, dining: 500000, activities: 350000 },
    days: [
      {
        day: 1,
        dayNumber: 1,
        date: '2026-12-05',
        travelLegs: [
          null,
          { fromPlaceId: 'War Remnants Museum', toPlaceId: 'Street food lunch', durationMin: 15, distanceKm: 3 }
        ],
        activities: [
          act('09:00', '11:00', 'War Remnants Museum', 'sightseeing', 40000, null, 'Important historical exhibits and artifact collections.'),
          act('12:00', '13:00', 'Street food lunch near Ben Thanh', 'dining', 70000, 15, 'Iconic Saigon broken rice (cơm tấm) and fresh spring rolls.')
        ]
      },
      {
        day: 2,
        dayNumber: 2,
        date: '2026-12-06',
        travelLegs: [
          null,
          { fromPlaceId: 'Cu Chi Tunnels', toPlaceId: 'Lunch', durationMin: 35, distanceKm: 25 }
        ],
        activities: [
          act('09:00', '11:30', 'Cu Chi Tunnels', 'sightseeing', 125000, null, 'Historical underground defensive tunnel network.'),
          act('12:30', '13:45', 'Riverside restaurant lunch', 'dining', null, 35, 'Lunch booking at riverside venue; menu prices unverified in dataset.')
        ]
      },
    ],
  },
  {
    id: 'p3',
    planId: 'plan-hoi-an-03',
    destination: 'Hoi An',
    title: 'Hoi An 2-Day Cultural Heritage Trip',
    image: '/images/hoi_an.jpg',
    status: 'INFEASIBLE',
    fit: ['Matches preference: Culture & Ancient Architecture'],
    notFit: ['Over budget (5,700,000 VND exceeds 4,000,000 VND limit)'],
    missing: [],
    failReason: 'Known costs already exceed the budget (5,700,000 VND > 4,000,000 VND)',
    costs: { transport: 2500000, accommodation: 2000000, dining: 700000, activities: 500000 },
    days: [
      {
        day: 1,
        dayNumber: 1,
        date: '2026-12-10',
        travelLegs: [
          null,
          { fromPlaceId: 'Ancient Town', toPlaceId: 'Cao Lau Thanh', durationMin: 10, distanceKm: 1.5 }
        ],
        activities: [
          act('09:00', '12:00', 'Hoi An Ancient Town', 'sightseeing', 120000, null, 'UNESCO World Heritage pedestrian old quarter and Japanese Bridge.'),
          act('12:30', '13:30', 'Cao Lau Thanh', 'dining', 60000, 10, 'Famous authentic Hoi An Cao Lau noodles.')
        ]
      },
      {
        day: 2,
        dayNumber: 2,
        date: '2026-12-11',
        travelLegs: [
          null,
          { fromPlaceId: 'Tra Que Village', toPlaceId: 'Morning Glory Restaurant', durationMin: 15, distanceKm: 4 }
        ],
        activities: [
          act('09:00', '11:00', 'Tra Que Vegetable Village', 'sightseeing', 50000, null, 'Organic farming village with traditional herbal gardens.'),
          act('11:30', '13:00', 'Morning Glory Restaurant', 'dining', 140000, 15, 'Central Vietnamese specialty dining.')
        ]
      },
    ],
  },
]

// Currency and formatting helper (null = unverified, NEVER converted to 0)
export const fmtMoney = (v) => (v == null ? 'Unverified' : `${Number(v).toLocaleString('en-US')} VND`)

export function knownTotal(plan) {
  if (!plan?.costs) return { total: 0, missing: [] }
  const vals = Object.values(plan.costs)
  return {
    total: vals.filter((v) => v != null).reduce((a, b) => a + b, 0),
    missing: Object.keys(plan.costs).filter((k) => plan.costs[k] == null),
  }
}

/**
 * Asynchronously fetch destination recommendations from mock response.
 * Simulates network latency, error scenarios, and empty states.
 */
export async function fetchDestinationRecommendations({ delay = 350, shouldFail = false, empty = false } = {}) {
  await new Promise((resolve) => setTimeout(resolve, delay))

  if (shouldFail) {
    throw new Error('Failed to fetch destination recommendations. Please check your network and try again.')
  }

  if (empty) {
    return {
      status: 'SUCCESS',
      data: [],
      total: 0,
      timestamp: new Date().toISOString(),
    }
  }

  return {
    status: 'SUCCESS',
    data: MOCK_PLANS,
    total: MOCK_PLANS.length,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Asynchronously fetch plan details by ID from mock response.
 */
export async function fetchPlanById(id, { delay = 250, shouldFail = false } = {}) {
  await new Promise((resolve) => setTimeout(resolve, delay))

  if (shouldFail) {
    throw new Error('Failed to load itinerary details. Please try again.')
  }

  const plan = MOCK_PLANS.find((p) => p.id === id)
  if (!plan) {
    throw new Error(`Plan with ID "${id}" was not found.`)
  }

  return {
    status: 'SUCCESS',
    data: plan,
    timestamp: new Date().toISOString(),
  }
}
