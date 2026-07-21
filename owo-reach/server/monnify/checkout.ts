import { monnify } from "./client";
import { MONNIFY } from "./config";
import { env } from "../env";
import { koboToNaira } from "../lib/money";

/**
 * Collections: one-time payment checkout, used only for ledger deposits
 * (services/ledger.ts). The customer completes payment at `checkoutUrl`;
 * the deposit is credited only once Monnify confirms it with a
 * SUCCESSFUL_TRANSACTION webhook — this call alone moves no money and
 * credits nothing.
 */

export interface CheckoutSession {
  transactionReference: string;
  paymentReference: string;
  checkoutUrl: string;
  enabledPaymentMethod: string[];
}

export async function initiateCheckout(input: {
  amountKobo: number;
  reference: string;
  customerName: string;
  customerEmail: string;
  redirectUrl?: string;
}): Promise<CheckoutSession> {
  return monnify<CheckoutSession>(MONNIFY.CHECKOUT_INIT, {
    body: {
      amount: koboToNaira(input.amountKobo),
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      paymentReference: input.reference,
      paymentDescription: "Owo Reach wallet deposit",
      currencyCode: "NGN",
      contractCode: env.MONNIFY_CONTRACT_CODE,
      redirectUrl: input.redirectUrl,
      paymentMethods: ["ACCOUNT_TRANSFER", "CARD"],
    },
  });
}
