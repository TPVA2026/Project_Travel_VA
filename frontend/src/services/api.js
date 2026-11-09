// TODO(M6): API client for the backend. The browser must never hold third-party API credentials.
export const API_BASE = import.meta.env?.VITE_API_BASE ?? "/api";

export {
  fetchDestinationRecommendations,
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

import { fetchPlanById as fetchPlanByIdMock, revisePlanMock } from "./mockData.js";
import { getSelectedPlan, setSelectedPlan, clearSelectedPlan } from "./planSelection.js";

function apiUrl(path) {
  if (!API_BASE || API_BASE === "/api") return path;
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}

/**
 * Select a plan as the chosen trip itinerary (TPVA-31 M5).
 * Saves to local persistence for the no-account MVP.
 */
export async function selectPlan(planOrId) {
  setSelectedPlan(planOrId);
  const id = typeof planOrId === 'string' ? planOrId : planOrId.id || planOrId.planId;
  return { status: "SUCCESS", planId: id, storage: "localStorage" };
}

/**
 * Submit an itinerary revision request (TPVA-31 M5).
 * Uses mock simulation only when an explicit demo plan has no original request.
 */
export async function revisePlan(planId, revisionPayload, opts = {}) {
  if (opts.forceMock) {
    return revisePlanMock(planId, revisionPayload, opts);
  }
  if (!opts.request || !opts.plan) {
    throw new Error("The original request and candidate plan are required for re-evaluation.");
  }
  const candidate = Object.fromEntries(
    ["planId", "title", "destinationId", "days", "missingData", "assumptions"]
      .filter((key) => Object.hasOwn(opts.plan, key))
      .map((key) => [key, opts.plan[key]])
  );
  return requestJson("/itineraries/revise", {
    request: opts.request,
    plan: candidate,
    revision: revisionPayload,
  });
}

export async function fetchPlanById(id, opts = {}) {
  const selected = getSelectedPlan();
  const selectedId = selected?.id || selected?.planId;
  if (selected && String(selectedId) === String(id)) return { data: selected };
  return fetchPlanByIdMock(id, opts); // Explicit sample/demo route only.
}

export function saveTripForResults(payload) {
  sessionStorage.setItem("tpva-travel-request", JSON.stringify(payload));
  sessionStorage.removeItem("tpva-ai-plan");
  clearSelectedPlan();
}

export async function fetchDestinations() {
  const res = await fetch(apiUrl("/api/v1/destinations"));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.detail?.message || "Could not load supported destinations.");
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return Array.isArray(body.destinations) ? body.destinations : [];
}

async function requestJson(path, payload) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const validationMessages = body.detail?.messages
    const defaults = {
      422: "The request or candidate plan is invalid.",
      500: "The planning service encountered an internal error.",
      501: "This planning feature is not available yet.",
      502: "The AI service is temporarily unavailable.",
      504: "The AI service timed out. Please try again.",
    }
    const error = new Error(
      body.message ||
      (Array.isArray(validationMessages) ? validationMessages.join(" ") : null) ||
      defaults[res.status] ||
      "The assistant could not complete the request."
    );
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function generateItinerary(payload) {
  return requestJson("/itineraries/generate", payload)
}

export async function evaluateItinerary(request, plan) {
  return requestJson("/itineraries/evaluate", { request, plan })
}

export async function rankItineraries(request, plans) {
  return requestJson("/itineraries/rank", { request, plans })
}

export async function runItineraryPipeline(payload) {
  const generated = await generateItinerary(payload)
  const evaluation = await evaluateItinerary(payload, generated.plan)
  const ranking = await rankItineraries(payload, [generated.plan])
  return {
    status: evaluation.status,
    plan: generated.plan,
    evaluation,
    ranking,
  }
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
