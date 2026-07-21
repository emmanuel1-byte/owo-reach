import { describe, it, expect, afterEach } from "bun:test";
import { initiateCheckout } from "../../server/monnify/checkout";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";

describe("initiateCheckout", () => {
  afterEach(() => __resetAuthTokenForTests());

  it("converts kobo to naira and forwards the customer + reference details", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/merchant/transactions/init-transaction": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.amount).toBe(5000); // 500000 kobo -> ₦5,000
        expect(body.customerName).toBe("Green Harvest Co-op");
        expect(body.customerEmail).toBe("ops@greenharvest.example");
        expect(body.paymentReference).toBe("owo-deposit-ldg_1");
        expect(body.currencyCode).toBe("NGN");
        expect(body.contractCode).toBeTruthy();
        return {
          body: {
            requestSuccessful: true,
            responseMessage: "success",
            responseCode: "0",
            responseBody: {
              transactionReference: "MNFY|20260719120000|000090",
              paymentReference: "owo-deposit-ldg_1",
              checkoutUrl: "https://sandbox.sdk.monnify.com/checkout/MNFY|20260719120000|000090",
              enabledPaymentMethod: ["ACCOUNT_TRANSFER", "CARD"],
            },
          },
        };
      },
    });
    try {
      const session = await initiateCheckout({
        amountKobo: 500000,
        reference: "owo-deposit-ldg_1",
        customerName: "Green Harvest Co-op",
        customerEmail: "ops@greenharvest.example",
      });
      expect(session.checkoutUrl).toContain("sandbox.sdk.monnify.com");
      expect(session.transactionReference).toBe("MNFY|20260719120000|000090");
    } finally {
      restore();
    }
  });

  it("passes redirectUrl through when given", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/merchant/transactions/init-transaction": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.redirectUrl).toBe("https://owo-reach.onrender.com/ledger");
        return {
          body: {
            requestSuccessful: true,
            responseMessage: "success",
            responseCode: "0",
            responseBody: { transactionReference: "x", paymentReference: "y", checkoutUrl: "https://example.com", enabledPaymentMethod: [] },
          },
        };
      },
    });
    try {
      await initiateCheckout({
        amountKobo: 1000,
        reference: "owo-deposit-ldg_2",
        customerName: "n",
        customerEmail: "e@example.com",
        redirectUrl: "https://owo-reach.onrender.com/ledger",
      });
    } finally {
      restore();
    }
  });
});
