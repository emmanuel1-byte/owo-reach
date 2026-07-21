import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { webhooksRoute } from "../../server/routes/webhooks";
import { getLedgerBalanceKobo, listLedgerEntries } from "../../server/services/ledger";
import { resetDb } from "../helpers/db";
import { insertRun, insertBeneficiary, getBeneficiary } from "../helpers/factories";

const app = new Hono();
app.route("/webhooks", webhooksRoute);

const SECRET = "dummy-secret"; // matches MONNIFY_SECRET_KEY set in tests/setup.ts
function sign(body: string): string {
  return createHmac("sha512", SECRET).update(body).digest("hex");
}
async function post(body: string, signature = sign(body)) {
  return app.request("/webhooks/monnify", { method: "POST", headers: { "monnify-signature": signature }, body });
}

beforeEach(resetDb);

describe("POST /webhooks/monnify", () => {
  it("401s on an invalid signature", async () => {
    const body = JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: {} });
    const res = await post(body, "not-a-valid-signature");
    expect(res.status).toBe(401);
  });

  it("401s when the signature header is missing entirely", async () => {
    const body = JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: {} });
    const res = await app.request("/webhooks/monnify", { method: "POST", body });
    expect(res.status).toBe(401);
  });

  it("completes a beneficiary on a SUCCESSFUL event", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT", monnifyReference: `owo-${"ben_x"}` });
    // reference has to match exactly what we insert — use the real generated id
    const real = await insertBeneficiary(runId, { status: "SENT" });
    const body = JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: { reference: `owo-${real}` } });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect((await getBeneficiary(real))?.status).toBe("COMPLETED");
    expect((await getBeneficiary(benId))?.status).toBe("SENT"); // untouched, different reference
  });

  it("fails a beneficiary on a FAILED event", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    const body = JSON.stringify({ eventType: "FAILED_DISBURSEMENT", eventData: { reference: `owo-${benId}` } });
    await post(body);
    expect((await getBeneficiary(benId))?.status).toBe("FAILED");
  });

  it("fails a beneficiary on a REVERSED event", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    const body = JSON.stringify({ eventType: "TRANSACTION_REVERSED", eventData: { reference: `owo-${benId}` } });
    await post(body);
    expect((await getBeneficiary(benId))?.status).toBe("FAILED");
  });

  it("completes a beneficiary on a paycode REDEEM event", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "CODE_ISSUED" });
    const body = JSON.stringify({ eventType: "PAYCODE_REDEEMED", eventData: { reference: `owo-${benId}` } });
    await post(body);
    expect((await getBeneficiary(benId))?.status).toBe("COMPLETED");
  });

  it("expires a beneficiary on an EXPIRE event", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "CODE_ISSUED" });
    const body = JSON.stringify({ eventType: "PAYCODE_EXPIRED", eventData: { reference: `owo-${benId}` } });
    await post(body);
    expect((await getBeneficiary(benId))?.status).toBe("EXPIRED");
  });

  it("cancels a beneficiary on a CANCEL event", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "CODE_ISSUED" });
    const body = JSON.stringify({ eventType: "PAYCODE_CANCELLED", eventData: { reference: `owo-${benId}` } });
    await post(body);
    expect((await getBeneficiary(benId))?.status).toBe("CANCELLED");
  });

  it("resolves a reissued reference (owo-<id>-r<timestamp>) back to the original beneficiary", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "CODE_ISSUED" });
    const body = JSON.stringify({ eventType: "SUCCESSFUL_TRANSACTION", eventData: { reference: `owo-${benId}-r1721300000000` } });
    await post(body);
    expect((await getBeneficiary(benId))?.status).toBe("COMPLETED");
  });

  it("is a no-op when the reference doesn't match any beneficiary", async () => {
    const body = JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: { reference: "owo-does_not_exist" } });
    const res = await post(body);
    expect(res.status).toBe(200);
  });

  it("is a no-op for an event with no owo- prefixed reference", async () => {
    const body = JSON.stringify({ eventType: "SOME_OTHER_EVENT", eventData: { reference: "not-ours-123" } });
    const res = await post(body);
    expect(res.status).toBe(200);
  });

  it("credits the ledger on a SUCCESSFUL_TRANSACTION for a deposit checkout", async () => {
    const body = JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { paymentReference: "owo-deposit-ldg_abc", paymentStatus: "PAID", amountPaid: 5000 },
    });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await getLedgerBalanceKobo()).toBe(500000); // ₦5,000 -> 500000 kobo
  });

  it("does not credit the ledger if paymentStatus isn't PAID", async () => {
    const body = JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { paymentReference: "owo-deposit-ldg_abc", paymentStatus: "PENDING", amountPaid: 5000 },
    });
    await post(body);
    expect(await getLedgerBalanceKobo()).toBe(0);
  });

  it("is idempotent against a webhook retry for the same deposit reference", async () => {
    const body = JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { paymentReference: "owo-deposit-ldg_abc", paymentStatus: "PAID", amountPaid: 5000 },
    });
    await post(body);
    await post(body);
    expect(await getLedgerBalanceKobo()).toBe(500000);
    expect((await listLedgerEntries()).filter((e) => e.type === "DEPOSIT")).toHaveLength(1);
  });

  it("does not fall through to beneficiary lookup for a deposit reference", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    const body = JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { paymentReference: "owo-deposit-ldg_abc", paymentStatus: "PAID", amountPaid: 100 },
    });
    await post(body);
    expect((await getBeneficiary(benId))?.status).toBe("SENT"); // untouched
  });
});
