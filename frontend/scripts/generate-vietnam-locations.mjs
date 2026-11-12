#!/usr/bin/env node
// Build the trimmed Vietnam province list used by departure/destination suggestions.
// Source: Vietnamese Provinces Database v5.2.0 (MIT),
// https://github.com/thanglequoc/vietnamese-provinces-database
//
// Usage:
//   node scripts/generate-vietnam-locations.mjs
//   node scripts/generate-vietnam-locations.mjs --source /path/to/simplified_json_generated_data_vn_units_minified.json

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATASET_VERSION = "v5.2.0";
export const DATASET_DECREE = "388/NQ-UBTVQH16";
const SOURCE_URL = `https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/${DATASET_VERSION}/json/simplified_json_generated_data_vn_units_minified.json`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src/data/vietnam-provinces.js");

function sourceArg(argv) {
  const index = argv.indexOf("--source");
  return index >= 0 ? argv[index + 1] : undefined;
}

export function trimProvinces(rows) {
  if (!Array.isArray(rows)) throw new Error("Expected an array of provinces");
  return rows.map(province => ({
    code: province.Code ?? province.code,
    name: province.Name ?? province.name,
    nameEn: province.NameEn ?? province.nameEn,
    fullName: province.FullName ?? province.fullName,
  }));
}

async function loadSource(pathOrUrl) {
  if (pathOrUrl && !/^https?:\/\//.test(pathOrUrl)) {
    return JSON.parse(await readFile(pathOrUrl, "utf8"));
  }
  const url = pathOrUrl || SOURCE_URL;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  return response.json();
}

async function main() {
  const source = sourceArg(process.argv.slice(2));
  const provinces = trimProvinces(await loadSource(source));
  if (provinces.length !== 34) throw new Error(`Expected 34 provinces, got ${provinces.length}`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `// Generated from Vietnamese Provinces Database ${DATASET_VERSION}. Do not edit by hand.\nexport default ${JSON.stringify(provinces, null, 2)};\n`);
  console.log(`Wrote ${provinces.length} provinces to ${outPath}`);
  console.log(`Dataset ${DATASET_VERSION} (${DATASET_DECREE})`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch(error => {
  console.error(error);
  process.exit(1);
});
