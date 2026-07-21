import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend (server/index.ts) only serves /api/* — it doesn't add CORS
// headers because in production Hono serves this app's build output itself
// (same origin, no CORS needed at all). In dev the two run as separate
// servers, so we proxy /api straight to the backend instead of touching its
// code: same relative /api/... calls work unmodified in both environments.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
