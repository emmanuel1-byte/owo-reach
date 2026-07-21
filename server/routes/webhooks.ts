import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { beneficiaries, events } from "../db/schema";
import { isValidMonnifySignature, type MonnifyWebhookEvent } from "../monnify/webhook";
import { transition } from "../services/execution";
import { confirmDeposit, isDepositReference } from "../services/ledger";
import { publish } from "../lib/sse";
import { nairaToKobo } from "../lib/money";

export const webhooksRoute = new Hono();

/**
 * Monnify webhook receiver.
 * Contract with Monnify: return 200 fast (they retry on anything else).
 * Contract with ourselves: validate the signature on the RAW body before
 * trusting a single byte; persist first; process after.
 */
webhooksRoute.post("/monnify", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("monnify-signature");

  if (!isValidMonnifySignature(raw, signature)) {
    // Log-and-reject: a bad signature is either misconfig or someone probing.
    console.warn("Webhook rejected: invalid monnify-signature");
    return c.json({ error: "invalid signature" }, 401);
  }

  const event = JSON.parse(raw) as MonnifyWebhookEvent;
  await db.insert(events).values({ type: `webhook.${event.eventType}`, payload: event.eventData });
  publish("webhook.received", { eventType: event.eventType });

  // Collections (ledger deposits) — distinct event type and reference field
  // from every disbursement event below; check first since a deposit
  // reference would never match a beneficiary id anyway, but this keeps the
  // two flows visibly separate rather than relying on a lookup miss.
  const paymentRef = event.eventData.paymentReference;
  if (event.eventType === "SUCCESSFUL_TRANSACTION" && typeof paymentRef === "string" && isDepositReference(paymentRef)) {
    if (event.eventData.paymentStatus === "PAID" && typeof event.eventData.amountPaid === "number") {
      confirmDeposit(paymentRef, nairaToKobo(event.eventData.amountPaid));
    }
    return c.json({ ok: true });
  }

  // Map Monnify events → beneficiary transitions. Our references are
  // `owo-<benId>`, or `owo-<benId>-r<timestamp>` for a reissued paycode.
  const ref = event.eventData.reference ?? event.eventData.transactionReference ?? "";
  if (typeof ref === "string" && ref.startsWith("owo-")) {
    const benId = ref.slice("owo-".length).replace(/-r\d+$/, "");
    const [b] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, benId));
    if (b) {
      const t = event.eventType.toUpperCase();
      if (t.includes("SUCCESSFUL") || t.includes("REDEEM")) {
        await transition(b.id, "COMPLETED", { via: "webhook", eventType: event.eventType });
      } else if (t.includes("FAILED") || t.includes("REVERSED")) {
        await transition(b.id, "FAILED", { via: "webhook", eventType: event.eventType });
      } else if (t.includes("EXPIRE")) {
        // Best-effort — the reconciliation job is the source of truth for expiry
        // in case Monnify doesn't emit this event.
        await transition(b.id, "EXPIRED", { via: "webhook" });
      } else if (t.includes("CANCEL")) {
        await transition(b.id, "CANCELLED", { via: "webhook" });
      }
    }
  }

  return c.json({ ok: true });
});
