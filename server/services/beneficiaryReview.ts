import { eq } from "drizzle-orm";
import { db, newId } from "../db/client";
import { beneficiaries, events, payoutRuns, type Beneficiary } from "../db/schema";
import { publish } from "../lib/sse";
import { formatNaira, PAYCODE_FEE_KOBO } from "../lib/money";
import { getBanks, nameEnquiry, namesLooselyMatch, resolveBankCode, type Bank } from "../monnify/verification";
import { humanError } from "../lib/errors";

/**
 * Shared review-stage logic for beneficiaries: bank/name verification and the
 * duplicate/outlier flagging. Ingestion runs it over a freshly-parsed list;
 * the edit/add/remove routes run it again when an operator corrects a row, so
 * a fix is re-checked against the real rails rather than just asserted.
 *
 * A run in REVIEW has no ledger reservation yet (that happens at approval, see
 * services/ledger.ts), so editing the list here only ever touches the
 * beneficiary rows and the run's display totals — never the ledger.
 */

// Flag text lives here so generation and the context/verification split below
// can't drift apart. "Context" flags depend on the rest of the run (and so are
// recomputed whenever the list changes); "verification" flags depend only on a
// single row's own bank details (and so survive a sibling being edited).
export const DUPLICATE_FLAG = "Possible duplicate of another beneficiary in this run";
export function outlierFlag(averageKobo: number): string {
  return `Amount is more than 3x the run average (${formatNaira(averageKobo)})`;
}
const CONTEXT_FLAG_PREFIXES = ["Possible duplicate", "Amount is more than 3x"];
function isContextFlag(flag: string): boolean {
  return CONTEXT_FLAG_PREFIXES.some((p) => flag.startsWith(p));
}

export interface BeneficiaryInput {
  name: string;
  phone: string;
  amountKobo: number;
  accountNumber?: string | null;
  /** A bank code or free-text bank name; resolved against the live bank list. */
  bankCode?: string | null;
}

export interface VerifiedIdentity {
  rail: "BANK" | "PAYCODE";
  accountNumber: string | null;
  bankCode: string | null;
  nameEnquiryName: string | null;
  nameMatch: boolean | null;
  verificationFlags: string[];
}

/** Lightly normalise a hand-typed Nigerian number to the +234 form the AI emits. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (/^0\d{10}$/.test(trimmed)) return "+234" + trimmed.slice(1);
  return trimmed;
}

/**
 * Resolve a single beneficiary's rail and, for bank transfers, run Name
 * Enquiry — returning the verification-only flags (name mismatch, or a
 * plain-language failure when the account/bank don't resolve). An account
 * number with no resolvable bank falls back to the PAYCODE rail, exactly as
 * ingestion does.
 */
export async function verifyIdentity(
  input: { name: string; accountNumber?: string | null; bankNameRaw?: string | null },
  banks: Bank[],
): Promise<VerifiedIdentity> {
  const flags: string[] = [];
  const accountNumber = input.accountNumber?.trim() || null;
  const bankCode = accountNumber && input.bankNameRaw ? resolveBankCode(input.bankNameRaw, banks) : null;
  const rail: "BANK" | "PAYCODE" = accountNumber && bankCode ? "BANK" : "PAYCODE";

  let nameEnquiryName: string | null = null;
  let nameMatch: boolean | null = null;
  if (rail === "BANK") {
    try {
      const result = await nameEnquiry(accountNumber!, bankCode!);
      nameEnquiryName = result.accountName;
      nameMatch = namesLooselyMatch(input.name, result.accountName);
      if (!nameMatch) flags.push(`Bank record name does not match: ${result.accountName}`);
    } catch (err) {
      // Technical detail to the log, plain language to the review screen.
      console.error(`name enquiry failed for ${accountNumber}/${bankCode}:`, err);
      flags.push(humanError(err));
    }
  }

  return {
    rail,
    accountNumber: rail === "BANK" ? accountNumber : null,
    bankCode: rail === "BANK" ? bankCode : null,
    nameEnquiryName,
    nameMatch,
    verificationFlags: flags,
  };
}

/**
 * Recompute the run-wide duplicate/outlier flags across a set of rows, keeping
 * each row's own verification flags intact. Returns the full flag list per row,
 * in the same order as the input.
 */
export function recomputeContextFlags(
  rows: { phone: string; amountKobo: number; flags: string[] }[],
): string[][] {
  const phoneCounts = new Map<string, number>();
  for (const r of rows) phoneCounts.set(r.phone, (phoneCounts.get(r.phone) ?? 0) + 1);
  const averageKobo = rows.length ? rows.reduce((sum, r) => sum + r.amountKobo, 0) / rows.length : 0;

  return rows.map((r) => {
    const verification = r.flags.filter((f) => !isContextFlag(f));
    const context: string[] = [];
    if ((phoneCounts.get(r.phone) ?? 0) > 1) context.push(DUPLICATE_FLAG);
    if (rows.length > 2 && r.amountKobo > averageKobo * 3) context.push(outlierFlag(averageKobo));
    return [...context, ...verification];
  });
}

