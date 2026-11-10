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
