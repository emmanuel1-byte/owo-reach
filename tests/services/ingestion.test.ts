import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createRunFromRawInput } from "../../server/services/ingestion";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { anthropicCreateMock, resetAnthropicMock } from "../helpers/ai";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { resetDb } from "../helpers/db";
import { getRun } from "../helpers/factories";

const BANKS = [{ name: "Guaranty Trust Bank", code: "058" }];

function mockAiExtraction(beneficiaries: unknown[]): void {
  anthropicCreateMock.mockImplementationOnce(async () => ({
    content: [{ type: "text", text: JSON.stringify({ beneficiaries }) }],
  }));
}

function mockBriefText(text = "Pre-flight brief."): void {
  anthropicCreateMock.mockImplementationOnce(async () => ({ content: [{ type: "text", text }] }));
}

beforeEach(() => {
  resetDb();
  resetAnthropicMock();
});
afterEach(() => __resetAuthTokenForTests());

describe("createRunFromRawInput", () => {
  it("creates a REVIEW run with resolved rails, totals, and a brief", async () => {
    mockAiExtraction([
      { name: "Chidi Okonkwo", phone: "+2348031234567", amountKobo: 2500000, accountNumber: "0123456789", bankNameRaw: "GTBank" },
      { name: "Amina Yusuf", phone: "+2348029876543", amountKobo: 2000000, accountNumber: null, bankNameRaw: null },
    ]);
    mockBriefText("2 recipients, one bank transfer and one paycode.");

    const restore = mockMonnifyFetch({
      "/api/v1/banks": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: BANKS } }),
      "/api/v1/disbursements/account/validate": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { accountNumber: "0123456789", accountName: "CHIDI OKONKWO", bankCode: "058" } },
      }),
    });
    try {
      const { run, beneficiaries } = await createRunFromRawInput("July stipends", "raw text");

      expect(run.status).toBe("REVIEW");
      expect(run.totalAmountKobo).toBe(4500000);
      expect(run.totalFeesKobo).toBe(10000); // one PAYCODE beneficiary × ₦100
      expect(run.preflightBrief).toBe("2 recipients, one bank transfer and one paycode.");

      const bank = beneficiaries.find((b) => b.name === "Chidi Okonkwo")!;
      expect(bank.rail).toBe("BANK");
      expect(bank.bankCode).toBe("058");
      expect(bank.nameMatch).toBe(true);
      expect(bank.flags).toEqual([]);

      const paycode = beneficiaries.find((b) => b.name === "Amina Yusuf")!;
      expect(paycode.rail).toBe("PAYCODE");
      expect(paycode.bankCode).toBeNull();

      const persisted = await getRun(run.id);
      expect(persisted?.totalAmountKobo).toBe(4500000);
    } finally {
      restore();
    }
  });

  it("flags beneficiaries sharing a phone number as possible duplicates", async () => {
    mockAiExtraction([
      { name: "Ngozi Eze", phone: "+2348055556666", amountKobo: 1800000, accountNumber: null, bankNameRaw: null },
      { name: "Ngozi Eze", phone: "+2348055556666", amountKobo: 1800000, accountNumber: null, bankNameRaw: null },
    ]);
    mockBriefText();
    const restore = mockMonnifyFetch({ "/api/v1/banks": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: [] } }) });
    try {
      const { beneficiaries } = await createRunFromRawInput("t", "raw");
      expect(beneficiaries.every((b) => b.flags?.some((f) => f.includes("duplicate")))).toBe(true);
    } finally {
      restore();
    }
  });

  it("flags an amount more than 3x the run average when there are more than two beneficiaries", async () => {
    // With n beneficiaries, an outlier can only clear 3x the (self-inclusive)
    // average once enough smaller amounts dilute its own weight in that
    // average — three items alone can never do it, hence four here.
    mockAiExtraction([
      { name: "A", phone: "1", amountKobo: 10000, accountNumber: null, bankNameRaw: null },
      { name: "B", phone: "2", amountKobo: 10000, accountNumber: null, bankNameRaw: null },
      { name: "C", phone: "3", amountKobo: 10000, accountNumber: null, bankNameRaw: null },
      { name: "D", phone: "4", amountKobo: 1000000, accountNumber: null, bankNameRaw: null },
    ]);
    mockBriefText();
    const restore = mockMonnifyFetch({ "/api/v1/banks": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: [] } }) });
    try {
      const { beneficiaries } = await createRunFromRawInput("t", "raw");
      const outlier = beneficiaries.find((b) => b.name === "D")!;
      expect(outlier.flags?.some((f) => f.includes("3x the run average"))).toBe(true);
      expect(beneficiaries.find((b) => b.name === "A")!.flags).toEqual([]);
    } finally {
      restore();
    }
  });

  it("flags a bank-record name mismatch instead of silently paying", async () => {
    mockAiExtraction([{ name: "Tunde Bakare", phone: "1", amountKobo: 2500000, accountNumber: "0987654321", bankNameRaw: "Zenith" }]);
    mockBriefText();
    const restore = mockMonnifyFetch({
      "/api/v1/banks": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: [{ name: "Zenith Bank", code: "057" }] } }),
      "/api/v1/disbursements/account/validate": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { accountNumber: "0987654321", accountName: "OLUWASEUN ADEBAYO", bankCode: "057" } },
      }),
    });
    try {
      const { beneficiaries } = await createRunFromRawInput("t", "raw");
      expect(beneficiaries[0].nameMatch).toBe(false);
      expect(beneficiaries[0].flags?.some((f) => f.includes("does not match"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("flags an unverifiable account instead of throwing", async () => {
    mockAiExtraction([{ name: "A", phone: "1", amountKobo: 100000, accountNumber: "0000000000", bankNameRaw: "GTBank" }]);
    mockBriefText();
    const restore = mockMonnifyFetch({
      "/api/v1/banks": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: BANKS } }),
      "/api/v1/disbursements/account/validate": () => ({ status: 400, body: { requestSuccessful: false, responseMessage: "Account not found", responseCode: "99" } }),
    });
    try {
      const { beneficiaries } = await createRunFromRawInput("t", "raw");
      expect(beneficiaries[0].flags?.some((f) => f.includes("could not be verified"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("falls back to PAYCODE rail when the bank name can't be resolved", async () => {
    mockAiExtraction([{ name: "A", phone: "1", amountKobo: 100000, accountNumber: "0123456789", bankNameRaw: "Some Bank Nobody Has Heard Of" }]);
    mockBriefText();
    const restore = mockMonnifyFetch({ "/api/v1/banks": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: BANKS } }) });
    try {
      const { beneficiaries } = await createRunFromRawInput("t", "raw");
      expect(beneficiaries[0].rail).toBe("PAYCODE");
    } finally {
      restore();
    }
  });

  it("throws when the AI extracts nothing", async () => {
    mockAiExtraction([]);
    await expect(createRunFromRawInput("t", "raw")).rejects.toThrow(/No beneficiaries/);
  });
});
