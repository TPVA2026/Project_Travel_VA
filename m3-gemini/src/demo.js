// Manual smoke test against the real Gemini API: npm run demo > docs/live-demo-output.json
import { readFile } from "node:fs/promises";
import { generateCandidate, GeminiError } from "./geminiClient.js";
const dataset = JSON.parse(await readFile(new URL("../data/sample-dataset.json", import.meta.url)));
const request = JSON.parse(await readFile(new URL("../sample/travel-request.json", import.meta.url)));
try {
  console.log(JSON.stringify(await generateCandidate({ request, dataset }), null, 2));
} catch (e) {
  if (!(e instanceof GeminiError)) throw e;
  console.error(`FAILED ${e.code} status=${e.status ?? "-"} ${e.message}`);
  if (e.details) console.error(typeof e.details === "string" ? e.details : JSON.stringify(e.details, null, 2));
  process.exit(1);
}
