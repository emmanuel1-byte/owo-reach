// Thin client for the owo-reach API. Every call goes through /api, which Vite
// proxies to the backend in dev (see vite.config.js) and which the backend
// serves itself alongside the built frontend in production — no CORS, ever.

const BASE = "/api";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const STATUS_FALLBACKS = {
  400: "That request wasn't quite right. Check the details and try again.",
  401: "Your session isn't authorised for this. Sign in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: "That's already been done, or the item has moved on since this page loaded.",
  422: "We couldn't complete that. Check the details and try again.",
  429: "Too many requests at once. Wait a moment and try again.",
  500: "Something went wrong on our side. Try again in a moment.",
  502: "The server is unreachable right now. Try again in a moment.",
  503: "The service is temporarily unavailable. Try again in a moment.",
};

const GENERIC_FALLBACK = "Something went wrong. Try again in a moment.";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    // fetch only throws on network-level failure (backend down, refused, DNS, etc.)
    throw new ApiError(
      "Can't reach the Owó Reach API. Make sure the backend is running on :3000.",
      0
    );
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    // The API writes plain-language messages (server/lib/errors.ts), so its
    // wording wins. These only cover the case where a response carries no
    // body at all — "Request failed (500)" tells an ops admin nothing.
    const message = data?.error || STATUS_FALLBACKS[res.status] || GENERIC_FALLBACK;
    throw new ApiError(message, res.status);
  }
  return data;
}

export const api = {
  health: () => request("/health"),

  listRuns: () => request("/runs"),
  createRun: (title, rawInput) =>
    request("/runs", { method: "POST", body: JSON.stringify({ title, rawInput }) }),
  getRun: (id) => request(`/runs/${id}`),
  approveRun: (id) => request(`/runs/${id}/approve`, { method: "POST" }),
  // Only valid while a run is still in review — the backend rejects anything
  // already executing, since money may be in flight by then.
  cancelRun: (id, reason) =>
    request(`/runs/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Editing the beneficiary list, review-stage only. Each of these re-verifies
  // against the bank rails and re-totals the run server-side; the backend
  // rejects them once the run leaves REVIEW.
  addBeneficiary: (runId, data) =>
    request(`/runs/${runId}/beneficiaries`, { method: "POST", body: JSON.stringify(data) }),
  updateBeneficiary: (runId, beneficiaryId, data) =>
    request(`/runs/${runId}/beneficiaries/${beneficiaryId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeBeneficiary: (runId, beneficiaryId) =>
    request(`/runs/${runId}/beneficiaries/${beneficiaryId}`, { method: "DELETE" }),

  submitOtp: (beneficiaryId, otp) =>
    request(`/beneficiaries/${beneficiaryId}/otp`, {
      method: "POST",
      body: JSON.stringify({ otp }),
    }),
  resendOtp: (beneficiaryId) =>
    request(`/beneficiaries/${beneficiaryId}/otp/resend`, { method: "POST" }),
  revealPaycode: (beneficiaryId) =>
    request(`/beneficiaries/${beneficiaryId}/reveal`, { method: "POST" }),
  cancelBeneficiary: (beneficiaryId) =>
    request(`/beneficiaries/${beneficiaryId}/cancel`, { method: "POST" }),
  reissuePaycode: (beneficiaryId) =>
    request(`/beneficiaries/${beneficiaryId}/reissue`, { method: "POST" }),
  nudgeBeneficiary: (beneficiaryId) =>
    request(`/beneficiaries/${beneficiaryId}/nudge`, { method: "POST" }),

  listBanks: () => request("/banks"),

  // --- Ledger ---------------------------------------------------------------
  // owo-reach's own tracked float: deposits minus what runs have reserved.
  // Nothing here credits money on request alone — a deposit only lands once
  // Monnify posts the confirming webhook (see startDeposit below).
  ledgerBalance: () => request("/ledger/balance"),
  listLedger: () => request("/ledger"),
  startDeposit: ({ amountKobo, customerName, customerEmail, redirectUrl }) =>
    request("/ledger/deposits/checkout", {
      method: "POST",
      body: JSON.stringify({ amountKobo, customerName, customerEmail, redirectUrl }),
    }),
};
