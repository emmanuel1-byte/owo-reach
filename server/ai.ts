import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "./env";
import { formatNaira } from "./lib/money";

/**
 * The two AI features this product uses, and nowhere else AI touches money:
 *  1. Chaos ingestion — turn a messy pasted list into structured beneficiaries.
 *  2. Pre-flight brief — a plain-language summary shown before approval.
 *
 * Provider-agnostic by design: set AI_PROVIDER/AI_MODEL/AI_API_KEY in .env to
 * point at whichever vendor is cheapest today — Anthropic, OpenAI, Gemini,
 * DeepSeek, Kimi (Moonshot), or any other OpenAI-compatible endpoint via
 * AI_BASE_URL. Nothing below the adapter (ingestBeneficiaries,
 * generatePreflightBrief, and their callers) needs to change when you swap.
 */

type ProviderId = "anthropic" | "openai" | "gemini" | "deepseek" | "kimi" | "openai-compatible";

/** Built-in base URLs for the OpenAI-compatible providers this ships presets for. */
const OPENAI_COMPATIBLE_BASE_URLS: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.ai/v1",
};

interface AiClient {
  /** JSON-mode call. Returns the raw JSON text, or null if the model returned no content. */
  completeJson(prompt: string, schemaName: string, schema: Record<string, unknown>): Promise<string | null>;
  /**
   * `fast` asks the provider not to spend reasoning tokens. Thinking models
   * (gemini-flash-latest, o-series) otherwise burn most of the latency — and
   * most of maxTokens — on hidden reasoning before writing a word, which is
   * wasted effort for short descriptive prose. Providers that don't understand
   * the hint ignore it.
   */
  completeText(prompt: string, maxTokens: number, fast?: boolean): Promise<string | null>;
}

function anthropicClient(model: string, apiKey: string): AiClient {
  const client = new Anthropic({ apiKey });
  return {
    async completeJson(prompt, _schemaName, schema) {
      const res = await client.messages.create({
        model,
        max_tokens: 8000,
        output_config: { format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      });
      return firstTextBlock(res.content);
    },
    async completeText(prompt, maxTokens) {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      return firstTextBlock(res.content);
    },
  };
}

function firstTextBlock(content: { type: string }[]): string | null {
  const block = content.find((b): b is { type: "text"; text: string } => b.type === "text");
  return block ? block.text : null;
}

/**
 * Generic client for any OpenAI-compatible Chat Completions endpoint — this
 * is what makes OpenAI, Gemini, DeepSeek, and Kimi/Moonshot all "just work"
 * from the same code path, plus anything else that speaks the same protocol
 * via a custom AI_BASE_URL. JSON mode here is the widely-supported
 * `json_object` form rather than strict `json_schema` (support for the
 * stricter mode is inconsistent across these vendors), so the schema is also
 * spelled out in the prompt text as a fallback.
 */
function openAiCompatibleClient(provider: ProviderId, model: string, apiKey: string): AiClient {
  const baseURL = env.AI_BASE_URL || OPENAI_COMPATIBLE_BASE_URLS[provider];
  if (!baseURL) throw new Error(`No built-in base URL for AI_PROVIDER="${provider}" — set AI_BASE_URL explicitly`);
  const client = new OpenAI({ apiKey, baseURL });

  async function complete(
    prompt: string,
    maxTokens: number,
    jsonMode: boolean,
    fast = false,
  ): Promise<string | null> {
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      // Unknown params are ignored by providers that don't implement them, so
      // this stays safe across the OpenAI-compatible vendors this client serves.
      ...(fast ? { reasoning_effort: "none" as const } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content ?? null;
  }

  return {
    completeJson: (prompt, _schemaName, schema) =>
      complete(`${prompt}\n\nRespond with ONLY a JSON object matching this schema:\n${JSON.stringify(schema)}`, 8000, true),
    completeText: (prompt, maxTokens, fast) => complete(prompt, maxTokens, false, fast),
  };
}

function getClient(): AiClient {
  const provider = env.AI_PROVIDER as ProviderId;
  if (!env.AI_MODEL) throw new Error("AI_MODEL is not set — see .env.example for per-provider examples");
  if (!env.AI_API_KEY) throw new Error("AI_API_KEY is not set — see .env.example for per-provider examples");
  return provider === "anthropic"
    ? anthropicClient(env.AI_MODEL, env.AI_API_KEY)
    : openAiCompatibleClient(provider, env.AI_MODEL, env.AI_API_KEY);
}

export interface IngestedBeneficiary {
  name: string;
  phone: string;
  amountKobo: number;
  accountNumber: string | null;
  /** Bank name/code as written by the source — resolved to a Monnify code separately. */
  bankNameRaw: string | null;
}

const INGEST_SCHEMA = {
  type: "object",
  properties: {
    beneficiaries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string", description: "Normalised to +234 international format where possible" },
          amountKobo: { type: "integer", description: "Amount in kobo (naira * 100)" },
          accountNumber: { type: ["string", "null"] },
          bankNameRaw: { type: ["string", "null"], description: "Bank name/code exactly as written in the source" },
        },
        required: ["name", "phone", "amountKobo", "accountNumber", "bankNameRaw"],
        additionalProperties: false,
      },
    },
  },
  required: ["beneficiaries"],
  additionalProperties: false,
} as const;

