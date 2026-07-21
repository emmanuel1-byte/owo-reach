// Tracks the most recently opened run so the sidebar's "Payout review" and
// "Live batch" links can jump straight back into it, instead of both
// pointing at the same generic fallback. Set from Review/Batch whenever a
// run successfully loads; read by AppShell on every render.

const KEY = "owo-reach:last-run";

export function getLastRun() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLastRun(id, status) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, status }));
  } catch {
    /* private-mode/quota errors — sidebar just falls back to Transactions */
  }
}