import { env } from "../env";
import { monnify } from "./client";
import { MONNIFY } from "./config";
import { koboToNaira } from "../lib/money";

/**
 * Monnify disbursements.
 *
 * IMPORTANT sandbox behaviour: MFA is enabled by default, so a transfer often
 * returns status PENDING_AUTHORIZATION rather than completing. You then submit
 * an OTP via authorizeTransfer(). In sandbox the OTP is delivered to the
 * merchant email on the account (check during the spike). Our product surfaces
 * this as a maker-checker approval step in the admin UI rather than fighting it.
 */

export interface TransferResult {
  amount: number;
  reference: string;
  status: string; // SUCCESS | PENDING | PENDING_AUTHORIZATION | FAILED ...
  dateCreated?: string;
  totalFee?: number;
  destinationAccountName?: string;
}

export async function singleTransfer(input: {
  amountKobo: number;
  reference: string;
  narration: string;
  destinationBankCode: string;
  destinationAccountNumber: string;
  destinationAccountName?: string;
}): Promise<TransferResult> {
  return monnify<TransferResult>(MONNIFY.TRANSFER_SINGLE, {
    body: {
      amount: koboToNaira(input.amountKobo), // Monnify expects naira decimals
      reference: input.reference,
      narration: input.narration,
      destinationBankCode: input.destinationBankCode,
      destinationAccountNumber: input.destinationAccountNumber,
      destinationAccountName: input.destinationAccountName,
      currency: "NGN",
      sourceAccountNumber: env.MONNIFY_SOURCE_ACCOUNT,
      async: true, // completion arrives via webhook, not in this response
    },
  });
}

export async function authorizeTransfer(reference: string, authorizationCode: string) {
  return monnify<TransferResult>(MONNIFY.TRANSFER_AUTHORIZE, {
    body: { reference, authorizationCode },
  });
}

export async function resendTransferOtp(reference: string) {
  return monnify<unknown>(MONNIFY.TRANSFER_RESEND_OTP, { body: { reference } });
}

/** Reconciliation fallback — only used when a webhook seems to have gone missing. */
export async function getTransferStatus(reference: string) {
  return monnify<TransferResult>(MONNIFY.TRANSFER_SINGLE_STATUS, { query: { reference } });
}
