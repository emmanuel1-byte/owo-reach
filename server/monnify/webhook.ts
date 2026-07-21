import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Monnify signs every webhook: HMAC-SHA512 of the RAW request body using your
 * client secret, sent in the `monnify-signature` header.
 *
 * Two rules that prevent 90% of webhook bugs:
 *  1. Compute over the raw body BYTES, before any JSON parsing.
 *  2. Compare with a timing-safe equality check.
 */
export function isValidMonnifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const computed = createHmac("sha512", env.MONNIFY_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The event envelope Monnify posts. eventType examples:
 *  SUCCESSFUL_TRANSACTION, SUCCESSFUL_DISBURSEMENT, FAILED_DISBURSEMENT, ... */
export interface MonnifyWebhookEvent {
  eventType: string;
  eventData: Record<string, unknown> & {
    reference?: string;
    transactionReference?: string;
    paymentReference?: string;
    status?: string;
    amountPaid?: number; // naira, on SUCCESSFUL_TRANSACTION (Collections) events
    paymentStatus?: string; // "PAID", on SUCCESSFUL_TRANSACTION events
  };
}
