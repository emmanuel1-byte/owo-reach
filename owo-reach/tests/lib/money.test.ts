import { describe, it, expect } from "bun:test";
import { koboToNaira, nairaToKobo, formatNaira, PAYCODE_FEE_KOBO } from "../../server/lib/money";

describe("koboToNaira", () => {
  it("divides by 100", () => {
    expect(koboToNaira(250000)).toBe(2500);
  });

  it("rounds fractional kobo before dividing", () => {
    expect(koboToNaira(250000.6)).toBe(2500.01);
  });

  it("handles zero", () => {
    expect(koboToNaira(0)).toBe(0);
  });
});

describe("nairaToKobo", () => {
  it("multiplies by 100", () => {
    expect(nairaToKobo(2500)).toBe(250000);
  });

  it("rounds to the nearest kobo", () => {
    expect(nairaToKobo(19.999)).toBe(2000);
  });

  it("is the inverse of koboToNaira for whole naira amounts", () => {
    expect(nairaToKobo(koboToNaira(500000))).toBe(500000);
  });
});

describe("formatNaira", () => {
  it("formats whole-naira amounts with no decimals", () => {
    expect(formatNaira(2500000)).toBe("₦25,000");
  });

  it("formats amounts with kobo remainders to 2 decimals", () => {
    expect(formatNaira(2500050)).toBe("₦25,000.50");
  });

  it("formats zero", () => {
    expect(formatNaira(0)).toBe("₦0");
  });
});

describe("PAYCODE_FEE_KOBO", () => {
  it("is a flat ₦100", () => {
    expect(PAYCODE_FEE_KOBO).toBe(10000);
  });
});
