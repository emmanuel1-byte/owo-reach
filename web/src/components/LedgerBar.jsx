import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import DepositDialog from "./DepositDialog.jsx";
import { formatNaira } from "../lib/money.js";
import { useLedgerBalance } from "../lib/queries.js";
import { useCountUp } from "../lib/useCountUp.js";
import { getPendingDeposit } from "../lib/pendingDeposit.js";

/**
 * The float, on every screen. A run can't be approved for more than the ledger
 * holds (the API answers 402), so the number that decides that is kept in view
 * rather than a page an admin has to go looking for.
 */
export default function LedgerBar() {
  const { data, isPending, error, refetch } = useLedgerBalance();
  const [depositOpen, setDepositOpen] = useState(false);
  const pending = getPendingDeposit();
  const balanceKobo = data?.balanceKobo ?? null;
  const empty = !isPending && !error && (balanceKobo ?? 0) <= 0;
  // Rolls only when the figure actually changes on screen — i.e. money moved.
  const [shownKobo, rolling] = useCountUp(balanceKobo);

  return (
    <>
      <section className="border-b border-hairline bg-surface-sunk">
        <div className="px-5 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Icon name="wallet" size={20} className="text-ink-soft shrink-0 hidden sm:inline-block" />
            <div className="min-w-0">
              <div className="label-caps md:text-[12px] text-ink-soft">Available balance</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                {isPending ? (
                  <span className="money text-[20px] text-ink-soft tabular-nums">…</span>
                ) : error ? (
                  <button
                    onClick={() => refetch()}
                    className="text-[13px] text-state-failed hover:underline underline-offset-2 text-left"
                  >
                    {error.message} Retry
                  </button>
                ) : (
                  <>
                    <span
                      className={`money text-[20px] md:text-[24px] tabular-nums rounded-sm px-1 -mx-1 ${
                        empty ? "text-brass" : "text-ink"
                      } ${rolling ? "animate-flash" : ""}`}
                    >
                      {formatNaira(shownKobo)}
                    </span>
                    {empty && (
                      <span className="text-[12px] text-ink-soft">
                        Deposit before approving a run.
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {pending && (
              <span
                className="state s-issued !text-[11px] mr-1 hidden md:inline-flex"
                title={`Awaiting Monnify confirmation for ${pending.reference}`}
              >
                <span className="dot dot--ring" />
                {formatNaira(pending.amountKobo)} pending
              </span>
            )}
            <Link to="/ledger" className="btn btn-secondary !py-2 !px-4 flex-1 sm:flex-none">
              Ledger
            </Link>
            <button
              className="btn btn-reach !py-2 !px-4 flex-1 sm:flex-none"
              onClick={() => setDepositOpen(true)}
            >
              <Icon name="deposit" size={16} />
              Deposit
            </button>
          </div>
        </div>
      </section>

      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
    </>
  );
}
