/**
 * Every Monnify endpoint path lives here and nowhere else.
 *
 * Sources: developers.monnify.com docs + API reference (developers.monnify.com/api).
 * Paths marked VERIFY are assembled from the docs' descriptions but were not
 * confirmed against a live sandbox call yet — the day-1 spike (`bun run spike`)
 * exercises each one and tells you exactly which need correcting.
 */
export const MONNIFY = {
  AUTH_LOGIN: "/api/v1/auth/login",

  // Verification
  BANKS: "/api/v1/banks",
  NAME_ENQUIRY: "/api/v1/disbursements/account/validate", // ?accountNumber=&bankCode=

  // Disbursements (v2). NOTE: sandbox has MFA enabled by default — a transfer
  // may return status PENDING_AUTHORIZATION and require the OTP endpoint below.
  TRANSFER_SINGLE: "/api/v2/disbursements/single",
  TRANSFER_SINGLE_STATUS: "/api/v2/disbursements/single/summary", // ?reference=
  TRANSFER_AUTHORIZE: "/api/v2/disbursements/single/validate-otp", // VERIFY exact path
  TRANSFER_RESEND_OTP: "/api/v2/disbursements/single/resend-otp", // VERIFY exact path
  TRANSFER_BULK: "/api/v2/disbursements/batch",

  // Paycode — offline cash pay-outs (VERIFY all paths against
  // developers.monnify.com/api#tag/paycode-api during the spike).
  PAYCODE_CREATE: "/api/v1/paycode",
  PAYCODE_GET: (ref: string) => `/api/v1/paycode/${ref}`, // returns masked code
  PAYCODE_CLEAR: (ref: string) => `/api/v1/paycode/${ref}/authorize`, // clear view, authorized
  PAYCODE_CANCEL: (ref: string) => `/api/v1/paycode/${ref}`, // DELETE
  PAYCODE_FETCH: "/api/v1/paycode", // ?from=&to= list within a period

  // Collections — one-time payment (ledger deposits). VERIFY: path and field
  // names are confirmed against Monnify's docs, but this specific call has
  // not been exercised against a live sandbox response — worth adding to the
  // day-1 spike before relying on it in a demo. Response includes a
  // checkoutUrl; the paying customer completes payment there, and Monnify
  // fires a SUCCESSFUL_TRANSACTION webhook (a different event type from the
  // disbursement ones above) with eventData.paymentReference,
  // eventData.amountPaid, eventData.paymentStatus.
  CHECKOUT_INIT: "/api/v1/merchant/transactions/init-transaction",
} as const;

export interface MonnifyResponse<T> {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: T;
}
