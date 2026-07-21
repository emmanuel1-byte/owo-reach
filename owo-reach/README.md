# Owó Reach

**Payroll for the informal economy**: pay everyone on a list in one click, whether or not they have a bank account. Banked recipients get an instant transfer; unbanked recipients get a **Monnify Paycode** they redeem for cash at any Moniepoint agent.

Built for the Monnify Developer Challenge · API Conference Lagos 2026.

## Live

- **App:** https://owo-reach.onrender.com
- **API docs:** https://owo-reach.onrender.com/api/docs

## How it works

1. Upload or paste a beneficiary list (messy CSVs and WhatsApp text welcome; AI normalises it).
2. Banked accounts are verified with Monnify **Name Enquiry**; mismatches are flagged, never silently paid.
3. Approve once, gated on the internal ledger (below) so a run can't be approved short of funds. Bank transfers go out via the **Disbursement API**; everyone else gets a **Paycode** by SMS.
4. Webhooks drive a live reconciliation dashboard: every code tracked from issued to redeemed, expired codes reissued or cancelled in one click.

## Quick start (no Docker, no Postgres, just Bun)

```bash
# 1. Install Bun if you don't have it: https://bun.sh
curl -fsSL https://bun.sh/install | bash

# 2. Clone & install
bun install
cd web && bun install && cd ..

# 3. Configure: sandbox keys from https://app.monnify.com (Developer → API Keys)
cp .env.example .env   # then fill in MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE

# 4. Database (a local SQLite file; the folder must exist before drizzle can create it)
mkdir -p data          # matches dbCredentials.url in drizzle.config.ts
bun run db:push        # creates data/owo.db and applies the schema
bun run seed           # loads demo data

# 5. Run
bun run dev        # API on :3000
bun run dev:web    # UI on :5173 (proxies /api to :3000)
```

> **Getting `TypeError: Cannot open database because the directory does not exist` or `SQLiteError: no such table: ...`?**
> The SQLite file lives in `data/`, which is gitignored, so a fresh clone doesn't have it. Run `mkdir -p data` and then `bun run db:push` again before seeding. The `no such table` error just means `db:push` never succeeded, so the seed ran against an empty database.

### Verify your Monnify sandbox works (recommended first step)

```bash
bun run spike
```

This walks the seven risky integration points in order (auth, banks, name enquiry, single transfer with OTP/MFA handling, paycode creation, checkout deposit, webhook validation) and prints a pass/fail report. See `scripts/day1-spike.ts`.

### Webhooks in local dev

Monnify needs a public URL. Use a tunnel and set it in your Monnify dashboard (Settings → Webhook URL):

```bash
cloudflared tunnel --url http://localhost:3000
# webhook endpoint: https://<your-tunnel>/api/webhooks/monnify
```

Paycode redemption is simulated from the Monnify dashboard: **Developer → Simulator** tab.

## Internal ledger

An org's balance is tracked inside Owó Reach itself, so an admin never has to open the Monnify dashboard to know if a run is affordable:

1. `POST /api/ledger/deposits/checkout` starts a real Monnify Collections checkout and returns a `checkoutUrl`. This credits nothing by itself.
2. The org pays at that URL (card, bank transfer, or USSD, in sandbox).
3. Monnify confirms with a `SUCCESSFUL_TRANSACTION` webhook; only then is the deposit credited, exactly once, matched by reference (safe against Monnify's webhook retries).
4. `GET /api/ledger/balance` is Owó Reach's own running total (deposits minus reserved/spent run totals), not a live read of the real Monnify wallet.
5. Approving a run (`POST /api/runs/:id/approve`) atomically reserves the full cost of everyone about to be queued; a run that can't be covered is rejected with `402` and nothing is queued. Money that never actually left (a failed transfer, an explicit cancel) is released back automatically.

There is no endpoint that credits a deposit on request alone; every credited kobo traces back to a Monnify-confirmed payment.

## Architecture

Single deployable: Bun + Hono API that also serves the built Vite/React frontend. SQLite via Drizzle (swap to Postgres by changing one driver import). All money is stored as **integer kobo**. All payment state changes are **webhook-driven** (HMAC-SHA512 validated), pushed to the browser over **Server-Sent Events**; a reconciliation job polls the status API only as a fallback for missed webhooks.

The database is a plain SQLite file at `data/owo.db`, created by `db:push`, never committed to git. On ephemeral hosts (e.g. Render's free tier, where the filesystem resets on every deploy), recreate it at boot:

```bash
mkdir -p data && bun run db:push -- --force && bun run seed && bun run start
```

```
web/            Vite + React + TanStack Query + Tailwind
server/
  monnify/      API client: cached auth token, transfers (+OTP), paycodes, checkout, verification, webhook HMAC
  routes/       /api/runs, /api/beneficiaries, /api/ledger, /api/webhooks/monnify, /api/events (SSE)
  services/     ingestion, execution, lifecycle, reconciliation, ledger
  db/           Drizzle schema, client, seed
scripts/        day1-spike.ts: sandbox smoke test
docs/           PRD.md: product spec & build plan
```

## Security notes

- Webhook signatures validated (HMAC-SHA512 of the raw body with the client secret) before any processing.
- Paycodes stored masked; revealing a clear code requires an explicit authorized call (Monnify Get Clear Paycode), which is logged to the audit trail.
- Sandbox keys only. Nothing in this repo has ever touched a live key.