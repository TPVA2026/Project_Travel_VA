// Demo draft used only when the AI step is unavailable (missing key, quota, outage).
// Place ids, prices, opening-hour fit and leg distances are copied verbatim from the
// backend curated Huê dataset, so the real /itineraries/evaluate and /itineraries/rank
// endpoints can verify this draft exactly like any AI candidate. Costs, statuses and
// unverified reasons shown in the UI always come from those backend checks, never from here.

export const DEMO_DESTINATION = 'Huế'
export const DEMO_DESTINATION_ID = 'H'

const ATTRACTIONS = [
  { id: 'ATTR_H_01', name: 'lăng Khải Định', priceVnd: 150000 },
  { id: 'ATTR_H_02', name: 'Cung An Định', priceVnd: 25000 },
  { id: 'ATTR_H_03', name: 'Đại Nội', priceVnd: 200000 },
  { id: 'ATTR_H_05', name: 'chợ Đông Ba', priceVnd: 0 },
  { id: 'ATTR_H_08', name: 'Làng Hương Thủy Xuân', priceVnd: 0 },
  { id: 'ATTR_H_09', name: 'Chùa Thiên Mụ', priceVnd: 0 },
]

const RESTAURANTS = [
  { id: 'REST_H_01', name: 'Quán bánh O Lé' },
  { id: 'REST_H_02', name: 'Bánh Ướt Huyền Anh 2' },
  { id: 'REST_H_04', name: 'Quán hến Hoa Đông' },
  { id: 'REST_H_06', name: 'Cơm niêu chạn' },
  { id: 'REST_H_08', name: 'Cháo Vịt Thuận' },
  { id: 'REST_H_10', name: 'Bánh canh Nam Phổ - Thúy' },
]

// Attraction -> attraction legs copied verbatim from the curated travel matrix,
// including both duration and distance: the backend grounding check rejects a
// draft whose leg values do not equal the dataset row. Attraction <-> restaurant
// legs have no curated row and stay null (never guessed).
const LEG_DATA = {
  'ATTR_H_01|ATTR_H_02': { distanceKm: 8.6, durationMin: 26 },
  'ATTR_H_01|ATTR_H_03': { distanceKm: 11, durationMin: 33 },
  'ATTR_H_01|ATTR_H_05': { distanceKm: 9.7, durationMin: 30 },
  'ATTR_H_01|ATTR_H_08': { distanceKm: 7.1, durationMin: 22 },
  'ATTR_H_01|ATTR_H_09': { distanceKm: 11, durationMin: 33 },
  'ATTR_H_02|ATTR_H_01': { distanceKm: 8.6, durationMin: 26 },
  'ATTR_H_02|ATTR_H_03': { distanceKm: 4.3, durationMin: 13 },
  'ATTR_H_02|ATTR_H_05': { distanceKm: 2.8, durationMin: 9 },
  'ATTR_H_02|ATTR_H_08': { distanceKm: 5.8, durationMin: 18 },
  'ATTR_H_02|ATTR_H_09': { distanceKm: 6.5, durationMin: 20 },
  'ATTR_H_03|ATTR_H_01': { distanceKm: 10, durationMin: 30 },
  'ATTR_H_03|ATTR_H_02': { distanceKm: 4.1, durationMin: 13 },
  'ATTR_H_03|ATTR_H_05': { distanceKm: 2.1, durationMin: 7 },
  'ATTR_H_03|ATTR_H_08': { distanceKm: 6.2, durationMin: 19 },
  'ATTR_H_03|ATTR_H_09': { distanceKm: 4.8, durationMin: 15 },
  'ATTR_H_05|ATTR_H_01': { distanceKm: 9.6, durationMin: 29 },
  'ATTR_H_05|ATTR_H_02': { distanceKm: 2.6, durationMin: 8 },
  'ATTR_H_05|ATTR_H_03': { distanceKm: 2.2, durationMin: 7 },
  'ATTR_H_05|ATTR_H_08': { distanceKm: 6.7, durationMin: 21 },
  'ATTR_H_05|ATTR_H_09': { distanceKm: 5.3, durationMin: 16 },
  'ATTR_H_08|ATTR_H_01': { distanceKm: 6.3, durationMin: 19 },
  'ATTR_H_08|ATTR_H_02': { distanceKm: 5.8, durationMin: 18 },
  'ATTR_H_08|ATTR_H_03': { distanceKm: 6.4, durationMin: 20 },
  'ATTR_H_08|ATTR_H_05': { distanceKm: 6.9, durationMin: 21 },
  'ATTR_H_08|ATTR_H_09': { distanceKm: 4.5, durationMin: 14 },
  'ATTR_H_09|ATTR_H_01': { distanceKm: 11, durationMin: 33 },
  'ATTR_H_09|ATTR_H_02': { distanceKm: 6.5, durationMin: 20 },
  'ATTR_H_09|ATTR_H_03': { distanceKm: 5, durationMin: 15 },
  'ATTR_H_09|ATTR_H_05': { distanceKm: 5.5, durationMin: 17 },
  'ATTR_H_09|ATTR_H_08': { distanceKm: 4.7, durationMin: 15 },
}

