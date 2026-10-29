import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the browser only talks to the backend; secrets stay on the server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": { target: "http://localhost:3001", rewrite: p => p.replace(/^\/api/, "") } } }
});
