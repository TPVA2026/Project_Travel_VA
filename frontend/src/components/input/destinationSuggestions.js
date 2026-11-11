// Destination suggestions for requests where the user skipped the destination.
//
// TODO(M3/M6): no suggestion API exists yet. Until the team agrees a contract, the
// default adapter below is a local mock with no network calls. Swap it with
// setDestinationSuggester(adapter) once the real endpoint exists. An adapter receives
// (request, { destinations }) and resolves to [{ city, reason }].
//
// Whatever the adapter returns, M1 only shows cities from the supported destinations
// list (GET /api/v1/destinations), never the departure city, at most MAX_SUGGESTIONS.

export const MAX_SUGGESTIONS = 3;
export const SUGGESTION_TIMEOUT_MS = 8000;

// Accent- and case-insensitive key, so "Da Nang" matches "Đà Nẵng".
export function placeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/^(thanh pho|tp\.?|tinh)\s+/, "")
    .replace(/\s+city$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function destinationLabel(item) {
  return item?.city || item?.city_name || item?.name || item?.id || "";
}

// Mock-only hints, keyed by accent-free name. Reasons are illustrative, not data.
const MOCK_PICKS = [
  { key: "da nang", reason: "Beaches and city sights within easy reach.", tags: ["beach", "sea", "seafood", "city"] },
  { key: "hue", reason: "Historic sites and a calm, walkable pace.", tags: ["culture", "history", "food", "slow"] },
  { key: "nha trang", reason: "Coastal stay with islands and seafood.", tags: ["beach", "sea", "island", "seafood"] },
  { key: "lam dong", reason: "Cool highland weather and nature walks.", tags: ["nature", "cool", "mountain", "relax"] },
  { key: "ninh binh", reason: "River landscapes and temples for a short trip.", tags: ["nature", "culture", "river"] },
  { key: "quang ninh", reason: "Bay views and boat trips.", tags: ["sea", "bay", "nature", "boat"] },
  { key: "can tho", reason: "Floating markets and Mekong food.", tags: ["food", "river", "market"] },
  { key: "ha noi", reason: "Old Quarter food and culture.", tags: ["culture", "food", "city", "history"] },
];

export async function mockDestinationSuggester(request, { destinations = [] } = {}) {
  const text = placeKey([
    request?.additionalRequirements,
    ...(request?.preferences?.interests ?? []).map(item => item?.type),
  ].filter(Boolean).join(" "));
  const score = pick => pick.tags.filter(tag => text.includes(tag)).length;
  const ranked = MOCK_PICKS
    .map((pick, index) => ({ pick, index, score: score(pick) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const byKey = new Map(destinations.map(item => [placeKey(destinationLabel(item)), destinationLabel(item)]));
  return ranked
    .filter(({ pick }) => byKey.has(pick.key))
    .map(({ pick }) => ({ city: byKey.get(pick.key), reason: pick.reason }));
}

let suggester = mockDestinationSuggester;

export function setDestinationSuggester(adapter) {
  suggester = typeof adapter === "function" ? adapter : mockDestinationSuggester;
}

// Keeps only supported cities (shown with the dataset's own label), drops the
// departure city, duplicates and malformed items, and caps the list.
export function filterSuggestions(items, destinations, departureLocation) {
  const supported = new Map(destinations
    .map(item => [placeKey(destinationLabel(item)), destinationLabel(item)])
    .filter(([key]) => key));
  const departure = placeKey(departureLocation);
  const seen = new Set();
  const kept = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = placeKey(typeof item?.city === "string" ? item.city : "");
    if (!key || !supported.has(key) || key === departure || seen.has(key)) continue;
    seen.add(key);
    const reason = typeof item.reason === "string" ? item.reason.trim().slice(0, 200) : "";
    kept.push({ city: supported.get(key), reason });
    if (kept.length === MAX_SUGGESTIONS) break;
  }
  return kept;
}

export async function suggestDestinations(request, destinations, { timeoutMs = SUGGESTION_TIMEOUT_MS } = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Destination suggestions timed out.")), timeoutMs);
  });
  try {
    const items = await Promise.race([suggester(request, { destinations }), timeout]);
    return filterSuggestions(items, destinations, request?.departureLocation);
  } finally {
    clearTimeout(timer);
  }
}
