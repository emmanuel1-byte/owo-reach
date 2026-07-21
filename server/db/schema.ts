import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** A payout run: one batch of beneficiaries approved and executed together. */
export const payoutRuns = sqliteTable("payout_runs", {
  id: text("id").primaryKey(), // e.g. run_x7Kq...
  title: text("title").notNull(),
  // CANCELLED is a soft discard, only reachable from DRAFT/REVIEW — a run that
  // was never approved and so never moved money. The row and its beneficiaries
  // are kept (Transactions still shows them) because deleting financial records
  // would break the audit trail this product is built on.
  status: text("status", {
    enum: ["DRAFT", "REVIEW", "EXECUTING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"],
  })
    .notNull()
    .default("DRAFT"),
  totalAmountKobo: integer("total_amount_kobo").notNull().default(0),
  totalFeesKobo: integer("total_fees_kobo").notNull().default(0),
  preflightBrief: text("preflight_brief"), // AI-written summary shown at review
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const beneficiaries = sqliteTable("beneficiaries", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => payoutRuns.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  rail: text("rail", { enum: ["BANK", "PAYCODE"] }).notNull(),
  // BANK rail only
  accountNumber: text("account_number"),
  bankCode: text("bank_code"),
  nameEnquiryName: text("name_enquiry_name"), // what the bank says the account is called
  nameMatch: integer("name_match", { mode: "boolean" }),
  // lifecycle
  status: text("status", {
    enum: [
      "PENDING_REVIEW",
      "QUEUED",
      "PENDING_AUTHORIZATION", // bank transfer awaiting OTP (sandbox MFA maker-checker step)
      "SENT", // bank transfer initiated
      "CODE_ISSUED", // paycode created + SMS sent
      "COMPLETED", // transfer confirmed / code redeemed
      "FAILED",
      "EXPIRED", // paycode lapsed unredeemed
      "CANCELLED",
    ],
  })
    .notNull()
    .default("PENDING_REVIEW"),
  monnifyReference: text("monnify_reference"), // transfer or paycode reference (ours, unique)
  paycodeExpiresAt: integer("paycode_expires_at", { mode: "timestamp_ms" }),
  flags: text("flags", { mode: "json" }).$type<string[]>().default([]),
  smsBody: text("sms_body"), // what we (would) send — shown in UI, honest about the stub
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Append-only. Doubles as audit trail and dashboard activity feed. */
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id"),
  beneficiaryId: text("beneficiary_id"),
  type: text("type").notNull(), // run.created, beneficiary.verified, webhook.received, paycode.revealed, ...
  payload: text("payload", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Owo Reach's own tracked balance, shown in-app instead of the real Monnify
 * wallet balance. Never a stored column, only ever SUM(amount_kobo) over
 * these rows, so there is exactly one number and it can't drift from its own
 * history.
 *
 * DEPOSIT rows are real, not self-reported: they're written only when a
 * Monnify Collections webhook (SUCCESSFUL_TRANSACTION) confirms a checkout
 * actually completed (see services/ledger.ts, routes/webhooks.ts). There is
 * no path that lets an amount be credited on request alone.
 */
export const ledgerEntries = sqliteTable("ledger_entries", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["DEPOSIT", "RUN_RESERVE", "RUN_REFUND"] }).notNull(),
  amountKobo: integer("amount_kobo").notNull(), // signed: DEPOSIT/RUN_REFUND > 0, RUN_RESERVE < 0
  runId: text("run_id"), // set for RUN_RESERVE / RUN_REFUND
  beneficiaryId: text("beneficiary_id"), // set for RUN_RESERVE / RUN_REFUND
  reference: text("reference"), // Monnify paymentReference, set for DEPOSIT — dedupes webhook retries
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type PayoutRun = typeof payoutRuns.$inferSelect;
export type Beneficiary = typeof beneficiaries.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
