// TODO(M6): API client for the backend. The browser must never hold third-party API credentials.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export {
  fetchDestinationRecommendations,
  fetchPlanById,
  MOCK_PLANS,
  knownTotal,
  fmtMoney,
} from "./mockData.js";

function apiUrl(path) {
  if (!API_BASE || API_BASE === "/api") return path;
  return `${API_BASE.replace(/\/$/, "")}${path}`;
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
