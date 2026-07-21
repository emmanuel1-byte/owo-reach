/**
 * All money in this codebase is INTEGER KOBO. Floats appear only at the
 * Monnify API boundary (their payloads use naira decimals).
 */

export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: kobo % 100 === 0 ? 0 : 2,
  }).format(kobo / 100);
}

/** Flat Monnify paycode fee: ₦100 per code. */
export const PAYCODE_FEE_KOBO = 100_00;
