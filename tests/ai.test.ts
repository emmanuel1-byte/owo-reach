import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ingestBeneficiaries, generatePreflightBrief } from "../server/ai";
import { anthropicCreateMock, resetAnthropicMock, openAiCreateMock, resetOpenAiMock } from "./helpers/ai";

describe("ingestBeneficiaries", () => {
  beforeEach(resetAnthropicMock);

  it("parses the structured JSON response into beneficiaries", async () => {
    anthropicCreateMock.mockImplementationOnce(async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            beneficiaries: [
              { name: "Chidi Okonkwo", phone: "+2348031234567", amountKobo: 2500000, accountNumber: "0123456789", bankNameRaw: "GTBank" },
              { name: "Amina Yusuf", phone: "+2348029876543", amountKobo: 2000000, accountNumber: null, bankNameRaw: null },
            ],
          }),
        },
      ],
    }));

    const result = await ingestBeneficiaries("Chidi Okonkwo 08031234567 25000 GTBank 0123456789\nAmina Yusuf 08029876543 20000");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Chidi Okonkwo", amountKobo: 2500000, bankNameRaw: "GTBank" });
    expect(result[1].accountNumber).toBeNull();
  });

  it("passes the raw input and a JSON schema output_config through to the SDK", async () => {
    anthropicCreateMock.mockImplementationOnce(async (params: any) => {
      expect(params.output_config.format.type).toBe("json_schema");
      expect(params.messages[0].content).toContain("free text");
      return { content: [{ type: "text", text: JSON.stringify({ beneficiaries: [] }) }] };
    });
    await ingestBeneficiaries("free text list");
  });

  it("throws if the model returns no text block", async () => {
    anthropicCreateMock.mockImplementationOnce(async () => ({ content: [] }));
    await expect(ingestBeneficiaries("anything")).rejects.toThrow(/no output/);
  });

  it("propagates malformed JSON as a parse error rather than swallowing it", async () => {
    anthropicCreateMock.mockImplementationOnce(async () => ({ content: [{ type: "text", text: "not json" }] }));
    await expect(ingestBeneficiaries("anything")).rejects.toThrow();
  });
});

describe("generatePreflightBrief", () => {
  beforeEach(resetAnthropicMock);

  it("returns the trimmed text response", async () => {
    anthropicCreateMock.mockImplementationOnce(async () => ({
      content: [{ type: "text", text: "  23 recipients, ₦415,000 total, 2 flagged.  " }],
    }));
    const brief = await generatePreflightBrief({
      title: "July stipends",
      totalAmountKobo: 41500000,
      totalFeesKobo: 20000,
      beneficiaryCount: 23,
      paycodeCount: 5,
      flaggedCount: 2,
      flagSamples: ["Possible duplicate of another beneficiary in this run"],
    });
    expect(brief).toBe("23 recipients, ₦415,000 total, 2 flagged.");
  });

  it("returns an empty string if the model returns no text block", async () => {
    anthropicCreateMock.mockImplementationOnce(async () => ({ content: [] }));
    const brief = await generatePreflightBrief({
      title: "t",
      totalAmountKobo: 0,
      totalFeesKobo: 0,
      beneficiaryCount: 0,
      paycodeCount: 0,
      flaggedCount: 0,
      flagSamples: [],
    });
    expect(brief).toBe("");
  });

  it("caps the flag samples sent to the model at 5", async () => {
    anthropicCreateMock.mockImplementationOnce(async (params: any) => {
      const payload = JSON.parse(params.messages[0].content.split("\n\n").pop());
      expect(payload.flagSamples).toHaveLength(5);
      return { content: [{ type: "text", text: "brief" }] };
    });
    await generatePreflightBrief({
      title: "t",
      totalAmountKobo: 0,
      totalFeesKobo: 0,
      beneficiaryCount: 7,
      paycodeCount: 0,
      flaggedCount: 7,
      flagSamples: ["a", "b", "c", "d", "e", "f", "g"],
    });
  });
});

