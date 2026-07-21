# Owó Reach — PRD & Build Plan

**Monnify Developer Challenge · API Conference Lagos 2026**
**Deadline: 12pm WAT, Monday July 21, 2026 · Team of 2**

---

## 1. One-liner

**Payroll for the informal economy.** One dashboard where any organisation — NGO, cooperative, church, small business — pays everyone on a list in one click: banked recipients by instant bank transfer, unbanked recipients by a Monnify **Paycode** they redeem for cash at any Moniepoint agent.

## 2. The problem

Roughly a third of Nigerian adults have no bank account, yet every payout tool assumes one. Organisations that pay stipends, farm-gate prices, welfare, or casual wages fall back on physically distributing cash: slow, risky, unauditable, and impossible to reconcile. The people most in need of reliable payment are the hardest to pay.

## 3. Why this wins (judging-criteria map)

| Judging criterion | How we hit it |
|---|---|
| Solves a real problem / useful API workflow | Financial inclusion payouts; a workflow (offline cash disbursement) no checkout clone touches |
| Clarity & storytelling | One narrative: "pay Amina, who has no bank account, in 90 seconds." Demo video scripted around one recipient's journey |
| Technical depth | Webhook-driven state machine, full Paycode lifecycle (create → redeem → expire → reissue → cancel), masked/clear-code authorization flow, HMAC-validated webhooks, MFA/OTP disbursement handling, AI ingestion of messy beneficiary data |
| No errors / broken links / exposed secrets | SQLite = zero-dependency local setup; `.env.example`; webhook signature validation; secrets never committed |
| Public repo + step-by-step local setup | `bun install && bun run db:push && bun run seed && bun run dev` — judges running it cold is a design goal |

Strategic edge: Paycode is **exclusive to Monnify** and testable end-to-end in sandbox via the dashboard Simulator tab. Judges are Monnify's own team; we showcase the feature nobody else will.

## 4. Users

- **Org admin (primary)** — bursar/ops person at an NGO, cooperative, or SME. Uploads lists, approves runs, answers "did everyone get paid?"
- **Recipient (secondary, no app)** — interacts only via SMS. Banked: money appears. Unbanked: gets a paycode + instructions.

## 5. Scope

### In scope (the golden path — build nothing else)

1. **Create payout run** — paste/upload a messy beneficiary list (CSV, spreadsheet, or free text). AI normalises to `{name, phone, amountKobo, accountNumber?, bankCode?}`, flags duplicates and outlier amounts.
2. **Verify** — for banked beneficiaries, Name Enquiry checks the account name matches; mismatches are flagged for review, never silently paid.
3. **Review screen** — totals, fees (₦100 flat per paycode), flags, one approve button. AI writes a plain-language pre-flight summary.
4. **Execute** — bank transfers via Disbursement API (handle `PENDING_AUTHORIZATION` + OTP); paycodes via Paycode API; SMS/WhatsApp message per unbanked recipient (simulated sender is fine — log the message body).
5. **Live reconciliation dashboard** — every beneficiary has a state: `QUEUED → SENT/CODE_ISSUED → COMPLETED / FAILED / EXPIRED`. Webhooks drive all state changes; SSE pushes them to the UI instantly.
6. **Lifecycle actions** — resend expiring-code nudge, reissue expired code, cancel code (refunds the run). Reveal a masked code via the authorized Get Clear Paycode flow.

### Explicitly out of scope (do not build)

Recipient-facing app · multi-org auth/tenancy · wallets · bills payment · real SMS gateway integration (stub it, show the message) · admin roles/permissions · anything mobile-native.

## 6. Where AI lives (and doesn't)

**Two features, both load-bearing:**
1. **Chaos ingestion** — LLM turns WhatsApp-pasted text, ragged CSVs, or a photo'd list into structured beneficiaries; flags duplicates ("Chidi appears twice"), anomalies ("this amount is 10× the run average"), and missing data.
2. **Pre-flight brief** — before approval: "23 recipients, ₦415,000 total, 2 name mismatches, 1 duplicate phone, est. fees ₦2,300."

**Banned:** chatbots, AI imagery, "ask AI anything" panels. The brief says AI slop is frowned upon — two sharp features beat five decorative ones.

## 7. Monnify API map

| Capability | Endpoint (sandbox base: `https://sandbox.monnify.com`) | Used for |
|---|---|---|
| Auth | `POST /api/v1/auth/login` (Basic apiKey:secret → Bearer token) | Everything; token cached until expiry |
| Name Enquiry | `GET /api/v1/disbursements/account/validate` | Verify banked beneficiaries |
| Banks list | `GET /api/v1/banks` | Bank picker / code lookup |
| Single transfer | `POST /api/v2/disbursements/single` | Banked payouts |
| Authorize transfer (OTP) | `POST /api/v2/disbursements/single/validate-otp` | Sandbox MFA is ON by default — transfers return `PENDING_AUTHORIZATION` |
| Transfer status | `GET /api/v2/disbursements/single/summary?reference=` | Reconcile missed webhooks |
| Paycode create/get/clear/cancel/fetch | see API reference `#tag/paycode-api` — **verify exact paths in Day-1 spike** | Unbanked payouts |
| Webhooks | HMAC-SHA512 of raw body with client secret, `monnify-signature` header | All state transitions |

