import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { beneficiaries, events, payoutRuns } from "../db/schema";
import { createRunFromRawInput } from "../services/ingestion";
import { executeRun } from "../services/execution";
import { reserveFundsForRun, InsufficientFundsError } from "../services/ledger";
import {
  addBeneficiaryToRun,
  updateBeneficiaryInRun,
  removeBeneficiaryFromRun,
  type BeneficiaryInput,
} from "../services/beneficiaryReview";
import { publish } from "../lib/sse";
import { humanError } from "../lib/errors";

/** Validate an add/edit payload into the shape the review service expects. */
function parseBeneficiaryInput(
  body: Record<string, unknown> | null,
): { value: BeneficiaryInput } | { error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const amountKobo = body?.amountKobo;
  const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.trim() : "";
  const bankCode = typeof body?.bankCode === "string" ? body.bankCode.trim() : "";

  if (!name) return { error: "A beneficiary name is required." };
  if (!phone) return { error: "A phone number is required." };
  if (!Number.isInteger(amountKobo) || (amountKobo as number) <= 0) {
    return { error: "Enter an amount greater than zero." };
  }
  if (accountNumber && !bankCode) {
    return { error: "Choose a bank for that account number, or clear the account to send a paycode instead." };
  }
  if (bankCode && !accountNumber) {
    return { error: "Enter an account number for the chosen bank, or clear the bank to send a paycode instead." };
  }

  return {
    value: {
      name,
      phone,
      amountKobo: amountKobo as number,
      accountNumber: accountNumber || null,
      bankCode: bankCode || null,
    },
  };
}

export const runsRoute = new Hono();

runsRoute.get("/", async (c) => {
  const rows = await db.select().from(payoutRuns).orderBy(desc(payoutRuns.createdAt));
  return c.json(rows);
});

/**
 * Create a run from a messy beneficiary list (paste, CSV text, free text).
 * AI extraction and Name Enquiry complete before this returns, publishing
 * coarse SSE progress (ingestion.started/parsed/verifying, run.created) so a
 * connected dashboard never shows a dead spinner. The pre-flight brief is
 * written afterwards and arrives on a later run.updated — it describes a run
 * that is already reviewable, so nothing waits on it.
 */
runsRoute.post("/", async (c) => {
  const body = await c.req.json<{ title?: string; rawInput?: string }>().catch(() => null);
  if (!body?.title?.trim() || !body?.rawInput?.trim()) {
    return c.json({ error: "title and rawInput are required" }, 400);
  }
  try {
    const result = await createRunFromRawInput(body.title.trim(), body.rawInput);
    return c.json(result, 201);
  } catch (err) {
    // Technical detail to the log, plain language to the caller — without this
    // an unmapped failure surfaces only as the generic "something went wrong".
    console.error("run creation failed:", err);
    return c.json({ error: humanError(err) }, 422);
  }
});

runsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [run] = await db.select().from(payoutRuns).where(eq(payoutRuns.id, id));
  if (!run) return c.json({ error: "We couldn't find that payout run. It may have been removed." }, 404);
  const people = await db.select().from(beneficiaries).where(eq(beneficiaries.runId, id));
  const log = await db
    .select()
    .from(events)
    .where(eq(events.runId, id))
    .orderBy(desc(events.createdAt))
    .limit(50);
  return c.json({ run, beneficiaries: people, events: log });
});

/**
 * Discard a run that was never approved — the "I pasted the wrong list" undo.
 *
 * Deliberately restricted to DRAFT/REVIEW. Once a run is EXECUTING, money is
 * already reserved and transfers may be in flight, so cancelling the whole run
 * is not a safe single operation: the caller has to cancel the remaining
 * beneficiaries individually (POST /api/beneficiaries/:id/cancel), which
 * refunds each reservation as it goes. Terminal runs stay as they are.
 *
 * Nothing is deleted. The run keeps its beneficiaries and its event trail, so
 * Transactions can still account for every row that ever existed.
 */
runsRoute.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const [run] = await db.select().from(payoutRuns).where(eq(payoutRuns.id, id));
  if (!run) return c.json({ error: "We couldn't find that payout run. It may have been removed." }, 404);
  if (run.status !== "REVIEW" && run.status !== "DRAFT") {
    const reason =
      run.status === "CANCELLED"
        ? "This run has already been discarded."
        : "This run has already been approved, so it can't be discarded. Cancel the individual payments instead.";
    return c.json({ error: reason }, 409);
  }

  const body = await c.req.json<{ reason?: string }>().catch(() => null);
  const reason = body?.reason?.trim() || null;

  await db.update(payoutRuns).set({ status: "CANCELLED" }).where(eq(payoutRuns.id, id));
  // Beneficiaries follow the run so they stop showing as awaiting a decision;
  // they were never queued, so no ledger reservation exists to release.
  await db
    .update(beneficiaries)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(beneficiaries.runId, id));

  await db.insert(events).values({ runId: id, type: "run.cancelled", payload: reason ? { reason } : {} });
  publish("run.updated", { runId: id, status: "CANCELLED" });

  return c.json({ ok: true, status: "CANCELLED" });
});

