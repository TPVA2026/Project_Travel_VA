import test from "node:test";
import assert from "node:assert/strict";
import {
  VIETNAM_PROVINCES,
  DATASET_VERSION,
  foldText,
  matchProvinces,
  POPULAR_PROVINCES,
  allProvincesSorted,
  provinceHint,
  compareVietnamese,
} from "./provinces.js";

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
});

test("folding ignores case, Vietnamese accents (including đ) and extra spaces", () => {
  assert.equal(foldText("  Thành phố  Hồ Chí Minh "), "thanh pho ho chi minh");
  assert.equal(foldText("Đà Nẵng"), "da nang");
  assert.equal(foldText("ĐẮK LẮK"), "dak lak");
});

test("popular destinations and the full list use accented names in Vietnamese order", () => {
  assert.deepEqual([...POPULAR_PROVINCES], ["Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Huế", "Lâm Đồng"]);
  const all = allProvincesSorted();
  assert.equal(all.length, 34);
  assert.deepEqual(all, [...all].sort(compareVietnamese));
  assert.ok(all.includes("Huế") && all.includes("Lâm Đồng"));
  assert.equal(provinceHint("Lâm Đồng"), "Da Lat · Vietnam");
  assert.equal(provinceHint("Huế"), "Vietnam");
});

test("matching is prefix-first, accent-insensitive, and limited to the 34 provinces", () => {
  const h = matchProvinces("h");
  assert.ok(h.includes("Huế"));
  assert.deepEqual(h, ["Hà Nội", "Hà Tĩnh", "Hải Phòng", "Hồ Chí Minh", "Huế", "Hưng Yên", "Khánh Hoà", "Thanh Hoá"]);
  assert.equal(h.some(name => /phường|xã|đặc khu/i.test(name)), false);
  assert.deepEqual(matchProvinces("Hà"), matchProvinces("ha"));
  assert.deepEqual(matchProvinces("HÀ TĨNH"), ["Hà Tĩnh"]);
  assert.ok(matchProvinces("đà").includes("Đà Nẵng"));
  assert.deepEqual(matchProvinces("Huế"), ["Huế"]);
  assert.deepEqual(matchProvinces("ninh"), ["Ninh Bình", "Bắc Ninh", "Quảng Ninh", "Tây Ninh"], "Whole-name prefix before later-word prefix");
  assert.deepEqual(matchProvinces("hanoi"), ["Hà Nội"]);
  assert.deepEqual(matchProvinces("Ha Noi"), ["Hà Nội"]);
  assert.deepEqual(matchProvinces("saigon"), ["Hồ Chí Minh"]);
  assert.deepEqual(matchProvinces("hcm"), ["Hồ Chí Minh"]);
  assert.deepEqual(matchProvinces("Thua Thien Hue"), ["Huế"]);
  assert.deepEqual(matchProvinces("da lat"), ["Lâm Đồng"]);
  assert.deepEqual(matchProvinces("Đà Lạt"), ["Lâm Đồng"]);
});

test("thu does not suggest wards, and unknown text has no match", () => {
  const thu = matchProvinces("thu");
  assert.deepEqual(thu, ["Huế"], "Thua Thien Hue alias may match, but no wards");
  assert.equal(thu.some(name => /phường|thuận hoá/i.test(name)), false);
  assert.deepEqual(matchProvinces(""), []);
  assert.deepEqual(matchProvinces("   "), []);
  assert.deepEqual(matchProvinces("inh"), [], "Text in the middle of a word does not match");
  assert.equal(matchProvinces("anh").includes("Thanh Hoá"), false, "Mid-word text in Thanh Hoá does not match");
  assert.deepEqual(matchProvinces("Da Lat town"), []);
  assert.deepEqual(matchProvinces("Sa Pa town"), []);
});
