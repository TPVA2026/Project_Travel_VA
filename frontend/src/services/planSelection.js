// LocalStorage and state helper for managing the selected / chosen itinerary plan (TPVA-31)

const STORAGE_KEY_ID = 'tpva_selected_plan_id'
const STORAGE_KEY_DATA = 'tpva_selected_plan_data'

/**
 * Get the currently selected plan ID from localStorage.
 * @returns {string|null}
 */
export function getSelectedPlanId() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(STORAGE_KEY_ID) || null
  } catch {
    return null
  }
}

/**
 * Get the cached data of the currently selected plan.
 * @returns {object|null}
 */
export function getSelectedPlan() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(STORAGE_KEY_DATA)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Set a plan as the user's selected/chosen plan.
 * @param {string|object} planOrId Plan object or plan ID
 */
export function setSelectedPlan(planOrId) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    if (!planOrId) {
      clearSelectedPlan()
      return
    }

    const id = typeof planOrId === 'string' ? planOrId : planOrId.id || planOrId.planId
    window.localStorage.setItem(STORAGE_KEY_ID, String(id))

    if (typeof planOrId === 'object') {
      window.localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(planOrId))
    }

    // Notify any active listeners across components
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('tpva-plan-selected', { detail: { id, plan: planOrId } }))
    }
  } catch {
    // Graceful fallback for non-storage environments
  }
}

/**
 * Clear the current plan selection.
 */
export function clearSelectedPlan() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(STORAGE_KEY_ID)
    window.localStorage.removeItem(STORAGE_KEY_DATA)

    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('tpva-plan-selected', { detail: { id: null, plan: null } }))
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if a plan ID matches the currently selected plan.
 * @param {string} id
 * @returns {boolean}
 */
export function isPlanSelected(id) {
  if (!id) return false
  const current = getSelectedPlanId()
  return current === String(id)
}
