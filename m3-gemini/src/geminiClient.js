import { itinerarySchema, validate, checkGrounding } from "./itinerary.schema.js";

const SYSTEM = `You are an itinerary generator for a Vietnam travel prototype.
RULES:
- Use ONLY places listed in DATASET (reference them by id). Never invent places, prices, hours or travel times.
- costStatus rules, per place price in DATASET (priceVnd for attractions, avgPricePerPersonVnd for dining):
  * price is null -> estimatedCostVnd null and costStatus "NO_DATA" (never 0 for unknown);
  * price present but the place's source contains "UNVERIFIED" -> costStatus "UNVERIFIED";
  * price present and source is verified -> costStatus "KNOWN".
- If a travel time or distance is unknown, output null.
- Activities in one day must not overlap and must fit the place's openHours when known.
- List every unknown essential item in missingData.
- Output JSON only, matching the schema.`;

export function buildPrompt(request, dataset) {
  return `TRAVEL_REQUEST:\n${JSON.stringify(request)}\n\nDATASET:\n${JSON.stringify(dataset)}`;
}

export class GeminiError extends Error {
  constructor(code, message, status, details) { super(message); this.code = code; this.status = status; this.details = details; }
}

export async function generateCandidate({ request, dataset, apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || "gemini-3.6-flash",
  timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || 30000, fetchImpl = fetch,
  maxRetries = Number(process.env.GEMINI_MAX_RETRIES ?? 3), sleepImpl = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!apiKey) throw new GeminiError("CONFIG", "GEMINI_API_KEY is not set on the server");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: buildPrompt(request, dataset) }] }],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseJsonSchema: itinerarySchema }
  };

  // Retry transient failures (overload/rate limit/network) with exponential backoff + jitter.
  const RETRY_STATUS = new Set([429, 500, 503, 504]);
  let res;
  for (let attempt = 0; ; attempt++) {
    let failure;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, // header, not URL: keeps key out of logs
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) break;
      let detail;
      try { detail = (await res.json())?.error?.message?.slice(0, 300); } catch { /* body not JSON */ }
      failure = new GeminiError("API_ERROR", `Gemini returned HTTP ${res.status}`, res.status, detail);
      if (!RETRY_STATUS.has(res.status)) throw failure; // 400/401/403/404: retrying won't help
    } catch (e) {
      if (e instanceof GeminiError) failure = e;
      else failure = new GeminiError(e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK", "Gemini request failed");
    }
    if (failure.status && !RETRY_STATUS.has(failure.status)) throw failure;
    if (attempt >= maxRetries) throw failure;
    await sleepImpl(Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 300);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("");
  if (!text) throw new GeminiError("EMPTY", "No content (possibly blocked or truncated)");

  let plan;
  try { plan = JSON.parse(text); } catch { throw new GeminiError("MALFORMED", "Model output is not valid JSON"); }

  const schemaErrors = validate(itinerarySchema, plan);
  const errors = schemaErrors.length ? schemaErrors : checkGrounding(plan, dataset); // grounding needs a schema-valid plan
  if (errors.length) throw new GeminiError("INVALID_PLAN", "Plan failed schema/grounding checks", 422, errors);
  return plan; // still UNVERIFIED: must be sent to M4 /itineraries/evaluate
}
