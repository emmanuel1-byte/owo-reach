# Owó Reach — frontend ↔ backend integration

This app talks to the backend (Bun + Hono, in `server/` at the repository root) over `/api/*`.

## Running it

1. Start the backend first, from the repository root:
   ```
   bun run dev    # listens on :3000
   ```
2. In this frontend directory (`web/`), install and run:
   ```
   bun install
   bun run dev
   ```
   Vite's dev server proxies every `/api/*` request to `http://localhost:3000`
   (see `vite.config.js`), so no CORS setup was needed on the backend at all.
   In production, the backend serves this app's build output itself: same
   origin, same story, zero proxy config required.

## What's wired up

| Screen | Backend endpoints |
|---|---|
| **Home** (`/home`) | `GET /api/runs` (recent runs), `POST /api/runs` (create + AI ingestion), live `ingestion.*` / `run.created` SSE events for progress |
| **Review** (`/review/:runId`) | `GET /api/runs/:id`, `POST /api/runs/:id/approve` |
| **Live batch** (`/batch/:runId`) | `GET /api/runs/:id`, `POST /api/beneficiaries/:id/otp`, `.../otp/resend`, `.../reveal`, `.../cancel`, `.../reissue`, `.../nudge`, plus the live `GET /api/events` SSE wire for real-time state |
| **Audit** (`/audit/:runId`) | `GET /api/runs/:id` (receipt + trail built from real events; export is a client-side download, no backend endpoint for this exists) |
| **Transactions** (`/transactions`) | `GET /api/runs` + `GET /api/runs/:id` per run, flattened into one ledger client-side |
| **Ledger** (`/ledger`) | `GET /api/ledger` (full movement history), `GET /api/ledger/balance`, `POST /api/ledger/deposits/checkout` |
| **Balance strip** (every screen) | `GET /api/ledger/balance`, re-read on `webhook.received` / `run.updated` / `beneficiary.updated` |
| **Settings** | `GET /api/health` only — the API has no org/profile/key-management endpoints, so this page says so instead of faking saves |

## Data layer

Server state lives in **TanStack Query** (`src/lib/queries.js`), not in per-page
`useState` + `useEffect`. Every key is declared once in `qk` so the live-event
wire can invalidate by prefix.

- **One EventSource for the whole app.** `src/lib/liveEvents.jsx` opens a single
  connection above the router and maps each event type to the queries it
  invalidates. Previously each page opened its own, so a single screen could
  hold several connections to the same stream.
- **`useLiveEvents(cb)` still exists** for screens that need the events
  themselves rather than merely fresh data — only Home does, for the ingestion
  progress steps. It subscribes to the shared connection instead of opening one.
- **Run details are shared.** Transactions fans out to every run via
  `useQueries`, writing into the same `["run", id]` entries Review/Batch/Audit
  read — so opening a run after visiting Transactions is already warm.
- **Writes are mutations** (`useMutation`) that invalidate what they touched. A
  beneficiary action invalidates the run, the run list, *and* the ledger, since
  cancelling writes a `RUN_REFUND`.

## Layout and tables

- Every page container is `max-w-6xl`. Keep it that way — mixed widths make the
  content edges jump as you move between screens. The narrower `max-w-2xl` /
  `max-w-3xl` inside pages are deliberate prose measures, not page widths.
- Tables use the shadcn-style components in `src/components/ui/table.jsx`,
  re-themed with this project's hairline/Outfit/mono tokens. `Table` takes a
  `minWidth` prop and handles its own horizontal scroll, so wide tables never
  push the page body sideways on mobile. The old `.ledger` CSS class is gone;
  `.ledger-total` remains for the double-rule summary rows, which sit on
  `<div>`/`<dl>` rather than tables.

## Motion

This is a money console, so motion earns its place by carrying information —
never by decorating. The rule of thumb: animate a change the operator would
otherwise miss, and nothing else.

- **The balance rolls only when it actually changes** (`src/lib/useCountUp.js`).
  It deliberately does not count up on first render — that would be decoration
  on every page load. A roll means money moved, and it's paired with a brief
  wash so the eye catches it.
- **Rows flash on live state transitions** in Batch, because a pushed update
  otherwise just silently differs from what you were looking at.
- **Skeletons, not spinners or "Loading…" text.** The placeholder is the shape
  of the incoming content, so nothing reflows when data lands.
- **Rows stagger in** via `.row-enter` and a `--row` index custom property.
- `prefers-reduced-motion` is honoured globally in `index.css`, and `useCountUp`
  checks it directly so the number snaps instead of rolling.

## Things worth knowing

- **Sign in / Sign up** are still a cosmetic gate (no `/api/auth/*` exists on
  the backend) — they just navigate to `/home`.
- **Toasts** (`src/lib/toast.jsx`) surface every API error and success,
  including a specific message when the backend is unreachable at all.
- **Live updates** come from a single `EventSource` per page
  (`src/lib/useLiveEvents.js`) subscribed to `/api/events`. On any relevant
  event the page re-fetches the run rather than hand-merging partial SSE
  payloads — simpler and correct at this product's scale.
- All money is formatted from the integer-kobo values the API returns
  (`src/lib/money.js`) — no client-side money math, only formatting. The one
  exception is `parseNairaToKobo`, converting typed naira into the integer kobo
  the API expects on a deposit.

## The ledger

- **Nothing credits on request.** `POST /ledger/deposits/checkout` only returns a
  Monnify Checkout URL; the balance moves when Monnify's Collections webhook
  confirms the payment. The deposit dialog reflects that honestly — it goes to a
  "waiting on Monnify" state and only claims success once a `DEPOSIT` row with
  the matching `reference` actually appears in `GET /ledger`.
- **Pending deposits survive reloads** via `src/lib/pendingDeposit.js`, so a
  checkout started before a redirect (or a closed tab) still shows as
  outstanding rather than silently vanishing. It clears itself when the matching
  ledger row lands, or after an hour.
- **Balance lives in one context** (`src/lib/ledger.jsx`), above the router, so
  the strip and the Ledger page share a single fetch and event subscription.
- **The Ledger page reconstructs a running balance** by accumulating entries
  oldest-first. This is exact, not an approximation: the API defines the balance
  as the sum of all rows, and there's no pagination.
- **Approval is funding-aware.** `POST /runs/:id/approve` answers `402` when the
  ledger can't cover the run; Review catches that specifically, re-reads the
  balance, and opens the deposit dialog. It also warns *before* the click — but
  note the requirement is the sum of **unflagged** beneficiaries only (flagged
  rows stay `PENDING_REVIEW` and are never paid, and fees aren't reserved), not
  the run total shown as "Total authorised". The server remains the authority.
