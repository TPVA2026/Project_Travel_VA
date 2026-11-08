// TODO(M6): API client for the backend. The browser must never hold third-party API credentials.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export {
  fetchDestinationRecommendations,
  fetchPlanById,
  revisePlanMock,
  MOCK_PLANS,
  knownTotal,
  fmtMoney,
} from "./mockData.js";

export {
  getSelectedPlanId,
  getSelectedPlan,
  setSelectedPlan,
  clearSelectedPlan,
  isPlanSelected,
} from "./planSelection.js";

import { revisePlanMock } from "./mockData.js";
import { setSelectedPlan, clearSelectedPlan } from "./planSelection.js";

function apiUrl(path) {
  if (!API_BASE || API_BASE === "/api") return path;
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}

/**
 * Select a plan as the chosen trip itinerary (TPVA-31 M5).
 * Saves to local persistence and attempts backend notification if available.
 */
export async function selectPlan(planOrId) {
  setSelectedPlan(planOrId);
  const id = typeof planOrId === 'string' ? planOrId : planOrId.id || planOrId.planId;

  try {
    const res = await fetch(apiUrl("/itineraries/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: id }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend select route is optional in current phase
  }

  return { status: "SUCCESS", planId: id };
}

/**
 * Submit an itinerary revision request (TPVA-31 M5).
 * Falls back to mock simulation when backend endpoint is in progress.
 */
export async function revisePlan(planId, revisionPayload, opts = {}) {
  // If backend endpoint is implemented and not forced to mock:
  if (!opts.forceMock && !opts.shouldFail) {
    try {
      const res = await fetch(apiUrl("/itineraries/revise"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(revisionPayload),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback to client mock
    }
  }

  // Client mock simulation
  return await revisePlanMock(planId, revisionPayload, opts);
}

export function saveTripForResults(payload) {
  sessionStorage.setItem("tpva-travel-request", JSON.stringify(payload));
  sessionStorage.removeItem("tpva-ai-plan");
  clearSelectedPlan();
}

export async function generateItinerary(payload) {
  const res = await fetch(apiUrl("/itineraries/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.message || "The assistant could not build an itinerary.");
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function validateTravelRequest(payload) {
  const res = await fetch(apiUrl("/api/v1/requests/validate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error("Request was rejected");
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}
