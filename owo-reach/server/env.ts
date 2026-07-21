const required = [
  "MONNIFY_API_KEY",
  "MONNIFY_SECRET_KEY",
  "MONNIFY_CONTRACT_CODE",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

/**
 * Getters, not a snapshot object — read live from process.env on every
 * access. Lets tests flip AI_PROVIDER/AI_MODEL/AI_API_KEY per-case (see
 * tests/ai.test.ts) without needing to re-import the module.
 */
export const env = {
  get MONNIFY_BASE_URL() { return process.env.MONNIFY_BASE_URL ?? "https://sandbox.monnify.com"; },
  get MONNIFY_API_KEY() { return process.env.MONNIFY_API_KEY!; },
  get MONNIFY_SECRET_KEY() { return process.env.MONNIFY_SECRET_KEY!; },
  get MONNIFY_CONTRACT_CODE() { return process.env.MONNIFY_CONTRACT_CODE!; },
  get MONNIFY_SOURCE_ACCOUNT() { return process.env.MONNIFY_SOURCE_ACCOUNT ?? ""; },
  // AI is provider-agnostic — see server/ai.ts. Swap providers by changing
  // these four values, no code change required.
  get AI_PROVIDER() { return process.env.AI_PROVIDER ?? "anthropic"; },
  get AI_MODEL() { return process.env.AI_MODEL ?? ""; },
  get AI_API_KEY() { return process.env.AI_API_KEY ?? ""; },
  get AI_BASE_URL() { return process.env.AI_BASE_URL ?? ""; },
  get PORT() { return Number(process.env.PORT ?? 3000); },
  get DATABASE_PATH() { return process.env.DATABASE_PATH ?? "./data/owo.sqlite"; },
  get isProd() { return process.env.NODE_ENV === "production"; },
};
