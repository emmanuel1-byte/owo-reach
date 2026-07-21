import { describe, it, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { isValidMonnifySignature } from "../../server/monnify/webhook";

const SECRET = "dummy-secret"; // matches MONNIFY_SECRET_KEY set in tests/setup.ts

function sign(body: string): string {
  return createHmac("sha512", SECRET).update(body).digest("hex");
}

describe("isValidMonnifySignature", () => {
  it("accepts a signature computed over the exact raw body", () => {
    const body = JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: { reference: "owo-ben_1" } });
    expect(isValidMonnifySignature(body, sign(body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT" });
    const signature = sign(body);
    const tampered = JSON.stringify({ eventType: "FAILED_DISBURSEMENT" });
    expect(isValidMonnifySignature(tampered, signature)).toBe(false);
  });

  it("rejects a signature signed with the wrong secret", () => {
    const body = JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT" });
    const wrongSignature = createHmac("sha512", "not-the-secret").update(body).digest("hex");
    expect(isValidMonnifySignature(body, wrongSignature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(isValidMonnifySignature("{}", undefined)).toBe(false);
  });

  it("rejects an empty-string signature", () => {
    expect(isValidMonnifySignature("{}", "")).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(isValidMonnifySignature("{}", "abc")).toBe(false);
  });
});
