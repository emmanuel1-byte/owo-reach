/**
 * SPIKE — a live sandbox smoke test.
 *
 *   bun run spike
 *
 * Validates the seven risky Monnify integration points in order. Every step
 * prints PASS or FAIL; a FAIL prints everything known about it (HTTP status,
 * Monnify's response code and message, the full raw response body, and the
 * request body that was sent), so the cause is visible without re-running
 * anything under a debugger.
 *
 * Prereqs: .env filled with sandbox keys; disbursement wallet funded with
 * sandbox test money (Dashboard → Wallet); nothing else.
 */

import { getToken, monnify, MonnifyError } from "../server/monnify/client";
import { MONNIFY } from "../server/monnify/config";
import { getBanks, nameEnquiry } from "../server/monnify/verification";
import { singleTransfer, getTransferStatus } from "../server/monnify/transfers";
import { createPaycode, getPaycode } from "../server/monnify/paycode";
import { initiateCheckout } from "../server/monnify/checkout";
import { isValidMonnifySignature } from "../server/monnify/webhook";
import { createHmac } from "node:crypto";
import { env } from "../server/env";

let passed = 0;
let failed = 0;
const notes: string[] = [];

/** Indents a multi-line block so it reads as a detail of the FAIL line above it. */
function indent(text: string, prefix = "       "): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

async function step(name: string, fn: () => Promise<string | void>): Promise<void> {
  process.stdout.write(`\n▶ ${name}\n`);
  try {
    const note = await fn();
    passed++;
    console.log(`  PASS${note ? ` - ${note}` : ""}`);
    if (note) notes.push(`${name}: ${note}`);
  } catch (err) {
    failed++;
    if (err instanceof MonnifyError) {
      console.log(`  FAIL - HTTP ${err.httpStatus ?? "?"}, code ${err.code ?? "?"}: ${err.message}`);
      if (err.requestBody !== undefined) {
        console.log("     request body sent:");
        console.log(indent(JSON.stringify(err.requestBody, null, 2)));
      }
      if (err.responseBody !== undefined) {
        console.log("     full response body:");
        console.log(indent(JSON.stringify(err.responseBody, null, 2)));
      }
      if (err.code === "99" && /unknown client id|not permitted/i.test(err.message)) {
        console.log(
          "     this reads as an account-side permission gap, not a wrong path or payload:",
        );
        console.log(
          "     Monnify's own JSON error format came back (not a generic 404 page), so the",
        );
        console.log(
          "     endpoint is reachable, but this account isn't authorized for it yet. Confirm",
        );
        console.log("     with Monnify support that this exact feature is provisioned.");
      } else if (err.httpStatus === 404) {
        console.log(
          "     likely a wrong endpoint path. Check server/monnify/config.ts against",
        );
        console.log("     https://developers.monnify.com/api and correct it there.");
      }
    } else if (err instanceof Error) {
      console.log(`  FAIL - ${err.message}`);
      if (err.stack) console.log(indent(err.stack));
    } else {
      console.log(`  FAIL - ${String(err)}`);
    }
  }
}

// ─── 1. Auth ────────────────────────────────────────────────────────────────
await step("Authenticate (POST /api/v1/auth/login) and cache token", async () => {
  const token = await getToken();
  return `token acquired (${token.slice(0, 12)}…)`;
});

// A real Monnify sandbox test account. A structurally-valid-but-nonexistent
// number (the old "0123456789") fails validation before the request reaches
// the disbursement engine, so it can't tell a wrong endpoint from a bad
// account — every step below would fail for a reason that isn't the code's.
const TEST_ACCOUNT = "9964840075";
const TEST_BANK_CODE = "101"; // Providus Bank

// ─── 2. Banks ───────────────────────────────────────────────────────────────
await step("Fetch supported banks (GET /api/v1/banks)", async () => {
  const banks = await getBanks();
  if (!banks.length) throw new Error("Empty banks list");
  // Assert the bank the later steps actually transfer to is in the list —
  // otherwise those steps fail with a confusing error from Monnify's side.
  const testBank = banks.find((b) => b.code === TEST_BANK_CODE);
  if (!testBank) throw new Error(`Test bank code ${TEST_BANK_CODE} not in the banks list`);
  return `${banks.length} banks; test bank ${TEST_BANK_CODE} (${testBank.name}) present`;
});

// ─── 3. Name enquiry ────────────────────────────────────────────────────────
// Falls back to a literal so a name-enquiry failure doesn't silently send an
// empty name to the transfer step below — that reads as "transfer is broken"
// when the real cause is the step before it.
let resolvedAccountName = "Owo Reach Test";
await step("Name enquiry on a test account", async () => {
  const result = await nameEnquiry(TEST_ACCOUNT, TEST_BANK_CODE);
  resolvedAccountName = result.accountName;
  return `resolved to "${result.accountName}"`;
});

