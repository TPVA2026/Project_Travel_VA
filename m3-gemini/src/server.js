import express from "express";
import { readFile } from "node:fs/promises";
import { generateCandidate, GeminiError } from "./geminiClient.js";

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => { // minimal CORS: only the known frontend origin
  res.set("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "http://localhost:5173");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const dataset = JSON.parse(await readFile(new URL("../data/sample-dataset.json", import.meta.url)));

// Contract: body = validated TravelRequest from M1. Response = candidate Itinerary with status UNVERIFIED.
app.post("/itineraries/generate", async (req, res) => {
  try {
    const plan = await generateCandidate({ request: req.body, dataset });
    res.json({ status: "UNVERIFIED", plan });
  } catch (e) {
    if (e instanceof GeminiError) {
      const http = e.code === "TIMEOUT" ? 504 : e.code === "CONFIG" ? 500 : e.status === 422 ? 422 : 502;
      return res.status(http).json({ error: e.code, message: e.message, details: e.details });
    }
    res.status(500).json({ error: "INTERNAL" }); // never echo internals / key
  }
});

app.listen(process.env.PORT || 3001, () => console.log("M3 service up"));