/**
 * Provider-agnostic adapter: same two exported functions, different vendor
 * underneath. env.ts uses live getters (not a process.env snapshot)
 * specifically so these tests can flip AI_PROVIDER/AI_MODEL/AI_API_KEY per
 * case — see server/env.ts.
 */
describe("provider selection", () => {
  const original = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
  };

  afterEach(() => {
    process.env.AI_PROVIDER = original.AI_PROVIDER;
    process.env.AI_MODEL = original.AI_MODEL;
    process.env.AI_API_KEY = original.AI_API_KEY;
    process.env.AI_BASE_URL = original.AI_BASE_URL;
    resetAnthropicMock();
    resetOpenAiMock();
  });

  it("routes to the OpenAI-compatible client for a preset provider (deepseek) and uses json_object mode", async () => {
    process.env.AI_PROVIDER = "deepseek";
    process.env.AI_MODEL = "deepseek-chat";
    process.env.AI_API_KEY = "sk-deepseek-test";
    resetOpenAiMock();
    openAiCreateMock.mockImplementationOnce(async (params: any) => {
      expect(params.model).toBe("deepseek-chat");
      expect(params.response_format).toEqual({ type: "json_object" });
      expect(params.messages[0].content).toContain("Respond with ONLY a JSON object");
      return { choices: [{ message: { content: JSON.stringify({ beneficiaries: [{ name: "A", phone: "1", amountKobo: 100, accountNumber: null, bankNameRaw: null }] }) } }] };
    });

    const result = await ingestBeneficiaries("A, 1, 1 naira");
    expect(result).toHaveLength(1);
  });

  it("does not set response_format for plain text completions", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-5-mini";
    process.env.AI_API_KEY = "sk-openai-test";
    resetOpenAiMock();
    openAiCreateMock.mockImplementationOnce(async (params: any) => {
      expect(params.response_format).toBeUndefined();
      return { choices: [{ message: { content: "a brief" } }] };
    });

    const brief = await generatePreflightBrief({
      title: "t",
      totalAmountKobo: 0,
      totalFeesKobo: 0,
      beneficiaryCount: 0,
      paycodeCount: 0,
      flaggedCount: 0,
      flagSamples: [],
    });
    expect(brief).toBe("a brief");
  });

  it("uses AI_BASE_URL to reach a fully custom openai-compatible endpoint", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_MODEL = "local-model";
    process.env.AI_API_KEY = "unused";
    process.env.AI_BASE_URL = "http://localhost:11434/v1";
    resetOpenAiMock();
    openAiCreateMock.mockImplementationOnce(async () => ({
      choices: [{ message: { content: JSON.stringify({ beneficiaries: [] }) } }],
    }));
    await expect(ingestBeneficiaries("anything")).resolves.toEqual([]);
  });

  it("throws a clear error when a custom provider has no AI_BASE_URL", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_MODEL = "local-model";
    process.env.AI_API_KEY = "unused";
    process.env.AI_BASE_URL = "";
    await expect(ingestBeneficiaries("anything")).rejects.toThrow(/AI_BASE_URL/);
  });

  it("throws a clear error when AI_MODEL is not set", async () => {
    process.env.AI_MODEL = "";
    await expect(ingestBeneficiaries("anything")).rejects.toThrow(/AI_MODEL/);
  });

  it("throws a clear error when AI_API_KEY is not set", async () => {
    process.env.AI_API_KEY = "";
    await expect(ingestBeneficiaries("anything")).rejects.toThrow(/AI_API_KEY/);
  });

  it("returns null content as an empty brief rather than throwing, for the OpenAI-compatible path too", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_MODEL = "gemini-2.5-flash";
    process.env.AI_API_KEY = "sk-gemini-test";
    resetOpenAiMock();
    openAiCreateMock.mockImplementationOnce(async () => ({ choices: [] }));
    const brief = await generatePreflightBrief({
      title: "t",
      totalAmountKobo: 0,
      totalFeesKobo: 0,
      beneficiaryCount: 0,
      paycodeCount: 0,
      flaggedCount: 0,
      flagSamples: [],
    });
    expect(brief).toBe("");
  });
});
