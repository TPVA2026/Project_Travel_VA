const act = (start, end, name, type, cost, travelMin = null) =>
  ({ start, end, name, type, cost, travelMin })

export const MOCK_PLANS = [
  {
    id: 'p1', destination: 'Ha Giang', image: '/images/ha_giang.jpg',
    status: 'FEASIBLE',
    fit: ['Matches preference: Nature', 'Fits group size', 'Within budget'],
    notFit: ['Long road travel on day 2'],
    missing: [], failReason: null,
    costs: { transport: 1200000, accommodation: 900000, dining: 600000, activities: 400000 },
    days: [
      { day: 1, activities: [
        act('08:00', '11:00', 'Quan Ba Heaven Gate', 'sightseeing', 0),
        act('12:00', '13:00', 'Local lunch', 'dining', 80000, 20)] },
      { day: 2, activities: [
        act('08:00', '12:00', 'Lung Cu Flag Tower', 'sightseeing', 25000),
        act('13:00', '14:00', 'Lunch', 'dining', 90000, 45)] },
      { day: 3, activities: [
        act('08:00', '12:00', 'Ma Pi Leng Pass', 'sightseeing', 0)] },
      { day: 4, activities: [
        act('08:00', '10:00', 'Dong Van Old Quarter', 'sightseeing', 0)] },
    ],
  },
  {
    id: 'p2', destination: 'Ho Chi Minh City', image: '/images/ho_chi_minh.jpg',
    status: 'UNVERIFIED',
    fit: ['Matches preference: City', 'Fits group size'],
    notFit: [],
    missing: ['accommodation cost', 'lunch price on day 2'],
    failReason: null,
    costs: { transport: 700000, accommodation: null, dining: 500000, activities: 350000 },
    days: [
      { day: 1, activities: [
        act('09:00', '11:00', 'War Remnants Museum', 'sightseeing', 40000),
        act('12:00', '13:00', 'Street food lunch', 'dining', 70000, 15)] },
      { day: 2, activities: [
        act('09:00', '11:00', 'Cu Chi Tunnels', 'sightseeing', 125000),
        act('12:00', '13:00', 'Lunch', 'dining', null, null)] },
    ],
  },
  {
    id: 'p3', destination: 'Hoi An', image: '/images/hoi_an.jpg',
    status: 'INFEASIBLE',
    fit: ['Matches preference: Culture'],
    notFit: ['Over budget'],
    missing: [],
    failReason: 'Known costs already exceed the budget',
    costs: { transport: 2500000, accommodation: 2000000, dining: 700000, activities: 500000 },
    days: [
      { day: 1, activities: [act('09:00', '12:00', 'Ancient Town', 'sightseeing', 120000)] },
      { day: 2, activities: [act('09:00', '11:00', 'Tra Que Village', 'sightseeing', 50000)] },
    ],
  },
]

// Helpers dùng chung (null = chưa xác minh, KHÔNG phải 0)
export const fmtMoney = (v) => (v == null ? 'Unverified' : `${v.toLocaleString('en-US')} VND`)

export function knownTotal(plan) {
  const vals = Object.values(plan.costs)
  return {
    total: vals.filter((v) => v != null).reduce((a, b) => a + b, 0),
    missing: Object.keys(plan.costs).filter((k) => plan.costs[k] == null),
  }
}