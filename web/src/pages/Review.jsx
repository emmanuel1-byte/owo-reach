import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AppShell from "../components/AppShell.jsx";
import Icon from "../components/Icon.jsx";
import DepositDialog from "../components/DepositDialog.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ErrorState from "../components/ErrorState.jsx";
import BeneficiaryForm from "../components/BeneficiaryForm.jsx";
import { BeneficiaryStateBadge } from "../components/StateBadge.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.jsx";
import { api, ApiError } from "../lib/api.js";
import { formatNaira } from "../lib/money.js";
import { useBanks, useLedgerBalance, useRun, qk } from "../lib/queries.js";
import { useToast } from "../lib/toast.jsx";
import { setLastRun } from "../lib/lastRun.js";

export default function Review() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const balanceQuery = useLedgerBalance();
  const balanceKobo = balanceQuery.data?.balanceKobo ?? null;
  const balanceLoading = balanceQuery.isPending;

  const runQuery = useRun(runId);
  const { data, isPending, error: loadError, refetch } = runQuery;
  const run = data?.run ?? null;
  const beneficiaries = data?.beneficiaries ?? [];
  const loading = Boolean(runId) && isPending;

  const banksQuery = useBanks();
  const banks = banksQuery.data ?? [];

  const [depositOpen, setDepositOpen] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Which row is open in the inline editor: a beneficiary id, "new" for the
  // add form, or null when nothing is being edited.
  const [editingId, setEditingId] = useState(null);
  // The beneficiary awaiting a remove confirmation, or null.
  const [removingBen, setRemovingBen] = useState(null);

  function invalidateRun() {
    queryClient.invalidateQueries({ queryKey: qk.runs });
    queryClient.invalidateQueries({ queryKey: qk.run(runId) });
    queryClient.invalidateQueries({ queryKey: qk.ledger });
  }

  const addBen = useMutation({
    mutationFn: (payload) => api.addBeneficiary(runId, payload),
    onSuccess: () => {
      invalidateRun();
      toast.success("Beneficiary added and verified.");
      setEditingId(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not add that beneficiary."),
  });

  const updateBen = useMutation({
    mutationFn: ({ id, payload }) => api.updateBeneficiary(runId, id, payload),
    onSuccess: () => {
      invalidateRun();
      toast.success("Beneficiary updated and re-verified.");
      setEditingId(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save that change."),
  });

  const removeBen = useMutation({
    mutationFn: (id) => api.removeBeneficiary(runId, id),
    onSuccess: () => {
      invalidateRun();
      toast.success("Beneficiary removed from the run.");
      setRemovingBen(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not remove that beneficiary."),
  });

  useEffect(() => {
    if (run) setLastRun(run.id, run.status);
  }, [run]);

  const approve = useMutation({
    mutationFn: () => api.approveRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.runs });
      queryClient.invalidateQueries({ queryKey: qk.run(runId) });
      queryClient.invalidateQueries({ queryKey: qk.ledger });
      toast.success("Run approved — execution is underway.");
      navigate(`/batch/${runId}`);
    },
    onError: (err) => {
      // 402 is the ledger refusing a run it can't cover. It's the one approval
      // failure with an obvious next step, so offer that step instead of just
      // reporting it — and re-read the balance, since a stale figure on screen
      // is what made the attempt look affordable in the first place.
      if (err instanceof ApiError && err.status === 402) {
        balanceQuery.refetch();
        // The API's message may or may not end in a full stop; normalise it so
        // the sentence we append doesn't run into it.
        const detail = err.message.replace(/[.\s]+$/, "");
        toast.error(`${detail}. Deposit funds to cover the shortfall, then approve again.`);
        setDepositOpen(true);
      } else {
        toast.error(err instanceof ApiError ? err.message : "Could not approve this run.");
      }
    },
  });
  const approving = approve.isPending;

  const cancel = useMutation({
    mutationFn: () => api.cancelRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.runs });
      queryClient.invalidateQueries({ queryKey: qk.run(runId) });
      toast.success("Run discarded. It stays in Transactions for the record.");
      navigate("/home");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not discard this run.");
    },
  });
  const cancelling = cancel.isPending;

  function handleApprove() {
    approve.mutate();
  }


  if (loading) {
    return (
      <AppShell active="review">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16 text-center text-ink-soft">Loading run…</div>
      </AppShell>
    );
  }

  if (!runId) {
    return (
      <AppShell active="review">
        <div className="max-w-2xl mx-auto px-6 md:px-10 py-24 text-center">
          <Icon name="fact_check" size={40} className="text-ink-soft mx-auto mb-4" />
          <h1 className="font-display text-display-sm text-ink mb-2">Nothing waiting on review</h1>
          <p className="text-body text-ink-soft mb-6">
            Every run is either still a draft or has already been approved. Start a new one
            to see it here.
          </p>
          <Link to="/home" className="btn btn-primary">Start a payout</Link>
        </div>
      </AppShell>
    );
  }

  if (loadError || !run) {
    const notFound = loadError?.status === 404 || !loadError;
    return (
      <AppShell active="review">
        <ErrorState
          code={loadError?.status || (notFound ? "404" : undefined)}
          title={notFound ? "We couldn't find that run" : "This run couldn't be loaded"}
          description={
            notFound
              ? "It may have been discarded, or the link may be out of date. Your other runs are on the start screen."
              : loadError?.message
          }
          onRetry={notFound ? undefined : () => refetch()}
        />
      </AppShell>
    );
  }

  const bankCount = beneficiaries.filter((b) => b.rail === "BANK").length;
  const paycodeCount = beneficiaries.filter((b) => b.rail === "PAYCODE").length;
  const flagged = beneficiaries.filter((b) => (b.flags ?? []).length > 0);
  const totalWithFees = (run.totalAmountKobo ?? 0) + (run.totalFeesKobo ?? 0);
  const canApprove = run.status === "REVIEW";
  const colCount = canApprove ? 6 : 5; // table spans an extra Edit column in review
  // What approval will actually draw: flagged rows stay in PENDING_REVIEW and
  // are never paid, and fees aren't reserved — so the run total overstates the
  // requirement badly on a list with flags. The API is still the authority (it
  // answers 402 on approve); this only surfaces the shortfall before the click.
  const payableKobo = beneficiaries
    .filter((b) => (b.flags ?? []).length === 0)
    .reduce((sum, b) => sum + b.amountKobo, 0);
  const shortfallKobo =
    balanceLoading || balanceKobo === null ? 0 : Math.max(0, payableKobo - balanceKobo);

  return (
    <AppShell active="review">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="label-caps text-ink-soft mb-2">
              Batch <span className="mono">{run.id}</span> · {beneficiaries.length} beneficiaries
            </div>
            <h1 className="font-display text-display-sm text-ink">{run.title}</h1>
            <p className="text-body text-ink-soft mt-2 max-w-2xl">
              Review the normalised list before you authorise disbursement. Flagged rows
              need a decision.
            </p>
          </div>
          <Link to="/home" className="btn btn-secondary self-start md:self-auto">
            Back to start
          </Link>
        </div>

        {!canApprove && (
          <div className="border border-hairline bg-surface-sunk px-5 py-3 mb-6 text-[13px] text-ink-soft">
            This run is <span className="font-semibold text-ink">{run.status}</span>, so it can no
            longer be approved from here.{" "}
            <Link to={`/batch/${runId}`} className="text-ink underline underline-offset-2 hover:text-reach">
              View its live status →
            </Link>
          </div>
        )}

        {/* Written in the background after the run is already reviewable, so
            this stands in until the SSE wire delivers it. */}
        {!run.preflightBrief && run.status === "REVIEW" && (
          <div className="border-l-2 border-hairline bg-surface-sunk p-6 mb-8 max-w-3xl">
            <div className="flex items-center gap-2">
              <Icon name="auto_awesome" size={18} className="text-ink-soft" />
              <span className="label-caps text-ink-soft">Writing pre-flight brief…</span>
            </div>
          </div>
        )}

        {/* AI pre-flight brief — the model's actual written brief, not placeholder copy */}
        {run.preflightBrief && (
          <div className="border-l-2 border-ink bg-surface-sunk p-6 mb-8 max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="auto_awesome" size={18} className="text-brass" fill />
              <span className="label-caps text-ink">AI pre-flight brief</span>
            </div>
            <p className="text-body text-ink-soft leading-relaxed whitespace-pre-line">
              {run.preflightBrief}
            </p>
          </div>
        )}

        {/* Ledger */}
        <div className="border border-hairline">
          <Table minWidth={720}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[30%]">Beneficiary</TableHead>
                <TableHead className="w-[18%]">Phone</TableHead>
                <TableHead className="w-[12%]">Rail</TableHead>
                <TableHead className="w-[18%] text-right">Amount</TableHead>
                <TableHead className="w-[12%] text-center">State</TableHead>
                {canApprove && <TableHead className="w-[10%] text-right">Edit</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {beneficiaries.map((b) => {
                const flags = b.flags ?? [];
                const isFlagged = flags.length > 0;

                if (editingId === b.id) {
                  return (
                    <TableRow key={b.id} className="hover:bg-transparent">
                      <TableCell colSpan={colCount} className="!p-3">
                        <BeneficiaryForm
                          initial={b}
                          banks={banks}
                          busy={updateBen.isPending}
                          onCancel={() => setEditingId(null)}
                          onSave={(payload) => updateBen.mutate({ id: b.id, payload })}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={b.id} className={isFlagged ? "wash-failed" : ""}>
                    <TableCell>
                      <div className="text-ink">{b.name}</div>
                      {flags.map((f, i) => (
                        <div key={i} className="text-[13px] text-state-failed mt-0.5 flex items-center gap-1">
                          <Icon name="error" size={15} />
                          {f}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="mono text-ink-soft tabular-nums">{b.phone}</TableCell>
                    <TableCell>
                      <span className={b.rail === "BANK" ? "rail rail-bank" : "rail rail-paycode"}>
                        {b.rail === "PAYCODE" && <Icon name="qr_code_2" size={13} />}
                        {b.rail}
                      </span>
                    </TableCell>
                    <TableCell className="money text-ink text-right tabular-nums">
                      {formatNaira(b.amountKobo)}
                    </TableCell>
                    <TableCell className="text-center">
                      {isFlagged ? (
                        <span className="state s-failed justify-center">
                          <span className="dot dot--ring" />Review
                        </span>
                      ) : (
                        <BeneficiaryStateBadge status={b.status} />
                      )}
                    </TableCell>
                    {canApprove && (
                      <TableCell className="text-right whitespace-nowrap">
                        <button
                          className="icon-btn"
                          title="Edit beneficiary"
                          aria-label={`Edit ${b.name}`}
                          onClick={() => setEditingId(b.id)}
                          disabled={editingId !== null}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          className="icon-btn icon-btn--danger ml-1"
                          title="Remove beneficiary"
                          aria-label={`Remove ${b.name}`}
                          onClick={() => setRemovingBen(b)}
                          disabled={editingId !== null}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {editingId === "new" && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colCount} className="!p-3">
                    <BeneficiaryForm
                      banks={banks}
                      busy={addBen.isPending}
                      onCancel={() => setEditingId(null)}
                      onSave={(payload) => addBen.mutate(payload)}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {canApprove && editingId !== "new" && (
            <div className="px-4 py-3 border-b border-hairline">
              <button
                className="text-[13px] text-ink-soft hover:text-ink inline-flex items-center gap-1.5 disabled:opacity-40"
                onClick={() => setEditingId("new")}
                disabled={editingId !== null}
              >
                <Icon name="plus" size={16} />
                Add a beneficiary
              </button>
            </div>
          )}

          <div className="px-4">
            <div className="flex items-center justify-between py-3 border-b border-hairline">
              <span className="text-[14px] text-ink-soft">
                {bankCount} bank transfer{bankCount === 1 ? "" : "s"} · {paycodeCount} Paycode
                {paycodeCount === 1 ? "" : "s"} fee{paycodeCount === 1 ? "" : "s"}
              </span>
              <span className="money text-ink-soft tabular-nums">{formatNaira(run.totalFeesKobo)}</span>
            </div>
            <div className="ledger-total flex items-center justify-between py-4">
              <span className="font-display text-subheading text-ink">Total authorised</span>
              <span className="money text-[22px] text-ink tabular-nums">{formatNaira(totalWithFees)}</span>
            </div>
          </div>
        </div>

        {flagged.length > 0 && canApprove && (
          <p className="text-[13px] text-ink-soft mt-3">
            <Icon name="info" size={15} className="text-brass inline-block align-text-bottom mr-1" />
            {flagged.length} row{flagged.length === 1 ? "" : "s"} flagged and will be held back —
            they stay in <span className="mono">PENDING_REVIEW</span> and won't be paid on approval.
          </p>
        )}

        {canApprove && shortfallKobo > 0 && (
          <div className="border-l-2 border-brass bg-surface-sunk p-5 mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <Icon name="wallet" size={20} className="text-brass shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="label-caps text-ink mb-1">
                Short by {formatNaira(shortfallKobo)}
              </div>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                Approving draws {formatNaira(payableKobo)}
                {flagged.length > 0 ? " (flagged rows are held back, so they don't count)" : ""} but
                the ledger holds {formatNaira(balanceKobo)}. Approving now will be refused until
                the balance covers it.
              </p>
            </div>
            <button
              className="btn btn-reach shrink-0 self-start sm:self-auto"
              onClick={() => setDepositOpen(true)}
            >
              <Icon name="deposit" size={16} />
              Deposit funds
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 border-t border-hairline mt-8 pt-6">
          {/* Only meaningful when the run is affordable — a negative projection
              is a state the ledger can't reach, and the shortfall banner above
              already says so in the case that matters. */}
          {canApprove && !balanceLoading && balanceKobo !== null && shortfallKobo === 0 && (
            <span className="text-[13px] text-ink-soft sm:mr-auto">
              Balance after this run:{" "}
              <span className="money text-ink tabular-nums">
                {formatNaira(balanceKobo - payableKobo)}
              </span>
            </span>
          )}
          {canApprove && (
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmingCancel(true)}
              disabled={cancelling || approving}
            >
              {cancelling ? "Discarding…" : "Discard run"}
            </button>
          )}
          <button
            className="btn btn-primary !px-8"
            onClick={handleApprove}
            disabled={!canApprove || approving || cancelling}
          >
            {approving ? "Approving…" : "Approve and pay"}
          </button>
        </div>
      </div>

      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />

      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        tone="danger"
        icon="ban"
        title="Discard run"
        description={
          <>
            <strong className="text-ink">{run.title}</strong> won't be paid, and this can't be
            undone. The run and its {beneficiaries.length} beneficiaries stay in Transactions for
            the record.
          </>
        }
        confirmLabel="Discard run"
        cancelLabel="Keep it"
        busy={cancelling}
        onConfirm={() => cancel.mutate()}
      />

      <ConfirmDialog
        open={Boolean(removingBen)}
        onOpenChange={(next) => !next && setRemovingBen(null)}
        tone="danger"
        icon="trash"
        title="Remove beneficiary"
        description={
          removingBen ? (
            <>
              <strong className="text-ink">{removingBen.name}</strong> ({formatNaira(removingBen.amountKobo)})
              will be taken off this run and won't be paid. The run's total updates to match.
            </>
          ) : null
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        confirmIcon="trash"
        busy={removeBen.isPending}
        onConfirm={() => removingBen && removeBen.mutate(removingBen.id)}
      />
    </AppShell>
  );
}