function destinationKey(value) {
  const plain = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const words = plain.split(/\s+/).filter(Boolean)
  if (words[0] === 'thanh' && words[1] === 'pho') words.splice(0, 2)
  else if (words[0] === 'tp') words.splice(0, 1)
  if (words[words.length - 1] === 'city') words.pop()
  return words.join(' ')
}

/**
 * The demo drafts a Huê trip only when it matches what the user asked for:
 * no destination at all (defaults, announced in assumptions) or a Huê spelling.
 */
export function supportsDemoDestination(request) {
  const wanted = request?.preferences?.destination
  if (!wanted || !String(wanted).trim()) return true
  const key = destinationKey(wanted)
  return key === 'hue' || key === 'h'
}

/**
 * The real TravelRequest is schema-strict (extra fields forbidden), so the demo
 * pipeline reuses every user answer and only pins the destination to Huê.
 */
export function demoRequestFor(request) {
  return {
    ...request,
    preferences: { ...(request?.preferences || {}), destination: DEMO_DESTINATION },
  }
}

function firstDate(request) {
  const period = request?.travelPeriod || {}
  if (period.startDate) return period.startDate
  if (period.month) return `${period.month}-01`
  return new Date().toISOString().slice(0, 10)
}

function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function activity(dayIndex, slot, place, type, startTime, endTime) {
  const known = place.priceVnd != null
  const priceNote = known
    ? place.priceVnd > 0
      ? 'verified entry price from the dataset'
      : 'free entry per the dataset'
    : 'no verified price in the dataset yet'
  return {
    activityId: `demo-d${dayIndex + 1}-a${slot}`,
    placeId: place.id,
    type,
    startTime,
    endTime,
    estimatedCostVnd: known ? place.priceVnd : null,
    costStatus: known ? 'KNOWN' : 'NO_DATA',
    reason: `${type === 'dining' ? 'Lunch at' : 'Visit'} ${place.name} — curated Huê dataset stop, ${priceNote}.`,
  }
}

function leg(fromId, toId) {
  const data = LEG_DATA[`${fromId}|${toId}`]
  return {
    fromPlaceId: fromId,
    toPlaceId: toId,
    durationMin: data ? data.durationMin : null,
    distanceKm: data ? data.distanceKm : null,
  }
}

/**
 * Deterministic day plan inside published opening hours:
 * 09:00 attraction -> 11:00 attraction -> 13:00 lunch -> 15:00 attraction.
 * Rotation reuses stops on longer trips; ids stay unique per day.
 */
export function buildDemoPlan(request) {
  const durationDays = Math.max(1, Number(request?.durationDays) || 1)
  const start = firstDate(request)
  const days = []

  for (let dayIndex = 0; dayIndex < durationDays; dayIndex += 1) {
    const morning = ATTRACTIONS[(2 * dayIndex) % ATTRACTIONS.length]
    const midday = ATTRACTIONS[(2 * dayIndex + 1) % ATTRACTIONS.length]
    const restaurant = RESTAURANTS[dayIndex % RESTAURANTS.length]
    const afternoon = ATTRACTIONS[(2 * dayIndex + 2) % ATTRACTIONS.length]

    days.push({
      dayNumber: dayIndex + 1,
      date: shiftDate(start, dayIndex),
      activities: [
        activity(dayIndex, 1, morning, 'sightseeing', '09:00', '10:30'),
        activity(dayIndex, 2, midday, 'sightseeing', '11:00', '12:30'),
        activity(dayIndex, 3, restaurant, 'dining', '13:00', '14:00'),
        activity(dayIndex, 4, afternoon, 'sightseeing', '15:00', '16:30'),
      ],
      travelLegs: [
        leg(morning.id, midday.id),
        leg(midday.id, restaurant.id),
        leg(restaurant.id, afternoon.id),
      ],
    })
  }

  return {
    planId: 'demo-hue-001',
    title: `Huê heritage days (${durationDays} ${durationDays === 1 ? 'day' : 'days'})`,
    destinationId: DEMO_DESTINATION_ID,
    days,
    missingData: [
      'Transport cost for the whole trip',
      'Accommodation cost for the whole trip',
      'Meal prices at the chosen restaurants',
      'Travel time between stops (only distances are curated)',
    ],
    assumptions: [
      'Demo draft: the AI service is unavailable right now, so this plan is built deterministically from the curated Huê dataset.',
      'Lunch at 13:00 and visits inside published opening hours.',
    ],
  }
}

export function buildDemoPipeline(request) {
  const destinationDefaulted = !request?.preferences?.destination?.trim()
  const plan = buildDemoPlan(request)
  if (destinationDefaulted) {
    plan.assumptions = [
      ...plan.assumptions,
      'No destination was given, so the demo drafts a Huê trip.',
    ]
  }
  return { request: demoRequestFor(request), plan }
}
