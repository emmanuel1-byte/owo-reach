# Owó Reach — Local Runbook

A step-by-step guide to running the **backend** and **frontend** on your own machine.
Written for a developer who has never seen this project before — follow the bullets top to bottom.

---

## 1. What you're running (30-second tour)

- **Owó Reach** is a payout-operations console: paste a messy list of people to pay, an AI cleans it up, you review + approve, and money goes out via Monnify (bank transfer or "paycode" cash pickup).
- There are **two apps** in this repo, run as two separate processes in development:
  - **`owo-reach/`** — the **backend**: a [Bun](https://bun.sh) + [Hono](https://hono.dev) API on **port 3000**, with a local SQLite database.
  - **`owo-web/`** — the **frontend**: a [Vite](https://vitejs.dev) + React app on **port 5173**.
- The frontend never calls Monnify directly. It calls `/api/...`, which Vite **proxies** to the backend on port 3000 (so there's no CORS to configure).
- For **deposits and payouts to update in real time**, Monnify has to reach your machine with webhooks. Locally that needs a **public tunnel** (cloudflared). More on that in §6.

```
┌────────────┐      /api/*  proxy      ┌────────────┐      HTTPS      ┌─────────┐
│  Frontend  │ ─────────────────────▶ │  Backend   │ ─────────────▶ │ Monnify │
│ Vite :5173 │                        │ Hono :3000 │ ◀───────────── │ sandbox │
└────────────┘                        └─────┬──────┘   webhooks      └─────────┘
                                            │  (need a public tunnel URL locally)
                                       SQLite file
                                    owo-reach/data/owo.sqlite
```

---

## 2. Prerequisites (install these once)

- **Bun** (the backend runs on Bun, not Node — it uses `bun:sqlite` and `hono/bun`, so Node will not work):
  - Install: `curl -fsSL https://bun.sh/install | bash`
  - Bun installs to `~/.bun/bin`. Make sure that's on your `PATH`:
    - Add to your shell profile (`~/.bashrc` / `~/.zshrc`): `export PATH="$HOME/.bun/bin:$PATH"`
    - Then open a new terminal (or `source` the profile).
  - Verify: `bun --version` (this project was last run on **1.3.14**).
- **cloudflared** — only needed for the webhook tunnel (§6). Skip if you just want to click around the UI.
  - macOS: `brew install cloudflared`
  - Linux: download the binary from Cloudflare's releases page and put it on your `PATH`.
  - Verify: `cloudflared --version`
- **Accounts / keys you'll need for a full run:**
  - A **Monnify sandbox** account → [app.monnify.com](https://app.monnify.com) → *Developer → API Keys & Contracts*. You need the **API key**, **secret key**, and **contract code**. These are **required** — the backend refuses to start without them.
  - An **AI provider key** (for the "clean up the messy list" and "pre-flight brief" features). Any one of: Anthropic, OpenAI, Gemini, DeepSeek, or Kimi/Moonshot. Optional to boot the server, but run creation will fail without it.

---

## 3. Repo layout (so you know where you are)

- `owo-reach/` — backend
  - `server/` — API routes, services, DB schema, Monnify + AI integrations
  - `data/owo.sqlite` — the SQLite database file (created locally, git-ignored)
  - `scripts/` — `day1-spike.ts` (sandbox smoke test) and `run-backend.sh` (one-command boot + tunnel)
  - `.env.example` — template for your secrets
- `owo-web/` — frontend
  - `src/` — React app (pages, components, API client)
  - `vite.config.js` — the `/api` → `localhost:3000` proxy
- `RUNBOOK.md` — this file

---

## 4. Run the BACKEND (port 3000)

Do these in order, from a terminal:

- **Go to the backend folder:**
  - `cd owo-reach`
- **Install dependencies:**
  - `bun install`
- **Create your environment file** from the template:
  - `cp .env.example .env`
- **Fill in `.env`** (open it in your editor). Fields:
  - `MONNIFY_API_KEY` — **required**, from the Monnify dashboard.
  - `MONNIFY_SECRET_KEY` — **required**.
  - `MONNIFY_CONTRACT_CODE` — **required**.
  - `MONNIFY_SOURCE_ACCOUNT` — your Monnify sandbox **wallet account number** (Dashboard → Wallet). This is the account payouts are sent *from*. Optional, but disbursements need it.
  - `MONNIFY_BASE_URL` — leave as `https://sandbox.monnify.com` for sandbox.
  - `AI_PROVIDER` — one of `anthropic | openai | gemini | deepseek | kimi | openai-compatible`.
  - `AI_MODEL` — the model slug for that provider (e.g. `claude-sonnet-5`, `gpt-5-mini`, `gemini-flash-latest`, `deepseek-chat`, `kimi-k2`).
  - `AI_API_KEY` — that provider's key.
  - `AI_BASE_URL` — leave blank unless you're using a custom `openai-compatible` endpoint.
  - `PORT` — leave as `3000` (the frontend proxy expects this).
  - `DATABASE_PATH` — leave as `./data/owo.sqlite`.
  - 💡 To switch AI providers later, just change those four `AI_*` values and restart — **no code changes**.
- **Create the database tables** (the DB file is created automatically, but the tables are not — do this once on a fresh clone, and again whenever the schema changes):
  - `bun run db:push`
- **(Optional) Seed demo data** so the dashboard isn't empty:
  - `bun run seed`
- **Start the server** (hot-reloads on file changes):
  - `bun run dev`
- **You should see:** `owo-reach api listening on :3000 (dev)`
- **Verify it's alive** (in another terminal):
  - `curl http://localhost:3000/api/health` → `{"ok":true,"service":"owo-reach"}`
  - API docs (Swagger UI): open `http://localhost:3000/api/docs`

> ⚠️ **Environment variables are read at startup.** If you edit `.env`, **stop and restart** `bun run dev` for the change to take effect.

---

## 5. Run the FRONTEND (port 5173)

In a **second terminal** (leave the backend running in the first):

- **Go to the frontend folder:**
  - `cd owo-web`
- **Install dependencies:**
  - `bun install` (or `npm install` — the frontend is plain Vite/React and works with either)
- **Start the dev server:**
  - `bun run dev`
- **Open the app:**
  - `http://localhost:5173`
- **Sign in** (single admin session for the sandbox):
  - Email: `admin@oworeach.com`
  - Password: `reach2024` (the hint is printed on the sign-in page)
- **How it talks to the backend:** every request goes to `/api/...`, which `vite.config.js` proxies to `http://localhost:3000`. So the backend **must be running** or the app will show "Can't reach the Owó Reach API."

> ℹ️ On the very first load right after starting Vite you may briefly see a blank page while it compiles — refresh once and the sign-in screen appears.

---

## 6. Webhooks + public tunnel (for real deposits & payouts)

You only need this if you want **deposits to credit** and **payout statuses to advance** live. Monnify calls your backend with webhooks, and it can't reach `localhost` — you need a public URL.

- **What the webhook endpoint is:** `POST /api/webhooks/monnify`
- **Start a tunnel** to your backend (in a third terminal):
  - `cloudflared tunnel --url http://localhost:3000`
  - It prints a public URL like `https://something-random.trycloudflare.com`.
- **Register the webhook URL in Monnify:**
  - Monnify dashboard → *Developer → Webhooks* (or API settings).
  - Set the webhook URL to: `https://<your-tunnel>.trycloudflare.com/api/webhooks/monnify`
- **Caveat — the tunnel URL is ephemeral:** cloudflared mints a **new random hostname every time it starts**. Each time you restart it, **re-paste** the new webhook URL into the Monnify dashboard.
- **How to confirm a webhook landed:** watch the backend logs for `POST /api/webhooks/monnify 200`. (An earlier `GET ... 404` is just Monnify's reachability probe — harmless.)

---

## 7. Shortcut: one command for backend + tunnel

Instead of §4's `bun run dev` **and** §6's cloudflared separately, there's a helper script that does both and prints the URLs:

- From `owo-reach/`:
  - `./scripts/run-backend.sh`
- It will:
  - check that `bun`, `cloudflared`, and `.env` are present,
  - start the API on `:3000` and wait until `/api/health` responds,
  - open the cloudflared tunnel,
  - print the **Local API**, **Public URL**, and ready-to-paste **Webhook URL**,
  - stream logs to `owo-reach/.run/server.log` and `.run/tunnel.log`.
- Press **Ctrl-C** to stop the server and the tunnel together.
- ⚠️ This script does **not** start the frontend — run `bun run dev` in `owo-web/` separately (§5).

---

## 8. Handy commands reference

Run these from `owo-reach/` unless noted:

- `bun run dev` — start the API in watch mode (port 3000).
- `bun run db:push` — create/update the SQLite tables from the schema.
- `bun run seed` — insert demo data.
- `bun run spike` — smoke-test your Monnify sandbox keys end-to-end (auth, banks, name enquiry, signature validation). Great first check that your keys work.
- `bun run typecheck` — TypeScript check, no emit.
- `bun test` — run the test suite.
- `./scripts/run-backend.sh` — boot API + tunnel together (§7).

From `owo-web/`:

- `bun run dev` — start the frontend (port 5173).
- `bun run build` — production build.
- `bun run preview` — serve the production build locally.

---

## 9. Ports & URLs at a glance

| What | URL |
|---|---|
| Frontend (the app you use) | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/api/health |
| API docs (Swagger) | http://localhost:3000/api/docs |
| Webhook endpoint | `<public-tunnel>/api/webhooks/monnify` |
| Sign-in | email `admin@oworeach.com`, password `reach2024` |

---

## 10. Troubleshooting

- **`bun: command not found`**
  - Bun isn't on your `PATH`. Run `export PATH="$HOME/.bun/bin:$PATH"` (and add it to your shell profile).
- **Backend exits immediately with "Missing required env var …"**
  - You skipped a required Monnify value in `.env`. Fill in `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, and `MONNIFY_CONTRACT_CODE`.
- **`address already in use` / port 3000 busy**
  - Another process is on 3000. Find and stop it: `ss -ltnp | grep :3000` (Linux) then kill that PID, or change `PORT` in `.env` (but then also update the target in `owo-web/vite.config.js`).
- **Frontend shows "Can't reach the Owó Reach API"**
  - The backend isn't running, or not on port 3000. Start it (§4) and confirm `curl http://localhost:3000/api/health`.
- **Creating a run fails with "The AI service is temporarily rate-limited"**
  - Your AI provider hit a rate/quota limit (e.g. Gemini's free tier is ~20 requests/day; each run uses ~2 calls). Wait for the quota to reset, or switch to another provider by changing the `AI_*` values in `.env` and restarting.
- **A run won't create at all / "No beneficiaries could be extracted"**
  - Check `AI_PROVIDER`, `AI_MODEL`, and `AI_API_KEY` are set correctly. If a model slug 404s, list available models: `curl -s <AI_BASE_URL>/models -H "Authorization: Bearer $AI_API_KEY"`.
- **"no such table" / database errors**
  - You didn't create the tables. Run `bun run db:push` from `owo-reach/`.
- **Deposit paid but balance doesn't update**
  - The webhook isn't reaching you. Confirm the tunnel is running (§6) and that the **current** tunnel URL is registered in the Monnify dashboard (it changes on every restart). Check backend logs for `POST /api/webhooks/monnify 200`.
- **Payout statuses stuck / not advancing on the Live Batch screen**
  - Same cause as above — a webhook that never arrived. There's a fallback reconciliation sweep, but it only re-checks items that have been in flight for 5+ minutes. Make sure the webhook URL is current.
- **Blank white page on first load**
  - Vite was still compiling. Refresh the page.

---

## 11. Quick start (TL;DR)

Three terminals:

```bash
# Terminal 1 — backend (first time: install, configure, create tables)
cd owo-reach
bun install
cp .env.example .env        # then edit .env with your Monnify + AI keys
bun run db:push             # create the database tables
bun run seed                # optional: demo data
bun run dev                 # API on http://localhost:3000

# Terminal 2 — frontend
cd owo-web
bun install
bun run dev                 # app on http://localhost:5173

# Terminal 3 — tunnel (only needed for live webhooks)
cd owo-reach
cloudflared tunnel --url http://localhost:3000
# → paste the printed https URL + /api/webhooks/monnify into the Monnify dashboard
```

Then open **http://localhost:5173**, sign in with `admin@oworeach.com` / `reach2024`, and you're in.
