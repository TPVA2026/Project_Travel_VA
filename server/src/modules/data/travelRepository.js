import { readFile } from "node:fs/promises";

const load = async name => JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), "utf8"));

// Shape consumed by M3/M4: { destinations, attractions, dining, travelMatrix }.
// Unknown prices/hours/travel times must stay null (never 0).
// TODO(M2): add retrieval filters, provenance and update-date metadata.
export async function loadDataset() {
  const [destinations, attractions, dining, travelMatrix] = await Promise.all(
    ["destinations.json", "attractions.json", "restaurants.json", "travelMatrix.json"].map(load)
  );
  return { destinations, attractions, dining, travelMatrix };
}
