import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { db } from "../../server/db/client";
import { ledgerEntries, events } from "../../server/db/schema";
import { eq } from "drizzle-orm";
import {
  getLedgerBalanceKobo,
  listLedgerEntries,
  initiateDeposit,
  confirmDeposit,
  isDepositReference,
  reserveFundsForRun,
  refundBeneficiary,
  InsufficientFundsError,
} from "../../server/services/ledger";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { resetDb } from "../helpers/db";
import { insertRun, insertBeneficiary } from "../helpers/factories";

beforeEach(resetDb);
afterEach(() => __resetAuthTokenForTests());

function mockCheckoutInit(handler?: (body: any) => Partial<{ checkoutUrl: string; transactionReference: string }>) {
  return mockMonnifyFetch({
    "/api/v1/merchant/transactions/init-transaction": (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const extra = handler?.(body) ?? {};
      return {
        body: {
          requestSuccessful: true,
          responseMessage: "success",
          responseCode: "0",
          responseBody: {
            transactionReference: extra.transactionReference ?? "MNFY|x",
            paymentReference: body.paymentReference,
            checkoutUrl: extra.checkoutUrl ?? "https://sandbox.sdk.monnify.com/checkout/x",
            enabledPaymentMethod: ["ACCOUNT_TRANSFER", "CARD"],
          },
        },
      };
    },
  });
}

describe("getLedgerBalanceKobo", () => {
  it("is zero with no entries", async () => {
    expect(await getLedgerBalanceKobo()).toBe(0);
  });

  it("sums signed amounts across entries rather than trusting a cached total", async () => {
    confirmDeposit("owo-deposit-a", 500000);
    confirmDeposit("owo-deposit-b", 200000);
    expect(await getLedgerBalanceKobo()).toBe(700000);
  });
});

describe("initiateDeposit", () => {
  it("starts a checkout with a generated owo-deposit- reference and logs an event, crediting nothing yet", async () => {
    const restore = mockCheckoutInit();
    try {
      const { checkoutUrl, reference } = await initiateDeposit({
        amountKobo: 500000,
        customerName: "Green Harvest Co-op",
        customerEmail: "ops@greenharvest.example",
      });
      expect(isDepositReference(reference)).toBe(true);
      expect(checkoutUrl).toContain("sandbox.sdk.monnify.com");
      expect(await getLedgerBalanceKobo()).toBe(0); // nothing credited until the webhook confirms

      const logged = await db.select().from(events).where(eq(events.type, "ledger.checkout_initiated"));
      expect(logged).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it("rejects a zero or negative amount without calling Monnify", async () => {
    const restore = mockMonnifyFetch({}); // no handler registered — a call would throw and fail the test
    try {
      await expect(initiateDeposit({ amountKobo: 0, customerName: "n", customerEmail: "e@example.com" })).rejects.toThrow(/positive/);
      await expect(initiateDeposit({ amountKobo: -100, customerName: "n", customerEmail: "e@example.com" })).rejects.toThrow(/positive/);
    } finally {
      restore();
    }
  });

  it("rejects a non-integer amount", async () => {
    const restore = mockMonnifyFetch({});
    try {
      await expect(initiateDeposit({ amountKobo: 100.5, customerName: "n", customerEmail: "e@example.com" })).rejects.toThrow(/integer/);
    } finally {
      restore();
    }
  });
});

describe("confirmDeposit", () => {
  it("credits a positive DEPOSIT entry against the given reference", async () => {
    confirmDeposit("owo-deposit-ldg_1", 500000);
    expect(await getLedgerBalanceKobo()).toBe(500000);
  });

  it("is idempotent: a webhook retry for the same reference only credits once", async () => {
    confirmDeposit("owo-deposit-ldg_1", 500000);
    confirmDeposit("owo-deposit-ldg_1", 500000);
    expect(await getLedgerBalanceKobo()).toBe(500000);
    expect((await listLedgerEntries()).filter((e) => e.type === "DEPOSIT")).toHaveLength(1);
  });
});

describe("isDepositReference", () => {
  it("recognises owo-deposit- prefixed references and rejects everything else", () => {
    expect(isDepositReference("owo-deposit-ldg_abc123")).toBe(true);
    expect(isDepositReference("owo-ben_abc123")).toBe(false);
    expect(isDepositReference("something-else")).toBe(false);
  });
});

describe("reserveFundsForRun", () => {
  it("reserves each beneficiary's amount as a negative entry when funds are sufficient", async () => {
    confirmDeposit("owo-deposit-a", 1_000_000);
    const runId = await insertRun();

    reserveFundsForRun(runId, [
      { id: "ben_a", amountKobo: 200000 },
      { id: "ben_b", amountKobo: 300000 },
    ]);

    expect(await getLedgerBalanceKobo()).toBe(500000);
    const entries = await listLedgerEntries();
    const reserves = entries.filter((e) => e.type === "RUN_RESERVE");
    expect(reserves).toHaveLength(2);
    expect(reserves.every((e) => e.runId === runId)).toBe(true);
    expect(reserves.map((e) => e.amountKobo).sort((a, b) => a - b)).toEqual([-300000, -200000]);
  });

  it("throws InsufficientFundsError and reserves nothing when the balance is short", async () => {
    confirmDeposit("owo-deposit-a", 100000);
    const runId = await insertRun();

    expect(() => reserveFundsForRun(runId, [{ id: "ben_a", amountKobo: 500000 }])).toThrow(InsufficientFundsError);
    expect(await getLedgerBalanceKobo()).toBe(100000); // untouched
    expect(await listLedgerEntries()).toHaveLength(1); // only the original deposit
  });

  it("is all-or-nothing: one unaffordable beneficiary blocks the whole batch, not just that one", async () => {
    confirmDeposit("owo-deposit-a", 250000);
    const runId = await insertRun();

    expect(() =>
      reserveFundsForRun(runId, [
        { id: "ben_affordable", amountKobo: 100000 },
        { id: "ben_not", amountKobo: 500000 },
      ]),
    ).toThrow(InsufficientFundsError);

    expect(await getLedgerBalanceKobo()).toBe(250000);
    expect((await listLedgerEntries()).filter((e) => e.type === "RUN_RESERVE")).toHaveLength(0);
  });

  it("is a no-op for an empty beneficiary list", async () => {
    const runId = await insertRun();
    expect(() => reserveFundsForRun(runId, [])).not.toThrow();
    expect(await getLedgerBalanceKobo()).toBe(0);
  });
});

describe("refundBeneficiary", () => {
  it("adds a positive RUN_REFUND entry for the beneficiary's amount", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { amountKobo: 150000 });

    refundBeneficiary(benId, runId, 150000);

    expect(await getLedgerBalanceKobo()).toBe(150000);
    const [entry] = await db.select().from(ledgerEntries);
    expect(entry).toMatchObject({ type: "RUN_REFUND", amountKobo: 150000, runId, beneficiaryId: benId });
  });

  it("is idempotent: calling it twice for the same beneficiary only credits once", async () => {
    const runId = await insertRun();
    const benId = await insertBeneficiary(runId, { amountKobo: 150000 });

    refundBeneficiary(benId, runId, 150000);
    refundBeneficiary(benId, runId, 150000);

    expect(await getLedgerBalanceKobo()).toBe(150000);
    expect((await listLedgerEntries()).filter((e) => e.type === "RUN_REFUND")).toHaveLength(1);
  });
});
