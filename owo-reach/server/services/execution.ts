import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { beneficiaries, events, payoutRuns, type Beneficiary } from "../db/schema";
import { publish } from "../lib/sse";
import { formatNaira } from "../lib/money";
import { singleTransfer } from "../monnify/transfers";
import { createPaycode } from "../monnify/paycode";
import { refundBeneficiary } from "./ledger";

export const PAYCODE_VALIDITY_MS = 72 * 3600 * 1000;

/**
 * Executes an approved run: BANK rail → single transfer; PAYCODE rail →
 * create paycode + compose the recipient SMS. Fire-and-record: each
 * beneficiary's terminal state arrives later via webhook. This function only
 * moves QUEUED → SENT/CODE_ISSUED/PENDING_AUTHORIZATION (or FAILED on
 * immediate rejection).
 *
 * Called without await from the route handler — the API returns instantly and
 * progress streams to the dashboard over SSE.
 */
export async function executeRun(runId: string): Promise<void> {
  await db.update(payoutRuns).set({ status: "EXECUTING" }).where(eq(payoutRuns.id, runId));
  publish("run.updated", { runId, status: "EXECUTING" });

  const list = await db.select().from(beneficiaries).where(eq(beneficiaries.runId, runId));

  for (const b of list) {
    if (b.status !== "QUEUED") continue;
    try {
      if (b.rail === "BANK") await payByTransfer(b);
      else await payByPaycode(b);
    } catch (err) {
      await transition(b.id, "FAILED", { error: String(err) });
    }
  }
}

async function payByTransfer(b: Beneficiary): Promise<void> {
  const reference = `owo-${b.id}`;
  const result = await singleTransfer({
    amountKobo: b.amountKobo,
    reference,
    narration: `Stipend — Owo Reach`,
    destinationBankCode: b.bankCode!,
    destinationAccountNumber: b.accountNumber!,
    destinationAccountName: b.nameEnquiryName ?? b.name,
  });
  await db
    .update(beneficiaries)
    .set({ monnifyReference: reference, updatedAt: new Date() })
    .where(eq(beneficiaries.id, b.id));

  // Sandbox MFA is on by default: a transfer often comes back PENDING_AUTHORIZATION
  // rather than completing. Surface that as an explicit maker-checker step —
  // the admin submits the OTP via POST /api/beneficiaries/:id/otp.
  if (result.status === "PENDING_AUTHORIZATION") {
    await transition(b.id, "PENDING_AUTHORIZATION", { monnifyStatus: result.status });
  } else {
    await transition(b.id, "SENT", { monnifyStatus: result.status });
  }
}

async function payByPaycode(b: Beneficiary): Promise<void> {
  const reference = `owo-${b.id}`;
  const code = await createPaycode({
    amountKobo: b.amountKobo,
    beneficiaryName: b.name,
    reference,
  });
  const expiresAt = code.expiryDate ? new Date(code.expiryDate) : new Date(Date.now() + PAYCODE_VALIDITY_MS);
  const sms = composePaycodeSms(b.amountKobo, code.paycode, expiresAt);
  await db
    .update(beneficiaries)
    .set({ monnifyReference: reference, smsBody: sms, paycodeExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(beneficiaries.id, b.id));
  await transition(b.id, "CODE_ISSUED", { expiryDate: expiresAt.toISOString() });
}

export function composePaycodeSms(amountKobo: number, code: string | undefined, expiresAt: Date): string {
  return (
    `You've received ${formatNaira(amountKobo)} via Owo Reach. ` +
    `Show code ${code ?? "(masked)"} with your ID at any Moniepoint agent to collect cash. ` +
    `Expires ${expiresAt.toLocaleString("en-NG")}.`
  );
}

const TERMINAL_BENEFICIARY_STATUSES: ReadonlySet<Beneficiary["status"]> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

// Money demonstrably never left (or came back) in these — release the ledger
// reservation. EXPIRED stays reserved: mirrors the existing run.totalAmountKobo
// behavior, where an expired paycode only releases funds via an explicit
// cancel (lifecycle.ts), same as it would need an explicit cancel at Monnify.
const LEDGER_REFUND_STATUSES: ReadonlySet<Beneficiary["status"]> = new Set(["FAILED", "CANCELLED"]);

/** Single choke-point for beneficiary state changes: persist, log, broadcast. */
export async function transition(
  beneficiaryId: string,
  status: Beneficiary["status"],
  payload: Record<string, unknown> = {},
): Promise<void> {
  const [before] = await db
    .select({ runId: beneficiaries.runId, amountKobo: beneficiaries.amountKobo })
    .from(beneficiaries)
    .where(eq(beneficiaries.id, beneficiaryId));

  await db
    .update(beneficiaries)
    .set({ status, updatedAt: new Date() })
    .where(eq(beneficiaries.id, beneficiaryId));
  await db.insert(events).values({ beneficiaryId, type: `beneficiary.${status.toLowerCase()}`, payload });
  publish("beneficiary.updated", { beneficiaryId, status, ...payload });

  if (before) {
    if (LEDGER_REFUND_STATUSES.has(status)) refundBeneficiary(beneficiaryId, before.runId, before.amountKobo);
    await maybeFinalizeRun(before.runId);
  }
}

/**
 * Rolls the run's own status forward once every beneficiary in it has
 * reached a terminal state. Without this, a run sits at EXECUTING forever —
 * beneficiary-level transitions never implied a run-level one.
 */
async function maybeFinalizeRun(runId: string): Promise<void> {
  const list = await db.select({ status: beneficiaries.status }).from(beneficiaries).where(eq(beneficiaries.runId, runId));
  if (list.length === 0 || !list.every((b) => TERMINAL_BENEFICIARY_STATUSES.has(b.status))) return;

  const [run] = await db.select({ status: payoutRuns.status }).from(payoutRuns).where(eq(payoutRuns.id, runId));
  if (!run || run.status !== "EXECUTING") return; // not mid-execution, or already finalized

  const resolvedOk = list.filter((b) => b.status === "COMPLETED" || b.status === "CANCELLED").length;
  const finalStatus = resolvedOk === list.length ? "COMPLETED" : resolvedOk === 0 ? "FAILED" : "PARTIAL";

  await db.update(payoutRuns).set({ status: finalStatus }).where(eq(payoutRuns.id, runId));
  await db.insert(events).values({ runId, type: "run.finalized", payload: { status: finalStatus } });
  publish("run.updated", { runId, status: finalStatus });
}
