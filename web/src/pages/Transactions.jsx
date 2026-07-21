import { useMemo, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import Icon from "../components/Icon.jsx";
import { BeneficiaryStateBadge } from "../components/StateBadge.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.jsx";
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
import { useAllBeneficiaries } from "../lib/queries.js";
import { useToast } from "../lib/toast.jsx";

const PAGE_SIZE = 10;

const STATE_FILTERS = {
  all: () => true,
  completed: (s) => s === "COMPLETED",
  "in-flight": (s) => ["QUEUED", "SENT", "CODE_ISSUED", "PENDING_AUTHORIZATION", "PENDING_REVIEW"].includes(s),
  failed: (s) => s === "FAILED",
  cancelled: (s) => s === "CANCELLED",
};

export default function Transactions() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Each run's detail is cached under the same key Review/Batch/Audit read, so
  // this screen warms them rather than duplicating their fetches.
  const { rows, isPending: loading, error: loadError } = useAllBeneficiaries();

  const stats = useMemo(() => {
    const totalDisbursedKobo = rows
      .filter((r) => r.status === "COMPLETED")
      .reduce((sum, r) => sum + r.amountKobo, 0);
    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    const inFlight = rows.filter((r) => STATE_FILTERS["in-flight"](r.status)).length;
    const failed = rows.filter((r) => r.status === "FAILED").length;
    return [
      ["Total disbursed", formatNaira(totalDisbursedKobo), "text-ink"],
      ["Completed", String(completed), "text-reach"],
      ["In flight", String(inFlight), "text-brass"],
      ["Failed", String(failed), "text-state-failed"],
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!STATE_FILTERS[stateFilter](r.status)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        r.runTitle.toLowerCase().includes(q)
      );
    });
  }, [rows, query, stateFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function exportCsv() {
    const header = ["Reference", "Run", "Beneficiary", "Rail", "Amount (NGN)", "State", "Updated"];
    const csvRows = filtered.map((r) => [
      r.ref,
      r.runTitle,
      r.name,
      r.rail,
      (r.amountKobo / 100).toFixed(2),
      r.status,
      r.when ? new Date(r.when).toISOString() : "",
    ]);
    const csv = [header, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "owo-reach-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} transaction${filtered.length === 1 ? "" : "s"}.`);
  }

  return (
    <AppShell active="transactions">
      <div className="border rounded-[12px] mx-auto px-6 md:mx-10 py-10 md:my-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="label-caps text-ink-soft mb-2">Ledger · all runs</div>
            <h1 className="font-display text-display-sm text-ink">Transaction history</h1>
            <p className="text-body text-ink-soft mt-2">
              A complete audit log of every transfer and Paycode.
            </p>
          </div>
          <button className="btn btn-secondary self-start md:self-auto" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Icon name="download" size={18} />Export CSV
          </button>
        </div>

        {loadError && (
          <div className="border border-state-failed bg-white px-5 py-3 mb-6 text-[13px] text-state-failed">
            {loadError.message ?? "Could not load transactions."}
          </div>
        )}

        {/* Reconciliation strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-hairline mb-6">
          {stats.map(([label, value, color], i) => (
            <div
              key={label}
              className={`p-4 ${i < 3 ? "lg:border-r" : ""} ${i % 2 === 0 ? "border-r" : ""} ${
                i >= 2 ? "border-t lg:border-t-0" : ""
              } border-hairline`}
            >
              <div className="label-caps text-ink-soft mb-1">{label}</div>
              <div className={`money text-[18px] tabular-nums ${color}`}>{loading ? "…" : value}</div>
            </div>
          ))}
        </div>

        {/* Search & filter */}
        <div className="flex flex-col md:flex-row md:items-center rounded-[16px] focus:none outline-none gap-3 border border-hairline p-3 mb-4">
          <div className="relative border border-highline rounded-[20px] overflow-hidden focus:none outline-none flex-1">
            <Icon name="search" size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              type="text"
              placeholder="Search by name, reference, or run"
              className="field !pl-10 !border-transparent focus:!border-hairline"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={stateFilter}
              onValueChange={(v) => {
                setStateFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-flight">In flight</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ledger */}
        <div className="border border-hairline">
          {loading ? (
            <TableSkeleton
              rows={6}
              minWidth={820}
              widths={["w-28", "w-24", "w-32", "w-14", "w-20 ml-auto", "w-24", "w-16 ml-auto"]}
            />
          ) : (
          <Table minWidth={820}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[18%]">Reference</TableHead>
                <TableHead className="w-[16%]">Run</TableHead>
                <TableHead className="w-[20%]">Beneficiary</TableHead>
                <TableHead className="w-[10%]">Rail</TableHead>
                <TableHead className="w-[14%]">Amount</TableHead>
                <TableHead className="w-[12%]">State</TableHead>
                <TableHead className="w-[10%] text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-ink-soft py-8">
                    No transactions match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r, i) => {
                  const cancelled = r.status === "CANCELLED";
                  return (
                    <TableRow key={r.id} className="row-enter" style={{ "--row": i }}>
                      <TableCell className="mono text-ink tabular-nums text-[12px]">{r.ref}</TableCell>
                      <TableCell className="text-ink-soft text-[13px]">{r.runTitle}</TableCell>
                      <TableCell className={cancelled ? "line-through text-ink-soft" : "text-ink"}>
                        {r.name}
                      </TableCell>
                      <TableCell>
                        <span className={r.rail === "BANK" ? "rail rail-bank" : "rail rail-paycode"}>
                          {r.rail === "PAYCODE" && <Icon name="qr_code_2" size={13} />}
                          {r.rail}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`money tabular-nums ${
                          cancelled ? "text-ink-soft line-through" : "text-ink"
                        }`}
                      >
                        {formatNaira(r.amountKobo)}
                      </TableCell>
                      <TableCell>
                        <BeneficiaryStateBadge status={r.status} />
                      </TableCell>
                      <TableCell className="mono text-ink-soft text-right tabular-nums text-[12px]">
                        {formatDateTime(r.when)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          )}
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between mt-5">
            <span className="text-[13px] text-ink-soft">
              Showing <span className="mono">{(clampedPage - 1) * PAGE_SIZE + 1}</span>–
              <span className="mono">{Math.min(clampedPage * PAGE_SIZE, filtered.length)}</span> of{" "}
              <span className="mono">{filtered.length}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                className="btn btn-secondary !px-3 !py-1.5 !text-[11px] disabled:opacity-50"
                disabled={clampedPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span className="mono text-[12px] text-ink-soft px-2">
                {clampedPage} / {pageCount}
              </span>
              <button
                className="btn btn-secondary !px-3 !py-1.5 !text-[11px] disabled:opacity-50"
                disabled={clampedPage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
