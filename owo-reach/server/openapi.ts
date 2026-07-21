/**
 * Hand-written OpenAPI 3.0 spec, served at /api/openapi.json and rendered at
 * /api/docs (Swagger UI). Kept as one plain object rather than per-route
 * decorators: easier to read top-to-bottom, and routes stay framework-plain
 * Hono with no schema-library coupling.
 */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Owó Reach API",
    version: "1.0.0",
    description:
      "Payroll for the informal economy. Upload a beneficiary list, messy or " +
      "clean, and every person gets paid through whichever rail reaches them: " +
      "an instant bank transfer if they're banked, or a Monnify **Paycode** " +
      "(redeemable for cash at any Moniepoint agent) if they're not.\n\n" +
      "All money in this API is **integer kobo** (₦1 = 100 kobo). All payment " +
      "state changes are webhook-driven; the dashboard should treat `GET` " +
      "responses as a snapshot and subscribe to `/api/events` (Server-Sent " +
      "Events) for live updates.",
    contact: { name: "Owó Reach", url: "https://github.com/" },
  },
  servers: [{ url: "/api", description: "Same origin as the web app" }],
  tags: [
    { name: "Runs", description: "Create, review, and approve a payout run." },
    { name: "Beneficiaries", description: "Lifecycle actions on a single beneficiary within a run." },
    { name: "Banks", description: "Bank list for account verification." },
    { name: "Ledger", description: "Internal balance tracking, so an admin never has to leave the app to check funds." },
    { name: "Webhooks", description: "Inbound Monnify webhook receiver." },
    { name: "Events", description: "Live dashboard stream." },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Runs"],
        summary: "Liveness check",
        responses: {
          "200": {
            description: "Service is up",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
          },
        },
      },
    },

    "/runs": {
      get: {
        tags: ["Runs"],
        summary: "List payout runs",
        description: "Most recent first.",
        responses: {
          "200": {
            description: "Payout runs",
            content: {
              "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/PayoutRun" } } },
            },
          },
        },
      },
      post: {
        tags: ["Runs"],
        summary: "Create a run from a messy beneficiary list",
        description:
          "The core of **chaos ingestion**: paste a ragged CSV, WhatsApp text, or " +
          "free-form list and an AI model extracts structured beneficiaries. Every " +
          "banked beneficiary is then checked with Monnify Name Enquiry, " +
          "duplicates and amount outliers are flagged deterministically, and an " +
          "AI-written plain-language pre-flight brief is attached. Runs " +
          "synchronously (typically a few seconds) and returns the finished run " +
          "in `REVIEW` status, ready for `/runs/{id}/approve`.\n\n" +
          "Progress is also published on `/api/events` as `ingestion.started` → " +
          "`ingestion.parsed` → `ingestion.verifying` → `ingestion.brief` → " +
          "`run.created`, so a connected dashboard never shows a dead spinner " +
          "while waiting on this call.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateRunRequest" },
              example: {
                title: "Green Harvest Co-op: July stipends",
                rawInput:
                  "Chidi Okonkwo 08031234567 25000 GTBank 0123456789\n" +
                  "Amina Yusuf 08029876543 20000 (no bank account)\n" +
                  "Tunde Bakare 07011112222 25000 Zenith 0987654321",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Run created, verified, and briefed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    run: { $ref: "#/components/schemas/PayoutRun" },
                    beneficiaries: { type: "array", items: { $ref: "#/components/schemas/Beneficiary" } },
                  },
                },
              },
            },
          },
          "400": { description: "Missing title or rawInput", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "422": {
            description: "AI ingestion failed, or nothing could be extracted",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/runs/{id}": {
      get: {
        tags: ["Runs"],
        summary: "Get a run with its beneficiaries and recent activity",
        parameters: [{ $ref: "#/components/parameters/RunId" }],
        responses: {
          "200": {
            description: "Run detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    run: { $ref: "#/components/schemas/PayoutRun" },
                    beneficiaries: { type: "array", items: { $ref: "#/components/schemas/Beneficiary" } },
                    events: { type: "array", items: { $ref: "#/components/schemas/Event" }, description: "Most recent 50" },
                  },
                },
              },
            },
          },
          "404": { description: "Run not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    "/runs/{id}/approve": {
      post: {
        tags: ["Runs"],
        summary: "Approve a run and start execution",
        description:
          "Every un-flagged, `PENDING_REVIEW` beneficiary moves to `QUEUED` and " +
          "execution starts in the background (bank transfers via the " +
          "Disbursement API, paycodes via the Paycode API). Returns immediately; " +
          "follow `/api/events` or poll `GET /runs/{id}` for progress. Flagged " +
          "beneficiaries are skipped; resolve their flags and re-approve, or " +
          "cancel them individually.\n\nGated on the internal ledger: the full " +
          "cost of everyone about to be queued is reserved atomically first. " +
          "If the ledger balance is short, nothing is queued and nothing is " +
          "reserved (see the Ledger tag).",
        parameters: [{ $ref: "#/components/parameters/RunId" }],
        responses: {
          "200": {
            description: "Execution started",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean" }, status: { type: "string", example: "EXECUTING" } } },
              },
            },
          },
          "404": { description: "Run not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "402": {
            description: "Ledger balance can't cover this run; record a deposit via POST /ledger/deposits first",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Run is not in REVIEW status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/banks": {
      get: {
        tags: ["Banks"],
        summary: "List supported banks",
        description: "Passed through from Monnify's bank list. Used for the manual bank picker and to resolve bank names extracted during ingestion.",
        responses: {
          "200": {
            description: "Banks",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Bank" } } } },
          },
        },
      },
    },

    "/ledger/balance": {
      get: {
        tags: ["Ledger"],
        summary: "Current available balance",
        description:
          "So an admin never has to leave the app to know if a run is " +
          "affordable. This is owo-reach's own tracked figure (deposits minus " +
          "reserved/spent run totals) shown instead of the real Monnify wallet " +
          "balance. Deposits are real, not self-reported: the balance only " +
          "moves once a Monnify Collections webhook confirms a checkout " +
          "actually completed (see POST /ledger/deposits/checkout).",
        responses: {
          "200": {
            description: "Balance",
            content: { "application/json": { schema: { type: "object", properties: { balanceKobo: { type: "integer", example: 900000 } } } } },
          },
        },
      },
    },

    "/ledger": {
      get: {
        tags: ["Ledger"],
        summary: "List ledger entries",
        description: "Audit trail: deposits, and every run's fund reservation (RUN_RESERVE) and release (RUN_REFUND). Most recent first.",
        responses: {
          "200": {
            description: "Ledger entries",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/LedgerEntry" } } } },
          },
        },
      },
    },

    "/ledger/deposits/checkout": {
      post: {
        tags: ["Ledger"],
        summary: "Start a real deposit via Monnify Checkout",
        description:
          "Initiates a Monnify Collections checkout and returns the URL to " +
          "send the org to pay at (card, bank transfer, or USSD). This call " +
          "credits nothing by itself: `GET /ledger/balance` won't reflect it " +
          "until Monnify posts a `SUCCESSFUL_TRANSACTION` webhook confirming " +
          "the payment actually completed, at which point it's credited " +
          "automatically. There is no endpoint that credits the ledger on " +
          "request alone.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amountKobo", "customerName", "customerEmail"],
                properties: {
                  amountKobo: { type: "integer", example: 500000 },
                  customerName: { type: "string", example: "Green Harvest Co-op" },
                  customerEmail: { type: "string", example: "ops@greenharvest.example" },
                  redirectUrl: { type: "string", description: "Where the org lands after paying", example: "https://owo-reach.onrender.com/ledger" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Checkout session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    checkoutUrl: { type: "string", example: "https://sandbox.sdk.monnify.com/checkout/MNFY|20260719120000|000090" },
                    reference: { type: "string", example: "owo-deposit-ldg_k3jdm9271a4f" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing amountKobo, customerName, or customerEmail", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "422": {
            description: "amountKobo is not a positive integer",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/beneficiaries/{id}/otp": {
      post: {
        tags: ["Beneficiaries"],
        summary: "Submit the OTP for a transfer awaiting authorization",
        description:
          "Monnify's sandbox has MFA on by default, so a bank transfer often " +
          "comes back `PENDING_AUTHORIZATION` instead of completing immediately. " +
          "This is a deliberate maker-checker step: an admin enters the OTP " +
          "(delivered to the merchant email/dashboard in sandbox) here to " +
          "release the transfer. On success the beneficiary moves to `SENT`.",
        parameters: [{ $ref: "#/components/parameters/BeneficiaryId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["otp"], properties: { otp: { type: "string", example: "123456" } } },
            },
          },
        },
        responses: {
          "200": { description: "Authorized", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "400": { description: "Missing otp", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "422": {
            description: "Beneficiary not in PENDING_AUTHORIZATION, or OTP rejected",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/beneficiaries/{id}/otp/resend": {
      post: {
        tags: ["Beneficiaries"],
        summary: "Resend the transfer OTP",
        parameters: [{ $ref: "#/components/parameters/BeneficiaryId" }],
        responses: {
          "200": { description: "Resent", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "422": {
            description: "Beneficiary not in PENDING_AUTHORIZATION",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/beneficiaries/{id}/reveal": {
      post: {
        tags: ["Beneficiaries"],
        summary: "Reveal the clear (unmasked) paycode",
        description:
          "Paycodes are stored and displayed masked everywhere. This is the one " +
          "explicit, authorized path to the clear code (for example, when a " +
          "recipient loses the original SMS). The reveal action is written to " +
          "the audit trail (the code value itself is not persisted in the log).",
        parameters: [{ $ref: "#/components/parameters/BeneficiaryId" }],
        responses: {
          "200": {
            description: "Clear paycode",
            content: { "application/json": { schema: { type: "object", properties: { paycode: { type: "string", example: "4821059637" } } } } },
          },
          "422": { description: "Beneficiary has no paycode", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    "/beneficiaries/{id}/cancel": {
      post: {
        tags: ["Beneficiaries"],
        summary: "Cancel an unredeemed code or pending transfer",
        description: "Refunds the beneficiary's amount back into the run's total. Valid from QUEUED, SENT, CODE_ISSUED, PENDING_AUTHORIZATION, or EXPIRED.",
        parameters: [{ $ref: "#/components/parameters/BeneficiaryId" }],
        responses: {
          "200": { description: "Cancelled", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "422": {
            description: "Beneficiary cannot be cancelled from its current status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/beneficiaries/{id}/reissue": {
      post: {
        tags: ["Beneficiaries"],
        summary: "Reissue a fresh paycode for an expired one",
        description: "Only valid from EXPIRED. Creates a new paycode reference and expiry for the same amount and composes a fresh SMS body.",
        parameters: [{ $ref: "#/components/parameters/BeneficiaryId" }],
        responses: {
          "200": { description: "Reissued", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "422": { description: "Beneficiary is not EXPIRED", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    "/beneficiaries/{id}/nudge": {
      post: {
        tags: ["Beneficiaries"],
        summary: "Send an expiry-reminder nudge",
        description: "Only valid from CODE_ISSUED. SMS sending is stubbed for the sandbox build; the composed message body is logged to the audit trail and returned here for display.",
        parameters: [{ $ref: "#/components/parameters/BeneficiaryId" }],
        responses: {
          "200": {
            description: "Nudge composed and logged",
            content: { "application/json": { schema: { type: "object", properties: { sms: { type: "string" } } } } },
          },
          "422": { description: "Beneficiary is not CODE_ISSUED", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    "/webhooks/monnify": {
      post: {
        tags: ["Webhooks"],
        summary: "Monnify webhook receiver",
        description:
          "Every payment state transition arrives here, from both Monnify " +
          "products this app uses: Disbursements (transfers, paycodes, " +
          "which drive beneficiary status) and Collections (checkout " +
          "deposits: a `SUCCESSFUL_TRANSACTION` with a `paymentReference` starting " +
          "`owo-deposit-` credits the ledger). The raw body is validated " +
          "against the `monnify-signature` header (HMAC-SHA512 with the " +
          "client secret) before anything is trusted or parsed. Always " +
          "responds fast; processing that touches beneficiary or ledger " +
          "state happens inline but is designed to be idempotent, since " +
          "Monnify retries on anything but a 2xx.",
        parameters: [
          {
            name: "monnify-signature",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "hex(HMAC-SHA512(rawBody, clientSecret))",
          },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MonnifyWebhookEvent" } } } },
        responses: {
          "200": { description: "Accepted", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "401": { description: "Invalid signature", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    "/events": {
      get: {
        tags: ["Events"],
        summary: "Live dashboard stream (Server-Sent Events)",
        description:
          "`Content-Type: text/event-stream`. Every payment state change, " +
          "ingestion progress tick, and lifecycle action is published here the " +
          "instant it happens; this is what keeps the dashboard live without " +
          "polling. A `ping` event is sent every 25s to keep proxies from " +
          "closing the connection. Not representable as a normal JSON response; " +
          "connect with `EventSource` or `curl -N`.",
        responses: {
          "200": {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: { type: "string" },
                example:
                  "event: beneficiary.updated\n" +
                  'data: {"type":"beneficiary.updated","payload":{"beneficiaryId":"ben_x1","status":"COMPLETED"},"at":"2026-07-18T10:00:00.000Z"}\n\n',
              },
            },
          },
        },
      },
    },
  },

  components: {
    parameters: {
      RunId: { name: "id", in: "path", required: true, schema: { type: "string", example: "run_x7kq9f2a1b3c" } },
      BeneficiaryId: { name: "id", in: "path", required: true, schema: { type: "string", example: "ben_k3jdm9271a4f" } },
    },
    schemas: {
      Health: { type: "object", properties: { ok: { type: "boolean" }, service: { type: "string", example: "owo-reach" } } },

      CreateRunRequest: {
        type: "object",
        required: ["title", "rawInput"],
        properties: {
          title: { type: "string", example: "Green Harvest Co-op: July stipends" },
          rawInput: {
            type: "string",
            description: "A messy CSV, pasted WhatsApp text, or free-form list of beneficiaries.",
          },
        },
      },

      PayoutRun: {
        type: "object",
        properties: {
          id: { type: "string", example: "run_x7kq9f2a1b3c" },
          title: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "REVIEW", "EXECUTING", "COMPLETED", "PARTIAL", "FAILED"] },
          totalAmountKobo: { type: "integer", description: "Sum of all beneficiary amounts, in kobo.", example: 12800000 },
          totalFeesKobo: { type: "integer", description: "₦100 flat fee × number of paycode beneficiaries.", example: 30000 },
          preflightBrief: { type: "string", nullable: true, description: "AI-written plain-language summary shown at review." },
          createdAt: { type: "string", format: "date-time" },
        },
      },

      Beneficiary: {
        type: "object",
        properties: {
          id: { type: "string", example: "ben_k3jdm9271a4f" },
          runId: { type: "string" },
          name: { type: "string" },
          phone: { type: "string", example: "+2348031234567" },
          amountKobo: { type: "integer", example: 2500000 },
          rail: { type: "string", enum: ["BANK", "PAYCODE"] },
          accountNumber: { type: "string", nullable: true },
          bankCode: { type: "string", nullable: true },
          nameEnquiryName: { type: "string", nullable: true, description: "What Monnify's Name Enquiry says the account is called." },
          nameMatch: { type: "boolean", nullable: true },
          status: {
            type: "string",
            enum: [
              "PENDING_REVIEW",
              "QUEUED",
              "PENDING_AUTHORIZATION",
              "SENT",
              "CODE_ISSUED",
              "COMPLETED",
              "FAILED",
              "EXPIRED",
              "CANCELLED",
            ],
          },
          monnifyReference: { type: "string", nullable: true },
          flags: { type: "array", items: { type: "string" }, example: ["Bank record name does not match: OLUWASEUN ADEBAYO"] },
          smsBody: { type: "string", nullable: true, description: "The (simulated) SMS sent for a paycode recipient." },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      Event: {
        type: "object",
        description: "Append-only audit trail entry. Doubles as the dashboard activity feed.",
        properties: {
          id: { type: "integer" },
          runId: { type: "string", nullable: true },
          beneficiaryId: { type: "string", nullable: true },
          type: { type: "string", example: "beneficiary.completed" },
          payload: { type: "object", additionalProperties: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },

      Bank: {
        type: "object",
        properties: { name: { type: "string", example: "Guaranty Trust Bank" }, code: { type: "string", example: "058" } },
      },

      LedgerEntry: {
        type: "object",
        description: "One row of owo-reach's own tracked balance. Signed amountKobo; balance is always SUM over these rows.",
        properties: {
          id: { type: "string", example: "ldg_k3jdm9271a4f" },
          type: { type: "string", enum: ["DEPOSIT", "RUN_RESERVE", "RUN_REFUND"] },
          amountKobo: { type: "integer", description: "Positive for DEPOSIT/RUN_REFUND, negative for RUN_RESERVE", example: 500000 },
          runId: { type: "string", nullable: true, description: "Set for RUN_RESERVE / RUN_REFUND" },
          beneficiaryId: { type: "string", nullable: true, description: "Set for RUN_RESERVE / RUN_REFUND" },
          reference: { type: "string", nullable: true, description: "Monnify paymentReference, set for DEPOSIT" },
          note: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },

      MonnifyWebhookEvent: {
        type: "object",
        properties: {
          eventType: { type: "string", example: "SUCCESSFUL_DISBURSEMENT" },
          eventData: { type: "object", additionalProperties: true },
        },
      },

      Error: { type: "object", properties: { error: { type: "string" } } },
    },
  },
} as const;
