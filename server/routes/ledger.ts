import { Hono } from "hono";
import { getLedgerBalanceKobo, listLedgerEntries, initiateDeposit } from "../services/ledger";
import { humanError } from "../lib/errors";

export const ledgerRoute = new Hono();

/** Current available balance, so an admin never has to leave the app to know if a run is affordable. */
ledgerRoute.get("/balance", async (c) => {
  const balanceKobo = await getLedgerBalanceKobo();
  return c.json({ balanceKobo });
});

/** Audit trail: deposits and every run's fund reservation/refund. */
ledgerRoute.get("/", async (c) => {
  const entries = await listLedgerEntries();
  return c.json(entries);
});

/**
 * Starts a real deposit: initiates a Monnify Collections checkout and
 * returns the URL to send the org to pay at. Nothing is credited by this
 * call — the balance only moves once Monnify confirms the payment via
 * webhook (routes/webhooks.ts), so GET /ledger/balance won't reflect it
 * until that lands.
 */
ledgerRoute.post("/deposits/checkout", async (c) => {
  const body = await c.req.json<{ amountKobo?: number; customerName?: string; customerEmail?: string; redirectUrl?: string }>().catch(() => null);
  if (!body?.amountKobo) return c.json({ error: "amountKobo is required" }, 400);
  if (!body?.customerName?.trim() || !body?.customerEmail?.trim()) {
    return c.json({ error: "customerName and customerEmail are required" }, 400);
  }
  try {
    const session = await initiateDeposit({
      amountKobo: body.amountKobo,
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim(),
      redirectUrl: body.redirectUrl,
    });
    return c.json(session, 201);
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});
