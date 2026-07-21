import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { reconcileStaleBeneficiaries } from "../../server/services/reconciliation";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { resetDb } from "../helpers/db";
import { insertRun, insertBeneficiary, getBeneficiary } from "../helpers/factories";

const STALE = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago > the 5 minute cutoff
const FRESH = new Date(); // just now

beforeEach(resetDb);
afterEach(() => __resetAuthTokenForTests());

describe("reconcileStaleBeneficiaries", () => {
  it("completes a stale SENT beneficiary whose transfer succeeded", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT", monnifyReference: "owo-x", updatedAt: STALE });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/summary": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1, reference: "owo-x", status: "SUCCESS" } },
      }),
    });
    try {
      await reconcileStaleBeneficiaries();
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("COMPLETED");
    } finally {
      restore();
    }
  });

  it("fails a stale SENT beneficiary whose transfer was reversed", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT", monnifyReference: "owo-x", updatedAt: STALE });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/summary": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1, reference: "owo-x", status: "REVERSED" } },
      }),
    });
    try {
      await reconcileStaleBeneficiaries();
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("FAILED");
    } finally {
      restore();
    }
  });

  it("leaves a SENT beneficiary untouched if it isn't stale yet", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT", monnifyReference: "owo-x", updatedAt: FRESH });
    const restore = mockMonnifyFetch({}); // no handler — a call here would throw and fail the test
    try {
      await reconcileStaleBeneficiaries();
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("SENT");
    } finally {
      restore();
    }
  });

  it("expires a CODE_ISSUED beneficiary past its paycode expiry", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, {
      status: "CODE_ISSUED",
      updatedAt: STALE,
      paycodeExpiresAt: new Date(Date.now() - 60_000),
    });
    await reconcileStaleBeneficiaries();
    const b = await getBeneficiary(benId);
    expect(b?.status).toBe("EXPIRED");
  });

  it("does not expire a CODE_ISSUED beneficiary before its paycode expiry", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, {
      status: "CODE_ISSUED",
      updatedAt: STALE,
      paycodeExpiresAt: new Date(Date.now() + 3600_000),
    });
    await reconcileStaleBeneficiaries();
    const b = await getBeneficiary(benId);
    expect(b?.status).toBe("CODE_ISSUED");
  });

  it("swallows a transient lookup failure and leaves the beneficiary for the next sweep", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT", monnifyReference: "owo-x", updatedAt: STALE });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/summary": () => ({ status: 500, body: { requestSuccessful: false, responseMessage: "boom", responseCode: "500" } }),
    });
    try {
      await expect(reconcileStaleBeneficiaries()).resolves.toBeUndefined();
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("SENT");
    } finally {
      restore();
    }
  });
});
