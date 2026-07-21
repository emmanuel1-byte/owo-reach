import { Hono } from "hono";
import {
  authorizeBeneficiaryTransfer,
  resendBeneficiaryOtp,
  revealPaycode,
  cancelBeneficiary,
  reissuePaycode,
  nudgeBeneficiary,
} from "../services/lifecycle";
import { humanError } from "../lib/errors";

export const beneficiariesRoute = new Hono();

/** Maker-checker: submit the OTP for a transfer stuck in PENDING_AUTHORIZATION. */
beneficiariesRoute.post("/:id/otp", async (c) => {
  const body = await c.req.json<{ otp?: string }>().catch(() => null);
  if (!body?.otp?.trim()) return c.json({ error: "otp is required" }, 400);
  try {
    await authorizeBeneficiaryTransfer(c.req.param("id"), body.otp.trim());
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});

beneficiariesRoute.post("/:id/otp/resend", async (c) => {
  try {
    await resendBeneficiaryOtp(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});

/** Authorized, audited reveal of the clear (unmasked) paycode. */
beneficiariesRoute.post("/:id/reveal", async (c) => {
  try {
    const { paycode } = await revealPaycode(c.req.param("id"));
    return c.json({ paycode });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});

/** Cancel an unredeemed code or pending transfer; refunds its amount to the run total. */
beneficiariesRoute.post("/:id/cancel", async (c) => {
  try {
    await cancelBeneficiary(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});

/** One-click reissue of a fresh paycode for an expired one. */
beneficiariesRoute.post("/:id/reissue", async (c) => {
  try {
    await reissuePaycode(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});

/** Compose (and log) an expiry-reminder SMS. Sending is stubbed — the body is returned for display. */
beneficiariesRoute.post("/:id/nudge", async (c) => {
  try {
    const { sms } = await nudgeBeneficiary(c.req.param("id"));
    return c.json({ sms });
  } catch (err) {
    return c.json({ error: humanError(err) }, 422);
  }
});
