// Vietnam's 34 provincial-level units after the 2025 reorganisation, with commune-level
// wards from Vietnamese Provinces Database v5.2.0. Display names keep Vietnamese accents
// ("Hà Nội", "Huế"). Suggestions only: the inputs accept and send any text the user types.
import fallbackProvinces from "../../data/vietnam-provinces-fallback.js";

export const DATASET_VERSION = "v5.2.0";
export const VIETNAM_PROVINCE_LOCATIONS = Object.freeze(fallbackProvinces.map(province => Object.freeze({ ...province, wards: Object.freeze([]) })));
export const VIETNAM_PROVINCES = Object.freeze(VIETNAM_PROVINCE_LOCATIONS.map(province => province.name));

// Common other spellings that should still find the same suggestion.
const ALIASES = {
  "Hà Nội": ["Hanoi", "Ha Noi"],
  "Hồ Chí Minh": ["HCMC", "TP HCM", "Sai Gon", "Saigon", "Ho Chi Minh City", "Ho Chi Minh"],
  "Huế": ["Thua Thien Hue", "Hue"],
  "Đắk Lắk": ["Daklak", "Dac Lac", "Dak Lak"],
  "Hải Phòng": ["Haiphong", "Hai Phong"],
};

export const PROVINCE_SUGGESTION_LIMIT = 8;
export const WARD_MIN_QUERY_CHARS = 2;

// Lower case, no Vietnamese accents (including đ), single spaces.
export function foldText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactLength(folded) {
  return folded.replace(/ /g, "").length;
}

function prefixRank(query, forms, { laterWord = true } = {}) {
  let rank = Infinity;
  const compactQuery = query.replace(/ /g, "");
  for (const form of forms.map(foldText)) {
    if (!form) continue;
    if (form.startsWith(query)) rank = Math.min(rank, 0);
    else if (laterWord && form.split(" ").some((_, index, words) => index > 0 && words.slice(index).join(" ").startsWith(query))) rank = Math.min(rank, 1);
    else if (form.replace(/ /g, "").startsWith(compactQuery)) rank = Math.min(rank, 0);
  }
  return rank;
}

function provinceForms(province) {
  return [province.name, province.nameEn, province.fullName, ...(ALIASES[province.name] ?? [])];
}

export function wardLabel(ward, province) {
  return `${ward.fullName}, ${province.name}`;
}

const UNIT_PREFIXES = ["phuong ", "xa ", "dac khu "];

function isUnitTypeQuery(query) {
  return UNIT_PREFIXES.some(prefix => foldText(prefix).startsWith(query));
}

function nameAfterUnitPrefix(fullName) {
  let folded = foldText(fullName);
  for (const prefix of UNIT_PREFIXES) {
    const foldedPrefix = foldText(prefix);
    if (folded.startsWith(foldedPrefix)) return folded.slice(foldedPrefix.length).trim();
  }
  return folded;
}

function wholeStringPrefix(query, form) {
  const folded = foldText(form);
  return folded.startsWith(query) || folded.replace(/ /g, "").startsWith(query.replace(/ /g, ""));
}

function wardRank(query, ward, province) {
  // Match the ward's own name (and the name after Phường/Xã/Đặc khu). The unit prefix
  // itself is not enough: "da" should not list every "Đặc khu". The full display label
  // is a whole-string prefix only, so typing "Huế" does not list every ward there.
  let rank = prefixRank(query, [ward.name, nameAfterUnitPrefix(ward.fullName)]);
  if (!isUnitTypeQuery(query) && (wholeStringPrefix(query, ward.fullName) || wholeStringPrefix(query, wardLabel(ward, province)))) {
    rank = Math.min(rank, 0);
  }
  return rank;
}

function byRankThenName(left, right) {
  return left.rank - right.rank || foldText(left.label).localeCompare(foldText(right.label));
}

// Provinces first (always), then wards/communes/special zones when the query has 2+ letters.
// Names that start with the text first, then names with a later word that starts with it;
// alphabetical (accent-insensitive) within each group. Text in the middle of a word does not match.
export function matchLocations(query, { limit = PROVINCE_SUGGESTION_LIMIT, locations = VIETNAM_PROVINCE_LOCATIONS } = {}) {
  const q = foldText(query);
  if (!q) return [];
  const includeWards = compactLength(q) >= WARD_MIN_QUERY_CHARS;
  const provinces = [];
  const wards = [];
  for (const province of locations) {
    const provinceRank = prefixRank(q, provinceForms(province));
    if (provinceRank !== Infinity) provinces.push({ label: province.name, kind: "province", rank: provinceRank });
    if (!includeWards) continue;
    for (const ward of province.wards ?? []) {
      const rank = wardRank(q, ward, province);
      if (rank !== Infinity) wards.push({ label: wardLabel(ward, province), kind: "ward", rank });
    }
  }
  provinces.sort(byRankThenName);
  wards.sort(byRankThenName);
  return [...provinces, ...wards].slice(0, limit);
}

export function matchProvinces(query, options) {
  return matchLocations(query, options).map(item => item.label);
}

let pendingLoad;
let loadedLocations = null;

export function getLoadedLocations() {
  return loadedLocations;
}

// Lazy-load the full province + ward list. Until it resolves, callers keep using the 34-province fallback.
export function loadLocations() {
  if (loadedLocations) return Promise.resolve(loadedLocations);
  if (!pendingLoad) {
    pendingLoad = import("../../data/vietnam-locations.json")
      .then(module => {
        loadedLocations = module.default;
        return loadedLocations;
      })
      .catch(error => {
        pendingLoad = undefined;
        throw error;
      });
  }
  return pendingLoad;
}

export function resetLoadedLocations() {
  pendingLoad = undefined;
  loadedLocations = null;
}
