import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AppShell from "../components/AppShell.jsx";
import Icon from "../components/Icon.jsx";
import { RunStateBadge } from "../components/StateBadge.jsx";
import { Table, TableBody, TableCell, TableRow } from "../components/ui/table.jsx";
import { TableSkeleton } from "../components/ui/skeleton.jsx";
import { api, ApiError } from "../lib/api.js";
import { formatNaira, formatDateTime } from "../lib/money.js";
import { useLiveEvents } from "../lib/liveEvents.jsx";
import { useRuns, qk } from "../lib/queries.js";
import { useToast } from "../lib/toast.jsx";

const ENTRY = [
  {
    key: "upload",
    icon: "upload_file",
    title: "Upload spreadsheet",
    body: "Drag in a CSV or text export. Best for bulk runs over 50 beneficiaries.",
    cta: "Select file",
  },
  {
    key: "paste",
    icon: "content_paste",
    title: "Paste from messaging",
    body: "Copy straight from WhatsApp, SMS, or Telegram. The AI sanitises and maps the fields.",
    cta: "Open paste zone",
  },
  {
    key: "type",
    icon: "keyboard",
    title: "Type it out",
    body: "Enter beneficiaries by hand, one per line. Ideal for small, precise disbursements.",
    cta: "Open form",
  },
];

// The pre-flight brief is deliberately absent: it's written after the run is
// created and already reviewable, so listing it here would show a step the
// user is no longer waiting on. It fills itself in on the review screen.
const PROGRESS_STEPS = [
  { key: "started", label: "Reading your list" },
  { key: "parsed", label: "Extracting beneficiaries" },
  { key: "verifying", label: "Verifying accounts" },
];

const PLACEHOLDERS = {
  upload: "Choose a file below — its contents will appear here once read.",
  paste: `Paste anything — a WhatsApp message, a CSV, free text.\n\nAmina Okafor, 08031112200, 20000\nOluwaseun Adeyemi, 08012345678, 150000, GTBank, 0123456789`,
  type: `Name, phone, amount, one beneficiary per line.\n\nAmina Okafor, 08031112200, 20000\nOluwaseun Adeyemi, 08012345678, 150000, GTBank, 0123456789`,
};

