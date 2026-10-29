import express from "express";
import requestRoutes from "./routes/requestRoutes.js";
import destinationRoutes from "./routes/destinationRoutes.js";
import itineraryRoutes from "./routes/itineraryRoutes.js";

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => { // minimal CORS: only the known frontend origin
  res.set("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "http://localhost:5173");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/requests", requestRoutes);
app.use("/destinations", destinationRoutes);
app.use("/itineraries", itineraryRoutes);

export default app;
