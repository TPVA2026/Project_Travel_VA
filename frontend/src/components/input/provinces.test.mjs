import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  VIETNAM_PROVINCES,
  VIETNAM_PROVINCE_LOCATIONS,
  DATASET_VERSION,
  foldText,
  matchProvinces,
  matchLocations,
  wardLabel,
} from "./provinces.js";

const locations = JSON.parse(readFileSync(fileURLToPath(new URL("../../data/vietnam-locations.json", import.meta.url)), "utf8"));

const H_PROVINCES = ["Hà Nội", "Hà Tĩnh", "Hải Phòng", "Hồ Chí Minh", "Huế", "Hưng Yên", "Khánh Hoà", "Thanh Hoá"];

test("the list has the 34 provincial-level units after the 2025 reorganisation, with accents", () => {
  assert.equal(DATASET_VERSION, "v5.2.0");
  assert.equal(VIETNAM_PROVINCES.length, 34);
  assert.equal(new Set(VIETNAM_PROVINCES).size, 34);
  for (const name of ["Hà Nội", "Hồ Chí Minh", "Hải Phòng", "Đà Nẵng", "Huế", "Cần Thơ", "Hà Tĩnh", "Lâm Đồng", "Cà Mau"]) {
    assert.ok(VIETNAM_PROVINCES.includes(name), name);
  }
  for (const merged of ["Quảng Nam", "Bình Dương", "Kon Tum", "Hà Giang", "Bà Rịa - Vũng Tàu"]) {
    assert.equal(VIETNAM_PROVINCES.includes(merged), false, merged);
  }
  assert.equal(locations.length, 34);
  assert.equal(locations.reduce((sum, province) => sum + province.wards.length, 0), 3321);
});

test("folding ignores case, Vietnamese accents (including đ) and extra spaces", () => {
  assert.equal(foldText("  Thành phố  Hồ Chí Minh "), "thanh pho ho chi minh");
  assert.equal(foldText("Đà Nẵng"), "da nang");
  assert.equal(foldText("ĐẮK LẮK"), "dak lak");
});

test("one character shows provinces only, including Huế, with or without accents", () => {
  assert.deepEqual(matchProvinces("h"), H_PROVINCES);
  assert.deepEqual(matchProvinces("h", { locations }), H_PROVINCES);
  assert.deepEqual(matchProvinces("H", { locations }), H_PROVINCES);
  assert.ok(matchProvinces("h", { locations }).includes("Huế"));
  assert.equal(matchLocations("h", { locations }).every(item => item.kind === "province"), true);
  assert.equal(matchLocations("h", { locations: VIETNAM_PROVINCE_LOCATIONS }).every(item => item.kind === "province"), true);
});

test("two or more characters rank provinces above wards and stay accent-insensitive", () => {
  const ha = matchLocations("ha", { locations });
  assert.deepEqual(ha.slice(0, 3).map(item => item.label), ["Hà Nội", "Hà Tĩnh", "Hải Phòng"]);
  assert.deepEqual(ha.slice(0, 3).map(item => item.kind), ["province", "province", "province"]);
  assert.equal(ha.length, 8);
  assert.ok(ha.slice(3).every(item => item.kind === "ward"));
  assert.deepEqual(matchProvinces("Hà", { locations }), matchProvinces("ha", { locations }));
  assert.deepEqual(matchProvinces("HÀ TĨNH", { locations }), ["Hà Tĩnh"]);
  const da = matchLocations("đà", { locations });
  assert.deepEqual(da.slice(0, 2).map(item => item.label), ["Đà Nẵng", "Đắk Lắk"]);
  assert.ok(da.slice(2).every(item => item.kind === "ward"));
  const hue = matchLocations("Huế", { locations });
  assert.equal(hue[0].label, "Huế");
  assert.equal(hue[0].kind, "province");
  assert.ok(hue.slice(1).every(item => item.kind === "ward"));
  const ninh = matchProvinces("ninh", { locations });
  assert.deepEqual(ninh.slice(0, 4), ["Ninh Bình", "Bắc Ninh", "Quảng Ninh", "Tây Ninh"], "Whole-name prefix before later-word prefix, provinces first");
  assert.deepEqual(matchProvinces("hanoi", { locations }), ["Hà Nội"]);
  assert.deepEqual(matchProvinces("Ha Noi", { locations }), ["Hà Nội"]);
  assert.deepEqual(matchProvinces("saigon", { locations }), ["Hồ Chí Minh", "Phường Sài Gòn, Hồ Chí Minh"]);
  assert.deepEqual(matchProvinces("hcm", { locations }), ["Hồ Chí Minh"]);
  assert.deepEqual(matchProvinces("Thua Thien Hue", { locations }), ["Huế"]);
});

test("thu lists Phường Thuận Hoá, Huế among ward suggestions after any provinces", () => {
  const thu = matchLocations("thu", { locations });
  assert.equal(thu.length, 8);
  const labels = thu.map(item => item.label);
  assert.ok(labels.includes("Phường Thuận Hoá, Huế"));
  const firstWard = thu.findIndex(item => item.kind === "ward");
  assert.ok(firstWard >= 0);
  assert.ok(thu.slice(0, firstWard).every(item => item.kind === "province"));
  const hue = locations.find(province => province.name === "Huế");
  const ward = hue.wards.find(item => item.name === "Thuận Hoá");
  assert.equal(wardLabel(ward, hue), "Phường Thuận Hoá, Huế");
});

test("no match for empty text, mid-word text or places outside the list", () => {
  assert.deepEqual(matchProvinces("", { locations }), []);
  assert.deepEqual(matchProvinces("   ", { locations }), []);
  assert.deepEqual(matchProvinces("inh", { locations }), [], "Text in the middle of a word does not match");
  assert.equal(matchProvinces("anh", { locations }).includes("Thanh Hoá"), false, "Mid-word text in Thanh Hoá does not match");
  const daLat = matchProvinces("Da Lat", { locations });
  assert.ok(daLat.length > 0 && daLat.every(label => label.includes("Đà Lạt")), "Đà Lạt wards are suggested");
  assert.deepEqual(matchProvinces("Da Lat town", { locations }), []);
  assert.deepEqual(matchProvinces("Sa Pa town", { locations }), []);
  assert.equal(matchProvinces("a", { locations }).length <= 8, true, "At most eight suggestions");
  assert.equal(matchProvinces("th", { locations }).length, 8);
});
