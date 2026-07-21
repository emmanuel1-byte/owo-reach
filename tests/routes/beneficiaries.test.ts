import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { beneficiariesRoute } from "../../server/routes/beneficiaries";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { resetDb } from "../helpers/db";
import { insertRun, insertBeneficiary, getBeneficiary } from "../helpers/factories";

const app = new Hono();
app.route("/beneficiaries", beneficiariesRoute);

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(resetDb);
afterEach(() => __resetAuthTokenForTests());

describe("POST /beneficiaries/:id/otp", () => {
  it("400s when otp is missing", async () => {
    const res = await app.request("/beneficiaries/ben_x/otp", { method: "POST", ...json({}) });
    expect(res.status).toBe(400);
  });

  it("authorizes and returns ok", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "PENDING_AUTHORIZATION", monnifyReference: "owo-x" });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/validate-otp": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1, reference: "owo-x", status: "SUCCESS" } } }),
    });
    try {
      const res = await app.request(`/beneficiaries/${benId}/otp`, { method: "POST", ...json({ otp: "123456" }) });
      expect(res.status).toBe(200);
      expect((await getBeneficiary(benId))?.status).toBe("SENT");
    } finally {
      restore();
    }
  });

  it("422s when the beneficiary isn't awaiting authorization", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    const res = await app.request(`/beneficiaries/${benId}/otp`, { method: "POST", ...json({ otp: "123456" }) });
    expect(res.status).toBe(422);
  });
});

describe("POST /beneficiaries/:id/otp/resend", () => {
  it("resends and returns ok", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "PENDING_AUTHORIZATION", monnifyReference: "owo-x" });
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/resend-otp": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: {} } }),
    });
    try {
      const res = await app.request(`/beneficiaries/${benId}/otp/resend`, { method: "POST" });
      expect(res.status).toBe(200);
    } finally {
      restore();
    }
  });

  it("422s when the beneficiary isn't awaiting authorization", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    const res = await app.request(`/beneficiaries/${benId}/otp/resend`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/not PENDING_AUTHORIZATION/);
  });
});

describe("POST /beneficiaries/:id/reveal", () => {
  it("returns the clear paycode", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "CODE_ISSUED", monnifyReference: "owo-x" });
    const restore = mockMonnifyFetch({
      "/api/v1/paycode/owo-x/authorize": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { paycodeReference: "owo-x", beneficiaryName: "n", amount: 1, status: "PENDING", paycode: "4821059637" } } }),
    });
    try {
      const res = await app.request(`/beneficiaries/${benId}/reveal`, { method: "POST" });
      expect(res.status).toBe(200);
      expect((await res.json()).paycode).toBe("4821059637");
    } finally {
      restore();
    }
  });

  it("422s for a BANK-rail beneficiary", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "BANK" });
    const res = await app.request(`/beneficiaries/${benId}/reveal`, { method: "POST" });
    expect(res.status).toBe(422);
  });
});

describe("POST /beneficiaries/:id/cancel", () => {
  it("cancels and refunds the run", async () => {
    const runId = await insertRun({ totalAmountKobo: 100000 });
    const benId = await insertBeneficiary(runId, { status: "QUEUED", amountKobo: 100000, rail: "PAYCODE" });
    const res = await app.request(`/beneficiaries/${benId}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await getBeneficiary(benId))?.status).toBe("CANCELLED");
  });

  it("422s for a beneficiary that can't be cancelled", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "COMPLETED" });
    const res = await app.request(`/beneficiaries/${benId}/cancel`, { method: "POST" });
    expect(res.status).toBe(422);
  });
});

describe("POST /beneficiaries/:id/reissue", () => {
  it("reissues an expired paycode", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { rail: "PAYCODE", status: "EXPIRED", monnifyReference: "owo-x" });
    const restore = mockMonnifyFetch({
      "/api/v1/paycode": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { paycodeReference: "owo-x-r1", beneficiaryName: "n", amount: 1, status: "PENDING", paycode: "1" } } }),
    });
    try {
      const res = await app.request(`/beneficiaries/${benId}/reissue`, { method: "POST" });
      expect(res.status).toBe(200);
      expect((await getBeneficiary(benId))?.status).toBe("CODE_ISSUED");
    } finally {
      restore();
    }
  });

  it("422s for a beneficiary that isn't expired", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "CODE_ISSUED" });
    const res = await app.request(`/beneficiaries/${benId}/reissue`, { method: "POST" });
    expect(res.status).toBe(422);
  });
});

describe("POST /beneficiaries/:id/nudge", () => {
  it("returns the composed SMS", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "CODE_ISSUED", amountKobo: 100000 });
    const res = await app.request(`/beneficiaries/${benId}/nudge`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).sms).toContain("₦1,000");
  });

  it("422s for a beneficiary that isn't CODE_ISSUED", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { status: "SENT" });
    const res = await app.request(`/beneficiaries/${benId}/nudge`, { method: "POST" });
    expect(res.status).toBe(422);
  });
});
