import { eq } from "drizzle-orm";
import { db, newId } from "../db/client";
import { beneficiaries, events, payoutRuns } from "../db/schema";
import { publish } from "../lib/sse";
import { PAYCODE_FEE_KOBO } from "../lib/money";
import { getBanks } from "../monnify/verification";
import { ingestBeneficiaries, generatePreflightBrief } from "../ai";
import { verifyIdentity, recomputeContextFlags } from "./beneficiaryReview";

/**
 * Turns a messy pasted list into a REVIEW-ready run: AI extraction, phone-
 * duplicate + amount-outlier flags (deterministic — no need for a model),
 * Name Enquiry on every banked beneficiary, totals, and an AI pre-flight
 * brief. Publishes coarse SSE progress events throughout so the caller never
 * shows a dead spinner, then returns the finished run.
 */
export async function createRunFromRawInput(title: string, rawInput: string) {
  publish("ingestion.started", { title });

  const extracted = await ingestBeneficiaries(rawInput);
  if (extracted.length === 0) throw new Error("No beneficiaries could be extracted from that input");
  publish("ingestion.parsed", { count: extracted.length });

  const banks = await getBanks();
  const runId = newId("run");

  publish("ingestion.verifying", { count: extracted.length });

  const rows: (typeof beneficiaries.$inferInsert)[] = [];
  for (const b of extracted) {
    const identity = await verifyIdentity(
      { name: b.name, accountNumber: b.accountNumber, bankNameRaw: b.bankNameRaw },
      banks,
    );
    rows.push({
      id: newId("ben"),
      runId,
      name: b.name,
      phone: b.phone,
      amountKobo: b.amountKobo,
      rail: identity.rail,
      accountNumber: identity.accountNumber,
      bankCode: identity.bankCode,
      nameEnquiryName: identity.nameEnquiryName,
      nameMatch: identity.nameMatch,
      flags: identity.verificationFlags,
      status: "PENDING_REVIEW",
    });
  }

  // Layer the run-wide duplicate/outlier flags on top of each row's own
  // verification flags, from the whole set at once.
  const contextFlags = recomputeContextFlags(
    rows.map((r) => ({ phone: r.phone, amountKobo: r.amountKobo, flags: r.flags ?? [] })),
  );
  rows.forEach((r, i) => {
    r.flags = contextFlags[i];
  });

  const totalAmountKobo = rows.reduce((sum, r) => sum + r.amountKobo, 0);
  const paycodeCount = rows.filter((r) => r.rail === "PAYCODE").length;
  const totalFeesKobo = paycodeCount * PAYCODE_FEE_KOBO;
  const flaggedRows = rows.filter((r) => (r.flags?.length ?? 0) > 0);

  await db.insert(payoutRuns).values({
    id: runId,
    title,
    status: "REVIEW",
    totalAmountKobo,
    totalFeesKobo,
    preflightBrief: null, // filled in asynchronously below
  });
  await db.insert(beneficiaries).values(rows);
  await db.insert(events).values({
    runId,
    type: "run.created",
    payload: { source: "ai", beneficiaries: rows.length, flagged: flaggedRows.length },
  });

  publish("run.created", { runId });

  // The brief is prose *about* a run that is already reviewable — it gates
  // nothing, so blocking creation on it (which cost 15-35s on a thinking
  // model) made the whole ingestion feel broken. Write it in the background
  // and let the SSE wire fill it in; the review screen renders without it.
  void generatePreflightBrief({
    title,
    totalAmountKobo,
    totalFeesKobo,
    beneficiaryCount: rows.length,
    paycodeCount,
    flaggedCount: flaggedRows.length,
    flagSamples: flaggedRows.flatMap((r) => r.flags ?? []),
  })
    .then(async (brief) => {
      if (!brief) return;
      await db.update(payoutRuns).set({ preflightBrief: brief }).where(eq(payoutRuns.id, runId));
      publish("run.updated", { runId, status: "REVIEW" });
    })
    .catch((err) => console.error(`pre-flight brief failed for ${runId}:`, err));

  return {
    run: { id: runId, title, status: "REVIEW" as const, totalAmountKobo, totalFeesKobo, preflightBrief: null },
    beneficiaries: rows,
  };
}