import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the browser only talks to the backend; secrets stay on the server.
// TRAVEL_API_ORIGIN overrides the target when port 3001 is already taken.
const apiTarget = process.env.TRAVEL_API_ORIGIN || "http://localhost:3001";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: apiTarget }, "/itineraries": { target: apiTarget } },
    // WSL mounts on /mnt/* do not emit inotify events, so Vite must poll for
    // changes or it keeps serving stale CSS/JS after edits.
    watch: { usePolling: true, interval: 300 },
  },
});
