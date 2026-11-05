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
