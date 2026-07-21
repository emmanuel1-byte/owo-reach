import { monnify } from "./client";
import { MONNIFY } from "./config";
import { koboToNaira } from "../lib/money";

/**
 * Paycode: Monnify-exclusive offline cash pay-outs. A 10-digit code the
 * recipient shows to any Moniepoint agent to withdraw cash. Flat ₦100 fee.
 * Default expiry 24h if none set. Statuses: PENDING | SUCCESS | EXPIRED | CANCELLED.
 *
 * Sandbox: redemption is simulated from the dashboard (Developer → Simulator).
 * Endpoint paths carry VERIFY notes in config.ts — run `bun run spike` first.
 */

export interface Paycode {
  paycodeReference: string;
  paycode?: string; // masked in GET; clear only via getClearPaycode
  beneficiaryName: string;
  amount: number; // naira
  status: "PENDING" | "SUCCESS" | "EXPIRED" | "CANCELLED";
  expiryDate?: string;
  createdDate?: string;
}

export async function createPaycode(input: {
  amountKobo: number;
  beneficiaryName: string;
  reference: string;
  /** ISO date-time; defaults to 24h if omitted. We default to 72h for reach. */
  expiryDate?: string;
}): Promise<Paycode> {
  const expiry =
    input.expiryDate ?? new Date(Date.now() + 72 * 3600 * 1000).toISOString().slice(0, 19);
  return monnify<Paycode>(MONNIFY.PAYCODE_CREATE, {
    body: {
      amount: koboToNaira(input.amountKobo),
      beneficiaryName: input.beneficiaryName,
      paycodeReference: input.reference,
      expiryDate: expiry,
    },
  });
}

/** Masked view — safe to store/display. */
export async function getPaycode(reference: string) {
  return monnify<Paycode>(MONNIFY.PAYCODE_GET(reference));
}

/**
 * Clear (unmasked) view. Requires authorization per Monnify docs.
 * Every call to this MUST be written to the audit log by the caller —
 * revealing a live cash code is a sensitive action.
 */
export async function getClearPaycode(reference: string) {
  return monnify<Paycode>(MONNIFY.PAYCODE_CLEAR(reference));
}

/** Cancel an unredeemed code (e.g. expired and being reissued). */
export async function cancelPaycode(reference: string) {
  return monnify<unknown>(MONNIFY.PAYCODE_CANCEL(reference), { method: "DELETE" });
}

export async function fetchPaycodes(fromISO: string, toISO: string) {
  return monnify<Paycode[]>(MONNIFY.PAYCODE_FETCH, { query: { from: fromISO, to: toISO } });
}