Sandbox facts to remember: disbursements are enabled by default in sandbox but MFA/OTP is also on by default; offline products (paycodes) are testable from the dashboard **Simulator** tab; webhook URL is set in dashboard settings and needs a public URL (Cloudflare Tunnel / ngrok in dev).

## 8. Architecture

Single repo, single deployable. **Bun + Hono + Drizzle + SQLite** backend; **Vite + React + TanStack Query + Tailwind** frontend; Hono serves the built frontend in production, so one process = one public URL = webhook endpoint with no CORS.

Principles:
- **Money is integers (kobo).** Never floats. Convert at the Monnify boundary only.
- **Webhook-driven, never polled.** Accept → persist event → return 200 fast → process async → push over SSE. Status API used only as a reconciliation fallback.
- **Event log table** = audit trail = activity feed. Every state change is an appended event.
- **Optimistic UI** — approval moves instantly, reconciles when the API confirms.
- **Stream AI output** into the review screen; never show a dead spinner.

## 9. Data model (Drizzle/SQLite)

- `payout_runs` — id, title, status (`DRAFT/REVIEW/EXECUTING/COMPLETED/PARTIAL`), totals, createdAt
- `beneficiaries` — id, runId, name, phone, amountKobo, rail (`BANK/PAYCODE`), accountNumber?, bankCode?, nameEnquiryResult?, status, monnifyReference, paycodeReference?, flags(json)
- `events` — id, runId?, beneficiaryId?, type, payload(json), createdAt

## 10. Six-day plan & division of labour

| Day | Person A (backend/integration) | Person B (frontend/product) | Shared |
|---|---|---|---|
| **Wed 15 (today)** | Run Day-1 spike script end-to-end; verify paycode endpoints against API reference; get webhook firing via tunnel | Repo setup, Vite shell, design tokens, dashboard skeleton | Both join `apiconf-hackathon`, intro posts, ticket + sandbox keys, social post with #APIConfXMonnify #DeveloperChallenge |
| **Thu 16** | Monnify client hardened (token cache, OTP flow, webhook validation); runs/execute service | Run creation flow + review screen | Agree API contract between FE/BE |
| **Fri 17** | Paycode lifecycle (issue, cancel, reissue, clear-code auth); SSE events | Live dashboard, beneficiary states, activity feed | — |
| **Sat 18** | AI ingestion + pre-flight brief (streamed) | Polish golden path; empty/error states | Integration test the full flow |
| **Sun 19** | Seed data, reconciliation fallback job | README walkthrough; record demo video (script below) | Freeze features at noon |
| **Mon 20** | Bug bash; secrets audit; fresh-clone setup test on a clean machine | Video edit; repo README final pass | Submit in Slack channel — **do not wait for the 21st** |
| **Tue 21 am** | Buffer only | Buffer only | Deadline 12pm WAT |

## 11. Demo video (2–5 min, script now)

1. **Cold open, problem first:** "Every month this cooperative pays 200 farmers. Forty of them have no bank account."
2. Messy list goes in → AI cleans it, catches a duplicate and a name mismatch on screen.
3. One click to approve. Split-screen: transfers fire, paycodes issue.
4. Recipient's phone: the SMS with the code. Cut to Simulator: agent redeems.
5. Dashboard flips to COMPLETED live (SSE). Close on reconciliation view: "every naira accounted for."

No feature tours. One story. Rehearse twice, record once.

## 12. Risks & kill-switches

| Risk | Trigger | Response |
|---|---|---|
| Paycode API weak/broken in sandbox | Day-1 spike fails after 3h effort | Pivot unbanked rail to SMS + reserved account; product story survives |
| Sandbox OTP flow blocks automation | OTP not retrievable programmatically | Semi-automate: surface OTP entry in the admin UI (this is actually a realistic maker-checker feature — sell it as one) |
| Webhook delivery flaky in sandbox | Missed events during demo | Reconciliation fallback polls status API for stale in-flight items every 60s |
| Scope creep | Anyone says "wouldn't it be cool if" after Fri | The answer is no. Golden path only. |

## 13. Submission checklist

- [ ] Working prototype deployed (Railway/Fly), sandbox keys only
- [ ] Public repo, `.env.example`, zero secrets in history (`git log -p | grep -i secret` before pushing)
- [ ] README: problem → demo GIF → architecture diagram → cold-start setup steps (tested on a clean machine)
- [ ] 2–5 min demo video linked
- [ ] Both registered attendees with conference tickets
- [ ] Intro'd + notifications on in `apiconf-hackathon`; submission link followed
- [ ] Social post with #APIConfXMonnify and #DeveloperChallenge
