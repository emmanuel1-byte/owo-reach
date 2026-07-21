import { describe, it, expect, afterEach } from "bun:test";
import { createPaycode, getPaycode, getClearPaycode, cancelPaycode, fetchPaycodes } from "../../server/monnify/paycode";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";

describe("monnify/paycode", () => {
  afterEach(() => {
    __resetAuthTokenForTests();
  });

  it("createPaycode converts kobo to naira and defaults expiry to 72h out", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/paycode": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.amount).toBe(200); // 20000 kobo -> ₦200
        expect(body.paycodeReference).toBe("owo-ben_2");
        expect(body.beneficiaryName).toBe("Amina Yusuf");
        expect(typeof body.expiryDate).toBe("string");
        return {
          body: {
            requestSuccessful: true,
            responseMessage: "success",
            responseCode: "0",
            responseBody: { paycodeReference: "owo-ben_2", beneficiaryName: "Amina Yusuf", amount: 200, status: "PENDING", paycode: "4821059637" },
          },
        };
      },
    });
    try {
      const code = await createPaycode({ amountKobo: 20000, beneficiaryName: "Amina Yusuf", reference: "owo-ben_2" });
      expect(code.status).toBe("PENDING");
      expect(code.paycode).toBe("4821059637");
    } finally {
      restore();
    }
  });

  it("createPaycode honours an explicit expiryDate", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/paycode": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.expiryDate).toBe("2026-08-01T00:00:00");
        return { body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: { paycodeReference: "r", beneficiaryName: "n", amount: 1, status: "PENDING" } } };
      },
    });
    try {
      await createPaycode({ amountKobo: 100, beneficiaryName: "n", reference: "r", expiryDate: "2026-08-01T00:00:00" });
    } finally {
      restore();
    }
  });

  it("getPaycode fetches the masked view by reference", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/paycode/owo-ben_2": () => ({
        body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: { paycodeReference: "owo-ben_2", beneficiaryName: "Amina Yusuf", amount: 200, status: "PENDING", paycode: "48210*****" } },
      }),
    });
    try {
      const code = await getPaycode("owo-ben_2");
      expect(code.paycode).toBe("48210*****");
    } finally {
      restore();
    }
  });

  it("getClearPaycode fetches the unmasked view", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/paycode/owo-ben_2/authorize": () => ({
        body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: { paycodeReference: "owo-ben_2", beneficiaryName: "Amina Yusuf", amount: 200, status: "PENDING", paycode: "4821059637" } },
      }),
    });
    try {
      const code = await getClearPaycode("owo-ben_2");
      expect(code.paycode).toBe("4821059637");
    } finally {
      restore();
    }
  });

  it("cancelPaycode issues a DELETE", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/paycode/owo-ben_2": (_url, init) => {
        expect(init?.method).toBe("DELETE");
        return { body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: {} } };
      },
    });
    try {
      await expect(cancelPaycode("owo-ben_2")).resolves.toBeDefined();
    } finally {
      restore();
    }
  });

  it("fetchPaycodes queries by date range", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/paycode": (url) => {
        expect(url.searchParams.get("from")).toBe("2026-07-01");
        expect(url.searchParams.get("to")).toBe("2026-07-31");
        return { body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: [] } };
      },
    });
    try {
      const codes = await fetchPaycodes("2026-07-01", "2026-07-31");
      expect(codes).toEqual([]);
    } finally {
      restore();
    }
  });
});