/**
 * After the list changes, re-derive the run-wide flags and the display totals
 * from whatever beneficiaries the run now holds. Only writes rows whose flags
 * actually moved, so an edit doesn't needlessly bump every row's updatedAt.
 */
async function refreshRunFlagsAndTotals(runId: string): Promise<void> {
  const rows = await db.select().from(beneficiaries).where(eq(beneficiaries.runId, runId));

  const nextFlags = recomputeContextFlags(
    rows.map((r) => ({ phone: r.phone, amountKobo: r.amountKobo, flags: r.flags ?? [] })),
  );
  for (let i = 0; i < rows.length; i++) {
    const before = rows[i].flags ?? [];
    const after = nextFlags[i];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await db.update(beneficiaries).set({ flags: after, updatedAt: new Date() }).where(eq(beneficiaries.id, rows[i].id));
    }
  }

  const totalAmountKobo = rows.reduce((sum, r) => sum + r.amountKobo, 0);
  const totalFeesKobo = rows.filter((r) => r.rail === "PAYCODE").length * PAYCODE_FEE_KOBO;
  await db.update(payoutRuns).set({ totalAmountKobo, totalFeesKobo }).where(eq(payoutRuns.id, runId));
}

async function readBeneficiary(id: string): Promise<Beneficiary> {
  const [row] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, id));
  return row;
}

/** Add a beneficiary to a run still in review, verifying it first. */
export async function addBeneficiaryToRun(runId: string, input: BeneficiaryInput): Promise<Beneficiary> {
  const banks = await getBanks();
  const identity = await verifyIdentity(
    { name: input.name, accountNumber: input.accountNumber, bankNameRaw: input.bankCode },
    banks,
  );
  const id = newId("ben");
  await db.insert(beneficiaries).values({
    id,
    runId,
    name: input.name,
    phone: normalizePhone(input.phone),
    amountKobo: input.amountKobo,
    rail: identity.rail,
    accountNumber: identity.accountNumber,
    bankCode: identity.bankCode,
    nameEnquiryName: identity.nameEnquiryName,
    nameMatch: identity.nameMatch,
    flags: identity.verificationFlags,
    status: "PENDING_REVIEW",
  });
  await db.insert(events).values({
    runId,
    beneficiaryId: id,
    type: "beneficiary.added",
    payload: { name: input.name, amountKobo: input.amountKobo },
  });
  await refreshRunFlagsAndTotals(runId);
  publish("run.updated", { runId, status: "REVIEW" });
  return readBeneficiary(id);
}

/** Re-verify and overwrite a reviewable beneficiary's editable fields. */
export async function updateBeneficiaryInRun(
  runId: string,
  beneficiaryId: string,
  input: BeneficiaryInput,
): Promise<Beneficiary> {
  const banks = await getBanks();
  const identity = await verifyIdentity(
    { name: input.name, accountNumber: input.accountNumber, bankNameRaw: input.bankCode },
    banks,
  );
  await db
    .update(beneficiaries)
    .set({
      name: input.name,
      phone: normalizePhone(input.phone),
      amountKobo: input.amountKobo,
      rail: identity.rail,
      accountNumber: identity.accountNumber,
      bankCode: identity.bankCode,
      nameEnquiryName: identity.nameEnquiryName,
      nameMatch: identity.nameMatch,
      flags: identity.verificationFlags,
      updatedAt: new Date(),
    })
    .where(eq(beneficiaries.id, beneficiaryId));
  await db.insert(events).values({
    runId,
    beneficiaryId,
    type: "beneficiary.edited",
    payload: { name: input.name, amountKobo: input.amountKobo },
  });
  await refreshRunFlagsAndTotals(runId);
  publish("run.updated", { runId, status: "REVIEW" });
  return readBeneficiary(beneficiaryId);
}

/**
 * Remove a beneficiary from a run still in review. Nothing was reserved or
 * paid for a PENDING_REVIEW row, so it's a true delete — but a
 * beneficiary.removed event keeps a trace of who was dropped and for how much.
 */
export async function removeBeneficiaryFromRun(runId: string, removed: Beneficiary): Promise<void> {
  await db.delete(beneficiaries).where(eq(beneficiaries.id, removed.id));
  await db.insert(events).values({
    runId,
    type: "beneficiary.removed",
    payload: { name: removed.name, phone: removed.phone, amountKobo: removed.amountKobo },
  });
  await refreshRunFlagsAndTotals(runId);
  publish("run.updated", { runId, status: "REVIEW" });
}