export default function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [composerMode, setComposerMode] = useState(null); // null | "upload" | "paste" | "type"
  const [title, setTitle] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [progressStage, setProgressStage] = useState(null);

  const { data: allRuns = [], isPending: runsLoading, error: runsError } = useRuns();
  // Discarded runs stay in the database and in Transactions for the audit
  // trail, but they're not work anyone still has to act on — so they don't
  // belong in the operator's list of recent runs.
  const runs = allRuns.filter((r) => r.status !== "CANCELLED");

  // The list itself refreshes from the central cache invalidation; this is only
  // here for the ingestion stages, which are progress reports rather than state.
  useLiveEvents((type) => {
    if (type.startsWith("ingestion.")) {
      setProgressStage(type.split(".")[1]);
    }
  });

  function openComposer(mode) {
    setComposerMode(mode);
    if (mode === "upload") {
      fileInputRef.current?.click();
    }
  }

  function closeComposer() {
    if (submitting) return;
    setComposerMode(null);
    setTitle("");
    setRawInput("");
    setProgressStage(null);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawInput(String(reader.result ?? ""));
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      setComposerMode("upload");
    };
    reader.onerror = () => toast.error("Couldn't read that file — try a plain-text CSV export.");
    reader.readAsText(file);
  }

  const createRun = useMutation({
    mutationFn: () => api.createRun(title.trim(), rawInput),
    onMutate: () => setProgressStage("started"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: qk.runs });
      toast.success(
        `${result.beneficiaries.length} beneficiaries ready for review in "${result.run.title}".`
      );
      navigate(`/review/${result.run.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not create the run.");
      setProgressStage(null);
    },
  });
  const submitting = createRun.isPending;

  function handleCreate() {
    if (!title.trim()) return toast.error("Give this run a title first.");
    if (!rawInput.trim()) return toast.error("The beneficiary list is empty.");
    createRun.mutate();
  }

  return (
    <AppShell active="home">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={handleFile}
      />

      <div className="border rounded-[12px] mx-auto px-6 md:mx-10 py-10 md:my-12">
        <div className="mb-10">
          <div className="label-caps text-ink-soft mb-3">New distribution</div>
          <h1 className="font-display text-display-sm md:text-display-lg text-ink mb-3">
            Start a payout run
          </h1>
          <p className="text-body-[18px] text-ink-soft max-w-2xl">
            Drop a list to start a spreadsheet, a WhatsApp paste, or type it out. The
            engine cleans it, checks each account, and flags the problems before a single
            naira is committed.
          </p>
        </div>

        {/* Three equal entry paths */}
        <div className="grid grid-cols-1 md:grid-cols-3 border border-hairline bg-white">
          {ENTRY.map((e, i) => (
            <button
              key={e.key}
              onClick={() => openComposer(e.key)}
              className={`text-left p-7 hover:bg-surface-sunk transition-colors group border-b md:border-b-0 ${
                i < 2 ? "md:border-r border-hairline" : ""
              }`}
            >
              <Icon name={e.icon} size={34} className="text-ink" />
              <h3 className="font-display text-subheading text-ink mt-5 mb-2">{e.title}</h3>
              <p className="text-[14px] text-ink-soft leading-relaxed">{e.body}</p>
              <span className="mt-6 pt-4 border-t border-hairline group-hover:border-ink transition-colors flex items-center justify-between">
                <span className="label-caps text-ink-soft">{e.cta}</span>
                <Icon name="arrow_forward" size={18} className="text-ink" />
              </span>
            </button>
          ))}
        </div>

        {/* Composer — opens for any of the three entry paths */}
        {composerMode && (
          <div className="mt-8 border border-hairline animate-settle">
            <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-surface-sunk">
              <span className="label-caps text-ink-soft">
                {composerMode === "upload"
                  ? "Uploaded list"
                  : composerMode === "paste"
                  ? "Paste zone"
                  : "Type it out"}
              </span>
              <button onClick={closeComposer} disabled={submitting} className="text-ink-soft hover:text-ink disabled:opacity-40">
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="field-label">Run title</label>
                <input
                  className="field"
                  type="text"
                  placeholder="e.g. July farm-gate payout"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="field-label">Beneficiary list</label>
                <textarea
                  className="field min-h-[160px] font-mono !text-[13px] leading-relaxed"
                  placeholder={PLACEHOLDERS[composerMode]}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  disabled={submitting}
                />
              </div>

              {submitting && (
                <div className="border-t border-hairline pt-4">
                  <ul className="space-y-2">
                    {PROGRESS_STEPS.map((s) => {
                      const stepIndex = PROGRESS_STEPS.findIndex((x) => x.key === s.key);
                      const currentIndex = PROGRESS_STEPS.findIndex((x) => x.key === progressStage);
                      const done = currentIndex > stepIndex;
                      const active = progressStage === s.key;
                      return (
                        <li key={s.key} className="flex items-center gap-2 text-[13px]">
                          {done ? (
                            <Icon name="check" size={16} className="text-reach" />
                          ) : active ? (
                            <Icon name="loader" size={16} className="text-brass animate-spin" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-hairline shrink-0" />
                          )}
                          <span className={done || active ? "text-ink" : "text-ink-soft"}>{s.label}…</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-hairline">
              <button className="btn btn-secondary" onClick={closeComposer} disabled={submitting}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? "Creating run…" : "Create run"}
              </button>
            </div>
          </div>
        )}

        {/* Recent runs — real data from GET /api/runs */}
        <div className="mt-8 border border-hairline">
          <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-surface-sunk">
            <span className="label-caps text-ink-soft">Recent runs</span>
            <span className="mono text-[12px] text-ink-soft">
              {runsLoading ? "…" : `${runs.length} total`}
            </span>
          </div>

          {runsLoading ? (
            <TableSkeleton
              rows={3}
              minWidth={640}
              widths={["w-48", "w-20", "w-24", "w-24 ml-auto", "w-12 ml-auto"]}
            />
          ) : runsError ? (
            <div className="px-5 py-8 text-center text-[13px] text-state-failed">
              {runsError.message ?? "Could not load recent runs."}
            </div>
          ) : runs.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-ink-soft">
              No runs yet — create one above to get started.
            </div>
          ) : (
            <Table minWidth={640}>
              <TableBody>
                {runs.slice(0, 8).map((r, i) => (
                  <TableRow key={r.id} className="row-enter" style={{ "--row": i }}>
                    <TableCell className="text-ink">{r.title}</TableCell>
                    <TableCell className="mono text-ink-soft text-[12px]">
                      {formatDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      <RunStateBadge status={r.status} />
                    </TableCell>
                    <TableCell className="money text-ink text-right tabular-nums">
                      {formatNaira(r.totalAmountKobo)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={r.status === "REVIEW" ? `/review/${r.id}` : `/batch/${r.id}`}
                        className="label-caps text-ink hover:text-reach transition-colors"
                      >
                        Open →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* AI pre-flight brief */}
        <div className="mt-8 border-l-2 border-ink bg-surface-sunk p-6">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="auto_awesome" size={18} className="text-brass" fill />
            <span className="label-caps text-ink">Intelligent pre-flight</span>
          </div>
          <p className="text-body text-ink-soft leading-relaxed max-w-3xl">
            Once you provide data, the system checks it against active bank rails —
            flagging duplicate phone numbers, outlier amounts, and name mismatches —
            before any funds are committed. You approve once, and can prove it afterward.
          </p>
        </div>
      </div>

      <footer className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-[12px] text-ink-soft">
            © <span className="mono">2026</span> Owó Reach · Audit-ready financial operations
          </span>
          <span className="text-[12px] text-ink-soft italic">
            Sandbox only. Simulated SMS is labelled in the app.
          </span>
        </div>
      </footer>
    </AppShell>
  );
}