/**
 * Approve a run in REVIEW: everyone un-flagged moves to QUEUED and execution
 * starts in the background. Returns immediately; progress arrives over SSE.
 *
 * Gated on the internal ledger (services/ledger.ts): the full cost of
 * everyone about to be queued is reserved atomically first. If the ledger
 * balance is short, nothing is queued and nothing is reserved — approve
 * again after recording a deposit via POST /api/ledger/deposits.
 */
runsRoute.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  const [run] = await db.select().from(payoutRuns).where(eq(payoutRuns.id, id));
  if (!run) return c.json({ error: "We couldn't find that payout run. It may have been removed." }, 404);
  if (run.status !== "REVIEW") {
    const reason =
      run.status === "CANCELLED"
        ? "This run was discarded, so it can't be approved."
        : "This run has already been approved.";
    return c.json({ error: reason }, 409);
  }

  const people = await db.select().from(beneficiaries).where(eq(beneficiaries.runId, id));
  const toQueue = people.filter((b) => b.status === "PENDING_REVIEW" && (b.flags ?? []).length === 0);

  try {
    reserveFundsForRun(id, toQueue.map((b) => ({ id: b.id, amountKobo: b.amountKobo })));
  } catch (err) {
    if (err instanceof InsufficientFundsError) return c.json({ error: err.message }, 402);
    throw err;
  }

  for (const b of toQueue) {
    await db
      .update(beneficiaries)
      .set({ status: "QUEUED", updatedAt: new Date() })
      .where(eq(beneficiaries.id, b.id));
  }
  await db.insert(events).values({ runId: id, type: "run.approved", payload: {} });
  publish("run.updated", { runId: id, status: "EXECUTING" });

  void executeRun(id); // deliberately not awaited — see services/execution.ts

  return c.json({ ok: true, status: "EXECUTING" });
});

// --- Editing the list while it's still in review -------------------------
// A run in REVIEW hasn't reserved or moved any money, so its beneficiaries can
// be corrected, added, or dropped — each change re-verifies against the bank
// rails and re-totals the run. Everything here is gated to REVIEW: once a run
// is approved, the batch screen's per-beneficiary controls take over.

/** Load a run and confirm it can still be edited, or return the response to send. */
async function requireEditableRun(id: string) {
  const [run] = await db.select().from(payoutRuns).where(eq(payoutRuns.id, id));
  if (!run) {
    return { error: { body: { error: "We couldn't find that payout run. It may have been removed." }, status: 404 as const } };
  }
  if (run.status !== "REVIEW") {
    const reason =
      run.status === "CANCELLED"
        ? "This run was discarded, so its list can't be edited."
        : "This run has already been approved, so its list can't be edited.";
    return { error: { body: { error: reason }, status: 409 as const } };
  }
  return { run };
}

runsRoute.post("/:id/beneficiaries", async (c) => {
  const id = c.req.param("id");
  const gate = await requireEditableRun(id);
  if (gate.error) return c.json(gate.error.body, gate.error.status);

  const parsed = parseBeneficiaryInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  try {
    const beneficiary = await addBeneficiaryToRun(id, parsed.value);
    return c.json({ beneficiary }, 201);
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});

runsRoute.patch("/:id/beneficiaries/:beneficiaryId", async (c) => {
  const id = c.req.param("id");
  const beneficiaryId = c.req.param("beneficiaryId");
  const gate = await requireEditableRun(id);
  if (gate.error) return c.json(gate.error.body, gate.error.status);

  const [ben] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, beneficiaryId));
  if (!ben || ben.runId !== id) {
    return c.json({ error: "We couldn't find that beneficiary in this run." }, 404);
  }
  if (ben.status !== "PENDING_REVIEW") {
    return c.json({ error: "This payment has already moved on and can no longer be edited." }, 409);
  }

  const parsed = parseBeneficiaryInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  try {
    const beneficiary = await updateBeneficiaryInRun(id, beneficiaryId, parsed.value);
    return c.json({ beneficiary });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});

runsRoute.delete("/:id/beneficiaries/:beneficiaryId", async (c) => {
  const id = c.req.param("id");
  const beneficiaryId = c.req.param("beneficiaryId");
  const gate = await requireEditableRun(id);
  if (gate.error) return c.json(gate.error.body, gate.error.status);

  const [ben] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, beneficiaryId));
  if (!ben || ben.runId !== id) {
    return c.json({ error: "We couldn't find that beneficiary in this run." }, 404);
  }
  if (ben.status !== "PENDING_REVIEW") {
    return c.json({ error: "This payment has already moved on and can no longer be removed." }, 409);
  }

  const remaining = await db.select({ id: beneficiaries.id }).from(beneficiaries).where(eq(beneficiaries.runId, id));
  if (remaining.length <= 1) {
    return c.json(
      { error: "This is the run's last beneficiary — discard the whole run instead of removing it." },
      409,
    );
  }

  try {
    await removeBeneficiaryFromRun(id, ben);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});
