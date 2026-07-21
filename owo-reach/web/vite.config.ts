import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Dev: UI on :5173, API on :3000 — one origin in prod (Hono serves dist/)
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
