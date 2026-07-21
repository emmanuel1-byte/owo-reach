import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AppShell from "../components/AppShell.jsx";
import ErrorState from "../components/ErrorState.jsx";
import Icon from "../components/Icon.jsx";
import PaycodeDialog from "../components/PaycodeDialog.jsx";
import { BeneficiaryStateBadge, RunStateBadge } from "../components/StateBadge.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.jsx";
import { api, ApiError } from "../lib/api.js";
import { formatNaira, formatClock } from "../lib/money.js";
import { TERMINAL_BENEFICIARY_STATES } from "../lib/statusMeta.js";
import { useRun, qk } from "../lib/queries.js";
import { useToast } from "../lib/toast.jsx";
import { setLastRun } from "../lib/lastRun.js";
import { describeEvent } from "../lib/describeEvent.js";

export default function Batch() {
  const { runId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  // The live wire invalidates this run's cache entry centrally, so any change
  // relevant to it re-reads on its own — no per-page subscription needed.
  const { data, isPending, error: loadError, refetch } = useRun(runId);
  const run = data?.run ?? null;
  const beneficiaries = data?.beneficiaries ?? [];
  const eventLog = data?.events ?? [];
  const loading = Boolean(runId) && isPending;

  const [busy, setBusy] = useState({}); // beneficiaryId -> true while an action is in flight
  const [otpDrafts, setOtpDrafts] = useState({}); // beneficiaryId -> typed OTP
  const [revealed, setRevealed] = useState(null); // { beneficiary, paycode } while shown

  useEffect(() => {
    if (run) setLastRun(run.id, run.status);
  }, [run]);

  // This screen is watched while it settles, and a status can change without
  // any local action causing it. Flashing the row that moved is what makes a
  // pushed update noticeable instead of the table silently differing.
  const [flashing, setFlashing] = useState(() => new Set());
  const prevStatusRef = useRef(null);
  useEffect(() => {
    const next = {};
    for (const b of beneficiaries) next[b.id] = b.status;
    const prev = prevStatusRef.current;
    prevStatusRef.current = next;
    if (!prev) return; // first load isn't a transition

    const changed = Object.keys(next).filter((id) => prev[id] && prev[id] !== next[id]);
    if (changed.length === 0) return;
    setFlashing(new Set(changed));
    const t = setTimeout(() => setFlashing(new Set()), 1300);
    return () => clearTimeout(t);
  }, [beneficiaries]);

  const load = refetch;

  const beneficiaryMap = useMemo(() => {
    const m = {};
    for (const b of beneficiaries) m[b.id] = b;
    return m;
  }, [beneficiaries]);

  function setRowBusy(id, value) {
    setBusy((b) => ({ ...b, [id]: value }));
  }

  // A row action can settle the run and move the float with it (cancelling
  // writes a RUN_REFUND), so all three go stale together.
  function refreshRun() {
    queryClient.invalidateQueries({ queryKey: qk.run(runId) });
    queryClient.invalidateQueries({ queryKey: qk.runs });
    queryClient.invalidateQueries({ queryKey: qk.ledger });
  }

  async function runAction(id, fn, { successMessage } = {}) {
    setRowBusy(id, true);
    try {
      const result = await fn();
      if (successMessage) toast.success(successMessage);
      refreshRun();
      return result;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That action failed.");
    } finally {
      setRowBusy(id, false);
    }
  }

  const handleSubmitOtp = (id) =>
    runAction(
      id,
      () => api.submitOtp(id, (otpDrafts[id] ?? "").trim()),
      { successMessage: "OTP accepted — transfer authorised." }
    );

  const handleResendOtp = (id) =>
    runAction(id, () => api.resendOtp(id), { successMessage: "OTP resent." });

  const handleReveal = async (id) => {
    setRowBusy(id, true);
    try {
      const { paycode } = await api.revealPaycode(id);
      // Held open until dismissed rather than toasted away on a timer — this
      // gets read aloud, and it's the artefact the whole PAYCODE rail exists for.
      setRevealed({ beneficiary: beneficiaryMap[id], paycode });
      refreshRun();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reveal this code.");
    } finally {
      setRowBusy(id, false);
    }
  };

  const handleNudge = async (id) => {
    setRowBusy(id, true);
    try {
      const { sms } = await api.nudgeBeneficiary(id);
      toast.info(`Nudge composed: "${sms}"`, { duration: 12000 });
      refreshRun();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send that nudge.");
    } finally {
      setRowBusy(id, false);
    }
  };

  const handleCancel = (id) =>
    runAction(id, () => api.cancelBeneficiary(id), { successMessage: "Beneficiary cancelled — amount refunded to the run total." });

  const handleReissue = (id) =>
    runAction(id, () => api.reissuePaycode(id), { successMessage: "New paycode issued." });

  if (loading) {
    return (
      <AppShell active="batch">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16 text-center text-ink-soft">Loading run…</div>
      </AppShell>
    );
  }

  if (!runId) {
    return (
      <AppShell active="batch">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-24 text-center">
          <Icon name="sync" size={40} className="text-ink-soft mx-auto mb-4" />
          <h1 className="font-display text-display-sm text-ink mb-2">No batch is running right now</h1>
          <p className="text-body text-ink-soft mb-6">
            Nothing is currently executing. Approve a run from Payout review to watch it
            settle live here.
          </p>
          <Link to="/home" className="btn btn-primary">Start a payout</Link>
        </div>
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
  const terminal = beneficiaries.filter((b) => TERMINAL_BENEFICIARY_STATES.includes(b.status));
  const completed = beneficiaries.filter((b) => b.status === "COMPLETED");
  const landedKobo = completed.reduce((sum, b) => sum + b.amountKobo, 0);
  const outstandingKobo = Math.max(0, (run.totalAmountKobo ?? 0) - landedKobo);
  const pct = total === 0 ? 0 : (terminal.length / total) * 100;
  const done = total > 0 && terminal.length === total;

  return (
    <AppShell active="batch">
      <div className="border rounded-[12px] mx-auto px-6 md:mx-10 py-10 md:my-12">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-8">
          <div>
            <div className="label-caps text-ink-soft mb-2 flex items-center gap-2 flex-wrap">
              Batch <span className="mono">{run.id}</span>
              <RunStateBadge status={run.status} className="!text-[11px]" />
            </div>
            <h1 className="font-display text-display-sm md:text-display-lg text-ink">
              Did everyone get paid?
            </h1>
          </div>
          <div className="text-left lg:text-right">
            <div className="money text-[28px] text-ink tabular-nums">
              {terminal.length} <span className="text-ink-soft text-[20px]">of</span> {total} settled
            </div>
            <button onClick={load} className="label-caps text-ink-soft hover:text-ink mt-1 inline-flex items-center gap-1">
              <Icon name="sync" size={13} />
              {done ? "All landed · reconciled" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="h-[3px] w-full bg-hairline mb-10 overflow-hidden">
          <div className="h-full bg-reach transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Execution ledger */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <span className="label-caps text-ink-soft">Execution queue</span>
            </div>
            <div className="border border-hairline">
              <Table minWidth={640}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[26%]">Beneficiary</TableHead>
                    <TableHead className="w-[16%] text-right">Amount</TableHead>
                    <TableHead className="w-[18%] text-center">State</TableHead>
                    <TableHead className="w-[40%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {beneficiaries.map((b, i) => {
                    const rowBusy = !!busy[b.id];
                    return (
                      <TableRow
                        key={b.id}
                        style={{ "--row": i }}
                        className={flashing.has(b.id) ? "animate-flash" : "row-enter"}
                      >
                        <TableCell className="text-ink">
                          {b.name}
                          <div className="mono text-[11px] text-ink-soft">{b.monnifyReference ?? "—"}</div>
                        </TableCell>
                        <TableCell className="money text-ink text-right tabular-nums">
                          {formatNaira(b.amountKobo)}
                        </TableCell>
                        <TableCell className="text-center">
                          <BeneficiaryStateBadge status={b.status} />
                        </TableCell>
                        <TableCell>
                          {b.status === "PENDING_AUTHORIZATION" && (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="OTP"
                                className="field !py-1.5 !px-2 !text-[12px] w-20"
                                value={otpDrafts[b.id] ?? ""}
                                onChange={(e) => setOtpDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                                disabled={rowBusy}
                              />
                              <button
                                className="btn btn-primary !py-1.5 !px-2.5 !text-[11px]"
                                onClick={() => handleSubmitOtp(b.id)}
                                disabled={rowBusy || !(otpDrafts[b.id] ?? "").trim()}
                              >
                                Submit
                              </button>
                              <button
                                className="btn btn-secondary !py-1.5 !px-2.5 !text-[11px]"
                                onClick={() => handleResendOtp(b.id)}
                                disabled={rowBusy}
                              >
                                Resend
                              </button>
                            </div>
                          )}

                          {b.status === "CODE_ISSUED" && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button className="btn btn-secondary !py-1.5 !px-2.5 !text-[11px]" onClick={() => handleReveal(b.id)} disabled={rowBusy}>
                                <Icon name="visibility" size={14} />Reveal
                              </button>
                              <button className="btn btn-secondary !py-1.5 !px-2.5 !text-[11px]" onClick={() => handleNudge(b.id)} disabled={rowBusy}>
                                <Icon name="send" size={14} />Nudge
                              </button>
                              <button className="btn btn-secondary !py-1.5 !px-2.5 !text-[11px]" onClick={() => handleCancel(b.id)} disabled={rowBusy}>
                                <Icon name="ban" size={14} />Cancel
                              </button>
                              {b.paycodeExpiresAt && (
                                <span className="mono text-[11px] text-ink-soft inline-flex items-center gap-1">
                                  <Icon name="clock" size={12} />
                                  exp {formatClock(b.paycodeExpiresAt)}
                                </span>
                              )}
                            </div>
                          )}

                          {b.status === "EXPIRED" && (
                            <div className="flex items-center gap-1.5">
                              <button className="btn btn-primary !py-1.5 !px-2.5 !text-[11px]" onClick={() => handleReissue(b.id)} disabled={rowBusy}>
                                <Icon name="sync" size={14} />Reissue
                              </button>
                              <button className="btn btn-secondary !py-1.5 !px-2.5 !text-[11px]" onClick={() => handleCancel(b.id)} disabled={rowBusy}>
                                Cancel
                              </button>
                            </div>
                          )}

                          {(b.status === "QUEUED" || b.status === "SENT") && (
                            <button className="btn btn-secondary !py-1.5 !px-2.5 !text-[11px]" onClick={() => handleCancel(b.id)} disabled={rowBusy}>
                              <Icon name="ban" size={14} />Cancel
                            </button>
                          )}

                          {["COMPLETED", "FAILED", "CANCELLED"].includes(b.status) && (
                            <span className="text-[12px] text-ink-soft">No actions remaining</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Reconciliation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 border border-hairline border-t-0 divide-y sm:divide-y-0 divide-hairline">
              <div className="p-4 sm:border-r border-hairline">
                <div className="label-caps text-ink-soft mb-1">Sent</div>
                <div className="money text-[18px] text-ink tabular-nums">{formatNaira(run.totalAmountKobo)}</div>
              </div>
              <div className="p-4 sm:border-r border-hairline">
                <div className="label-caps text-ink-soft mb-1">Redeemed / landed</div>
                <div className="money text-[18px] text-reach tabular-nums">{formatNaira(landedKobo)}</div>
              </div>
              <div className="p-4">
                <div className="label-caps text-ink-soft mb-1">Outstanding</div>
                <div className="money text-[18px] text-brass tabular-nums">{formatNaira(outstandingKobo)}</div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Link
                to={`/audit/${runId}`}
                className={`btn btn-primary ${done ? "" : "opacity-40 pointer-events-none"}`}
              >
                View audit receipt
              </Link>
            </div>
          </div>

          {/* Activity feed — the run's real append-only event log */}
          <aside className="lg:col-span-1">
            <span className="label-caps text-ink-soft">Activity</span>
            <div className="mt-3 border border-hairline divide-y divide-hairline max-h-[560px] overflow-y-auto">
              {eventLog.length === 0 ? (
                <div className="p-3 text-[13px] text-ink-soft">No activity yet.</div>
              ) : (
                eventLog.map((e, i) => (
                  <div key={e.id} className={`p-3 flex gap-3 items-start ${i === 0 ? "animate-settle" : ""}`}>
                    <span className="mono text-[12px] text-ink-soft pt-0.5 shrink-0">{formatClock(e.createdAt)}</span>
                    <span className="text-[13px] text-ink">{describeEvent(e, beneficiaryMap)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 label-caps text-ink-soft">
              <Icon name="shield" size={16} className="text-reach" />
              Reconciliation sweep · every 60s
            </div>
          </aside>
        </div>
      </div>

      <PaycodeDialog
        open={Boolean(revealed)}
        onOpenChange={(next) => !next && setRevealed(null)}
        beneficiary={revealed?.beneficiary}
        paycode={revealed?.paycode}
      />
    </AppShell>
  );
}