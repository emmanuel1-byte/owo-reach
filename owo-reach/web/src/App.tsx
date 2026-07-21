import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatNaira, type Beneficiary } from "./lib/api";
import { useLiveEvents } from "./lib/useSSE";

/**
 * Dashboard shell — the golden path only:
 * runs list → run detail (beneficiary ledger) → approve → watch it go live.
 * Person B: this is your starting point, not your ceiling.
 */

const STATUS_STYLE: Record<Beneficiary["status"], string> = {
  PENDING_REVIEW: "bg-line text-ink",
  QUEUED: "bg-line text-ink",
  SENT: "bg-pending-soft text-pending",
  CODE_ISSUED: "bg-pending-soft text-pending",
  COMPLETED: "bg-naira-soft text-naira",
  FAILED: "bg-alert-soft text-alert",
  EXPIRED: "bg-alert-soft text-alert",
  CANCELLED: "bg-line text-ink/60",
};

export default function App() {
  useLiveEvents();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns });
  const activeRunId = selectedRunId ?? runs.data?.[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-baseline justify-between border-b border-line pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Owó Reach</h1>
          <p className="mt-1 text-sm text-ink/60">
            Pay everyone on the list — bank account or not.
          </p>
        </div>
        <span className="ledger text-xs text-ink/40">sandbox</span>
      </header>

      <main className="grid grid-cols-[240px_1fr] gap-8">
        <nav aria-label="Payout runs">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Payout runs
          </h2>
          {runs.isLoading && <p className="text-sm text-ink/50">Loading…</p>}
          {runs.data?.length === 0 && (
            <p className="text-sm text-ink/50">No runs yet. Run `bun run seed` to load demo data.</p>
          )}
          <ul className="space-y-1">
            {runs.data?.map((run) => (
              <li key={run.id}>
                <button
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    run.id === activeRunId ? "bg-surface shadow-sm" : "hover:bg-surface/60"
                  }`}
                >
                  <span className="block font-medium">{run.title}</span>
                  <span className="ledger mt-0.5 block text-xs text-ink/50">
                    {formatNaira(run.totalAmountKobo)} · {run.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {activeRunId ? <RunDetail runId={activeRunId} /> : <div />}
      </main>
    </div>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["run", runId], queryFn: () => api.getRun(runId) });

  const approve = useMutation({
    mutationFn: () => api.approveRun(runId),
    // Optimistic: the run moves the instant the button is pressed.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["run", runId] });
      queryClient.setQueryData(["run", runId], (old: typeof detail.data) =>
        old ? { ...old, run: { ...old.run, status: "EXECUTING" as const } } : old,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["run", runId] }),
  });

  if (detail.isLoading) return <p className="text-sm text-ink/50">Loading run…</p>;
  if (!detail.data) return <p className="text-sm text-alert">Run not found.</p>;

  const { run, beneficiaries } = detail.data;
  const flagged = beneficiaries.filter((b) => b.flags.length > 0);

  return (
    <section aria-label={run.title}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">{run.title}</h2>
          <p className="ledger mt-1 text-sm text-ink/60">
            {beneficiaries.length} beneficiaries · {formatNaira(run.totalAmountKobo)} · fees{" "}
            {formatNaira(run.totalFeesKobo)}
          </p>
        </div>
        {run.status === "REVIEW" && (
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending}
            className="rounded-md bg-naira px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Approve and pay {beneficiaries.length - flagged.length}
          </button>
        )}
      </div>

      {flagged.length > 0 && run.status === "REVIEW" && (
        <p className="mb-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {flagged.length} flagged beneficiar{flagged.length === 1 ? "y is" : "ies are"} held back
          from this run. Resolve the flags to include them.
        </p>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50">
            <th className="py-2 pr-4 font-semibold">Beneficiary</th>
            <th className="py-2 pr-4 font-semibold">Rail</th>
            <th className="py-2 pr-4 text-right font-semibold">Amount</th>
            <th className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {beneficiaries.map((b) => (
            <tr key={b.id} className="border-b border-line/60">
              <td className="py-3 pr-4">
                <span className="font-medium">{b.name}</span>
                <span className="ledger block text-xs text-ink/50">{b.phone}</span>
                {b.flags.map((flag) => (
                  <span key={flag} className="mt-1 block text-xs text-alert">
                    ⚑ {flag}
                  </span>
                ))}
              </td>
              <td className="py-3 pr-4">
                {b.rail === "PAYCODE" ? "Cash · paycode" : `Bank · ${b.bankCode}`}
              </td>
              <td className="ledger py-3 pr-4 text-right">{formatNaira(b.amountKobo)}</td>
              <td className="py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}
                >
                  {b.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
