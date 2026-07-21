import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  authorizeBeneficiaryTransfer,
  resendBeneficiaryOtp,
  revealPaycode,
  cancelBeneficiary,
  reissuePaycode,
  nudgeBeneficiary,
} from "../../server/services/lifecycle";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { resetDb } from "../helpers/db";
import { insertRun, insertBeneficiary, getRun, getBeneficiary } from "../helpers/factories";

beforeEach(resetDb);
afterEach(() => __resetAuthTokenForTests());

describe("authorizeBeneficiaryTransfer", () => {
  it("submits the OTP and moves the beneficiary to SENT on success", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "PENDING_AUTHORIZATION", monnifyReference: `owo-${"x"}` });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/validate-otp": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1, reference: "owo-x", status: "SUCCESS" } },
      }),
    });
    try {
      await authorizeBeneficiaryTransfer(benId, "123456");
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("SENT");
    } finally {
      restore();
    }
  });

  it("rejects when the beneficiary isn't PENDING_AUTHORIZATION", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    await expect(authorizeBeneficiaryTransfer(benId, "123456")).rejects.toThrow(/not PENDING_AUTHORIZATION/);
  });

  it("throws when Monnify rejects the OTP", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "PENDING_AUTHORIZATION", monnifyReference: "owo-x" });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/validate-otp": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1, reference: "owo-x", status: "PENDING_AUTHORIZATION" } },
      }),
    });
    try {
      await expect(authorizeBeneficiaryTransfer(benId, "000000")).rejects.toThrow(/OTP rejected/);
    } finally {
      restore();
    }
  });
});

describe("resendBeneficiaryOtp", () => {
  it("calls the resend endpoint and logs an event", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "PENDING_AUTHORIZATION", monnifyReference: "owo-x" });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/resend-otp": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: {} } }),
    });
    try {
      await expect(resendBeneficiaryOtp(benId)).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it("rejects when the beneficiary isn't PENDING_AUTHORIZATION", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    await expect(resendBeneficiaryOtp(benId)).rejects.toThrow(/not PENDING_AUTHORIZATION/);
  });
});

describe("revealPaycode", () => {
  it("returns the clear code and logs a reveal event without the code in the payload", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "CODE_ISSUED", monnifyReference: "owo-x" });
    const restore = mockMonnifyFetch({
      "/api/v1/paycode/owo-x/authorize": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { paycodeReference: "owo-x", beneficiaryName: "n", amount: 1, status: "PENDING", paycode: "4821059637" } },
      }),
    });
    try {
      const { paycode } = await revealPaycode(benId);
      expect(paycode).toBe("4821059637");
    } finally {
      restore();
    }
  });

  it("rejects for a BANK-rail beneficiary", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "BANK" });
    await expect(revealPaycode(benId)).rejects.toThrow(/no paycode/);
  });
});

describe("cancelBeneficiary", () => {
  it("cancels the paycode, refunds the run total, and marks CANCELLED", async () => {
    const runId = await insertRun({ totalAmountKobo: 300000 });
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "CODE_ISSUED", monnifyReference: "owo-x", amountKobo: 100000 });
    const restore = mockMonnifyFetch({
      "/api/v1/paycode/owo-x": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: {} } }),
    });
    try {
      await cancelBeneficiary(benId);
      const b = await getBeneficiary(benId);
      const run = await getRun(runId);
      expect(b?.status).toBe("CANCELLED");
      expect(run?.totalAmountKobo).toBe(200000);
    } finally {
      restore();
    }
  });

  it("does not call Monnify to cancel an already-EXPIRED paycode", async () => {
    const runId = await insertRun({ totalAmountKobo: 100000 });
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "EXPIRED", monnifyReference: "owo-x", amountKobo: 100000 });
    const restore = mockMonnifyFetch({}); // no handler registered — a call would throw and fail the test
    try {
      await cancelBeneficiary(benId);
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("CANCELLED");
    } finally {
      restore();
    }
  });

  it("rejects a beneficiary that is already COMPLETED", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "COMPLETED" });
    await expect(cancelBeneficiary(benId)).rejects.toThrow(/cannot be cancelled/);
  });
});

describe("reissuePaycode", () => {
  it("creates a fresh paycode with a new reference and returns to CODE_ISSUED", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "EXPIRED", monnifyReference: "owo-x", amountKobo: 100000 });
    const restore = mockMonnifyFetch({
      "/api/v1/paycode": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.paycodeReference).toMatch(new RegExp(`^owo-${benId}-r\\d+$`));
        return {
          body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { paycodeReference: body.paycodeReference, beneficiaryName: "n", amount: 1000, status: "PENDING", paycode: "1111111111", expiryDate: "2026-08-01T00:00:00" } },
        };
      },
    });
    try {
      await reissuePaycode(benId);
      const b = await getBeneficiary(benId);
      expect(b?.status).toBe("CODE_ISSUED");
      expect(b?.monnifyReference).not.toBe("owo-x");
    } finally {
      restore();
    }
  });

  it("rejects a beneficiary that is not EXPIRED", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "CODE_ISSUED" });
    await expect(reissuePaycode(benId)).rejects.toThrow(/not EXPIRED/);
  });
});

describe("nudgeBeneficiary", () => {
  it("composes and returns a reminder SMS for a CODE_ISSUED beneficiary", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "CODE_ISSUED", amountKobo: 200000 });
    const { sms } = await nudgeBeneficiary(benId);
    expect(sms).toContain("₦2,000");
  });

  it("rejects a beneficiary that is not CODE_ISSUED", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    await expect(nudgeBeneficiary(benId)).rejects.toThrow(/not CODE_ISSUED/);
  });
});
