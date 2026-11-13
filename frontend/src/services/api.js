// TODO(M6): API client for the backend. The browser must never hold third-party API credentials.
export const API_BASE = import.meta.env?.VITE_API_BASE ?? "/api";

import { MOCK_PLANS } from "./mockData.js";

export { knownTotal, fmtMoney } from "./mockData.js";

export {
  getSelectedPlanId,
  getSelectedPlan,
  setSelectedPlan,
  clearSelectedPlan,
  isPlanSelected,
  resetCurrentTrip,
} from "./planSelection.js";

import { getSelectedPlan, getSelectedPlanId, setSelectedPlan, clearSelectedPlan } from "./planSelection.js";
import { getAuthToken } from "./authSession.js";

const SAMPLE_PLAN_IDS = new Set(
  MOCK_PLANS.flatMap((plan) => [plan.id, plan.planId])
    .filter(Boolean)
    .map(String)
);

/**
 * One-time cleanup for the removed sample plan. Earlier builds could save the
 * bundled demo itinerary as the user's selected trip, which then kept appearing
 * on the review page. Drop any stored selection that points at that sample so the
 * review page only ever shows a plan generated in this session.
 */
export function purgeSampleSelection() {
  const stored = getSelectedPlan();
  const id = stored?.id || stored?.planId || getSelectedPlanId();
  if (id && SAMPLE_PLAN_IDS.has(String(id))) clearSelectedPlan();
}

function apiUrl(path) {
  if (!API_BASE || API_BASE === "/api") return path;
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}

/**
 * Save a selected itinerary to the signed-in account (TPVA-66).
 */
export async function selectPlan(planOrId) {
  if (!planOrId || typeof planOrId !== 'object') throw new Error('A complete itinerary is required.');
  const savedTripId = planOrId.savedTripId;
  const body = await authenticatedRequest(savedTripId ? `/api/trips/${savedTripId}` : '/api/trips', {
    method: savedTripId ? 'PUT' : 'POST',
    body: JSON.stringify({ itinerary: planOrId }),
  });
  const saved = { ...body.trip.itinerary, savedTripId: body.trip.id };
  setSelectedPlan(saved);
  return { status: "SUCCESS", planId: saved.planId || saved.id, trip: body.trip };
}

async function authenticatedRequest(path, options = {}) {
  const token = getAuthToken();
  if (!token) {
    window.dispatchEvent(new window.CustomEvent('tpva-auth-required'));
    const error = new Error('Sign in with Google to save or open My Trips.');
    error.status = 401;
    throw error;
  }
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new window.CustomEvent('tpva-auth-required'));
    const error = new Error(typeof body.detail === 'string' ? body.detail : 'Could not access saved trips.');
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function fetchMyTrips() {
  const body = await authenticatedRequest('/api/trips');
  return body.trips;
}

export async function fetchSavedTrip(id) {
  const body = await authenticatedRequest(`/api/trips/${encodeURIComponent(id)}`);
  return body.trip;
}

