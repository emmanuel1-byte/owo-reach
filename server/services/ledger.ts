import { and, desc, eq, sql } from "drizzle-orm";
import { db, newId } from "../db/client";
import { ledgerEntries, events, type LedgerEntry } from "../db/schema";
import { formatNaira } from "../lib/money";
import { initiateCheckout } from "../monnify/checkout";

/**
 * Owo Reach's own tracked balance, shown in-app so an admin never has to
 * leave and check the real Monnify wallet before paying people. See the
 * schema comment on ledgerEntries: deposits are real (Monnify-confirmed via
 * webhook), never a typed claim. Balance is always SUM(amount_kobo), never a
 * cached column, so it can't drift from its own audit trail.
 */

const DEPOSIT_REFERENCE_PREFIX = "owo-deposit-";

export class InsufficientFundsError extends Error {
  constructor(
    public requiredKobo: number,
    public availableKobo: number,
  ) {
    super(`This run needs ${formatNaira(requiredKobo)} but the ledger balance is only ${formatNaira(availableKobo)}`);
    this.name = "InsufficientFundsError";
  }
}

export async function getLedgerBalanceKobo(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amountKobo}), 0)` })
    .from(ledgerEntries);
  return row?.total ?? 0;
}

export async function listLedgerEntries(limit = 50): Promise<LedgerEntry[]> {
  return db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(limit);
}

/**
 * Starts a real deposit: initiates a Monnify Collections checkout and
 * returns the URL the org pays at. Credits nothing by itself — the ledger
 * only moves once confirmDeposit is called from the SUCCESSFUL_TRANSACTION
 * webhook (routes/webhooks.ts). Logs an event either way so an abandoned
 * checkout still leaves a trace.
 */
export async function initiateDeposit(input: {
  amountKobo: number;
  customerName: string;
  customerEmail: string;
  redirectUrl?: string;
}): Promise<{ checkoutUrl: string; reference: string }> {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw new Error("Deposit amount must be a positive integer number of kobo");
  }
  const reference = `${DEPOSIT_REFERENCE_PREFIX}${newId("ldg")}`;
  const session = await initiateCheckout({
    amountKobo: input.amountKobo,
    reference,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    redirectUrl: input.redirectUrl,
  });
  await db.insert(events).values({
    type: "ledger.checkout_initiated",
    payload: { reference, amountKobo: input.amountKobo, transactionReference: session.transactionReference },
  });
  return { checkoutUrl: session.checkoutUrl, reference };
}

/**
 * Credits a deposit once Monnify's webhook confirms the checkout actually
 * completed. Idempotent on `reference` — safe against webhook retries,
 * which is the norm for Monnify (they retry on anything but a 2xx).
 */
export function confirmDeposit(reference: string, amountKobo: number): void {
  db.transaction((tx) => {
    const already = tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.reference, reference), eq(ledgerEntries.type, "DEPOSIT")))
      .get();
    if (already) return;

    tx.insert(ledgerEntries).values({ id: newId("ldg"), type: "DEPOSIT", amountKobo, reference }).run();
  });
}

export function isDepositReference(reference: string): boolean {
  return reference.startsWith(DEPOSIT_REFERENCE_PREFIX);
}

/**
 * Atomically checks the ledger can cover every beneficiary about to be
 * queued, then reserves (debits) each one in the same transaction. The
 * check and the write happen inside one synchronous SQLite transaction
 * specifically to close the race where two concurrent approvals could each
 * read a sufficient balance before either has written its reservation.
 * Throws InsufficientFundsError, and reserves nothing, if the balance is
 * short — approval is all-or-nothing, never partial.
 */
export function reserveFundsForRun(runId: string, beneficiaries: { id: string; amountKobo: number }[]): void {
  if (beneficiaries.length === 0) return;
  const required = beneficiaries.reduce((sum, b) => sum + b.amountKobo, 0);

  db.transaction((tx) => {
    const row = tx
      .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amountKobo}), 0)` })
      .from(ledgerEntries)
      .get();
    const available = row?.total ?? 0;
    if (required > available) throw new InsufficientFundsError(required, available);

    for (const b of beneficiaries) {
      tx.insert(ledgerEntries)
        .values({ id: newId("ldg"), type: "RUN_RESERVE", amountKobo: -b.amountKobo, runId, beneficiaryId: b.id })
        .run();
    }
  });
}

/**
 * Releases a beneficiary's reservation when its money demonstrably never
 * left (FAILED before the transfer completed, or an explicit CANCELLED).
 * Idempotent — safe to call more than once for the same beneficiary, so a
 * caller never has to reason about whether it already ran.
 */
export function refundBeneficiary(beneficiaryId: string, runId: string, amountKobo: number): void {
  db.transaction((tx) => {
    const already = tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.beneficiaryId, beneficiaryId), eq(ledgerEntries.type, "RUN_REFUND")))
      .get();
    if (already) return;

    tx.insert(ledgerEntries)
      .values({ id: newId("ldg"), type: "RUN_REFUND", amountKobo, runId, beneficiaryId })
      .run();
  });
}
