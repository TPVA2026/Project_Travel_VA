import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { itinerarySchema, validate, checkGrounding } from "../src/itinerary.schema.js";
import { generateCandidate, GeminiError } from "../src/geminiClient.js";

const load = async p => JSON.parse(await readFile(new URL(p, import.meta.url)));
const dataset = await load("../data/sample-dataset.json");
const request = await load("../sample/travel-request.json");
const plan = await load("../sample/candidate-plan.json");
const mockFetch = body => async () => ({ ok: true, status: 200, json: async () => body });
const wrap = obj => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

test("sample plan matches schema and is grounded in dataset", () => {
  assert.deepEqual(validate(itinerarySchema, plan), []);
  assert.deepEqual(checkGrounding(plan, dataset), []);
});

test("schema rejects bad plans", () => {
  const bad = structuredClone(plan);
  bad.days[0].activities[0].startTime = "8:30";
  delete bad.days[0].date;
  assert.ok(validate(itinerarySchema, bad).length >= 2);
});

test("grounding rejects invented place, overlap, and null cost marked KNOWN", () => {
  const bad = structuredClone(plan);
  bad.days[0].activities[0].placeId = "INVENTED-1";
  bad.days[0].activities[1].startTime = "10:00";
  bad.days[0].activities[2].costStatus = "KNOWN";
  const errs = checkGrounding(bad, dataset);
  assert.ok(errs.some(e => e.includes("unknown placeId")));
  assert.ok(errs.some(e => e.includes("overlaps")));
  assert.ok(errs.some(e => e.includes("null cost marked KNOWN")));
});

test("client sends key in header only, with JSON-schema structured output", async () => {
  let seen;
  const f = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => wrap(plan) }; };
  const out = await generateCandidate({ request, dataset, apiKey: "TEST_KEY_123", fetchImpl: f });
  assert.deepEqual(out, plan);
  assert.ok(!seen.url.includes("TEST_KEY_123"));
  assert.equal(seen.opts.headers["x-goog-api-key"], "TEST_KEY_123");
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.generationConfig.responseJsonSchema);
});

test("error handling: missing key, HTTP error, malformed JSON, invalid plan, timeout", async () => {
  const code = async args => { try { await generateCandidate(args); } catch (e) { assert.ok(e instanceof GeminiError); return e.code; } };
  assert.equal(await code({ request, dataset, apiKey: "", fetchImpl: mockFetch({}) }), "CONFIG");
  assert.equal(await code({ request, dataset, apiKey: "k", maxRetries: 0, fetchImpl: async () => ({ ok: false, status: 429 }) }), "API_ERROR");
  assert.equal(await code({ request, dataset, apiKey: "k", fetchImpl: mockFetch({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }) }), "MALFORMED");
  assert.equal(await code({ request, dataset, apiKey: "k", fetchImpl: mockFetch(wrap({ planId: "x" })) }), "INVALID_PLAN");
  assert.equal(await code({ request, dataset, apiKey: "k", maxRetries: 0, fetchImpl: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); } }), "TIMEOUT");
});

test("no secret committed: no API-key-like strings or hardcoded key in repo", async () => {
  const root = new URL("..", import.meta.url).pathname;
  const files = [];
  const walk = async d => { for (const n of await readdir(d)) { if (n === "node_modules" || n === ".env") continue; const p = path.join(d, n); (await stat(p)).isDirectory() ? await walk(p) : files.push(p); } };
  await walk(root);
  for (const f of files.filter(f => /\.(js|json|md|html|jsx)$/.test(f))) {
    const t = await readFile(f, "utf8");
    assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(t), `key-like string in ${f}`);
    if (/client|frontend|public/.test(f)) assert.ok(!/GEMINI_API_KEY/.test(t), `client file references key: ${f}`);
  }
});

test("retries transient 503 then succeeds; no retry on 400; gives up after maxRetries", async () => {
  const sleepImpl = async () => {};
  let n = 0;
  const flaky = async () => (++n <= 2 ? { ok: false, status: 503, json: async () => ({ error: { message: "overloaded" } }) } : { ok: true, json: async () => wrap(plan) });
  assert.deepEqual(await generateCandidate({ request, dataset, apiKey: "k", fetchImpl: flaky, sleepImpl }), plan);
  assert.equal(n, 3);

  let m = 0;
  await assert.rejects(generateCandidate({ request, dataset, apiKey: "k", sleepImpl, fetchImpl: async () => { m++; return { ok: false, status: 400, json: async () => ({ error: { message: "bad schema" } }) }; } }),
    e => e.code === "API_ERROR" && e.status === 400 && e.details === "bad schema");
  assert.equal(m, 1);

  let k = 0;
  await assert.rejects(generateCandidate({ request, dataset, apiKey: "k", maxRetries: 3, sleepImpl, fetchImpl: async () => { k++; return { ok: false, status: 503, json: async () => ({}) }; } }),
    e => e.status === 503);
  assert.equal(k, 4);
});

test("grounding enforces cost status against dataset (no invented prices, no KNOWN on unverified source)", () => {
  const bad = structuredClone(plan);
  bad.days[0].activities[0].estimatedCostVnd = 50000;   // dataset price is null
  bad.days[0].activities[0].costStatus = "UNVERIFIED";
  bad.days[1].activities[0].costStatus = "KNOWN";        // price 0 but source FIXTURE-UNVERIFIED
  const errs = checkGrounding(bad, dataset);
  assert.ok(errs.some(e => e.includes("must be null/NO_DATA")));
  assert.ok(errs.some(e => e.includes("must be UNVERIFIED")));
});
