/**
 * Test bootstrap, loaded via bunfig.toml `[test].preload` — runs to
 * completion before any test file is loaded.
 *
 * IMPORTANT: this file must not statically `import` anything from `server/`.
 * ES module imports are hoisted above other statements in the same file, so
 * a static import would run before the `process.env` assignments below and
 * server/env.ts would exit(1) on missing config. Server modules are pulled
 * in with a dynamic `import()` after the environment is set up.
 */
import { mock } from "bun:test";

process.env.NODE_ENV = "test";
process.env.MONNIFY_BASE_URL = "https://sandbox.monnify.test";
process.env.MONNIFY_API_KEY = "MK_TEST_dummy";
process.env.MONNIFY_SECRET_KEY = "dummy-secret";
process.env.MONNIFY_CONTRACT_CODE = "0000000000";
process.env.MONNIFY_SOURCE_ACCOUNT = "9999999999";
// Default test provider is Anthropic; tests/services/ai-providers.test.ts
// flips AI_PROVIDER per-test to exercise the OpenAI-compatible adapter path.
process.env.AI_PROVIDER = "anthropic";
process.env.AI_MODEL = "claude-test-model";
process.env.AI_API_KEY = "sk-ant-test-dummy";
process.env.DATABASE_PATH = ":memory:";
process.env.PORT = "0";

/**
 * Mocked at the SDK boundary: `messages.create` / `chat.completions.create`
 * are `bun:test` mocks so any test can reconfigure their response with
 * `.mockImplementationOnce(...)` / `.mockResolvedValueOnce(...)`, imported
 * from here as `anthropicCreateMock` / `openAiCreateMock`. Every AI-touching
 * test must reset the one it uses in `beforeEach` (see tests/helpers/ai.ts)
 * so mocks don't leak between test files.
 */
export const anthropicCreateMock = mock(async () => ({
  content: [{ type: "text", text: JSON.stringify({ beneficiaries: [] }) }],
}));

mock.module("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: anthropicCreateMock };
  }
  return { default: MockAnthropic };
});

export const openAiCreateMock = mock(async () => ({
  choices: [{ message: { content: JSON.stringify({ beneficiaries: [] }) } }],
}));

mock.module("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: openAiCreateMock } };
  }
  return { default: MockOpenAI };
});

const { sqlite } = await import("../server/db/client");

// Mirrors server/db/schema.ts. Kept as raw DDL because drizzle-kit's SQLite
// push/introspect commands require the better-sqlite3 or @libsql/client
// driver to connect, neither of which this project uses (it runs on
// bun:sqlite) — so there's no CLI path to generate this from the schema file
// for a bun:sqlite target. If schema.ts changes, update this to match.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS payout_runs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    total_amount_kobo INTEGER NOT NULL DEFAULT 0,
    total_fees_kobo INTEGER NOT NULL DEFAULT 0,
    preflight_brief TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS beneficiaries (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL,
    rail TEXT NOT NULL,
    account_number TEXT,
    bank_code TEXT,
    name_enquiry_name TEXT,
    name_match INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    monnify_reference TEXT,
    paycode_expires_at INTEGER,
    flags TEXT,
    sms_body TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    beneficiary_id TEXT,
    type TEXT NOT NULL,
    payload TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL,
    run_id TEXT,
    beneficiary_id TEXT,
    reference TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
  );
`);
