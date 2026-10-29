// Itinerary output schema (JSON Schema subset, accepted by Gemini `responseJsonSchema`).
// The LLM only PROPOSES structure; M4 recomputes costs/distances and decides feasibility.
const nullableNumber = { type: ["number", "null"], minimum: 0 };
const hhmm = { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" };

export const itinerarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["planId", "title", "destinationId", "days", "missingData", "assumptions"],
  properties: {
    planId: { type: "string" },
    title: { type: "string" },
    destinationId: { type: "string" },
    days: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dayNumber", "date", "activities", "travelLegs"],
        properties: {
          dayNumber: { type: "integer", minimum: 1 },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          activities: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["activityId", "placeId", "type", "startTime", "endTime", "estimatedCostVnd", "costStatus", "reason"],
              properties: {
                activityId: { type: "string" },
                placeId: { type: "string", description: "Must be an id from the supplied dataset" },
                type: { type: "string", enum: ["sightseeing", "dining"] },
                startTime: hhmm,
                endTime: hhmm,
                estimatedCostVnd: { ...nullableNumber, description: "null = unknown; never 0 for unknown" },
                costStatus: { type: "string", enum: ["KNOWN", "UNVERIFIED", "NO_DATA"] },
                reason: { type: "string" }
              }
            }
          },
          travelLegs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["fromPlaceId", "toPlaceId", "durationMin", "distanceKm"],
              properties: {
                fromPlaceId: { type: "string" },
                toPlaceId: { type: "string" },
                durationMin: nullableNumber,
                distanceKm: nullableNumber
              }
            }
          }
        }
      }
    },
    missingData: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } }
  }
};

// Tiny dependency-free validator for the subset used above.
export function validate(schema, value, path = "$") {
  const errs = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : null;
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  if (types && !types.some(t => t === actual || (t === "number" && actual === "integer"))) {
    return [`${path}: expected ${types.join("|")}, got ${actual}`];
  }
  if (value === null) return errs;
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: not in enum ${schema.enum}`);
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: pattern mismatch`);
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: below minimum`);
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errs.push(`${path}: too few items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  } else if (typeof value === "object") {
    for (const k of schema.required ?? []) if (!(k in value)) errs.push(`${path}.${k}: required`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) errs.push(...validate(schema.properties[k], v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}.${k}: unexpected property`);
    }
  }
  return errs;
}

// Grounding check: every placeId must exist in the curated dataset; times must not overlap.
export function checkGrounding(plan, dataset) {
  const places = new Map([...dataset.attractions, ...dataset.dining].map(p => [p.id, p]));
  const ids = new Set(places.keys());
  const errs = [];
  for (const d of plan.days) {
    const sorted = [...d.activities].sort((a, b) => a.startTime.localeCompare(b.startTime));
    sorted.forEach((a, i) => {
      if (!ids.has(a.placeId)) errs.push(`day ${d.dayNumber}: unknown placeId ${a.placeId}`);
      if (a.startTime >= a.endTime) errs.push(`day ${d.dayNumber}: ${a.activityId} ends before it starts`);
      if (i > 0 && sorted[i - 1].endTime > a.startTime) errs.push(`day ${d.dayNumber}: ${a.activityId} overlaps previous`);
      if (a.estimatedCostVnd === null && a.costStatus === "KNOWN") errs.push(`${a.activityId}: null cost marked KNOWN`);
      const pl = places.get(a.placeId);
      if (pl) { // cost status must agree with the curated dataset, not with the model's opinion
        const price = pl.priceVnd ?? pl.avgPricePerPersonVnd ?? null;
        if (price === null && (a.estimatedCostVnd !== null || a.costStatus !== "NO_DATA"))
          errs.push(`${a.activityId}: dataset has no price for ${a.placeId}; must be null/NO_DATA`);
        if (price !== null && a.costStatus === "KNOWN" && /UNVERIFIED/i.test(pl.source ?? ""))
          errs.push(`${a.activityId}: source of ${a.placeId} is unverified; status must be UNVERIFIED`);
      }
    });
  }
  return errs;
}
