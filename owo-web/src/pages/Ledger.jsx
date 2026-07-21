import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import Icon from "../components/Icon.jsx";
import DepositDialog from "../components/DepositDialog.jsx";
import { LedgerTypeBadge } from "../components/StateBadge.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.jsx";
import { TableSkeleton } from "../components/ui/skeleton.jsx";
import { formatNaira, formatDateTime } from "../lib/money.js";
import { useLedgerBalance, useLedgerEntries } from "../lib/queries.js";
import { getPendingDeposit, clearPendingDeposit } from "../lib/pendingDeposit.js";
import { useToast } from "../lib/toast.jsx";

// Entries arrive signed, so the sign carries the direction and only needs a
// leading + made explicit to read as a ledger rather than a list of amounts.
function formatSigned(kobo) {
  const formatted = formatNaira(Math.abs(kobo));
  return kobo < 0 ? `−${formatted}` : `+${formatted}`;
}

export default function Ledger() {
  const toast = useToast();
  const [depositOpen, setDepositOpen] = useState(false);
  const [pending, setPending] = useState(() => getPendingDeposit());

  const balanceQuery = useLedgerBalance();
  const balanceKobo = balanceQuery.data?.balanceKobo ?? null;

  // Backstop while a deposit is outstanding: the confirming webhook can land
  // while this tab is backgrounded or the event wire is reconnecting, so poll
  // until the row shows up rather than trusting the push alone.
  const entriesQuery = useLedgerEntries();
  const { data: entries = [], isPending: loading, error: loadError, refetch } = entriesQuery;
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => {
      entriesQuery.refetch();
      balanceQuery.refetch();
    }, 10000);
    return () => clearInterval(id);
    // Refetching is all this needs; the query objects change identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // A tracked checkout is only settled once its DEPOSIT row exists — that row,
  // not the redirect coming back, is the proof the money arrived.
  useEffect(() => {
    const tracked = getPendingDeposit();
    if (!tracked) {
      setPending(null);
      return;
    }
    if (entries.some((e) => e.type === "DEPOSIT" && e.reference === tracked.reference)) {
      clearPendingDeposit();
      setPending(null);
      toast.success(`${formatNaira(tracked.amountKobo)} confirmed by Monnify and credited.`);
    } else {
      setPending(tracked);
    }
  }, [entries, toast]);

  // Balance is the sum of every row, so a running total can be reconstructed
  // exactly — accumulate oldest-first, then show the list newest-first as the
  // API returns it.
  const rows = useMemo(() => {
    const oldestFirst = [...entries].reverse();
    let running = 0;
    const withBalance = oldestFirst.map((e) => {
      running += e.amountKobo ?? 0;
      return { ...e, balanceAfterKobo: running };
    });
    return withBalance.reverse();
  }, [entries]);

  const totals = useMemo(() => {
    const sum = (type) =>
      entries.filter((e) => e.type === type).reduce((acc, e) => acc + Math.abs(e.amountKobo ?? 0), 0);
    return {
      deposited: sum("DEPOSIT"),
      reserved: sum("RUN_RESERVE"),
      refunded: sum("RUN_REFUND"),
    };
  }, [entries]);

  const tiles = [
    ["Available balance", formatNaira(balanceKobo ?? 0), "text-ink"],
    ["Total deposited", formatNaira(totals.deposited), "text-reach"],
    ["Reserved by runs", formatNaira(totals.reserved), "text-brass"],
    ["Refunded back", formatNaira(totals.refunded), "text-ink-soft"],
  ];

  return (
    <AppShell active="ledger">
      <div className="border rounded-[12px] mx-auto px-6 md:mx-10 py-10 md:my-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="label-caps text-ink-soft mb-2">Float · all movements</div>
            <h1 className="font-display text-display-sm text-ink">Ledger</h1>
            <p className="text-body text-ink-soft mt-2 max-w-2xl">
              Every naira in and out: deposits confirmed by Monnify, and what each run
              reserved or handed back. The balance is the sum of these rows — nothing else.
            </p>
          </div>
          <button className="btn btn-reach self-start md:self-auto" onClick={() => setDepositOpen(true)}>
            <Icon name="deposit" size={18} />
            Deposit funds
          </button>
        </div>

        {loadError && (
          <div className="border border-state-failed bg-white px-5 py-3 mb-6 text-[13px] text-state-failed flex items-center justify-between gap-4">
            <span>{loadError.message ?? "Could not load the ledger."}</span>
            <button
              onClick={() => refetch()}
              className="label-caps hover:underline underline-offset-2 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {pending && (
          <div className="border-l-2 border-brass bg-surface-sunk p-5 mb-6 flex items-start gap-3">
            <Icon name="loader" size={18} className="text-brass animate-spin mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="label-caps text-ink mb-1">
                {formatNaira(pending.amountKobo)} awaiting confirmation
              </div>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                A checkout was started but Monnify hasn't confirmed it yet, so none of it counts
                toward the balance. This clears itself the moment the confirmation lands.
                <span className="mono text-[12px] block mt-1 truncate">{pending.reference}</span>
              </p>
            </div>
          </div>
        )}

        {/* Reconciliation strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-hairline mb-6">
          {tiles.map(([label, value, color], i) => (
            <div
              key={label}
              className={`p-4 ${i < 3 ? "lg:border-r" : ""} ${i % 2 === 0 ? "border-r" : ""} ${
                i >= 2 ? "border-t lg:border-t-0" : ""
              } border-hairline`}
            >
              <div className="label-caps text-ink-soft mb-1">{label}</div>
              <div className={`money text-[18px] tabular-nums ${color}`}>
                {loading ? "…" : value}
              </div>
            </div>
          ))}
        </div>

        <div className="border border-hairline">
          {loading ? (
            <TableSkeleton
              rows={4}
              minWidth={760}
              widths={["w-24", "w-40", "w-24 ml-auto", "w-24 ml-auto", "w-20 ml-auto"]}
            />
          ) : (
          <Table minWidth={760}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[16%]">Movement</TableHead>
                <TableHead className="w-[30%]">Reference</TableHead>
                <TableHead className="w-[18%] text-right">Amount</TableHead>
                <TableHead className="w-[18%] text-right">Balance after</TableHead>
                <TableHead className="w-[18%] text-right">Recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-ink-soft py-8">
                    No movements yet — deposit funds to start paying runs.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((e, i) => (
                  <TableRow key={e.id} className="row-enter" style={{ "--row": i }}>
                    <TableCell>
                      <LedgerTypeBadge type={e.type} />
                    </TableCell>
                    <TableCell className="min-w-0">
                      {e.reference ? (
                        <span className="mono text-[12px] text-ink break-all">{e.reference}</span>
                      ) : e.runId ? (
                        <Link
                          to={`/batch/${e.runId}`}
                          className="mono text-[12px] text-ink hover:text-reach underline underline-offset-2"
                        >
                          {e.runId}
                        </Link>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`money text-right tabular-nums ${
                        (e.amountKobo ?? 0) < 0 ? "text-ink-soft" : "text-reach"
                      }`}
                    >
                      {formatSigned(e.amountKobo ?? 0)}
                    </TableCell>
                    <TableCell className="money text-right tabular-nums text-ink">
                      {formatNaira(e.balanceAfterKobo)}
                    </TableCell>
                    <TableCell className="mono text-ink-soft text-right tabular-nums text-[12px]">
                      {formatDateTime(e.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          )}
        </div>

        <p className="text-[12px] text-ink-soft mt-4 flex items-start gap-2 max-w-4xl leading-relaxed">
          <Icon name="shield" size={15} className="text-reach mt-0.5 shrink-0" />
          Deposits are credited only on a confirmed Monnify Collections webhook. this console
          has no way to credit the balance on request alone.
        </p>
      </div>

      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
    </AppShell>
  );
}
