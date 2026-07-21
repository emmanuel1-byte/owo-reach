import { describe, it, expect, afterEach } from "bun:test";
import { namesLooselyMatch, resolveBankCode, getBanks, nameEnquiry } from "../../server/monnify/verification";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";

describe("namesLooselyMatch", () => {
  it("matches identical names", () => {
    expect(namesLooselyMatch("Chidi Okonkwo", "Chidi Okonkwo")).toBe(true);
  });

  it("matches regardless of case and token order", () => {
    expect(namesLooselyMatch("okonkwo chidi", "CHIDI OKONKWO")).toBe(true);
  });

  it("matches when the bank record has an extra middle name", () => {
    expect(namesLooselyMatch("Chidi Okonkwo", "CHIDI EMEKA OKONKWO")).toBe(true);
  });

  it("rejects an unrelated name", () => {
    expect(namesLooselyMatch("Tunde Bakare", "OLUWASEUN ADEBAYO")).toBe(false);
  });

  it("matches a single shared token when only one token is provided", () => {
    expect(namesLooselyMatch("Chidi", "CHIDI OKONKWO")).toBe(true);
  });

  it("rejects a single non-matching token", () => {
    expect(namesLooselyMatch("Chidi", "TUNDE BAKARE")).toBe(false);
  });
});

describe("resolveBankCode", () => {
  const banks = [
    { name: "Guaranty Trust Bank", code: "058" },
    { name: "Zenith Bank", code: "057" },
  ];

  it("matches an exact bank code", () => {
    expect(resolveBankCode("058", banks)).toBe("058");
  });

  it("matches a bank name substring, case-insensitive", () => {
    expect(resolveBankCode("Guaranty", banks)).toBe("058");
  });

  it("matches when the input contains the full bank name", () => {
    expect(resolveBankCode("Zenith Bank Plc", banks)).toBe("057");
  });

  it("returns null for an unrecognised bank", () => {
    expect(resolveBankCode("First City Monument Bank", banks)).toBeNull();
  });

  it("matches a common abbreviation via the bank name's initials", () => {
    expect(resolveBankCode("GTBank", banks)).toBe("058");
    expect(resolveBankCode("gtb", banks)).toBe("058");
  });

  it("returns null for empty input", () => {
    expect(resolveBankCode("", banks)).toBeNull();
    expect(resolveBankCode("   ", banks)).toBeNull();
  });
});

describe("getBanks / nameEnquiry (HTTP boundary)", () => {
  afterEach(() => {
    __resetAuthTokenForTests();
  });

  it("getBanks returns the parsed bank list", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/banks": () => ({
        body: {
          requestSuccessful: true,
          responseMessage: "success",
          responseCode: "0",
          responseBody: [{ name: "Guaranty Trust Bank", code: "058" }],
        },
      }),
    });
    try {
      const banks = await getBanks();
      expect(banks).toEqual([{ name: "Guaranty Trust Bank", code: "058" }]);
    } finally {
      restore();
    }
  });

  it("nameEnquiry passes accountNumber/bankCode as query params and returns the resolved name", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/disbursements/account/validate": (url) => {
        expect(url.searchParams.get("accountNumber")).toBe("0123456789");
        expect(url.searchParams.get("bankCode")).toBe("058");
        return {
          body: {
            requestSuccessful: true,
            responseMessage: "success",
            responseCode: "0",
            responseBody: { accountNumber: "0123456789", accountName: "CHIDI EMEKA OKONKWO", bankCode: "058" },
          },
        };
      },
    });
    try {
      const result = await nameEnquiry("0123456789", "058");
      expect(result.accountName).toBe("CHIDI EMEKA OKONKWO");
    } finally {
      restore();
    }
  });

  it("nameEnquiry throws a MonnifyError when the account cannot be resolved", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/disbursements/account/validate": () => ({
        status: 400,
        body: { requestSuccessful: false, responseMessage: "Invalid account number", responseCode: "99" },
      }),
    });
    try {
      await expect(nameEnquiry("0000000000", "058")).rejects.toThrow(/Invalid account number/);
    } finally {
      restore();
    }
  });
});
