// A checkout started here doesn't credit anything — Monnify's webhook does,
// possibly minutes later and possibly after the admin has navigated away or
// come back from the redirect. Remembering the reference locally is what lets
// the UI say "waiting on Monnify" instead of silently showing an unchanged
// balance. Cleared once a DEPOSIT entry with that reference appears in the
// ledger, or once it's old enough to have plainly been abandoned.

const KEY = "owo-reach:pending-deposit";
const MAX_AGE_MS = 60 * 60 * 1000; // an hour — beyond this the checkout is stale

export function getPendingDeposit() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value?.reference) return null;
    if (Date.now() - (value.startedAt ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function setPendingDeposit({ reference, amountKobo }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ reference, amountKobo, startedAt: Date.now() }));
  } catch {
    /* private mode / quota — the deposit still works, we just can't track it */
  }
}

export function clearPendingDeposit() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
