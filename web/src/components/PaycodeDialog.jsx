import { useState } from "react";
import Icon from "./Icon.jsx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog.jsx";
import { formatNaira, formatDateTime } from "../lib/money.js";

// Digits arrive as one run of characters; grouping them in fours is what makes
// a code readable aloud, which is exactly how it gets used — an operator reads
// it to a beneficiary, or a beneficiary reads it to an agent.
function grouped(code) {
  return String(code ?? "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/**
 * The revealed paycode, on the engraved instrument the design system was built
 * around (`.paycode` / `.seal` / `.digits` in index.css).
 *
 * This replaces a toast. A toast was wrong for it twice over: it timed out
 * while someone was still reading the code aloud, and it gave the most
 * consequential artefact in the product the same weight as "OTP resent".
 */
export default function PaycodeDialog({ open, onOpenChange, beneficiary, paycode }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(paycode ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the code is on screen to read regardless */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,100%)]" aria-describedby="paycode-desc">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-surface-sunk">
          <DialogTitle className="label-caps text-ink-soft">Paycode revealed</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-ink-soft hover:text-ink"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <DialogDescription id="paycode-desc" className="text-[13px] text-ink-soft leading-relaxed">
            Redeemable for cash at any Moniepoint agent. Every reveal is written to the
            event log.
          </DialogDescription>

          {/* The instrument */}
          <div className="paycode p-6 animate-settle">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="min-w-0">
                <div className="label-caps text-white/50 mb-1">Pay to bearer</div>
                <div className="font-display text-[19px] text-white truncate">
                  {beneficiary?.name ?? "Beneficiary"}
                </div>
              </div>
              <span className="seal shrink-0 animate-seal-in">
                <span className="seal-inner">
                  <Icon name="shield" size={15} />
                </span>
              </span>
            </div>

            <div className="digits text-[27px] text-white mb-6 break-all">{grouped(paycode)}</div>

            <div className="flex items-end justify-between gap-4 pt-4 border-t border-white/15">
              <div>
                <div className="label-caps text-white/50 mb-1">Amount</div>
                <div className="money text-[19px] text-white tabular-nums">
                  {formatNaira(beneficiary?.amountKobo)}
                </div>
              </div>
              {beneficiary?.paycodeExpiresAt && (
                <div className="text-right">
                  <div className="label-caps text-white/50 mb-1">Expires</div>
                  <div className="mono text-[13px] text-white/85 tabular-nums">
                    {formatDateTime(beneficiary.paycodeExpiresAt)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button className="btn btn-secondary w-full" onClick={copy}>
            <Icon name={copied ? "check" : "content_copy"} size={16} />
            {copied ? "Copied to clipboard" : "Copy code"}
          </button>
        </div>

        <div className="flex items-center justify-end px-5 py-4 border-t border-hairline">
          <button className="btn btn-primary" onClick={() => onOpenChange(false)}>
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
