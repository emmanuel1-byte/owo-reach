import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { beneficiaries, events, payoutRuns, type Beneficiary } from "../db/schema";
import { publish } from "../lib/sse";
import { formatNaira } from "../lib/money";
import { authorizeTransfer, resendTransferOtp } from "../monnify/transfers";
import { createPaycode, cancelPaycode, getClearPaycode } from "../monnify/paycode";
import { transition, composePaycodeSms, PAYCODE_VALIDITY_MS } from "./execution";

/** Post-execution actions an admin takes on a single beneficiary: OTP entry and paycode lifecycle. */

export async function requireBeneficiary(id: string): Promise<Beneficiary> {
  const [b] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, id));
  if (!b) throw new Error("Beneficiary not found");
  return b;
}

// ─── OTP maker-checker (sandbox MFA on bank transfers) ──────────────────────

export async function authorizeBeneficiaryTransfer(beneficiaryId: string, otp: string): Promise<void> {
  const b = await requireBeneficiary(beneficiaryId);
  if (b.status !== "PENDING_AUTHORIZATION") throw new Error(`Beneficiary is ${b.status}, not PENDING_AUTHORIZATION`);
  const result = await authorizeTransfer(b.monnifyReference!, otp);
  if (result.status === "PENDING_AUTHORIZATION") {
    throw new Error("OTP rejected — still pending authorization");
  }
  await transition(b.id, "SENT", { monnifyStatus: result.status, via: "otp" });
}

export async function resendBeneficiaryOtp(beneficiaryId: string): Promise<void> {
  const b = await requireBeneficiary(beneficiaryId);
  if (b.status !== "PENDING_AUTHORIZATION") throw new Error(`Beneficiary is ${b.status}, not PENDING_AUTHORIZATION`);
  await resendTransferOtp(b.monnifyReference!);
  await db.insert(events).values({ beneficiaryId: b.id, type: "beneficiary.otp_resent", payload: {} });
}

// ─── Paycode lifecycle actions ───────────────────────────────────────────

/**
 * Reveal the clear (unmasked) paycode. Authorized, audited action — the code
 * itself is deliberately NOT written to the event payload; only the fact that
 * it was revealed is logged, per the security posture in docs/PRD.md.
 */
export async function revealPaycode(beneficiaryId: string): Promise<{ paycode: string }> {
  const b = await requireBeneficiary(beneficiaryId);
  if (b.rail !== "PAYCODE" || !b.monnifyReference) throw new Error("Beneficiary has no paycode to reveal");
  const clear = await getClearPaycode(b.monnifyReference);
  await db.insert(events).values({
    beneficiaryId: b.id,
    type: "beneficiary.paycode_revealed",
    payload: { reference: b.monnifyReference },
  });
  publish("beneficiary.paycode_revealed", { beneficiaryId: b.id });
  return { paycode: clear.paycode ?? "" };
}

/** Cancel an unredeemed code or pending transfer; returns its amount to the run total. */
export async function cancelBeneficiary(beneficiaryId: string): Promise<void> {
  const b = await requireBeneficiary(beneficiaryId);
  if (!["QUEUED", "SENT", "CODE_ISSUED", "PENDING_AUTHORIZATION", "EXPIRED"].includes(b.status)) {
    throw new Error(`Beneficiary is ${b.status} and cannot be cancelled`);
  }
  if (b.rail === "PAYCODE" && b.monnifyReference && b.status !== "EXPIRED") {
    await cancelPaycode(b.monnifyReference);
  }
  await db
    .update(payoutRuns)
    .set({ totalAmountKobo: sql`${payoutRuns.totalAmountKobo} - ${b.amountKobo}` })
    .where(eq(payoutRuns.id, b.runId));
  await transition(b.id, "CANCELLED", { refundedKobo: b.amountKobo });
}

/** Re-issue a fresh paycode for an expired one. Same amount, new reference and expiry. */
export async function reissuePaycode(beneficiaryId: string): Promise<void> {
  const b = await requireBeneficiary(beneficiaryId);
  if (b.status !== "EXPIRED") throw new Error(`Beneficiary is ${b.status}, not EXPIRED`);
  const reference = `owo-${b.id}-r${Date.now()}`;
  const code = await createPaycode({ amountKobo: b.amountKobo, beneficiaryName: b.name, reference });
  const expiresAt = code.expiryDate ? new Date(code.expiryDate) : new Date(Date.now() + PAYCODE_VALIDITY_MS);
  const sms = composePaycodeSms(b.amountKobo, code.paycode, expiresAt);
  await db
    .update(beneficiaries)
    .set({ monnifyReference: reference, smsBody: sms, paycodeExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(beneficiaries.id, b.id));
  await transition(b.id, "CODE_ISSUED", { reissued: true, expiryDate: expiresAt.toISOString() });
}

/** Compose (and log) a reminder nudge for a code that's about to expire. SMS sending is stubbed. */
export async function nudgeBeneficiary(beneficiaryId: string): Promise<{ sms: string }> {
  const b = await requireBeneficiary(beneficiaryId);
  if (b.status !== "CODE_ISSUED") throw new Error(`Beneficiary is ${b.status}, not CODE_ISSUED`);
  const sms =
    `Reminder: you have ${formatNaira(b.amountKobo)} waiting via Owo Reach. ` +
    `Show your code with your ID at any Moniepoint agent before it expires` +
    (b.paycodeExpiresAt ? ` on ${b.paycodeExpiresAt.toLocaleString("en-NG")}.` : ".");
  await db.insert(events).values({ beneficiaryId: b.id, type: "beneficiary.nudge_sent", payload: { sms } });
  publish("beneficiary.nudge_sent", { beneficiaryId: b.id });
  return { sms };
}
