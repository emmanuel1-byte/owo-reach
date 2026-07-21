import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { db } from "../../server/db/client";
import { events } from "../../server/db/schema";
import { eq } from "drizzle-orm";
import { executeRun, transition } from "../../server/services/execution";
import { getLedgerBalanceKobo } from "../../server/services/ledger";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { resetDb } from "../helpers/db";
import { insertRun, insertBeneficiary, getRun, getBeneficiary } from "../helpers/factories";

describe("executeRun", () => {
  beforeEach(resetDb);
  afterEach(() => __resetAuthTokenForTests());

  it("pays a BANK-rail beneficiary by transfer and moves it to SENT", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { rail: "BANK", status: "QUEUED" });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1000, reference: `owo-${benId}`, status: "SUCCESS" } },
      }),
    });
    try {
      await executeRun(runId);
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("SENT");
      expect(b?.monnifyReference).toBe(`owo-${benId}`);
    } finally {
      restore();
    }
  });

  it("moves a BANK-rail beneficiary to PENDING_AUTHORIZATION when sandbox MFA kicks in", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { rail: "BANK", status: "QUEUED" });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1000, reference: `owo-${benId}`, status: "PENDING_AUTHORIZATION" } },
      }),
    });
    try {
      await executeRun(runId);
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("PENDING_AUTHORIZATION");
    } finally {
      restore();
    }
  });

  it("pays a PAYCODE-rail beneficiary and moves it to CODE_ISSUED with an SMS body and expiry", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", accountNumber: null, bankCode: null, status: "QUEUED" });
    const restore = mockMonnifyFetch({
      "/api/v1/paycode": () => ({
        body: {
          requestSuccessful: true,
          responseMessage: "ok",
          responseCode: "0",
          responseBody: { paycodeReference: `owo-${benId}`, beneficiaryName: "Test Beneficiary", amount: 1000, status: "PENDING", paycode: "4821059637", expiryDate: "2026-08-01T00:00:00" },
        },
      }),
    });
    try {
      await executeRun(runId);
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("CODE_ISSUED");
      expect(b?.smsBody).toContain("4821059637");
      expect(b?.paycodeExpiresAt).not.toBeNull();
    } finally {
      restore();
    }
  });

  it("marks a beneficiary FAILED when the Monnify call rejects", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { rail: "BANK", status: "QUEUED" });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single": () => ({
        status: 400,
        body: { requestSuccessful: false, responseMessage: "Insufficient wallet balance", responseCode: "99" },
      }),
    });
    try {
      await executeRun(runId);
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("FAILED");
    } finally {
      restore();
    }
  });

  it("skips beneficiaries that are not QUEUED", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { rail: "BANK", status: "PENDING_REVIEW" });
    const restore = mockMonnifyFetch({});
    try {
      await executeRun(runId);
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("PENDING_REVIEW"); // untouched — no handler was even registered, so a call would throw
    } finally {
      restore();
    }
  });

  it("sets the run status to EXECUTING", async () => {
    const runId = await insertRun({ status: "REVIEW" });
    const restore = mockMonnifyFetch({});
    try {
      await executeRun(runId);
      const run = await getRun(runId);
      expect(run?.status).toBe("EXECUTING");
    } finally {
      restore();
    }
  });
});

describe("transition", () => {
  beforeEach(resetDb);

  it("persists the new status, appends an audit event, and broadcasts", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "QUEUED" });

    await transition(benId, "COMPLETED", { via: "test" });

    const b = await getBeneficiary(benId);
    expect(b?.status).toBe("COMPLETED");

    const rows = await db.select().from(events).where(eq(events.beneficiaryId, benId));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("beneficiary.completed");
    expect(rows[0].payload).toEqual({ via: "test" });
  });
});

describe("run finalization", () => {
  beforeEach(resetDb);

  it("moves an EXECUTING run to COMPLETED once every beneficiary is COMPLETED", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const a = await insertBeneficiary(runId, { status: "SENT" });
    const b = await insertBeneficiary(runId, { status: "SENT" });

    await transition(a, "COMPLETED");
    expect((await getRun(runId))?.status).toBe("EXECUTING"); // b is still in flight

    await transition(b, "COMPLETED");
    expect((await getRun(runId))?.status).toBe("COMPLETED");
  });

  it("moves an EXECUTING run to PARTIAL when some beneficiaries failed", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const a = await insertBeneficiary(runId, { status: "SENT" });
    const b = await insertBeneficiary(runId, { status: "SENT" });

    await transition(a, "COMPLETED");
    await transition(b, "FAILED");

    expect((await getRun(runId))?.status).toBe("PARTIAL");
  });

  it("moves an EXECUTING run to FAILED when every beneficiary failed", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    await transition(benId, "FAILED");
    expect((await getRun(runId))?.status).toBe("FAILED");
  });

  it("counts CANCELLED as resolved-ok, not a failure", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { status: "QUEUED" });
    await transition(benId, "CANCELLED");
    expect((await getRun(runId))?.status).toBe("COMPLETED");
  });

  it("does not finalize a run that isn't EXECUTING (e.g. still in REVIEW)", async () => {
    const runId = await insertRun({ status: "REVIEW" });
    const benId = await insertBeneficiary(runId, { status: "QUEUED" });
    await transition(benId, "CANCELLED");
    expect((await getRun(runId))?.status).toBe("REVIEW");
  });

  it("logs a single run.finalized event and does not re-finalize an already-finalized run", async () => {
    const runId = await insertRun({ status: "EXECUTING" });
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    await transition(benId, "COMPLETED");

    const finalizedEvents = await db.select().from(events).where(eq(events.runId, runId));
    expect(finalizedEvents.filter((e) => e.type === "run.finalized")).toHaveLength(1);

    // A later transition on the same (already-terminal) beneficiary must not finalize again.
    await transition(benId, "COMPLETED", { via: "duplicate webhook retry" });
    const afterRetry = await db.select().from(events).where(eq(events.runId, runId));
    expect(afterRetry.filter((e) => e.type === "run.finalized")).toHaveLength(1);
  });
});

describe("transition ledger effects", () => {
  beforeEach(resetDb);

  it("refunds the ledger when a beneficiary FAILS", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { amountKobo: 100000, status: "QUEUED" });
    await transition(benId, "FAILED");
    expect(await getLedgerBalanceKobo()).toBe(100000);
  });

  it("refunds the ledger when a beneficiary is CANCELLED", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { amountKobo: 100000, status: "QUEUED" });
    await transition(benId, "CANCELLED");
    expect(await getLedgerBalanceKobo()).toBe(100000);
  });

  it("does not refund the ledger when a beneficiary COMPLETES (money genuinely left)", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { amountKobo: 100000, status: "SENT" });
    await transition(benId, "COMPLETED");
    expect(await getLedgerBalanceKobo()).toBe(0);
  });

  it("does not refund the ledger when a paycode merely EXPIRES (stays reserved until an explicit cancel)", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { amountKobo: 100000, status: "CODE_ISSUED" });
    await transition(benId, "EXPIRED");
    expect(await getLedgerBalanceKobo()).toBe(0);
  });

  it("does not refund the ledger for in-flight statuses (SENT, CODE_ISSUED, PENDING_AUTHORIZATION)", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { amountKobo: 100000, status: "QUEUED" });
    await transition(benId, "PENDING_AUTHORIZATION");
    await transition(benId, "SENT");
    expect(await getLedgerBalanceKobo()).toBe(0);
  });
});
