// Vietnam's 34 provincial-level units after the 2025 reorganisation.
// Display names keep Vietnamese accents ("Hà Nội", "Huế"). Suggestions only:
// the inputs accept and send any text the user types.
import provinces from "../../data/vietnam-provinces.js";

export const DATASET_VERSION = "v5.2.0";
export const VIETNAM_PROVINCE_LOCATIONS = Object.freeze(provinces.map(province => Object.freeze({ ...province })));
export const VIETNAM_PROVINCES = Object.freeze(VIETNAM_PROVINCE_LOCATIONS.map(province => province.name));

export const POPULAR_PROVINCES = Object.freeze(["Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Huế", "Lâm Đồng"]);

// Common other spellings that should still find the same suggestion.
const ALIASES = {
  "Hà Nội": ["Hanoi", "Ha Noi"],
  "Hồ Chí Minh": ["HCMC", "TP HCM", "Sai Gon", "Saigon", "Ho Chi Minh City", "Ho Chi Minh"],
  "Huế": ["Thua Thien Hue", "Hue"],
  "Đắk Lắk": ["Daklak", "Dac Lac", "Dak Lak"],
  "Hải Phòng": ["Haiphong", "Hai Phong"],
  "Lâm Đồng": ["Da Lat", "Dalat", "Đà Lạt"],
};

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

function prefixRank(query, forms) {
  let rank = Infinity;
  const compactQuery = query.replace(/ /g, "");
  for (const form of forms.map(foldText)) {
    if (!form) continue;
    if (form.startsWith(query)) rank = Math.min(rank, 0);
    else if (form.split(" ").some((_, index, words) => index > 0 && words.slice(index).join(" ").startsWith(query))) rank = Math.min(rank, 1);
    else if (form.replace(/ /g, "").startsWith(compactQuery)) rank = Math.min(rank, 0);
  }
  return rank;
}

function provinceForms(province) {
  return [province.name, province.nameEn, province.fullName, ...(ALIASES[province.name] ?? [])];
}

export function compareVietnamese(left, right) {
  return String(left).localeCompare(String(right), "vi");
}

export function allProvincesSorted() {
  return [...VIETNAM_PROVINCES].sort(compareVietnamese);
}

export function provinceHint(name) {
  return name === "Lâm Đồng" ? "Da Lat · Vietnam" : "Vietnam";
}

// Names that start with the text first, then names with a later word that starts with it;
// Vietnamese alphabetical order within each group. Text in the middle of a word does not match.
export function matchProvinces(query, { locations = VIETNAM_PROVINCE_LOCATIONS } = {}) {
  const q = foldText(query);
  if (!q) return [];
  const ranked = [];
  for (const province of locations) {
    const rank = prefixRank(q, provinceForms(province));
    if (rank !== Infinity) ranked.push({ name: province.name, rank });
  }
  ranked.sort((left, right) => left.rank - right.rank || compareVietnamese(left.name, right.name));
  return ranked.map(item => item.name);
}
