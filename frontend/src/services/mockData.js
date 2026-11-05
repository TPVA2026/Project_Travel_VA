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
    notFit: [],
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
  {
    id: 'p4',
    planId: 'plan-hue-04',
    destination: 'Hue',
    title: 'Hue 2-Day Imperial City Escape',
    image: '/images/hue.jpg',
    status: 'FEASIBLE',
    fit: ['Matches preference: History & Culture', 'Within budget (2,950,000 VND < 5,000,000 VND)'],
    notFit: ['Fewer nature-focused activities than history and culture attractions'],
    missing: [],
    failReason: null,
    costs: { transport: 900000, accommodation: 1200000, dining: 500000, activities: 350000 },
    days: [
      {
        day: 1,
        dayNumber: 1,
        date: '2026-12-15',
        travelLegs: [null, { fromPlaceId: 'Imperial City', toPlaceId: 'Dong Ba Market', durationMin: 15, distanceKm: 3 }],
        activities: [
          act('08:00', '11:00', 'Hue Imperial City', 'sightseeing', 200000, null, 'Explore the historic palaces and gardens of the former imperial capital.'),
          act('11:30', '12:30', 'Lunch near Dong Ba Market', 'dining', 70000, 15, 'A local Hue-style lunch near the market.')
        ]
      },
      {
        day: 2,
        dayNumber: 2,
        date: '2026-12-16',
        travelLegs: [null, { fromPlaceId: 'Thien Mu Pagoda', toPlaceId: 'Local restaurant', durationMin: 20, distanceKm: 5 }],
        activities: [
          act('09:00', '11:00', 'Thien Mu Pagoda', 'sightseeing', 0, null, 'Visit Hue’s well-known riverside pagoda.'),
          act('11:30', '12:30', 'Hue local lunch', 'dining', 80000, 20, 'Sample local dishes in the city.')
        ]
      },
    ],
  },
  {
    id: 'p5',
    planId: 'plan-ninh-binh-05',
    destination: 'Ninh Binh',
    title: 'Ninh Binh 2-Day Nature & Heritage Trip',
    image: '/images/ninhbinh.jpg',
    status: 'FEASIBLE',
    fit: ['Matches preference: Nature & Scenery'],
    notFit: ['Limited city and nightlife activities'],
    missing: [],
    failReason: null,
    costs: { transport: 800000, accommodation: 1000000, dining: 450000, activities: 300000 },
    days: [
      {
        day: 1,
        dayNumber: 1,
        date: '2026-12-20',
        travelLegs: [null, { fromPlaceId: 'Trang An', toPlaceId: 'Local restaurant', durationMin: 15, distanceKm: 4 }],
        activities: [
          act('08:00', '11:30', 'Trang An Scenic Landscape Complex', 'sightseeing', 250000, null, 'Explore the limestone landscape and waterways by boat.'),
          act('12:00', '13:00', 'Lunch in Ninh Binh', 'dining', 75000, 15, 'Local lunch near the Trang An area.')
        ]
      },
      {
        day: 2,
        dayNumber: 2,
        date: '2026-12-21',
        travelLegs: [null, { fromPlaceId: 'Hoa Lu Ancient Capital', toPlaceId: 'Local restaurant', durationMin: 15, distanceKm: 3 }],
        activities: [
          act('08:30', '10:30', 'Hoa Lu Ancient Capital', 'sightseeing', 50000, null, 'Visit temples and historic sites in Vietnam’s former capital.'),
          act('11:00', '12:00', 'Ninh Binh countryside lunch', 'dining', 85000, 15, 'Enjoy regional food after the morning visit.')
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

  const plan = MOCK_PLANS.find((p) => p.id === id || p.planId === id)
  if (!plan) {
    throw new Error(`Plan with ID "${id}" was not found.`)
  }

  // Deep clone so revisions and local edits don't mutate template directly
  return {
    status: 'SUCCESS',
    data: JSON.parse(JSON.stringify(plan)),
    timestamp: new Date().toISOString(),
  }
}

/**
 * Asynchronously revise an existing plan (TPVA-31 M5).
 * Simulates backend revision pipeline:
 * Accept revision request -> Recalculate constraints -> Revalidate feasibility -> Return updated plan.
 */
export async function revisePlanMock(planId, revisionRequest, { delay = 350, shouldFail = false } = {}) {
  await new Promise((resolve) => setTimeout(resolve, delay))

  if (shouldFail) {
    throw new Error('Revision failed: Conflict detected between revised parameters and itinerary constraints.')
  }

  const basePlan = MOCK_PLANS.find((p) => p.id === planId || p.planId === planId)
  if (!basePlan) {
    throw new Error(`Cannot revise: plan "${planId}" not found.`)
  }

  // Clone current plan
  const plan = JSON.parse(JSON.stringify(basePlan))
  const changeType = revisionRequest.changeType
  let summary = ''

  if (changeType === 'budget') {
    const newBudget = revisionRequest.budget?.amount ?? 0
    const { total } = knownTotal(plan)

    summary = `Updated budget to ${newBudget.toLocaleString('en-US')} VND (${revisionRequest.budget?.scope || 'group'})`

    if (newBudget < total) {
      plan.status = 'INFEASIBLE'
      plan.failReason = `Known costs (${total.toLocaleString('en-US')} VND) exceed revised budget (${newBudget.toLocaleString('en-US')} VND).`
      plan.notFit = [`Over budget (${total.toLocaleString('en-US')} VND > ${newBudget.toLocaleString('en-US')} VND limit)`]
      plan.fit = (plan.fit || []).filter((f) => !f.toLowerCase().includes('budget'))
    } else {
      // If previously infeasible due to budget, it is now feasible!
      if (plan.status === 'INFEASIBLE' && plan.failReason?.toLowerCase().includes('budget')) {
        plan.status = 'FEASIBLE'
        plan.failReason = null
        plan.notFit = (plan.notFit || []).filter((nf) => !nf.toLowerCase().includes('budget'))
      }
      plan.fit = [
        ...(plan.fit || []).filter((f) => !f.toLowerCase().includes('budget')),
        `Within revised budget (${total.toLocaleString('en-US')} VND <= ${newBudget.toLocaleString('en-US')} VND)`,
      ]
    }
  } else if (changeType === 'durationDays') {
    const targetDays = Number(revisionRequest.durationDays) || 1
    const currentDays = plan.days?.length || 1
    summary = `Adjusted trip duration from ${currentDays} to ${targetDays} day(s)`

    if (targetDays > currentDays) {
      // Append extra days
      for (let i = currentDays + 1; i <= targetDays; i++) {
        plan.days.push({
          day: i,
          dayNumber: i,
          date: `2026-11-${10 + i}`,
          travelLegs: [null],
          activities: [
            act('09:00', '12:00', `Scenic Exploration Day ${i}`, 'sightseeing', 40000, null, 'Custom scenic stop added per duration extension.'),
            act('12:30', '13:45', `Local Lunch Day ${i}`, 'dining', 80000, 20, 'Local restaurant stop.'),
          ],
        })
      }
    } else if (targetDays < currentDays) {
      // Truncate days
      plan.days = plan.days.slice(0, targetDays)
    }

    // Adjust costs proportionally
    if (plan.costs) {
      const scale = targetDays / currentDays
      if (plan.costs.accommodation != null) {
        plan.costs.accommodation = Math.round(plan.costs.accommodation * scale)
      }
      if (plan.costs.dining != null) {
        plan.costs.dining = Math.round(plan.costs.dining * scale)
      }
      if (plan.costs.activities != null) {
        plan.costs.activities = Math.round(plan.costs.activities * scale)
      }
    }

    plan.title = `${plan.destination} ${targetDays}-Day Itinerary (Revised)`
  } else if (changeType === 'travelPeriod') {
    const period = revisionRequest.travelPeriod
    if (period?.startDate) {
      summary = `Changed travel dates to start on ${period.startDate}`
      const start = new Date(period.startDate)
      plan.days.forEach((d, idx) => {
        const nextDate = new Date(start)
        nextDate.setDate(start.getDate() + idx)
        d.date = nextDate.toISOString().split('T')[0]
      })
    } else if (period?.month) {
      summary = `Changed travel timing to month ${period.month}`
      plan.days.forEach((d, idx) => {
        d.date = `${period.month}-${String(idx + 1).padStart(2, '0')}`
      })
    }
  } else if (changeType === 'departureLocation') {
    const dep = revisionRequest.departureLocation
    summary = `Changed departure city to ${dep}`
    plan.departureLocation = dep
    plan.fit = [
      ...(plan.fit || []).filter((f) => !f.toLowerCase().includes('departing')),
      `Departing from ${dep}`,
    ]
  } else if (changeType === 'travelers') {
    const count = revisionRequest.travelers?.count || 1
    summary = `Updated traveler count to ${count} person(s)`
    plan.fit = [
      ...(plan.fit || []).filter((f) => !f.toLowerCase().includes('group size') && !f.toLowerCase().includes('traveler')),
      `Fits revised group size (${count} traveler${count > 1 ? 's' : ''})`,
    ]
    if (plan.costs?.dining) {
      plan.costs.dining = 250000 * count
    }
  } else if (changeType === 'preferences') {
    const pref = revisionRequest.preferences || {}
    const interests = pref.interests?.map((i) => i.type).join(', ')
    summary = `Updated preferences: ${interests || 'Custom activities'}`
    if (interests) {
      plan.fit = [
        ...(plan.fit || []),
        `Added preference: ${interests}`,
      ]
    }
  } else if (changeType === 'limits') {
    const limits = revisionRequest.limits || {}
    summary = `Updated travel limit: max ${limits.maxTravelTimeMinutes || limits.maxDistanceKm || 60} ${limits.maxTravelTimeMinutes ? 'mins' : 'km'} (${limits.appliesTo})`
    plan.fit = [
      ...(plan.fit || []),
      `Respects limits: ${limits.appliesTo}`,
    ]
  }

  // Record revision log
  plan.revisions = [
    ...(plan.revisions || []),
    {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      changeType,
      summary,
      payload: revisionRequest,
    },
  ]

  return {
    status: 'SUCCESS',
    data: plan,
    timestamp: new Date().toISOString(),
  }
}
