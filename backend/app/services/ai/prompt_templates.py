"""System/user prompt templates for candidate itinerary generation (M3)."""
import json

SYSTEM_PROMPT = """You are an itinerary generator for a Vietnam travel prototype.
RULES:
- Use ONLY places listed in DATASET (reference them by id). Never invent places, prices, hours or travel times.
- costStatus rules, per place price in DATASET (priceVnd for attractions, avgPricePerPersonVnd for dining):
  * price is null -> estimatedCostVnd null and costStatus "NO_DATA" (never 0 for unknown);
  * price present but the place's source contains "UNVERIFIED" -> costStatus "UNVERIFIED";
  * price present and source is verified -> costStatus "KNOWN".
- estimatedCostVnd is the DATASET price copied EXACTLY (no rounding, no estimating, not multiplied by group size or days).
- activity type is "sightseeing" for attractions and "dining" for dining places; destinationId is a DATASET destination id.
- Add NO fields that are not in the schema (no scores, ranks, totals, "verified"/"feasible" flags): every plan stays UNVERIFIED until the server checks it.
- If a travel time or distance is unknown, output null.
- Activities in one day must not overlap and must fit the place's openHours when known.
- List every unknown essential item in missingData.
- Output JSON only, matching the schema."""


def build_prompt(request: dict, dataset: dict) -> str:
    return (
        f"TRAVEL_REQUEST:\n{json.dumps(request, ensure_ascii=False)}\n\n"
        f"DATASET:\n{json.dumps(dataset, ensure_ascii=False)}"
    )
