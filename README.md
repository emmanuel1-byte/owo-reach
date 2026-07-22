# Owó Reach

Owó Reach is a payout operations console for the informal economy. An admin pastes or uploads a messy list of people to pay (a spreadsheet, a WhatsApp export, anything), an AI model cleans it up into a structured list, the admin reviews and approves it, and the money goes out through Monnify. Recipients with a bank account get an instant transfer. Recipients without one get a Paycode, a ten digit number they can take to any Moniepoint agent to withdraw cash.

Built for the Monnify Developer Challenge at API Conference Lagos 2026.

## How it works

1. Paste or upload a beneficiary list. An AI provider (Anthropic, OpenAI, Gemini, DeepSeek, or Kimi, whichever you configure) normalises the messy input into names, phone numbers, amounts, and a payout rail for each person.
2. Every bank account is checked against Monnify's Name Enquiry. A mismatch is flagged for the admin rather than paid silently.
3. The admin approves the run once. Approval is gated on an internal ledger, so a run can never be approved for more than the org has actually deposited. Bank transfers go out through Monnify's Disbursement API; everyone else gets a Paycode by SMS.
4. Monnify's webhooks drive a live reconciliation dashboard. Every code is tracked from issued to redeemed, and an expired code can be reissued or cancelled in one click.

## Architecture

This is a single deployable application: one Bun and Hono API that, in production, also serves the built React frontend. There is one process, one port, and one URL. There is no separate frontend host and no CORS to configure.

```
server/          Bun + Hono API
  routes/        /api/runs, /api/beneficiaries, /api/banks, /api/ledger, /api/webhooks/monnify, /api/events (SSE)
  services/      ingestion, execution, lifecycle, reconciliation, ledger
  monnify/       Monnify client: cached auth token, transfers, paycodes, checkout, verification, webhook HMAC
  db/            Drizzle schema, client, seed script
  ai.ts          provider-agnostic AI client used for ingestion and the pre-flight brief
web/             Vite + React frontend (TanStack Query, Tailwind, Radix UI)
scripts/         spike.ts (sandbox smoke test), run-backend.sh (one-command boot + tunnel)
docs/            product spec and design rationale
tests/           bun:test suite, mirrors the server/ layout
data/            local SQLite file, created on first run, never committed
```

The database is SQLite through Drizzle. Swapping to Postgres later is a matter of changing one driver import in `server/db/client.ts` and `drizzle.config.ts`; nothing else in the schema or queries is SQLite-specific.

All money is stored and passed around as integer kobo, never floating point naira, so rounding errors cannot creep in. Every payment state change arrives through a webhook, validated with an HMAC-SHA512 signature check before anything is processed, and is pushed to the browser over Server-Sent Events. A reconciliation sweep polls Monnify's status API as a fallback, but only for anything that has been in flight for more than five minutes, on the assumption that the webhook is the source of truth and the poll is just a safety net.

## Quick start

