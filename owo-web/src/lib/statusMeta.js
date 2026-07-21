// Maps the backend's beneficiary/run enums onto the design system's existing
// .state / .s-* / .dot--* classes (see index.css) — no new visual language,
// just wiring real states into the palette that was already designed for them.

export const BENEFICIARY_STATUS_META = {
  PENDING_REVIEW: { cls: "s-queued", dot: "dot--ring", label: "Pending review" },
  QUEUED: { cls: "s-queued", dot: "dot--ring", label: "Queued" },
  PENDING_AUTHORIZATION: { cls: "s-issued", dot: "dot--ring", label: "Needs OTP" },
  SENT: { cls: "s-issued", dot: "dot--ring", label: "Sending" },
  CODE_ISSUED: { cls: "s-issued", dot: "dot--ring", label: "Code issued" },
  COMPLETED: { cls: "s-complete", dot: "dot--fill", label: "Completed" },
  FAILED: { cls: "s-failed", dot: "dot--fill", label: "Failed" },
  EXPIRED: { cls: "s-expiring", dot: "dot--ring", label: "Expired" },
  CANCELLED: { cls: "s-cancelled", dot: "dot--fill", label: "Cancelled" },
};

export const RUN_STATUS_META = {
  DRAFT: { cls: "s-queued", dot: "dot--ring", label: "Draft" },
  REVIEW: { cls: "s-issued", dot: "dot--ring", label: "In review" },
  EXECUTING: { cls: "s-issued", dot: "dot--ring", label: "Executing" },
  COMPLETED: { cls: "s-complete", dot: "dot--fill", label: "Completed" },
  PARTIAL: { cls: "s-expiring", dot: "dot--ring", label: "Partially completed" },
  FAILED: { cls: "s-failed", dot: "dot--fill", label: "Failed" },
  CANCELLED: { cls: "s-cancelled", dot: "dot--fill", label: "Discarded" },
};

// Ledger rows carry a signed amount, so the chip only has to name the movement —
// the sign and colour of the figure beside it say which way the money went.
export const LEDGER_TYPE_META = {
  DEPOSIT: { cls: "s-complete", dot: "dot--fill", label: "Deposit" },
  RUN_RESERVE: { cls: "s-issued", dot: "dot--ring", label: "Run reserve" },
  RUN_REFUND: { cls: "s-queued", dot: "dot--ring", label: "Run refund" },
};

export const TERMINAL_BENEFICIARY_STATES = ["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"];

export function statusMeta(status) {
  return BENEFICIARY_STATUS_META[status] ?? { cls: "s-queued", dot: "dot--ring", label: status ?? "Unknown" };
}

export function runStatusMeta(status) {
  return RUN_STATUS_META[status] ?? { cls: "s-queued", dot: "dot--ring", label: status ?? "Unknown" };
}

export function ledgerTypeMeta(type) {
  return LEDGER_TYPE_META[type] ?? { cls: "s-queued", dot: "dot--ring", label: type ?? "Unknown" };
}
