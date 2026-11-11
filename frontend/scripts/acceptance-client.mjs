// TPVA-54: drive the real frontend API client (src/services/api.js) against a running backend.
// Usage: node scripts/acceptance-client.mjs http://localhost:3001 ../docs/evidence/tpva-54/frontend_client.json
// It calls only existing endpoints through the same functions the Results page uses.
import { readFile, writeFile } from "node:fs/promises";

const [base = "http://localhost:3001", out = "../docs/evidence/tpva-54/frontend_client.json"] = process.argv.slice(2);
const nativeFetch = globalThis.fetch;
globalThis.fetch = (path, options) => nativeFetch(new URL(path, base), options);

const api = await import("../src/services/api.js");
const { getCandidatePresentation } = await import("../src/services/recommendations.js");
const fixture = JSON.parse(await readFile(new URL("../../backend/tests/fixtures/acceptance/hue_scenarios.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(fixture.scenarios.map((s) => [s.id, s]));
const request = byId.S01_valid_3day_validate.body;
const plan = byId.S03_valid_3day_evaluate.body.plan;
const noDestination = byId.S15_no_destination_validate.body;

async function attempt(name, fn) {
  try {
    return { name, ok: true, result: await fn() };
  } catch (error) {
    return { name, ok: false, status: error.status ?? null, message: error.message, body: error.body ?? null };
  }
}

const steps = [];
steps.push(await attempt("validateTravelRequest(valid 3-day Huế)", () => api.validateTravelRequest(request)));
steps.push(await attempt("runItineraryPipeline(valid 3-day Huế) - Results page path", () => api.runItineraryPipeline(request)));
const evaluation = await attempt("evaluateItinerary(fixture plan)", () => api.evaluateItinerary(request, plan));
steps.push(evaluation);
const ranking = await attempt("rankItineraries(fixture plan)", () => api.rankItineraries(request, [plan]));
steps.push(ranking);
if (evaluation.ok && ranking.ok) {
  steps.push({ name: "getCandidatePresentation (what the Results page shows)", ok: true,
    result: getCandidatePresentation(evaluation.result.status, evaluation.result, ranking.result, plan.planId) });
}
steps.push(await attempt("validateTravelRequest(no destination)", () => api.validateTravelRequest(noDestination)));
steps.push(await attempt("runItineraryPipeline(no destination)", () => api.runItineraryPipeline(noDestination)));

const report = { ranAt: new Date().toISOString(), base, node: process.version, steps };
await writeFile(out, JSON.stringify(report, null, 2) + "\n");
for (const step of steps) {
  const detail = step.ok ? (step.result?.status ?? (step.result?.valid ? "valid" : "ok")) : `${step.status} ${step.message}`;
  console.log(`${step.ok ? "OK  " : "ERR "} ${step.name}: ${detail}`);
}