export async function updateSavedTrip(id, itinerary) {
  const body = await authenticatedRequest(`/api/trips/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ itinerary }),
  });
  return body.trip;
}

/**
 * Submit an itinerary revision request (TPVA-31 M5).
 * Requires the original backend request and candidate plan.
 */
export async function revisePlan(planId, revisionPayload, opts = {}) {
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

const PIPELINE_CACHE_KEY = "tpva-ai-plan";

function readCachedPipeline() {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(PIPELINE_CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved?.pipeline) return saved.pipeline;
    if (saved?.plan) {
      return {
        pipelineStatus: "COMPLETE",
        candidates: [
          {
            planId: saved.plan.planId || saved.plan.id,
            plan: saved.plan,
            status: saved.status || saved.evaluation?.status || "UNVERIFIED",
            evaluation: saved.evaluation || null,
          },
        ],
        ranking: saved.ranking || null,
        request: saved.request || null,
        plan: saved.plan,
        evaluation: saved.evaluation || null,
        status: saved.status || null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function planFromCandidate(candidate, pipeline, id) {
  const plan = candidate?.plan || candidate || {};
  const evaluation = candidate?.evaluation || pipeline?.evaluation || null;
  return {
    ...plan,
    id,
    planId: plan.planId || id,
    status: candidate?.status || evaluation?.status || "UNVERIFIED",
    evaluation,
    ranking: pipeline?.ranking || null,
    request: pipeline?.request || null,
    missing: (Array.isArray(evaluation?.reasons) ? evaluation.reasons : [])
      .map((reason) => reason?.message || reason?.code)
      .filter(Boolean),
    fit: Array.isArray(plan.fit) ? plan.fit : [],
  };
}

/**
 * Resolve a candidate generated by the current session's pipeline even before
 * it was chosen, so "View details" works for every card. The pipeline result is
 * cached in sessionStorage by the results page; nothing is invented here.
 */
export function findCachedCandidatePlan(id) {
  if (id == null) return null;
  const key = String(id);
  const cached = readCachedPipeline();
  if (!cached) return null;
  const candidates = Array.isArray(cached.candidates) ? cached.candidates : [];
  const candidate = candidates.find(
    (item) => String(item?.planId || item?.plan?.planId || item?.plan?.id) === key
  );
  if (candidate) return planFromCandidate(candidate, cached, key);
  if (cached.plan && String(cached.plan.planId || cached.plan.id) === key) {
    return planFromCandidate(
      { plan: cached.plan, status: cached.status, evaluation: cached.evaluation },
      cached,
      key
    );
  }
  return null;
}

export async function fetchPlanById(id) {
  const selected = getSelectedPlan();
  const selectedId = selected?.id || selected?.planId;
  if (selected && String(selectedId) === String(id)) return { data: selected };
  const cached = findCachedCandidatePlan(id);
  if (cached) return { data: cached };
  const error = new Error(
    "This itinerary was not generated in this session. Create a new trip to see a backend-generated plan."
  );
  error.status = 404;
  throw error;
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

/**
 * Display-only snapshot of the curated Huê place metadata.
 * The backend stays the source of truth for grounding, costs and statuses; this
 * snapshot only turns place ids into readable names/hours/prices in the UI.
 * Unknown ids are never guessed and are shown as ids by the caller.
 */
const PLACE_CATALOG = [
  { id: "ATTR_H_01", name: "lăng Khải Định", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Núi Châu Chữ, phường Thủy Xuân, thành phố Huế", openingHours: "07:00 - 17:30", priceVnd: 150000, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_02", name: "Cung An Định", type: 'sightseeing', destinationId: "H", city: "Huế", address: "97 Phan Đình Phùng, thành phố Huế", openingHours: "07:00 - 17:00", priceVnd: 25000, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_03", name: "Đại Nội", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Đường 23/8, phường Phú Xuân, thành phố Huế", openingHours: "07:00 - 17:30", priceVnd: 200000, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_04", name: "Bến Xưa Vỹ Dạ", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Kiệt 73 Nguyễn Sinh Cung, Vỹ Dạ, Huế", openingHours: "tự do", priceVnd: 0, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_05", name: "chợ Đông Ba", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Đường Trần Hưng Đạo, bên sông Hương, thành phố Huế", openingHours: "07:00 - 19:00", priceVnd: 0, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_06", name: "làng nón bài thơ Tây Hồ", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Thôn Tây Hồ, xã Phú Hồ, huyện Phú Vang, Thừa Thiên Huế", openingHours: "không cố định", priceVnd: 0, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_07", name: "Quốc Học Huế", type: 'sightseeing', destinationId: "H", city: "Huế", address: "12 Lê Lợi, phường Thuận Hóa, thành phố Huế", openingHours: "Ngày trong tuần: buổi chiều; Chủ nhật: cả ngày", priceVnd: 0, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_08", name: "Làng Hương Thủy Xuân", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Đường Huyền Trân Công Chúa, phường Thủy Xuân, Huế", openingHours: "09:00 - 22:00", priceVnd: 0, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_09", name: "Chùa Thiên Mụ", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Đồi Hà Khê, khu vực Kim Long, Huế", openingHours: "24/7", priceVnd: 0, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "ATTR_H_10", name: "Cầu Trường Tiền", type: 'sightseeing', destinationId: "H", city: "Huế", address: "Cầu Trường Tiền, bắc qua sông Hương, Huế", openingHours: "tự do", priceVnd: 0, priceDisplay: null, priceScope: "perPerson", costStatus: 'KNOWN' },
  { id: "REST_H_01", name: "Quán bánh O Lé", type: 'dining', destinationId: "H", city: "Huế", address: "9/17, kiệt 104 Kim Long, thành phố Huế", openingHours: "11:00 - 20:00", priceVnd: null, priceDisplay: "35.000 VND", priceScope: "perServing", costStatus: 'NO_DATA' },
  { id: "REST_H_02", name: "Bánh ướt - Bún thịt nướng Huyền Anh", type: 'dining', destinationId: "H", city: "Huế", address: "50 Kim Long, thành phố Huế", openingHours: null, priceVnd: null, priceDisplay: null, priceScope: "unspecified", costStatus: 'NO_DATA' },
  { id: "REST_H_03", name: "Bún giấm nuốc Gia Hội", type: 'dining', destinationId: "H", city: "Huế", address: "02 Chi Lăng, phường Phú Cát, thành phố Huế", openingHours: "15:00 - 18:00", priceVnd: null, priceDisplay: "30.000 VND", priceScope: "perServing", costStatus: 'NO_DATA' },
  { id: "REST_H_04", name: "Quán hến Hoa Đông", type: 'dining', destinationId: "H", city: "Huế", address: "64 kiệt 7 Ưng Bình, Huế", openingHours: "07:00 - 22:00", priceVnd: null, priceDisplay: "7.000 - 10.000 VND", priceScope: "perServing", costStatus: 'NO_DATA' },
  { id: "REST_H_05", name: "Bún bò mệ Kéo", type: 'dining', destinationId: "H", city: "Huế", address: "20 Bạch Đằng, Huế", openingHours: "06:00 - 10:00", priceVnd: null, priceDisplay: "20.000 - 30.000 VND", priceScope: "perServing", costStatus: 'NO_DATA' },
  { id: "REST_H_06", name: "Cơm niêu chạn", type: 'dining', destinationId: "H", city: "Huế", address: "1 Nguyễn Thái Học, Huế", openingHours: "08:00 - 22:00", priceVnd: null, priceDisplay: "50.000 - 250.000 VND", priceScope: "unspecified", costStatus: 'NO_DATA' },
  { id: "REST_H_07", name: "Bánh mì O Tho", type: 'dining', destinationId: "H", city: "Huế", address: "14 Trần Cao Vân, Huế", openingHours: "06:30 - 11:00; 15:00 - 03:00", priceVnd: null, priceDisplay: "10.000 - 25.000 VND", priceScope: "perItem", costStatus: 'NO_DATA' },
  { id: "REST_H_08", name: "Cháo Vịt Thuận", type: 'dining', destinationId: "H", city: "Huế", address: "94 Bùi Thị Xuân, Huế", openingHours: "11:00 - 20:00", priceVnd: null, priceDisplay: "35.000 - 100.000 VND", priceScope: "unspecified", costStatus: 'NO_DATA' },
  { id: "REST_H_09", name: "Chè Cầm", type: 'dining', destinationId: "H", city: "Huế", address: "10 Nguyễn Sinh Cung, Vỹ Dạ, Huế", openingHours: "16:00 - 22:00", priceVnd: null, priceDisplay: "Từ 15.000 VND/ly", priceScope: "perServing", costStatus: 'NO_DATA' },
  { id: "REST_H_10", name: "Bánh canh Nam Phổ - Thúy", type: 'dining', destinationId: "H", city: "Huế", address: "16 Phạm Hồng Thái, Huế", openingHours: "11:15 - 20:00", priceVnd: null, priceDisplay: "5.000 - 15.000 VND", priceScope: "perServing", costStatus: 'NO_DATA' },
];

export function getPlaceCatalog(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return PLACE_CATALOG;
  const wanted = new Set(ids.map(String));
  return PLACE_CATALOG.filter((place) => wanted.has(String(place.id)));
}


export async function fetchPlaceCatalog({ ids, destination } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const uniqueIds = [...new Set(ids.map(String))];
  const places = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const query = new URLSearchParams();
    if (destination) query.set('destination', destination);
    uniqueIds.slice(offset, offset + 100).forEach((id) => query.append('ids', id));
    const response = await fetch(apiUrl(`/api/v1/places?${query}`));
    if (!response.ok) throw new Error('Could not load the place name catalog.');
    const body = await response.json();
    if (!Array.isArray(body.places)) throw new Error('The place catalog is invalid.');
    places.push(...body.places);
  }
  return places;
}

const VALID_STATUSES = new Set(['FEASIBLE', 'INFEASIBLE', 'UNVERIFIED'])

export const VERIFICATION_CHECKS = [
  { key: 'cost', label: 'Budget' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'travel', label: 'Travel' },
]

export function getCheckStatus(evaluation, checkKey) {
  const status = evaluation?.components?.[checkKey]?.status
  return VALID_STATUSES.has(status) ? status : null
}

const REASON_TOPICS = [
  { key: 'budget', label: 'Budget', codes: ['BUDGET'] },
  {
    key: 'openingHours',
    label: 'Opening hours',
    codes: ['OPENING_HOURS', 'OUTSIDE_OPENING_HOURS'],
  },
  {
    key: 'travelTime',
    label: 'Travel time',
    codes: [
      'TRANSFER_GAP', 'TRAVEL_MISMATCH', 'TRAVEL_LIMIT', 'LIMIT_DATA',
      'DAILY_LIMIT_DATA', 'TRIP_TIME_LIMIT',
    ],
  },
  {
    key: 'routing',
    label: 'Unverified route',
    codes: ['UNSUPPORTED_LEG', 'TRAVEL_DATA', 'MISSING_LEG', 'LEG_ENDPOINTS', 'LEG_ORDER'],
  },
  {
    key: 'schedule',
    label: 'Schedule',
    codes: [
      'DAY_COUNT', 'TRAVEL_MONTH', 'DAY_NUMBER', 'TRAVEL_DATE', 'DAY_SCHEDULE',
      'ACTIVITY_ORDER',
    ],
  },
  {
    key: 'place',
    label: 'Place data',
    codes: ['PLACE_DATA', 'PLACE_SOURCE', 'VISIT_DURATION_DATA', 'VISIT_DURATION'],
  },
  { key: 'plan', label: 'Trip details', codes: ['DESTINATION_ID', 'INVALID_INPUT'] },
  { key: 'ranking', label: 'Ranking', codes: [] },
]

const TOPIC_FOR_CODE = new Map(
  REASON_TOPICS.flatMap((topic) => topic.codes.map((code) => [code, topic.key]))
)
const TOPIC_LABELS = new Map(REASON_TOPICS.map((topic) => [topic.key, topic.label]))
const TOPIC_ORDER = REASON_TOPICS.map((topic) => topic.key)

function normalizeReason(reason) {
  return typeof reason === 'string' ? { message: reason } : reason
}

function reasonIdentity(reason) {
  return `${reason.code || ''}\u0000${reason.path || ''}\u0000${reason.message || ''}`
}

function reasonTopic(reason, fallback) {
  return TOPIC_FOR_CODE.get(reason.code) || (TOPIC_LABELS.has(fallback) ? fallback : 'plan')
}

/**
 * Group every non-passing reason by the user-facing question it answers:
 * budget, opening hours, travel time, unverified routing, schedule, place
 * data, plan data and ranking leftovers. Backend check codes stay on each
 * reason for debugging.
 */
export function groupEvaluationReasons(evaluation, ranking, planId) {
  const seen = new Set()
  const buckets = new Map(TOPIC_ORDER.map((key) => [key, []]))
  const add = (raw, fallback) => {
    const reason = normalizeReason(raw)
    if (!reason || reason.status === 'FEASIBLE') return
    if (!reason.message && !reason.code) return
    const identity = reasonIdentity(reason)
    if (seen.has(identity)) return
    seen.add(identity)
    buckets.get(reasonTopic(reason, fallback)).push(reason)
  }

  const components = evaluation?.components || {}
  const costComponentReasons = Array.isArray(components.cost?.reasons)
    ? components.cost.reasons
    : []
  const hasCostComponentReasons = costComponentReasons.length > 0

  for (const raw of Array.isArray(evaluation?.reasons) ? evaluation.reasons : []) {
    const reason = normalizeReason(raw)
    if (reason?.code === 'BUDGET' && hasCostComponentReasons) continue
    add(raw, 'plan')
  }
  for (const raw of costComponentReasons) add(raw, 'budget')
  for (const raw of components.schedule?.reasons || []) add(raw, 'schedule')
  for (const raw of components.travel?.reasons || []) add(raw, 'travelTime')

  const excluded = Array.isArray(ranking?.excluded)
    ? ranking.excluded.find((item) => item?.planId === planId)
    : null
  for (const raw of excluded?.reasons || []) add(raw, 'ranking')

  return TOPIC_ORDER
    .filter((key) => buckets.get(key).length > 0)
    .map((key) => ({ key, label: TOPIC_LABELS.get(key), reasons: buckets.get(key) }))
}

export function collectPlaceIds(plan) {
  const ids = new Set()
  const add = (id) => {
    if (id != null && String(id).trim()) ids.add(String(id))
  }
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    for (const activity of Array.isArray(day?.activities) ? day.activities : []) add(activity?.placeId)
    for (const leg of Array.isArray(day?.travelLegs) ? day.travelLegs : []) {
      add(leg?.fromPlaceId)
      add(leg?.toPlaceId)
    }
  }
  return [...ids]
}

export function indexPlaces(places) {
  const byId = new Map()
  for (const place of Array.isArray(places) ? places : []) {
    if (place?.id) byId.set(String(place.id), place)
  }
  return byId
}

export function safeSourceUrl(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

export function sourceLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Source"
  } catch {
    return "Source"
  }
}

function makeSource(url, label) {
  const safeUrl = safeSourceUrl(url)
  if (!safeUrl) return null
  const text = typeof label === "string" && label.trim()
    ? label.trim()
    : sourceLabel(safeUrl)
  return { url: safeUrl, label: text }
}

/**
 * Every source the backend already returns for an activity, keyed by activity
 * id. Place metadata is the primary source in the timeline; cost evidence is
 * the fallback when a place has no source of its own.
 */
export function collectActivitySources(plan) {
  const sources = new Map()
  const add = (activityId, url, label) => {
    if (activityId == null) return
    const key = String(activityId)
    if (sources.has(key)) return
    const source = makeSource(url, label)
    if (source) sources.set(key, source)
  }
  const cost = plan?.evaluation?.components?.cost
  for (const item of Array.isArray(cost?.projection?.items) ? cost.projection.items : []) {
    add(item?.activityId, item?.sourceUrl, item?.source)
  }
  for (const evidence of Array.isArray(cost?.costEvidence) ? cost.costEvidence : []) {
    add(evidence?.activityId, evidence?.source, evidence?.sourceLabel)
  }
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    for (const activity of Array.isArray(day?.activities) ? day.activities : []) {
      add(activity?.activityId, activity?.sourceUrl || activity?.source, activity?.sourceLabel)
    }
  }
  return sources
}

export function getPlanServiceItems(plan) {
  const items = plan?.evaluation?.components?.cost?.projection?.items
  const list = Array.isArray(items) ? items : []
  return {
    stay: list.find((item) => item?.category === "accommodation") || null,
    transport: list.find((item) => item?.category === "transport") || null,
  }
}

export function collectTravelLegs(plan) {
  const legs = []
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    const dayLegs = Array.isArray(day?.travelLegs) ? day.travelLegs : []
    const dayNumber = day?.dayNumber ?? day?.day ?? null
    for (const leg of dayLegs) {
      if (!leg || typeof leg !== "object") continue
      legs.push({ ...leg, dayNumber })
    }
  }
  return legs
}

function placeFrom(placesById, placeId) {
  if (!placesById || placeId == null) return null
  const key = String(placeId)
  if (typeof placesById.get === 'function') return placesById.get(key) || null
  return placesById[key] || null
}

export function resolvePlaceName(placeId, placesById) {
  return placeFrom(placesById, placeId)?.name || null
}

export function displayPlaceName(placeId, placesById) {
  return resolvePlaceName(placeId, placesById) || (placeId == null ? '' : String(placeId))
}

export function resolveDestinationName(destinationId, placesById) {
  if (!destinationId) return ''
  const places = typeof placesById?.values === 'function'
    ? [...placesById.values()]
    : Object.values(placesById || {})
  const match = places.find((place) => place?.destinationId === destinationId && place?.city)
  return match?.city || String(destinationId)
}

export function createNameResolver(plan, placesById) {
  const activityNames = new Map()
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    for (const activity of Array.isArray(day?.activities) ? day.activities : []) {
      if (activity?.activityId) {
        activityNames.set(String(activity.activityId), displayPlaceName(activity.placeId, placesById))
      }
    }
  }
  return (id) => {
    if (id == null) return ''
    const key = String(id)
    return activityNames.get(key) || resolvePlaceName(key, placesById) || key
  }
}

function replaceIds(message, resolveName) {
  return String(message || '').replace(
    /[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+/g,
    (token) => resolveName(token) || token
  )
}

function translateCostMessage(message) {
  if (message === 'Known costs exceed budget.') return 'Known costs exceed your budget.'
  if (message === 'Budget is missing or invalid.') return 'Budget is missing or invalid.'
  if (message === 'Cost total exceeds the supported numeric range.') {
    return 'Cost total exceeds the supported numeric range.'
  }
  if (message.startsWith('Required costs are missing or invalid:')) {
    const missing = message
      .slice('Required costs are missing or invalid:'.length)
      .trim()
      .replace(/\.$/, '')
    return `Required costs are missing or invalid: ${missing}.`
  }
  return message
}

function translateMeasurementFields(message) {
  return message
    .replace(/\bdurationMin\b/g, 'travel time')
    .replace(/\bdistanceKm\b/g, 'distance')
    .replace(/\bmaxTravelTimeMinutes\b/g, 'travel time limit')
    .replace(/\bmaxDistanceKm\b/g, 'distance limit')
}

export function formatReason(reason, context = {}) {
  const normalized = normalizeReason(reason)
  if (!normalized) return ''
  const rawMessage = String(normalized.message || normalized.code || '')
  const resolveName = typeof context.resolveName === 'function'
    ? context.resolveName
    : createNameResolver(context.plan, context.placesById)
  const withNames = replaceIds(rawMessage, resolveName)
  const message = translateMeasurementFields(withNames)
  const code = normalized.code

  if (!code) return translateCostMessage(message)

  switch (code) {
    case 'BUDGET':
      return translateCostMessage(message)
    case 'DESTINATION_ID':
      return 'Destination is not in the verified dataset.'
    case 'DAY_COUNT':
      return 'Itinerary day count does not match the request.'
    case 'TRAVEL_MONTH':
      return 'Start date is outside the month you chose.'
    case 'DAY_NUMBER':
      return 'Day numbers must start at 1 and be consecutive.'
    case 'TRAVEL_DATE':
      return 'Itinerary dates do not match or are not consecutive.'
    case 'DAY_SCHEDULE':
      return 'Activities overlap or have invalid durations.'
    case 'ACTIVITY_ORDER':
      return 'Activities are not sorted by start time.'
    case 'PLACE_DATA':
      return 'This place was not found in the verified dataset.'
    case 'PLACE_SOURCE':
      return 'The place data source is not verified.'
    case 'OPENING_HOURS':
      return 'Not enough opening-hours data to check.'
    case 'OUTSIDE_OPENING_HOURS':
      return 'The activity falls outside the place opening hours.'
    case 'VISIT_DURATION_DATA':
      return 'Minimum visit duration is invalid.'
    case 'VISIT_DURATION':
      return 'Time allotted for the place is below the minimum.'
    case 'TRANSFER_GAP': {
      const match = message.match(/between (.+?) and (.+?)\.?$/i) || message.match(/giữa (.+?) và (.+?)\.?$/i)
      const places = match ? `${match[1]} and ${match[2]}` : 'two consecutive activities'
      return normalized.status === 'INFEASIBLE'
        ? `Not enough travel time between ${places}.`
        : `Travel time between ${places} is unverified.`
    }
    case 'LEG_ENDPOINTS':
      return 'Travel legs do not match the day activities.'
    case 'MISSING_LEG':
      return 'Missing a travel leg between two consecutive activities.'
    case 'LEG_ORDER':
      return 'Travel legs are not listed in activity order.'
    case 'UNSUPPORTED_LEG': {
      const match = message.match(/^Chưa có chặng đã xác minh (.+?) -> (.+?)\.?$/)
      return match ? `No verified route from ${match[1]} to ${match[2]}.` : message
    }
    case 'TRAVEL_DATA': {
      const match = message.match(/^Thiếu (.+?) cho (.+?) -> (.+?)\.?$/)
      return match ? `Missing ${match[1]} for ${match[2]} to ${match[3]}.` : message
    }
    case 'TRAVEL_MISMATCH':
      return 'Itinerary time or distance does not match the verified data.'
    case 'TRAVEL_LIMIT': {
      const match = message.match(/^(.+?)=([\d.]+) vượt giới hạn ([\d.]+)\.?$/)
      if (!match) return message
      const label = match[1].charAt(0).toUpperCase() + match[1].slice(1)
      return `${label} ${match[2]} exceeds the limit of ${match[3]}.`
    }
    case 'LIMIT_DATA': {
      const match = message.match(/^Chưa đủ (.+?) để kiểm tra (.+?)\.?$/)
      return match ? `Not enough ${match[1]} data to check the ${match[2]}.` : message
    }
    case 'DAILY_LIMIT_DATA': {
      const match = message.match(/^Chưa đủ (.+?) của cả ngày\.?$/)
      return match ? `Not enough ${match[1]} data for the whole day.` : message
    }
    case 'TRIP_TIME_LIMIT':
      return 'Total travel time exceeds the trip limit.'
    case 'INVALID_INPUT':
      return 'Itinerary data is invalid.'
    default:
      return message
  }
}

async function requestJson(path, payload, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) || 0
  const controller = timeoutMs > 0 ? new AbortController() : null
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null
  let res
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    })
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("The AI service took too long to respond.")
      timeout.status = 504
      timeout.code = "TIMEOUT"
      throw timeout
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
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
    error.code = body.error;
    error.body = body;
    throw error;
  }
  return body;
}

export async function generateItinerary(payload, opts = {}) {
  return requestJson("/itineraries/generate", payload, opts)
}

export async function evaluateItinerary(request, plan) {
  return requestJson("/itineraries/evaluate", { request, plan })
}

export async function rankItineraries(request, plans) {
  return requestJson("/itineraries/rank", { request, plans })
}

export const PIPELINE_MAX_CANDIDATES = 3

function pipelineError(code, message, extra = {}) {
  const error = new Error(message)
  error.code = code
  Object.assign(error, extra)
  return error
}

/**
 * Convert a fetch/request error into a stable pipeline code so the UI can tell
 * no-candidates, timeout and an unavailable AI apart. This never replaces a
 * real failure with mock data on the AI flow.
 */
export function normalizePipelineError(error, stage = "pipeline") {
  if (error?.code) return error
  const status = error?.status
  const serverCode = error?.body?.error
  let code = "PIPELINE_ERROR"
  if (
    serverCode === "NO_CANDIDATES" ||
    serverCode === "INSUFFICIENT_CANDIDATES"
  ) code = "NO_CANDIDATES"
  else if (status === 504 || serverCode === "TIMEOUT") code = "TIMEOUT"
  else if (status === 429 || serverCode === "RATE_LIMIT") code = "RATE_LIMIT"
  else if (status === 503) code = "AI_BUSY"
  else if (status === 502 || (status === 500 && serverCode === "CONFIG")) code = "AI_UNAVAILABLE"
  else if (status === 422) code = "INVALID_REQUEST"
  else if (!status) code = "AI_UNAVAILABLE"
  const wrapped = new Error(error?.message || "The assistant could not complete the request.")
  wrapped.code = code
  wrapped.status = status
  wrapped.body = error?.body
  wrapped.stage = stage
  return wrapped
}

function clampCandidateCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return PIPELINE_MAX_CANDIDATES
  return Math.max(1, Math.min(PIPELINE_MAX_CANDIDATES, Math.trunc(numeric)))
}

/**
 * Identity of a candidate by its ordered place visits per day. Times may vary
 * between otherwise-identical Gemini answers, so they are not part of the
 * identity used to avoid showing the same itinerary twice.
 */
export function planSignature(plan) {
  const days = Array.isArray(plan?.days) ? [...plan.days] : []
  return JSON.stringify(
    days
      .sort((a, b) => (a?.dayNumber || 0) - (b?.dayNumber || 0))
      .map((day) => [
        day?.dayNumber || 0,
        (Array.isArray(day?.activities) ? [...day.activities] : [])
          .sort((a, b) => String(a?.startTime || "").localeCompare(String(b?.startTime || "")))
          .map((activity) => activity?.placeId || null),
      ])
  )
}

export function normalizeCandidateStatus(status) {
  return VALID_STATUSES.has(status) ? status : "UNVERIFIED"
}

export const CANDIDATE_STATUS_LABEL = {
  FEASIBLE: "Feasible",
  UNVERIFIED: "Unverified",
  INFEASIBLE: "Not feasible",
}

export const CANDIDATE_STATUS_HINT = {
  FEASIBLE: "Passed budget, schedule, and travel checks.",
  UNVERIFIED: "Some data is unverified; this is not a verified recommendation and missing costs are not counted as 0.",
  INFEASIBLE: "Violates checked constraints; cannot be selected.",
}

export function candidateStatusLabel(status) {
  return CANDIDATE_STATUS_LABEL[normalizeCandidateStatus(status)]
}

/**
 * Known vs unknown costs for one candidate. `complete` is false whenever any
 * required cost is missing, so the UI can never present a partial total as the
 * full trip cost (missing costs are never counted as 0).
 */
export function getCandidateCost(candidate) {
  const cost = candidate?.evaluation?.components?.cost
  if (!cost || typeof cost !== "object") {
    return { knownTotal: null, missing: [], complete: false, budget: null, remaining: null }
  }
  return {
    knownTotal: cost.known_total ?? null,
    missing: Array.isArray(cost.missing_costs) ? cost.missing_costs : [],
    complete: cost.total_cost != null,
    budget: cost.budget ?? null,
    remaining: cost.remaining_budget ?? null,
    ...(cost.projection ? { projection: cost.projection } : {}),
  }
}

/**
 * Routing evidence summarises how many legs carry verified provenance. An
 * absent routing component means "not verified here", never "no travel".
 */
export function getRoutingEvidence(candidate) {
  const routes = candidate?.evaluation?.components?.routing?.routes
  if (!Array.isArray(routes)) {
    return { available: false, total: 0, verified: 0, unverified: 0, routes: [] }
  }
  const verified = routes.filter(
    (route) =>
      route?.status === "ROUTE_AVAILABLE" && route?.evidenceStatus === "VERIFIED"
  )
  return {
    available: true,
    total: routes.length,
    verified: verified.length,
    unverified: routes.length - verified.length,
    routes,
  }
}

/**
 * Locate a candidate in ranking: ranked (with score/position), unscored
 * (feasible but missing score inputs) or excluded (not ranked).
 */
export function getCandidateRanking(ranking, planId) {
  const ranked = Array.isArray(ranking?.ranked) ? ranking.ranked : []
  const index = ranked.findIndex((item) => item?.planId === planId)
  if (index !== -1) {
    const entry = ranked[index]
    return {
      kind: "ranked",
      position: index + 1,
      score: entry?.score ?? null,
      score100: entry?.score100 ?? (entry?.score != null ? entry.score * 100 : null),
      entry,
    }
  }
  const unscored = Array.isArray(ranking?.unscored) ? ranking.unscored : []
  const unscoredEntry = unscored.find((item) => item?.planId === planId)
  if (unscoredEntry) {
    return { kind: "unscored", position: null, score: null, score100: null, entry: unscoredEntry }
  }
  const excluded = Array.isArray(ranking?.excluded) ? ranking.excluded : []
  const excludedEntry = excluded.find((item) => item?.planId === planId)
  if (excludedEntry) {
    return { kind: "excluded", position: null, score: null, score100: null, entry: excludedEntry }
  }
  return { kind: null, position: null, score: null, score100: null, entry: null }
}

/**
 * Suitability / quality warnings for a candidate: every non-passing evaluation
 * reason plus the ranking exclusion reasons, de-duplicated by code + path.
 */
export function getCandidateWarnings(candidate, ranking) {
  const reasons = [
    ...(Array.isArray(candidate?.evaluation?.reasons) ? candidate.evaluation.reasons : []),
  ]
  const source = ranking || candidate?.ranking
  const excluded = Array.isArray(source?.excluded) ? source.excluded : []
  const own = excluded.find((item) => item?.planId === candidate?.planId)
  reasons.push(...(Array.isArray(own?.reasons) ? own.reasons : []))

  const seen = new Set()
  const warnings = []
  for (const raw of reasons) {
    const reason = typeof raw === "string" ? { message: raw } : raw
    if (!reason || reason.status === "FEASIBLE") continue
    if (!reason.message && !reason.code) continue
    const identity = `${reason.code || ""}\u0000${reason.path || ""}\u0000${reason.message || ""}`
    if (seen.has(identity)) continue
    seen.add(identity)
    warnings.push(reason)
  }
  return warnings
}

/**
 * Run the multi-candidate AI pipeline through the backend generate/evaluate/
 * rank endpoints (TPVA-34 contract, orchestrated from the client because the
 * generation endpoint returns one candidate per call).
 *
 * Returns `{ pipelineStatus, candidates, ranking, warnings }` plus the legacy
 * single-plan fields (`status`, `plan`, `evaluation`). The AI flow never falls
 * back to mock recommendations: no candidates, timeout and partial failures
 * surface as typed errors or an explicit PARTIAL result.
 */
export async function runItineraryPipeline(payload, opts = {}) {
  const requested = clampCandidateCount(opts.count)
  try {
    const result = await requestJson(
      "/itineraries/pipeline",
      { request: payload, count: requested },
      { timeoutMs: opts.timeoutMs || 600000 }
    )
    const legacyCandidate = result?.plan
      ? [{
          planId: result.plan.planId,
          plan: result.plan,
          status: result.status || result.evaluation?.status || "UNVERIFIED",
          evaluation: result.evaluation || null,
        }]
      : []
    const candidates = Array.isArray(result?.candidates)
      ? result.candidates
      : legacyCandidate
    if (candidates.length === 0) {
      throw pipelineError(
        "NO_CANDIDATES",
        "The assistant did not return any usable candidate."
      )
    }

    const normalizedCandidates = candidates.map((candidate) => ({
      ...candidate,
      planId: candidate.planId || candidate.plan?.planId,
      status: normalizeCandidateStatus(
        candidate.status || candidate.evaluation?.status
      ),
      evaluation: candidate.evaluation || null,
    }))
    const primary = normalizedCandidates[0]
    return {
      ...result,
      pipelineStatus:
        result?.pipelineStatus ||
        (Array.isArray(result?.warnings) && result.warnings.length > 0
          ? "PARTIAL"
          : "COMPLETE"),
      generator: result?.generator || "ai",
      candidates: normalizedCandidates,
      ranking: result?.ranking || { ranked: [], unscored: [], excluded: [] },
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      request: result?.request || payload,
      // Preserve the single-candidate fields for older consumers.
      status: result?.status || primary.status,
      plan: result?.plan || primary.plan,
      evaluation: result?.evaluation || primary.evaluation,
    }
  } catch (error) {
    throw normalizePipelineError(error)
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

/** Stream fully generated and evaluated candidates, one at a time. */
export async function streamItineraryPipeline(payload, opts = {}) {
  const response = await fetch(apiUrl('/itineraries/pipeline-stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: payload, count: clampCandidateCount(opts.count) }),
    signal: opts.signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw pipelineError(body.error || 'STREAM_ERROR', body.message || 'Cannot start itinerary generation')
  }
  if (!response.body) throw pipelineError('STREAM_ERROR', 'Streaming is unavailable in this browser')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult = null
  const processLine = (line) => {
    if (!line.trim()) return
    const event = JSON.parse(line)
    opts.onEvent?.(event)
    if (event.type === 'complete') finalResult = event.result
    if (event.type === 'error') throw pipelineError(event.code, event.message)
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let end
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        processLine(line)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) processLine(buffer)
    if (!finalResult) throw pipelineError('STREAM_ERROR', 'Stream ended without a completed result')
    return finalResult
  } finally {
    reader.releaseLock()
  }
}
