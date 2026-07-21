import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { ledgerRoute } from "../../server/routes/ledger";
import { confirmDeposit } from "../../server/services/ledger";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { resetDb } from "../helpers/db";

const app = new Hono();
app.route("/ledger", ledgerRoute);

function mockCheckoutInit() {
  return mockMonnifyFetch({
    "/api/v1/merchant/transactions/init-transaction": (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return {
        body: {
          requestSuccessful: true,
          responseMessage: "success",
          responseCode: "0",
          responseBody: {
            transactionReference: "MNFY|x",
            paymentReference: body.paymentReference,
            checkoutUrl: "https://sandbox.sdk.monnify.com/checkout/x",
            enabledPaymentMethod: ["ACCOUNT_TRANSFER", "CARD"],
          },
        },
      };
    },
  });
}

beforeEach(resetDb);
afterEach(() => __resetAuthTokenForTests());

describe("GET /ledger/balance", () => {
  it("is zero with no deposits", async () => {
    const res = await app.request("/ledger/balance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balanceKobo: 0 });
  });

  it("reflects confirmed deposits", async () => {
    confirmDeposit("owo-deposit-x", 500000);
    const res = await app.request("/ledger/balance");
    expect(await res.json()).toEqual({ balanceKobo: 500000 });
  });
});

describe("POST /ledger/deposits/checkout", () => {
  it("initiates a checkout and returns the payment URL, crediting nothing yet", async () => {
    const restore = mockCheckoutInit();
    try {
      const res = await app.request("/ledger/deposits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo: 500000, customerName: "Green Harvest Co-op", customerEmail: "ops@greenharvest.example" }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { checkoutUrl: string; reference: string };
      expect(body.checkoutUrl).toContain("sandbox.sdk.monnify.com");
      expect(body.reference).toStartWith("owo-deposit-");

      const balance = await app.request("/ledger/balance");
      expect(await balance.json()).toEqual({ balanceKobo: 0 });
    } finally {
      restore();
    }
  });

  it("400s when amountKobo is missing", async () => {
    const res = await app.request("/ledger/deposits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: "n", customerEmail: "e@example.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("400s when customerName or customerEmail is missing", async () => {
    const res = await app.request("/ledger/deposits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountKobo: 500000 }),
    });
    expect(res.status).toBe(400);
  });

  it("422s on a non-positive amount", async () => {
    const res = await app.request("/ledger/deposits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountKobo: -100, customerName: "n", customerEmail: "e@example.com" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /ledger", () => {
  it("lists entries most-recent-first", async () => {
    confirmDeposit("owo-deposit-a", 100);
    await new Promise((resolve) => setTimeout(resolve, 5));
    confirmDeposit("owo-deposit-b", 200);
    const res = await app.request("/ledger");
    expect(res.status).toBe(200);
    const entries = (await res.json()) as { amountKobo: number }[];
    expect(entries.map((e) => e.amountKobo)).toEqual([200, 100]);
  });
});
