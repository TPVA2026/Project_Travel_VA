import test from "node:test";
import assert from "node:assert/strict";
import { WELCOME_SESSION_KEY, welcomeEntryRedirect } from "./entryRoute.js";

function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), data };
}

test("fresh load of / opens Welcome once per tab; later loads keep the planner", () => {
  const storage = memory();
  assert.equal(welcomeEntryRedirect({ pathname: "/", search: "", hash: "" }, () => storage), "/welcome");
  assert.equal(storage.data.get(WELCOME_SESSION_KEY), "1");
  assert.equal(welcomeEntryRedirect({ pathname: "/", search: "", hash: "" }, () => storage), null, "Reloading the planner does not bounce back");
  assert.equal(welcomeEntryRedirect({ pathname: "/", search: "?a=1", hash: "#x" }, () => memory()), "/welcome?a=1#x");
});

test("other entry routes are never redirected and still mark the tab", () => {
  for (const pathname of ["/welcome", "/results", "/selected"]) {
    const storage = memory();
    assert.equal(welcomeEntryRedirect({ pathname, search: "", hash: "" }, () => storage), null);
    assert.equal(storage.data.get(WELCOME_SESSION_KEY), "1");
  }
});

test("unavailable storage never redirects and touches nothing else", () => {
  assert.equal(welcomeEntryRedirect({ pathname: "/" }, () => { throw new Error("blocked"); }), null);
  const storage = memory({ "tpva-welcome-seen": "1", other: "kept" });
  welcomeEntryRedirect({ pathname: "/" }, () => storage);
  assert.deepEqual([...storage.data.keys()].sort(), [WELCOME_SESSION_KEY, "other", "tpva-welcome-seen"].sort());
});