/**
 * Extraction only — no arithmetic or judgment calls. Duplicate/outlier
 * detection and bank-code resolution are deterministic (see
 * services/ingestion.ts and monnify/verification.ts) because they're
 * reliable without a model; turning ragged, human-written text into
 * structured fields is the part that genuinely needs one.
 */
export async function ingestBeneficiaries(rawInput: string): Promise<IngestedBeneficiary[]> {
  const prompt =
    "Extract every beneficiary from this payout list. It may be a messy CSV, " +
    "a WhatsApp paste, or free text. Preserve amounts exactly as stated, " +
    "converting naira to kobo (multiply by 100). Leave accountNumber/bankNameRaw " +
    "null when a beneficiary has no bank details (they'll be paid by cash paycode " +
    "instead of transfer).\n\n---\n" +
    rawInput;

  const text = await getClient().completeJson(prompt, "beneficiary_list", INGEST_SCHEMA);
  if (!text) throw new Error("AI ingestion returned no output");
  const parsed = JSON.parse(text) as { beneficiaries: IngestedBeneficiary[] };
  return parsed.beneficiaries;
}

export interface PreflightSummaryInput {
  title: string;
  totalAmountKobo: number;
  totalFeesKobo: number;
  beneficiaryCount: number;
  paycodeCount: number;
  flaggedCount: number;
  flagSamples: string[];
}

/** Short plain-language brief shown on the review screen before approval. */
export async function generatePreflightBrief(input: PreflightSummaryInput): Promise<string> {
  const prompt =
    "Write a 2-3 sentence plain-language pre-flight summary for a payout run, " +
    "for a non-technical ops admin about to approve it. State the recipient " +
    "count, total amount, how many go by paycode vs bank transfer, and call out " +
    "flags plainly (never bury a risk). No markdown, no headers, just prose.\n\n" +
    JSON.stringify({
      title: input.title,
      totalAmount: formatNaira(input.totalAmountKobo),
      totalFees: formatNaira(input.totalFeesKobo),
      beneficiaryCount: input.beneficiaryCount,
      paycodeCount: input.paycodeCount,
      bankCount: input.beneficiaryCount - input.paycodeCount,
      flaggedCount: input.flaggedCount,
      flagSamples: input.flagSamples.slice(0, 5),
    });

  // `fast` suppresses reasoning tokens; the budget still has headroom for
  // providers that ignore the hint and think anyway (at 400 with thinking on,
  // this returned a mid-sentence fragment — 13 visible tokens out of 447).
  const text = await getClient().completeText(prompt, 2000, true);
  return text ? text.trim() : "";
}
