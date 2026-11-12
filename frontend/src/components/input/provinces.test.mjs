import test from "node:test";
import assert from "node:assert/strict";
import { VIETNAM_PROVINCES, foldText, matchProvinces } from "./provinces.js";

test("the list has the 34 provincial-level units after the 2025 reorganisation", () => {
  assert.equal(VIETNAM_PROVINCES.length, 34);
  assert.equal(new Set(VIETNAM_PROVINCES).size, 34);
  for (const name of ["Ha Noi", "Ho Chi Minh City", "Hai Phong", "Da Nang", "Hue", "Can Tho", "Ha Tinh", "Lam Dong", "Ca Mau"]) assert.ok(VIETNAM_PROVINCES.includes(name), name);
  for (const merged of ["Quang Nam", "Binh Duong", "Kon Tum", "Ha Giang", "Ba Ria - Vung Tau"]) assert.equal(VIETNAM_PROVINCES.includes(merged), false, merged);
});

test("folding ignores case, Vietnamese accents (including đ) and extra spaces", () => {
  assert.equal(foldText("  Thành phố  Hồ Chí Minh "), "thanh pho ho chi minh");
  assert.equal(foldText("Đà Nẵng"), "da nang");
  assert.equal(foldText("ĐẮK LẮK"), "dak lak");
});

test("matching is prefix-first and alphabetical, with or without accents", () => {
  assert.deepEqual(matchProvinces("h"), ["Ha Noi", "Ha Tinh", "Hai Phong", "Ho Chi Minh City", "Hue", "Hung Yen", "Khanh Hoa", "Thanh Hoa"]);
  assert.deepEqual(matchProvinces("ha"), ["Ha Noi", "Ha Tinh", "Hai Phong"]);
  assert.deepEqual(matchProvinces("Hà"), matchProvinces("ha"));
  assert.deepEqual(matchProvinces("HÀ TĨNH"), ["Ha Tinh"]);
  assert.deepEqual(matchProvinces("đà"), ["Da Nang", "Dak Lak"]);
  assert.deepEqual(matchProvinces("Huế"), ["Hue"]);
  assert.deepEqual(matchProvinces("ninh"), ["Ninh Binh", "Bac Ninh", "Quang Ninh", "Tay Ninh"], "Whole-name prefix before later-word prefix");
  assert.deepEqual(matchProvinces("hanoi"), ["Ha Noi"]);
  assert.deepEqual(matchProvinces("saigon"), ["Ho Chi Minh City"]);
  assert.deepEqual(matchProvinces("hcm"), ["Ho Chi Minh City"]);
});

test("no match for empty text, mid-word text or places outside the list", () => {
  assert.deepEqual(matchProvinces(""), []);
  assert.deepEqual(matchProvinces("   "), []);
  assert.deepEqual(matchProvinces("anh"), [], "Text in the middle of a word does not match");
  assert.deepEqual(matchProvinces("Da Lat"), []);
  assert.deepEqual(matchProvinces("Sa Pa"), []);
  assert.equal(matchProvinces("a").length <= 8, true, "At most eight suggestions");
});
