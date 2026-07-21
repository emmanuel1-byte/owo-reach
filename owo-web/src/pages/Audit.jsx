import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import ErrorState from "../components/ErrorState.jsx";
import Icon from "../components/Icon.jsx";
import { formatNaira, formatDateTime } from "../lib/money.js";
import { useRun } from "../lib/queries.js";
import { describeEvent } from "../lib/describeEvent.js";
import { useToast } from "../lib/toast.jsx";

export default function Audit() {
  const { runId } = useParams();
  const toast = useToast();

  const { data, isPending, error: loadError } = useRun(runId);
  const run = data?.run ?? null;
  const beneficiaries = data?.beneficiaries ?? [];
  const eventLog = data?.events ?? [];
  const loading = Boolean(runId) && isPending;

  const beneficiaryMap = useMemo(() => {
    const m = {};
    for (const b of beneficiaries) m[b.id] = b;
    return m;
  }, [beneficiaries]);

  if (loading) {
    return (
      <AppShell active="batch">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16 text-center text-ink-soft">Loading receipt…</div>
      </AppShell>
    );
  }

  if (loadError || !run) {
    return (
      <AppShell active="batch">
        <ErrorState
          code={loadError?.status ?? "404"}
          title={loadError && loadError.status !== 404 ? "This run couldn't be loaded" : "We couldn't find that run"}
          description={
            loadError && loadError.status !== 404
              ? loadError.message
              : "It may have been discarded, or the link may be out of date. Your other runs are on the start screen."
          }
        />
      </AppShell>
    );
  }

  const total = beneficiaries.length;
  const completed = beneficiaries.filter((b) => b.status === "COMPLETED");
  const failed = beneficiaries.filter((b) => b.status === "FAILED");
  const cancelled = beneficiaries.filter((b) => b.status === "CANCELLED");
  const bankTotalKobo = beneficiaries.filter((b) => b.rail === "BANK").reduce((s, b) => s + b.amountKobo, 0);
  const paycodeTotalKobo = beneficiaries.filter((b) => b.rail === "PAYCODE").reduce((s, b) => s + b.amountKobo, 0);
  const totalDisbursedKobo = (run.totalAmountKobo ?? 0) + (run.totalFeesKobo ?? 0);
  const allSettled = total > 0 && completed.length === total;
  const lastEventAt = eventLog[0]?.createdAt;

  const RECEIPT = [
    ["Beneficiaries paid", `${completed.length} of ${total}`, "mono"],
    ["Bank transfers", formatNaira(bankTotalKobo), "money"],
    ["Paycodes issued", formatNaira(paycodeTotalKobo), "money"],
    [`Fees`, formatNaira(run.totalFeesKobo), "money-soft"],
    ["Failed", String(failed.length), failed.length > 0 ? "warn" : "mono"],
    ["Cancelled", String(cancelled.length), "mono"],
    ["Timestamp", formatDateTime(lastEventAt ?? run.createdAt), "mono"],
  ];

  function exportReceipt() {
    const lines = [
      `Owó Reach settlement receipt`,
      `Run: ${run.title} (${run.id})`,
      `Status: ${run.status}`,
      "",
      ...RECEIPT.map(([k, v]) => `${k}: ${v}`),
      `Total disbursed: ${formatNaira(totalDisbursedKobo)}`,
      "",
      "Beneficiaries:",
      ...beneficiaries.map(
        (b) => `- ${b.name} · ${b.rail} · ${formatNaira(b.amountKobo)} · ${b.status}${b.monnifyReference ? ` · ${b.monnifyReference}` : ""}`
      ),
      "",
      "Audit trail:",
      ...eventLog
        .slice()
        .reverse()
        .map((e) => `[${formatDateTime(e.createdAt)}] ${describeEvent(e, beneficiaryMap)}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${run.id}-receipt.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Receipt downloaded.");
  }

  return (
    <AppShell active="batch">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="flex items-start gap-4 mb-10">
          <span
            className={`shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center animate-flip ${
              allSettled ? "border-reach text-reach" : "border-brass text-brass"
            }`}
          >
            <Icon name={allSettled ? "check" : "info"} size={26} fill={allSettled} />
          </span>
          <div>
            <div className={`label-caps mb-1 ${allSettled ? "text-reach" : "text-brass"}`}>
              {allSettled ? "Run complete · everyone paid" : `Run status · ${completed.length} of ${total} paid`}
            </div>
            <h1 className="font-display text-display-sm text-ink">
              Batch <span className="mono">{run.id}</span> is audit-ready
            </h1>
            <p className="text-body text-ink-soft mt-2 max-w-2xl">
              {completed.length} of {total} beneficiaries settled
              {failed.length > 0 ? `, ${failed.length} failed` : ""}
              {cancelled.length > 0 ? `, ${cancelled.length} cancelled` : ""}. Every state change below is
              stamped, timestamped, and can be handed to an auditor.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Receipt */}
          <section className="lg:col-span-3">
            <div className="border border-hairline">
              <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 bg-surface-sunk">
                <span className="label-caps text-ink">Settlement receipt</span>
                <div className="flex items-center gap-3">
                  {/* A receipt where everyone was paid earns the stamp; a partial
                      one deliberately doesn't get to look finished. */}
                  {allSettled && <span className="stamp animate-seal-in">Settled</span>}
                  <span className="mono text-[12px] text-ink-soft">{run.id}</span>
                </div>
              </div>
              <dl className="px-5">
                {RECEIPT.map(([k, v, kind]) => (
                  <div key={k} className="flex items-center justify-between py-3 border-b border-hairline">
                    <dt className="text-[14px] text-ink-soft">{k}</dt>
                    <dd
                      className={
                        kind === "money"
                          ? "money text-ink tabular-nums"
                          : kind === "money-soft"
                          ? "money text-ink-soft tabular-nums"
                          : kind === "warn"
                          ? "mono text-state-failed tabular-nums"
                          : kind === "mono"
                          ? "mono text-ink tabular-nums"
                          : "text-[14px] text-ink"
                      }
                    >
                      {v}
                    </dd>
                  </div>
                ))}
                <div className="ledger-total flex items-center justify-between py-4">
                  <dt className="font-display text-subheading text-ink">Total disbursed</dt>
                  <dd className="money text-[22px] text-ink tabular-nums">{formatNaira(totalDisbursedKobo)}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Link to="/transactions" className="btn btn-primary flex-1">Back to transactions</Link>
              <button className="btn btn-secondary flex-1" onClick={exportReceipt}>
                <Icon name="download" size={18} />Export receipt
              </button>
            </div>
          </section>

          {/* Audit trail — real event log, oldest last as recorded */}
          <section className="lg:col-span-2">
            <span className="label-caps text-ink-soft">Audit trail</span>
            <ol className="mt-3 border border-hairline divide-y divide-hairline max-h-[520px] overflow-y-auto">
              {eventLog.length === 0 ? (
                <li className="p-4 text-[13px] text-ink-soft">No events recorded.</li>
              ) : (
                eventLog.map((e) => (
                  <li key={e.id} className="p-4 flex gap-3">
                    <span className="mono text-[12px] text-ink-soft pt-0.5 w-16 shrink-0">
                      {formatDateTime(e.createdAt)}
                    </span>
                    <div className="text-[13px] text-ink">{describeEvent(e, beneficiaryMap)}</div>
                  </li>
                ))
              )}
            </ol>

            <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-soft leading-relaxed">
              <Icon name="info" size={16} className="text-brass" />
              Simulated SMS delivery. Composed message bodies are labelled in the app.
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
