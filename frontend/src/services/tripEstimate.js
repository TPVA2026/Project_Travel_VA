import { collectTravelLegs, getPlanServiceItems } from './api.js'
import { knownTotal } from './mockData.js'

const CATEGORY_LABELS = {
  accommodation: 'Stay',
  transport: 'Transport',
  dining: 'Dining',
  meal: 'Dining',
  activities: 'Activities',
  activity: 'Activities',
}

function asNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sum(items, key = 'amountVnd') {
  if (!items.length) return null
  const values = items.map((item) => asNumber(item?.[key]))
  if (values.some((value) => value == null)) return null
  return values.reduce((total, value) => total + value, 0)
}

function resolveCategory(items, breakdownValue) {
  if (items.length) {
    const amount = sum(items)
    return { amount, source: amount == null ? 'missing' : 'estimate' }
  }
  const known = asNumber(breakdownValue)
  if (known != null) return { amount: known, source: 'known' }
  return { amount: null, source: 'missing' }
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))]
}

export function estimateCategoryLabel(category) {
  return CATEGORY_LABELS[category] || null
}

export function formatMissingCostItem(item, resolveName) {
  if (item == null || item === '') return null
  if (typeof item !== 'string') return String(item)
  if (CATEGORY_LABELS[item]) return CATEGORY_LABELS[item]

  const indexed = item.match(/^([a-zA-Z]+)\[(\d+)\]$/)
  if (indexed) {
    const label = CATEGORY_LABELS[indexed[1]]
    return label ? `${label} #${Number(indexed[2]) + 1}` : `Cost item #${Number(indexed[2]) + 1}`
  }

  const resolved = resolveName?.(item)
  if (resolved && resolved !== item && !/^[A-Z0-9_[\]-]+$/.test(String(resolved))) {
    return resolved
  }
  return 'An activity'
}

export function getPlanEstimate(plan) {
  const cost = plan?.evaluation?.components?.cost || null
  const projection = cost?.projection || null
  const projectionItems = Array.isArray(projection?.items) ? projection.items : []
  const breakdown = cost?.breakdown || plan?.costs || {}
  const fallback = plan ? knownTotal(plan) : { total: null, missing: [] }
  const known = cost?.known_total ?? (plan?.costs ? fallback.total : null)
  const missing = Array.isArray(cost?.missing_costs)
    ? cost.missing_costs
    : Array.isArray(fallback.missing)
      ? fallback.missing
      : []
  const uncovered = Array.isArray(projection?.uncovered) ? projection.uncovered : []
  const exclusions = projection ? uncovered : missing

  const stayItems = projectionItems.filter((item) => item?.category === 'accommodation')
  const transportItems = projectionItems.filter((item) => item?.category === 'transport')
  const diningItems = projectionItems.filter((item) => item?.category === 'dining')
  const stayInfo = resolveCategory(stayItems, breakdown.accommodation)
  const transportInfo = resolveCategory(transportItems, breakdown.transport)
  const diningInfo = resolveCategory(diningItems, breakdown.dining)
  const stay = stayInfo.amount
  const transport = transportInfo.amount
  const dining = diningInfo.amount
  const subtotal = asNumber(projection?.subtotalVnd)
  const projectedTotal = asNumber(projection?.totalVnd)
  const estimatedTotal = projection
    ? subtotal ?? projectedTotal
    : exclusions.length === 0
      ? known
      : null
  const complete = projection
    ? projectedTotal != null && exclusions.length === 0
    : exclusions.length === 0 && known != null
  const travelers =
    plan?.request?.travelers?.count ??
    projectionItems.find((item) => item?.travelers != null)?.travelers ??
    null
  const dayCount = Array.isArray(plan?.days) ? plan.days.length : 0

  return {
    hasCostData: Boolean(cost || plan?.costs || projection),
    currency: projection?.currency || 'VND',
    estimatedTotal,
    complete,
    partial: !complete,
    knownTotal: known,
    knownLabel: complete ? 'Known costs' : 'Known costs · partial',
    stay,
    staySource: stayInfo.source,
    transport,
    transportSource: transportInfo.source,
    dining,
    diningSource: diningInfo.source,
    diningItems,
    diningLabel: diningItems.length ? 'Dining estimates' : 'Dining',
    budget: asNumber(cost?.budget),
    remaining: asNumber(cost?.remaining_budget),
    missing: exclusions,
    uncovered,
    missingCombined: unique(exclusions),
    travelers: asNumber(travelers),
    dayCount,
    projection,
    assumptions: Array.isArray(projection?.assumptions) ? projection.assumptions : [],
  }
}

export function getTripChecklistItems(plan) {
  if (!plan) return []
  const estimate = getPlanEstimate(plan)
  const days = Array.isArray(plan.days) ? plan.days : []
  const activities = days.flatMap((day) => (Array.isArray(day?.activities) ? day.activities : []))
  const legs = collectTravelLegs(plan)
  const { stay, transport } = getPlanServiceItems(plan)
  const hasStay = Boolean(stay) || estimate.stay != null
  const hasTransport = Boolean(transport) || estimate.transport != null
  const items = []

  if (hasStay || hasTransport) {
    let title = 'Confirm room and transport prices'
    let description =
      'Check the final price, availability, taxes, and fees with the provider before booking.'
    if (hasStay && !hasTransport) {
      title = 'Confirm room price and availability'
      description =
        'Check the final room price, availability, taxes, and fees with the hotel before booking.'
    } else if (!hasStay && hasTransport) {
      title = 'Confirm transport prices'
      description =
        'Check the final fare, availability, and fees with the transport provider before booking.'
    }
    items.push({ key: 'room-transport-prices', title, description })
  }

  if (activities.length > 0) {
    items.push({
      key: 'opening-hours',
      title: 'Confirm opening hours and visit times',
      description: 'Check opening hours for your travel dates and adjust your visit times if needed.',
    })
  }

  if (activities.length > 1 || legs.length > 0) {
    items.push({
      key: 'travel-times',
      title: 'Check travel times on the map',
      description: 'Review the route between stops and allow enough time for travel.',
    })
  }

  return items
}