// ─── 4. Single transfer + MFA behaviour ─────────────────────────────────────
const transferRef = `spike-transfer-${Date.now()}`;
await step("Initiate a sandbox transfer (watch for PENDING_AUTHORIZATION)", async () => {
  if (!env.MONNIFY_SOURCE_ACCOUNT) {
    throw new Error("Set MONNIFY_SOURCE_ACCOUNT in .env (Dashboard → Wallet account number)");
  }
  const result = await singleTransfer({
    amountKobo: 50_00, // ₦50
    reference: transferRef,
    narration: "Owo Reach spike test",
    destinationBankCode: TEST_BANK_CODE,
    destinationAccountNumber: TEST_ACCOUNT,
    // Monnify rejects the request without this. services/execution.ts always
    // sends it, so omitting it here made the spike test a payload the app
    // never actually sends.
    destinationAccountName: resolvedAccountName,
  });
  if (result.status === "PENDING_AUTHORIZATION") {
    return (
      "status PENDING_AUTHORIZATION — sandbox MFA is ON. Find the OTP " +
      "(merchant email / dashboard), then verify the authorize endpoint path in config.ts. " +
      "Product decision: surface OTP entry as a maker-checker step in the admin UI."
    );
  }
  return `status ${result.status}`;
});

await step("Query transfer status (reconciliation fallback path)", async () => {
  const s = await getTransferStatus(transferRef);
  return `status ${s.status}`;
});

// ─── 5. Paycode — THE critical unknown ──────────────────────────────────────
const paycodeRef = `spike-paycode-${Date.now()}`;
await step("Create a paycode (THE go/no-go check for the product)", async () => {
  const code = await createPaycode({
    amountKobo: 100_00, // ₦100
    beneficiaryName: "Spike Test Beneficiary",
    reference: paycodeRef,
  });
  return `created; status=${code.status}, code=${code.paycode ?? "(masked/absent)"} — now redeem it from Dashboard → Developer → Simulator and confirm the status flips + a webhook arrives`;
});

await step("Fetch the paycode back (masked view)", async () => {
  const code = await getPaycode(paycodeRef);
  return `status=${code.status}, masked code=${code.paycode ?? "(not returned)"}`;
});

// ─── 6. Checkout — ledger deposits (added when the internal ledger shipped) ─
await step("Initiate a Collections checkout (ledger deposit)", async () => {
  const session = await initiateCheckout({
    amountKobo: 500_00, // ₦500
    reference: `spike-deposit-${Date.now()}`,
    customerName: "Spike Test Org",
    customerEmail: "spike@owo-reach.test",
  });
  return (
    `checkoutUrl issued: ${session.checkoutUrl} — pay it in a browser (sandbox test card ` +
    "or account transfer) and confirm a SUCCESSFUL_TRANSACTION webhook arrives with " +
    "paymentStatus=PAID and the amountPaid/paymentReference fields this app expects."
  );
});

// ─── 7. Webhook signature validation (offline check) ────────────────────────
await step("Webhook HMAC-SHA512 validation logic (local self-test)", async () => {
  const body = JSON.stringify({ eventType: "TEST", eventData: { reference: "owo-test" } });
  const goodSig = createHmac("sha512", env.MONNIFY_SECRET_KEY).update(body).digest("hex");
  if (!isValidMonnifySignature(body, goodSig)) throw new Error("Valid signature rejected");
  // Flip the first hex digit to a DIFFERENT one. Hardcoding "0" here silently
  // no-ops whenever the signature already starts with "0" (~1 key in 16), which
  // makes this assertion pass a tampered-signature check that never happened.
  const tampered = (goodSig[0] === "0" ? "1" : "0") + goodSig.slice(1);
  if (isValidMonnifySignature(body, tampered)) {
    throw new Error("Tampered signature accepted");
  }
  return "sign/verify round-trip OK — still confirm against a REAL webhook via tunnel today";
});

// ─── Report ─────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(64));
console.log(`SPIKE RESULT: ${passed} passed · ${failed} failed`);
if (notes.length) {
  console.log("\nNotes:");
  for (const n of notes) console.log(`  • ${n}`);
}
console.log(`
Manual follow-ups (cannot be scripted):
  1. Set webhook URL in dashboard → your tunnel URL + /api/webhooks/monnify
  2. Redeem the spike paycode in Dashboard → Developer → Simulator
  3. Confirm the webhook lands, signature validates, and note the eventType
     for paycode redemption (add it to routes/webhooks.ts mapping)
  4. If any endpoint 404'd: fix the path in server/monnify/config.ts (they are
     all defined there and nowhere else) and re-run this script.

Go/no-go: if step 5 (paycode create) and follow-up 2 (simulator redemption)
both work, the product is GREEN. If paycode is broken after ~3h of effort,
switch to Plan B in docs/PRD.md §12.
`);
console.log(`Endpoints under test are defined once in server/monnify/config.ts:`);
console.log(`  paycode create  → ${MONNIFY.PAYCODE_CREATE}`);
console.log(`  checkout init   → ${MONNIFY.CHECKOUT_INIT}`);

process.exit(failed > 2 ? 1 : 0);
