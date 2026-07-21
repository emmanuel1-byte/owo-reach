import { describe, it, expect, afterEach } from "bun:test";
import { singleTransfer, authorizeTransfer, resendTransferOtp, getTransferStatus } from "../../server/monnify/transfers";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";

describe("monnify/transfers", () => {
  afterEach(() => {
    __resetAuthTokenForTests();
  });

  it("singleTransfer converts kobo to naira decimals and passes the reference/narration through", async () => {
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.amount).toBe(250); // 25000 kobo -> ₦250
        expect(body.reference).toBe("owo-ben_1");
        expect(body.destinationBankCode).toBe("058");
        expect(body.async).toBe(true);
        return {
          body: {
            requestSuccessful: true,
            responseMessage: "success",
            responseCode: "0",
            responseBody: { amount: 250, reference: "owo-ben_1", status: "SUCCESS" },
          },
        };
      },
    });
    try {
      const result = await singleTransfer({
        amountKobo: 25000,
        reference: "owo-ben_1",
        narration: "Stipend",
        destinationBankCode: "058",
        destinationAccountNumber: "0123456789",
      });
      expect(result.status).toBe("SUCCESS");
    } finally {
      restore();
    }
  });

  it("singleTransfer surfaces PENDING_AUTHORIZATION status from sandbox MFA", async () => {
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single": () => ({
        body: {
          requestSuccessful: true,
          responseMessage: "success",
          responseCode: "0",
          responseBody: { amount: 250, reference: "owo-ben_1", status: "PENDING_AUTHORIZATION" },
        },
      }),
    });
    try {
      const result = await singleTransfer({
        amountKobo: 25000,
        reference: "owo-ben_1",
        narration: "Stipend",
        destinationBankCode: "058",
        destinationAccountNumber: "0123456789",
      });
      expect(result.status).toBe("PENDING_AUTHORIZATION");
    } finally {
      restore();
    }
  });

  it("authorizeTransfer posts the reference and authorizationCode", async () => {
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/validate-otp": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body).toEqual({ reference: "owo-ben_1", authorizationCode: "123456" });
        return {
          body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: { amount: 250, reference: "owo-ben_1", status: "SUCCESS" } },
        };
      },
    });
    try {
      const result = await authorizeTransfer("owo-ben_1", "123456");
      expect(result.status).toBe("SUCCESS");
    } finally {
      restore();
    }
  });

  it("resendTransferOtp posts the reference", async () => {
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/resend-otp": (_url, init) => {
        expect(JSON.parse(init!.body as string)).toEqual({ reference: "owo-ben_1" });
        return { body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: {} } };
      },
    });
    try {
      await expect(resendTransferOtp("owo-ben_1")).resolves.toBeDefined();
    } finally {
      restore();
    }
  });

  it("getTransferStatus queries by reference", async () => {
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single/summary": (url) => {
        expect(url.searchParams.get("reference")).toBe("owo-ben_1");
        return {
          body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: { amount: 250, reference: "owo-ben_1", status: "SUCCESS" } },
        };
      },
    });
    try {
      const result = await getTransferStatus("owo-ben_1");
      expect(result.status).toBe("SUCCESS");
    } finally {
      restore();
    }
  });
});
