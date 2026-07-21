// The API returns every amount as an integer in kobo. Format for display only —
// never do math on the formatted string, always on the kobo integer.

export function formatNaira(kobo) {
  const value = (Number(kobo) || 0) / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Admins type naira; the API only ever speaks integer kobo. Returns null for
// anything that isn't a positive amount, so callers can reject it outright
// rather than posting a NaN the API would 422 on anyway.
export function parseNairaToKobo(input) {
  const cleaned = String(input ?? "").replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const kobo = Math.round(Number(cleaned) * 100);
  return kobo > 0 ? kobo : null;
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-NG", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}
