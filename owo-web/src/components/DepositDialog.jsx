import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "./Icon.jsx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog.jsx";
import { api, ApiError } from "../lib/api.js";
import { formatNaira, parseNairaToKobo } from "../lib/money.js";
import { qk } from "../lib/queries.js";
import { setPendingDeposit, clearPendingDeposit } from "../lib/pendingDeposit.js";
import { useToast } from "../lib/toast.jsx";

// The org's own details, as shown on Settings. Monnify wants a payer name and
// email on every checkout; these are a starting point, not a lock — an admin
// paying from a different account can change them before going through.
const DEFAULT_PAYER = { name: "Green Harvest Co-op", email: "admin@oworeach.com" };

const PRESETS_KOBO = [5_000_00, 20_000_00, 100_000_00];

// Where Monnify sends the browser back to once the org has paid. Hash routing
// means the route lives after the '#', so the origin + path prefix has to be
// rebuilt rather than assumed to be bare.
function ledgerRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}#/ledger`;
}


export default function DepositDialog({ open, onOpenChange }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [payerName, setPayerName] = useState(DEFAULT_PAYER.name);
  const [payerEmail, setPayerEmail] = useState(DEFAULT_PAYER.email);
  const [checkout, setCheckout] = useState(null); // { checkoutUrl, reference, amountKobo }
  const [confirmed, setConfirmed] = useState(false);

  // Reset to a clean form whenever the dialog is reopened, so a previous
  // deposit's checkout link never lingers into the next one.
  useEffect(() => {
    if (open) return;
    const id = setTimeout(() => {
      setAmount("");
      setCheckout(null);
      setConfirmed(false);
    }, 200); // after the close transition, so the reset isn't visible
    return () => clearTimeout(id);
  }, [open]);

  // While a checkout is outstanding, watch the ledger for the DEPOSIT row that
  // Monnify's webhook writes. Polled on its own interval rather than left to the
  // SSE wire alone: the credit can land while this tab is backgrounded or
  // mid-reconnect, and a missed event would leave the dialog waiting forever.
  const watching = Boolean(open && checkout && !confirmed);
  const { data: entries } = useQuery({
    queryKey: qk.ledgerEntries,
    queryFn: api.listLedger,
    enabled: watching,
    refetchInterval: watching ? 6000 : false,
  });

  const landed =
    checkout && entries?.find((e) => e.type === "DEPOSIT" && e.reference === checkout.reference);

  useEffect(() => {
    if (!landed || confirmed) return;
    setConfirmed(true);
    clearPendingDeposit();
    queryClient.invalidateQueries({ queryKey: qk.ledger });
    toast.success(`${formatNaira(landed.amountKobo)} confirmed by Monnify and credited.`);
  }, [landed, confirmed, queryClient, toast]);

  const deposit = useMutation({
    mutationFn: (body) => api.startDeposit(body),
    onSuccess: (session, body) => {
      setPendingDeposit({ reference: session.reference, amountKobo: body.amountKobo });
      setCheckout({ ...session, amountKobo: body.amountKobo });

      // New tab, so the console (and this dialog's waiting state) survives the
      // trip through Monnify. If the browser blocks it, the link below is the
      // fallback — hence no error here.
      window.open(session.checkoutUrl, "_blank", "noopener,noreferrer");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not start that deposit.");
    },
  });
  const submitting = deposit.isPending;

  function handleSubmit(e) {
    e.preventDefault();
    const amountKobo = parseNairaToKobo(amount);
    if (amountKobo === null) return toast.error("Enter a deposit amount in naira, e.g. 50000.");
    if (!payerName.trim()) return toast.error("Monnify needs a payer name on the checkout.");
    if (!payerEmail.trim()) return toast.error("Monnify needs a payer email on the checkout.");

    deposit.mutate({
      amountKobo,
      customerName: payerName.trim(),
      customerEmail: payerEmail.trim(),
      redirectUrl: ledgerRedirectUrl(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="deposit-desc">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-surface-sunk">
          <DialogTitle className="label-caps text-ink-soft">
            {checkout ? "Deposit in progress" : "Add funds"}
          </DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-ink-soft hover:text-ink"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {!checkout ? (
          <form onSubmit={handleSubmit}>
            <div className="p-5 space-y-4">
              <DialogDescription id="deposit-desc" className="text-[13px] text-ink-soft leading-relaxed">
                Funds are added through Monnify Checkout card, bank transfer, or USSD. The
                balance moves only once Monnify confirms the payment, never on request alone.
              </DialogDescription>

              <div>
                <label className="field-label" htmlFor="deposit-amount">Amount</label>
                <div className="relative">
                  <span className="money absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none">
                    ₦
                  </span>
                  <input
                    id="deposit-amount"
                    className="field money !pl-8 tabular-nums"
                    type="text"
                    inputMode="decimal"
                    placeholder="50000.00"
                    value={amount}
                    onChange={(ev) => setAmount(ev.target.value)}
                    disabled={submitting}
                    autoFocus
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {PRESETS_KOBO.map((kobo) => (
                    <button
                      key={kobo}
                      type="button"
                      onClick={() => setAmount(String(kobo / 100))}
                      disabled={submitting}
                      className="btn btn-secondary !py-1.5 !px-3 !text-[11px]"
                    >
                      {formatNaira(kobo)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="deposit-name">Payer name</label>
                <input
                  id="deposit-name"
                  className="field"
                  type="text"
                  value={payerName}
                  onChange={(ev) => setPayerName(ev.target.value)}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="deposit-email">Payer email</label>
                <input
                  id="deposit-email"
                  className="field"
                  type="email"
                  value={payerEmail}
                  onChange={(ev) => setPayerEmail(ev.target.value)}
                  disabled={submitting}
                />
                <p className="text-[12px] text-ink-soft mt-2">
                  Monnify sends the payment receipt here.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-hairline">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-reach" disabled={submitting}>
                {submitting ? "Opening checkout…" : "Continue to Monnify"}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="p-5 space-y-4">
              {confirmed ? (
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-9 h-9 rounded-full border-2 border-reach text-reach flex items-center justify-center animate-flip">
                    <Icon name="check" size={20} fill />
                  </span>
                  <div>
                    <div className="label-caps text-reach mb-1">Deposit confirmed</div>
                    <p className="text-[13px] text-ink-soft leading-relaxed">
                      Monnify confirmed {formatNaira(checkout.amountKobo)} and the ledger has
                      been credited. It's available to fund runs now.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <Icon name="loader" size={20} className="text-brass animate-spin mt-0.5 shrink-0" />
                  <div>
                    <div className="label-caps text-brass mb-1">Waiting on Monnify</div>
                    <p className="text-[13px] text-ink-soft leading-relaxed">
                      Complete the payment in the tab that opened. Nothing is credited until
                      Monnify confirms it — this updates by itself the moment it does, so you
                      can close this and carry on.
                    </p>
                  </div>
                </div>
              )}

              <dl className="border border-hairline divide-y divide-hairline">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <dt className="text-[13px] text-ink-soft">Amount</dt>
                  <dd className="money text-ink tabular-nums">{formatNaira(checkout.amountKobo)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <dt className="text-[13px] text-ink-soft shrink-0">Reference</dt>
                  <dd className="mono text-[12px] text-ink truncate">{checkout.reference}</dd>
                </div>
              </dl>

              {!confirmed && (
                <a
                  href={checkout.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary w-full"
                >
                  <Icon name="open_in_new" size={16} />
                  Reopen the checkout page
                </a>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-hairline">
              <button className="btn btn-primary" onClick={() => onOpenChange(false)}>
                {confirmed ? "Done" : "Close"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
