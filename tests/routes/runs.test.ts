import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { runsRoute } from "../../server/routes/runs";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { anthropicCreateMock, resetAnthropicMock } from "../helpers/ai";
import { __resetAuthTokenForTests } from "../../server/monnify/client";
import { confirmDeposit, getLedgerBalanceKobo } from "../../server/services/ledger";
import { resetDb } from "../helpers/db";
import { insertRun, insertBeneficiary } from "../helpers/factories";

const app = new Hono();
app.route("/runs", runsRoute);

function mockAiExtraction(beneficiaries: unknown[]): void {
  anthropicCreateMock.mockImplementationOnce(async () => ({ content: [{ type: "text", text: JSON.stringify({ beneficiaries }) }] }));
}
function mockBrief(text = "brief"): void {
  anthropicCreateMock.mockImplementationOnce(async () => ({ content: [{ type: "text", text }] }));
}

beforeEach(() => {
  resetDb();
  resetAnthropicMock();
});
afterEach(() => __resetAuthTokenForTests());

describe("GET /runs", () => {
  it("returns an empty list when there are no runs", async () => {
    const res = await app.request("/runs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns runs most-recent-first", async () => {
    await insertRun({ id: "run_a", title: "First", createdAt: new Date(Date.now() - 60_000) });
    await insertRun({ id: "run_b", title: "Second", createdAt: new Date() });
    const res = await app.request("/runs");
    const body = (await res.json()) as { id: string }[];
    expect(body.map((r) => r.id)).toEqual(["run_b", "run_a"]);
  });
});

describe("POST /runs", () => {
  it("400s when title or rawInput is missing", async () => {
    const res = await app.request("/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "t" }) });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed JSON body instead of throwing", async () => {
    const res = await app.request("/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    expect(res.status).toBe(400);
  });

  it("ingests, verifies, briefs, and creates a REVIEW run", async () => {
    mockAiExtraction([{ name: "Amina Yusuf", phone: "+2348029876543", amountKobo: 2000000, accountNumber: null, bankNameRaw: null }]);
    mockBrief("1 recipient, ₦20,000 total.");
    const restore = mockMonnifyFetch({ "/api/v1/banks": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: [] } }) });
    try {
      const res = await app.request("/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "July stipends", rawInput: "Amina Yusuf 08029876543 20000" }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { run: { status: string; preflightBrief: string }; beneficiaries: unknown[] };
      expect(body.run.status).toBe("REVIEW");
      expect(body.run.preflightBrief).toBe("1 recipient, ₦20,000 total.");
      expect(body.beneficiaries).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it("422s when nothing could be extracted", async () => {
    mockAiExtraction([]);
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "t", rawInput: "garbage" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/No beneficiaries/);
  });
});

describe("GET /runs/:id", () => {
  it("404s for a missing run", async () => {
    const res = await app.request("/runs/nope");
    expect(res.status).toBe(404);
  });

  it("returns the run with its beneficiaries", async () => {
    const runId = await insertRun({ title: "t" });
    await insertBeneficiary(runId, { name: "A" });
    const res = await app.request(`/runs/${runId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run: { id: string }; beneficiaries: { name: string }[] };
    expect(body.run.id).toBe(runId);
    expect(body.beneficiaries).toHaveLength(1);
  });
});

describe("POST /runs/:id/approve", () => {
  it("404s for a missing run", async () => {
    const res = await app.request("/runs/nope/approve", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("409s when the run isn't in REVIEW", async () => {
    const runId = await insertRun({ status: "DRAFT" });
    const res = await app.request(`/runs/${runId}/approve`, { method: "POST" });
    expect(res.status).toBe(409);
  });

  it("queues unflagged beneficiaries but leaves flagged ones for review", async () => {
    const runId = await insertRun({ status: "REVIEW" });
    await insertBeneficiary(runId, { id: "ben_clean", flags: [], amountKobo: 100000 });
    await insertBeneficiary(runId, { id: "ben_flagged", flags: ["Bank record name does not match: X"] });
    confirmDeposit("owo-deposit-test-1", 1_000_000);
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1, reference: "owo-ben_clean", status: "SUCCESS" } } }),
    });
    try {
      const res = await app.request(`/runs/${runId}/approve`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, status: "EXECUTING" });

      const detail = await (await app.request(`/runs/${runId}`)).json();
      const clean = detail.beneficiaries.find((b: { id: string }) => b.id === "ben_clean");
      const flagged = detail.beneficiaries.find((b: { id: string }) => b.id === "ben_flagged");
      expect(["QUEUED", "SENT"]).toContain(clean.status); // approved synchronously to QUEUED; may already be SENT if background execution won the race
      expect(flagged.status).toBe("PENDING_REVIEW");

      // give the fire-and-forget executeRun a moment to finish against the mock before it's torn down
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      restore();
    }
  });

  it("402s and queues nobody when the ledger balance can't cover the run", async () => {
    const runId = await insertRun({ status: "REVIEW" });
    await insertBeneficiary(runId, { id: "ben_broke", flags: [], amountKobo: 100000 });
    confirmDeposit("owo-deposit-test-2", 50000); // half of what.s needed

    const res = await app.request(`/runs/${runId}/approve`, { method: "POST" });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/₦1,000.*₦500/);

    const detail = await (await app.request(`/runs/${runId}`)).json();
    expect(detail.beneficiaries[0].status).toBe("PENDING_REVIEW"); // nothing queued
    expect(await getLedgerBalanceKobo()).toBe(50000); // nothing reserved either
  });

  it("reserves exactly the queued total from the ledger on a successful approve", async () => {
    const runId = await insertRun({ status: "REVIEW" });
    await insertBeneficiary(runId, { id: "ben_a", flags: [], amountKobo: 100000, status: "PENDING_REVIEW" });
    await insertBeneficiary(runId, { id: "ben_b", flags: ["dupe"], amountKobo: 500000, status: "PENDING_REVIEW" }); // flagged, skipped
    confirmDeposit("owo-deposit-test-3", 1_000_000);
    const restore = mockMonnifyFetch({
      "/api/v2/disbursements/single": () => ({ body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { amount: 1, reference: "owo-ben_a", status: "PENDING_AUTHORIZATION" } } }),
    });
    try {
      const res = await app.request(`/runs/${runId}/approve`, { method: "POST" });
      expect(res.status).toBe(200);
      // only ben_a's 100000 reserved, not ben_b's flagged 500000
      expect(await getLedgerBalanceKobo()).toBe(900000);
    } finally {
      restore();
    }
  });
});
