import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { swaggerUI } from "@hono/swagger-ui";
import { env } from "./env";
import { watchEnvFile } from "./lib/envReload";
import { runsRoute } from "./routes/runs";
import { beneficiariesRoute } from "./routes/beneficiaries";
import { banksRoute } from "./routes/banks";
import { ledgerRoute } from "./routes/ledger";
import { webhooksRoute } from "./routes/webhooks";
import { eventsRoute } from "./routes/events";
import { openApiSpec } from "./openapi";
import { reconcileStaleBeneficiaries } from "./services/reconciliation";

if (!env.isProd) watchEnvFile();

const app = new Hono();

app.use(logger());

app.get("/api/health", (c) => c.json({ ok: true, service: "owo-reach" }));
app.route("/api/runs", runsRoute);
app.route("/api/beneficiaries", beneficiariesRoute);
app.route("/api/banks", banksRoute);
app.route("/api/ledger", ledgerRoute);
app.route("/api/webhooks", webhooksRoute);
app.route("/api/events", eventsRoute);

app.get("/api/openapi.json", (c) => c.json(openApiSpec));
app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

// Webhooks drive every state change; this is only the fallback for ones that
// go missing (see docs/PRD.md §12 — "Flaky webhook delivery").
setInterval(() => {
  reconcileStaleBeneficiaries().catch((err) => console.error("reconciliation sweep failed:", err));
}, 60_000);

// Production: one process serves everything — API + built frontend.
// One public URL means the webhook endpoint, the app, and the demo never drift.
if (env.isProd) {
  app.use("/*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ path: "./web/dist/index.html" })); // SPA fallback
}

console.log(`owo-reach api listening on :${env.PORT} (${env.isProd ? "prod" : "dev"})`);

export default {
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 120, // keep SSE streams alive
};
