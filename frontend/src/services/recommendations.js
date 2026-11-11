function countMatches(values) {
  return Array.isArray(values) ? values.length : 0
}

export function getTopFeasiblePlans(plans, limit = 3) {
  if (!Array.isArray(plans) || limit <= 0) return []

  return plans
    .filter((plan) => plan.status === 'FEASIBLE')
    .sort(
      (a, b) =>
        countMatches(b.fit) - countMatches(a.fit) ||
        countMatches(a.notFit) - countMatches(b.notFit)
    )
    .slice(0, limit)
}

const VALID_STATUSES = new Set(['FEASIBLE', 'INFEASIBLE', 'UNVERIFIED'])

// Backend check codes owned by each deterministic component, so a top-level
// reason is not shown twice (once flat, once inside its component group).
const COMPONENT_CHECK_CODES = {
  cost: new Set(['BUDGET']),
  schedule: new Set([
    'DAY_COUNT', 'TRAVEL_MONTH', 'DAY_NUMBER', 'TRAVEL_DATE', 'DAY_SCHEDULE',
    'ACTIVITY_ORDER', 'PLACE_DATA', 'PLACE_SOURCE', 'OPENING_HOURS',
    'OUTSIDE_OPENING_HOURS', 'VISIT_DURATION_DATA', 'VISIT_DURATION', 'TRANSFER_GAP',
  ]),
  travel: new Set([
    'LEG_ENDPOINTS', 'MISSING_LEG', 'LEG_ORDER', 'UNSUPPORTED_LEG', 'TRAVEL_DATA',
    'TRAVEL_MISMATCH', 'TRAVEL_LIMIT', 'LIMIT_DATA', 'DAILY_LIMIT_DATA', 'TRIP_TIME_LIMIT',
  ]),
}

const COMPONENT_FOR_CODE = new Map(
  Object.entries(COMPONENT_CHECK_CODES).flatMap(
    ([owner, codes]) => [...codes].map((code) => [code, owner])
  )
)

export const VERIFICATION_CHECKS = [
  { key: 'cost', label: 'Cost' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'travel', label: 'Travel' },
]

export function getCheckStatus(evaluation, checkKey) {
  const status = evaluation?.components?.[checkKey]?.status
  return VALID_STATUSES.has(status) ? status : null
}

function normalizeReason(reason) {
  return typeof reason === 'string' ? { message: reason } : reason
}

function reasonIdentity(reason) {
  return `${reason.code || ''}\u0000${reason.path || ''}\u0000${reason.message || ''}`
}

/**
 * Group every non-passing reason by the check component that produced it
 * (cost / schedule / travel), plus plan-level and ranking leftovers.
 */
export function groupEvaluationReasons(evaluation, ranking, planId) {
  const groups = []
  const seen = new Set()
  const collect = (key, label, rawReasons) => {
    const reasons = []
    for (const raw of Array.isArray(rawReasons) ? rawReasons : []) {
      const reason = normalizeReason(raw)
      if (!reason || reason.status === 'FEASIBLE') continue
      if (!reason.message && !reason.code) continue
      const identity = reasonIdentity(reason)
      if (seen.has(identity)) continue
      seen.add(identity)
      reasons.push(reason)
    }
    if (reasons.length > 0) groups.push({ key, label, reasons })
  }

  const components = evaluation?.components || {}
  const byComponent = { cost: [], schedule: [], travel: [] }
  const planReasons = []
  for (const raw of Array.isArray(evaluation?.reasons) ? evaluation.reasons : []) {
    const reason = normalizeReason(raw)
    if (!reason || reason.status === 'FEASIBLE' || (!reason.message && !reason.code)) continue
    const owner = COMPONENT_FOR_CODE.get(reason.code)
    if (owner) byComponent[owner].push(reason)
    else planReasons.push(reason)
  }

  // The top-level BUDGET check only repeats the cost component's reasons.
  const costReasons = Array.isArray(components.cost?.reasons) && components.cost.reasons.length
    ? components.cost.reasons
    : byComponent.cost
  collect('cost', 'Cost', costReasons)
  collect('schedule', 'Schedule', [
    ...(components.schedule?.reasons || []),
    ...byComponent.schedule,
  ])
  collect('travel', 'Travel', [
    ...(components.travel?.reasons || []),
    ...byComponent.travel,
  ])
  collect('plan', 'Plan', planReasons)

  const excluded = Array.isArray(ranking?.excluded)
    ? ranking.excluded.find((item) => item?.planId === planId)
    : null
  collect('ranking', 'Ranking', excluded?.reasons)
  return groups
}

export function getCandidatePresentation(status, evaluation, ranking, planId) {
  const safeStatus = VALID_STATUSES.has(status) ? status : 'UNVERIFIED'
  const rankingEntry = ranking?.excluded?.find((item) => item.planId === planId)
  const reasons = [...(evaluation?.reasons || []), ...(rankingEntry?.reasons || [])]
    .filter((reason, index, all) => all.findIndex(
      (candidate) => candidate.code === reason.code && candidate.path === reason.path
    ) === index)

  return {
    status: safeStatus,
    reasons,
    recommended: Boolean(ranking?.ranked?.some((item) => item.planId === planId)),
  }
}
