import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

// One place for every cache key, so the live-event wire can invalidate by
// prefix without guessing at how each page happens to spell its query.
export const qk = {
  health: ["health"],
  runs: ["runs"],
  run: (id) => ["run", id],
  ledger: ["ledger"],
  ledgerEntries: ["ledger", "entries"],
  ledgerBalance: ["ledger", "balance"],
};

export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: api.health,
    refetchInterval: 20_000,
    retry: false, // an unreachable API is the answer here, not a failure to retry
    staleTime: 0,
  });
}

export function useRuns() {
  return useQuery({ queryKey: qk.runs, queryFn: api.listRuns });
}

// The bank list barely changes and is only needed when editing a beneficiary,
// so cache it hard — an hour keeps the edit form's dropdown instant.
export function useBanks() {
  return useQuery({ queryKey: ["banks"], queryFn: api.listBanks, staleTime: 60 * 60 * 1000 });
}

export function useRun(runId) {
  return useQuery({
    queryKey: qk.run(runId),
    queryFn: () => api.getRun(runId),
    enabled: Boolean(runId),
  });
}

/**
 * Every beneficiary across every run, flattened. The API only exposes
 * beneficiaries per-run, so this still fans out — but each run detail lands in
 * the same cache entry Review/Batch/Audit read, so opening a run afterwards is
 * already warm instead of refetching what this just pulled.
 */
export function useAllBeneficiaries() {
  const runsQuery = useRuns();
  const runs = runsQuery.data ?? [];

  const detailQueries = useQueries({
    queries: runs.map((run) => ({
      queryKey: qk.run(run.id),
      queryFn: () => api.getRun(run.id),
    })),
  });

  const rows = [];
  detailQueries.forEach((query, i) => {
    const detail = query.data;
    if (!detail) return;
    for (const b of detail.beneficiaries) {
      rows.push({
        id: b.id,
        ref: b.monnifyReference ?? b.id,
        name: b.name,
        rail: b.rail,
        amountKobo: b.amountKobo,
        status: b.status,
        when: b.updatedAt,
        runTitle: runs[i].title,
      });
    }
  });
  rows.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  return {
    rows,
    // Runs must load before the details can even be requested, so the list
    // query's own pending state is part of "still loading".
    isPending: runsQuery.isPending || detailQueries.some((q) => q.isPending),
    error: runsQuery.error ?? detailQueries.find((q) => q.error)?.error ?? null,
  };
}

export function useLedgerEntries() {
  return useQuery({ queryKey: qk.ledgerEntries, queryFn: api.listLedger });
}

export function useLedgerBalance() {
  return useQuery({ queryKey: qk.ledgerBalance, queryFn: api.ledgerBalance });
}