You need [Bun](https://bun.sh) 1.3 or newer. This project does not run on Node: the backend uses `bun:sqlite` and `hono/bun` directly.

```bash
# 1. Install Bun if you don't already have it
curl -fsSL https://bun.sh/install | bash

# 2. Install dependencies (backend and frontend)
bun install
cd web && bun install && cd ..

# 3. Configure your secrets
cp .env.example .env
# then open .env and fill in MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE,
# plus one AI provider's key. See "Environment variables" below.

# 4. Create the database
mkdir -p data          # data/ is gitignored, so a fresh clone doesn't have it yet
bun run db:push        # creates data/owo.sqlite and applies the schema
bun run seed           # optional: loads demo data so the dashboard isn't empty

# 5. Run it, in two terminals
bun run dev            # API on http://localhost:3000
bun run dev:web        # UI on http://localhost:5173, proxies /api to :3000
```

Open `http://localhost:5173` and sign in. Sign-in is a single admin session for the sandbox, with the email and password hint printed on the sign-in screen itself; there is no real user database behind it yet.

If you see `TypeError: Cannot open database because the directory does not exist` or `SQLiteError: no such table`, it means `data/` was never created or `db:push` never ran. Run `mkdir -p data && bun run db:push` again before seeding.

### Verify your Monnify sandbox keys

```bash
bun run spike
```

This walks through the seven riskiest integration points in order: authentication, fetching banks, name enquiry, a single transfer (including OTP handling if sandbox MFA kicks in), paycode creation, a Collections checkout, and webhook signature validation. It prints a pass or fail report so you know exactly which of your sandbox credentials or endpoints need attention before you rely on them in a demo. See `scripts/spike.ts`.

### Webhooks in local development

Monnify needs a public URL to call your machine. Use a tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
# then set the webhook URL in your Monnify dashboard to:
# https://<your-tunnel>/api/webhooks/monnify
```

The tunnel's hostname is random and changes every time cloudflared restarts, so you'll need to re-paste the URL into the Monnify dashboard after each restart. `./scripts/run-backend.sh` automates starting the API, waiting for it to become healthy, opening the tunnel, and printing the webhook URL for you; run it from the repository root and press Ctrl-C to stop both together.

Paycode redemption itself is simulated from the Monnify dashboard, under Developer, then Simulator.

## Environment variables

All of these live in `.env` (copy `.env.example` to start). Getters in `server/env.ts` read `process.env` live on every access, and the server now watches `.env` for changes while it runs, so editing a value and saving takes effect immediately without a restart. See "The .env reload problem" below for why that matters.

| Variable | Required | Notes |
|---|---|---|
| `MONNIFY_API_KEY` | Yes | From your Monnify dashboard, under Developer, then API Keys & Contracts. |
| `MONNIFY_SECRET_KEY` | Yes | Same place as above. |
| `MONNIFY_CONTRACT_CODE` | Yes | Same place as above. |
| `MONNIFY_SOURCE_ACCOUNT` | No | Your sandbox wallet account number. Disbursements are sent from this account; without it, transfers will fail. |
| `MONNIFY_BASE_URL` | No | Defaults to `https://sandbox.monnify.com`. |
| `AI_PROVIDER` | No | One of `anthropic`, `openai`, `gemini`, `deepseek`, `kimi`, or `openai-compatible`. Defaults to `anthropic`. |
| `AI_MODEL` | No | The model slug for whichever provider you chose. |
| `AI_API_KEY` | No | Required for run creation to work, even though the server will boot without it. |
| `AI_BASE_URL` | No | Only needed for a custom `openai-compatible` endpoint. |
| `PORT` | No | Defaults to `3000`. If you change it, also update the proxy target in `web/vite.config.js`. |
| `DATABASE_PATH` | No | Defaults to `./data/owo.sqlite`. |

To switch AI providers, change the four `AI_*` values and save. No code changes and, as of this restructure, no restart either.

## The .env reload problem

Bun reads `.env` once, at process start, and there is no built-in flag to make it reload automatically; `bun --watch` restarts the process when a file it imports changes, but `.env` is loaded outside the module graph, so editing it alone does not trigger anything (this is a known, still-open Bun limitation: see [oven-sh/bun#13075](https://github.com/oven-sh/bun/issues/13075)).

To work around it, `server/lib/envReload.ts` watches `.env` directly with `node:fs`'s `watch`, and on every change re-parses the file and writes any changed keys back into `process.env`. Since the rest of the server already reads configuration live from `process.env` on every access rather than caching it at startup, this is enough to make a new API key or a different AI provider take effect the moment you save the file, with no restart at all. It only runs outside production, where env vars are typically injected by the host rather than read from a file on disk.

## Commands reference

From the repository root:

- `bun run dev`: start the API in watch mode, on port 3000.
- `bun run dev:web`: start the frontend, on port 5173.
- `bun run build`: install frontend dependencies and build it to `web/dist`, ready for the API to serve in production.
- `bun run start`: run the production server (`NODE_ENV=production`), serving both the API and the built frontend on one port.
- `bun run db:push`: create or update the SQLite tables from the schema.
- `bun run seed`: insert demo data.
- `bun run spike`: smoke-test your Monnify sandbox keys end to end.
- `bun run typecheck`: TypeScript check, no emit.
- `bun test`: run the test suite.
- `bun test --coverage`: run the test suite with coverage.
- `./scripts/run-backend.sh`: boot the API and a cloudflared tunnel together.

## Deployment

The whole application is one deployable: the API and the built frontend run as a single Bun process on a single port, so there is exactly one URL in production, and the webhook endpoint, the app, and any demo link are always the same origin.

On a host like Render, Railway, or Fly:

- Root directory: the repository root (this is now a flat monorepo; there is no nested backend folder to point at).
- Build command: `bun install && bun run build`
- Start command: `bun run start`
- Environment variables: the same ones listed above, set through the host's dashboard rather than a committed `.env` file.
- If the host's filesystem is ephemeral (for example, Render's free tier resets on every deploy), recreate the database at boot instead of relying on a persisted file:

```bash
mkdir -p data && bun run db:push -- --force && bun run seed && bun run start
```

## Known limitation: Paycode creation

`POST /api/v1/paycode` currently returns `Unknown client id null` from Monnify's sandbox, even with valid keys and even after Monnify support confirmed Paycode has been enabled on this account. The request path and payload match Monnify's own documentation and changelog exactly (verified directly against the live sandbox while writing this README), and `GET /api/v1/paycode/:reference` returns a different, more specific error ("You're not permitted to access this functionality"), which suggests the create endpoint is reachable but the account's link to the offline payment service is not fully provisioned on Monnify's side yet. If you hit this, it is worth following up with Monnify support with that exact detail rather than assuming the integration code is wrong.

## Security notes

- Every webhook is validated with an HMAC-SHA512 signature over the raw request body before any processing happens.
- Paycodes are stored masked. Revealing the clear code requires an explicit, separately authorized call (Monnify's Get Clear Paycode), and every reveal is written to the audit trail.
- Only sandbox keys have ever touched this repository. Nothing here has seen a live key.

## Internal ledger

An org's balance is tracked inside Owó Reach itself, so an admin never needs to open the Monnify dashboard to know whether a run is affordable:

1. `POST /api/ledger/deposits/checkout` starts a real Monnify Collections checkout and returns a `checkoutUrl`. This credits nothing by itself.
2. The org completes payment at that URL.
3. Monnify confirms with a `SUCCESSFUL_TRANSACTION` webhook. Only then is the deposit credited, exactly once, matched by reference so Monnify's webhook retries can never double-credit it.
4. `GET /api/ledger/balance` is Owó Reach's own running total (deposits minus reserved and spent run totals), not a live read of the Monnify wallet.
5. Approving a run (`POST /api/runs/:id/approve`) atomically reserves the full cost of everyone about to be queued. A run that cannot be covered is rejected with a `402` and nothing is queued. Money that never actually left, whether from a failed transfer or an explicit cancel, is released back automatically.

There is no endpoint that credits a deposit on request alone. Every credited kobo traces back to a Monnify-confirmed payment.

## Repository

https://github.com/emmanuel1-byte/owo-reach

## Further reading

- `docs/PRD.md`: the product spec and build plan.
- `docs/RATIONALE.md`: the reasoning behind some of the less obvious design decisions.
- `web/INTEGRATION.md`: how the frontend talks to the backend: data layer, live events, and page-by-page endpoint mapping.
