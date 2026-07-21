import { MonnifyError } from "../monnify/client";

/**
 * Turns an internal error into something an ops admin can act on.
 *
 * MonnifyError carries the endpoint path and the provider's own wording
 * ("/api/v1/disbursements/account/validate → Invalid account details
 * supplied") because that is what you want in a log. It is not what you want
 * on a review screen next to somebody's name, so every user-facing surface
 * (flags, API error bodies) passes through here first.
 *
 * The original is never discarded — callers log `err` and send this.
 */

/** Matched against the provider's message, longest-specific first. */
const MONNIFY_MESSAGE_PATTERNS: [RegExp, string][] = [
  [
    /invalid account details|could not resolve|account.*not.*found/i,
    "That account number isn't valid for the bank selected. Check both and try again.",
  ],
  [
    /not permitted to access this functionality|unknown client id/i,
    "This feature isn't enabled on your Monnify account yet. Contact Monnify support to switch it on.",
  ],
  [
    /destination account name is required/i,
    "The recipient's account name is missing, so the transfer can't be sent.",
  ],
  [
    /insufficient|balance too low/i,
    "The Monnify wallet doesn't have enough to cover this. Top it up and try again.",
  ],
  [
    /duplicate.*reference|already exists/i,
    "This payment was already sent — it hasn't been sent twice.",
  ],
  [
    /invalid.*otp|otp.*incorrect|otp.*expired/i,
    "That code wasn't accepted. Request a new one and try again.",
  ],
  [
    /transaction not found|could not find disbursement/i,
    "Monnify has no record of this payment yet. It may still be processing.",
  ],
];

/** Non-Monnify failures that still reach a user. */
const GENERIC_PATTERNS: [RegExp, string][] = [
  [
    /fetch failed|network|econnrefused|enotfound|socket|timeout|etimedout/i,
    "Couldn't reach the payment provider. Check your connection and try again.",
  ],
  [
    // Billing before rate-limiting: an out-of-credit account often reports
    // "quota", and topping up is a different fix from waiting.
    /credit balance is too low|plans & billing|billing|payment required|insufficient credit/i,
    "The AI service has run out of credit. Top up your provider account, or switch AI_PROVIDER in .env, then try again.",
  ],
  [
    /invalid.*api key|unauthorized|authentication_error|401/i,
    "The AI service rejected the API key. Check AI_API_KEY in .env and restart the server.",
  ],
  [
    /429|rate limit|quota|resource_exhausted/i,
    "The AI service is temporarily rate-limited. Wait a moment and try again.",
  ],
  [
    /no beneficiaries could be extracted/i,
    "No beneficiaries could be read from that list. Check it includes a name, phone number and amount per person.",
  ],
];

export function humanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (err instanceof MonnifyError) {
    for (const [pattern, message] of MONNIFY_MESSAGE_PATTERNS) {
      if (pattern.test(raw)) return message;
    }
    // Unmapped provider error: strip the leading "<path> → " so at least the
    // endpoint doesn't surface, and keep the provider's own sentence.
    const withoutPath = raw.replace(/^\/\S*\s*→\s*/, "").trim();
    return withoutPath || "The payment provider rejected this request.";
  }

  for (const [pattern, message] of GENERIC_PATTERNS) {
    if (pattern.test(raw)) return message;
  }

  // Anything genuinely unexpected: say so plainly rather than leaking a stack
  // or a class name the reader can do nothing with.
  return "Something went wrong on our side. Try again, and tell an engineer if it keeps happening.";
}
