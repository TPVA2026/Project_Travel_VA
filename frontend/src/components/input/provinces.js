// Vietnam's 34 provincial-level units after the 2025 reorganisation (effective 2025-07-01),
// in the order of the official code list (Decision 19/2025/QD-TTg, Appendix I),
// written without accents in the same style as the rest of the form ("Ha Noi", "Hue").
// Suggestions only: the inputs accept and send any text the user types.
export const VIETNAM_PROVINCES = Object.freeze([
  "Ha Noi", "Cao Bang", "Tuyen Quang", "Dien Bien", "Lai Chau", "Son La", "Lao Cai",
  "Thai Nguyen", "Lang Son", "Quang Ninh", "Bac Ninh", "Phu Tho", "Hai Phong", "Hung Yen",
  "Ninh Binh", "Thanh Hoa", "Nghe An", "Ha Tinh", "Quang Tri", "Hue", "Da Nang",
  "Quang Ngai", "Gia Lai", "Khanh Hoa", "Dak Lak", "Lam Dong", "Dong Nai",
  "Ho Chi Minh City", "Tay Ninh", "Dong Thap", "Vinh Long", "An Giang", "Can Tho", "Ca Mau",
]);

// Common other spellings that should still find the same suggestion.
const ALIASES = {
  "Ha Noi": ["Hanoi"],
  "Ho Chi Minh City": ["HCMC", "TP HCM", "Sai Gon", "Saigon"],
  "Hue": ["Thua Thien Hue"],
  "Dak Lak": ["Daklak", "Dac Lac"],
};

export const PROVINCE_SUGGESTION_LIMIT = 8;

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

// Names that start with the text first, then names with a later word that starts with it;
// alphabetical within each group. Text in the middle of a word does not match.
export function matchProvinces(query, { limit = PROVINCE_SUGGESTION_LIMIT, list = VIETNAM_PROVINCES } = {}) {
  const q = foldText(query);
  if (!q) return [];
  const ranked = [];
  for (const name of list) {
    const forms = [name, ...(ALIASES[name] ?? [])].map(foldText);
    let rank = Infinity;
    for (const form of forms) {
      if (form.startsWith(q)) rank = Math.min(rank, 0);
      else if (form.split(" ").some((_, i, words) => i > 0 && words.slice(i).join(" ").startsWith(q))) rank = Math.min(rank, 1);
      else if (form.replace(/ /g, "").startsWith(q.replace(/ /g, ""))) rank = Math.min(rank, 0);
    }
    if (rank !== Infinity) ranked.push({ name, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return ranked.slice(0, limit).map(item => item.name);
}
