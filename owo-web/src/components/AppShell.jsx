import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Icon from "./Icon.jsx";
import LedgerBar from "./LedgerBar.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { Sheet, SheetContent } from "./ui/sheet.jsx";
import { api, ApiError } from "../lib/api.js";
import { useHealth, qk } from "../lib/queries.js";
import { useToast } from "../lib/toast.jsx";

// Used only for the top-bar breadcrumb label — the actual sidebar entries
// (including their destinations) are built inside SidebarContent below.
const NAV_LABELS = {
  home: "Start payout",
  review: "Payout review",
  batch: "Live batch",
  transactions: "Transactions",
  ledger: "Ledger",
  settings: "Settings",
};

function SidebarContent({ active, onNavigate, onSignOut }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [routing, setRouting] = useState(null); // "review" | "batch" | null — which lookup is in flight

  // fetchQuery rather than a bare api call: a list already in cache answers
  // instantly, and a fresh one is shared with whatever page we land on.
  const fetchRuns = () => queryClient.fetchQuery({ queryKey: qk.runs, queryFn: api.listRuns });

  async function goToReview() {
    setRouting("review");
    try {
      const runs = await fetchRuns();
      const target = runs.find((r) => r.status === "REVIEW");
      onNavigate();
      if (target) {
        navigate(`/review/${target.id}`);
      } else {
        toast.info("No run is waiting on review right now.");
        navigate("/transactions");
      }
    } catch (err) {
      onNavigate();
      toast.error(err instanceof ApiError ? err.message : "Could not check for runs in review.");
      navigate("/transactions");
    } finally {
      setRouting(null);
    }
  }

  async function goToBatch() {
    setRouting("batch");
    try {
      const runs = await fetchRuns();
      const target =
        runs.find((r) => r.status === "EXECUTING") ??
        runs.find((r) => r.status === "PARTIAL") ??
        runs.find((r) => r.status === "COMPLETED" || r.status === "FAILED");
      onNavigate();
      // Always land on the Live batch page itself — /batch renders its own
      // "No batch is running right now" empty state when target is undefined.
      // No fallback to Transactions.
      navigate(target ? `/batch/${target.id}` : "/batch");
    } catch (err) {
      onNavigate();
      toast.error(err instanceof ApiError ? err.message : "Could not check for active batches.");
      navigate("/batch");
    } finally {
      setRouting(null);
    }
  }

  const items = [
    { key: "home", label: "Start payout", icon: "bolt", kind: "link", to: "/home" },
    { key: "review", label: "Payout review", icon: "fact_check", kind: "action", onClick: goToReview },
    { key: "batch", label: "Live batch", icon: "sync", kind: "action", onClick: goToBatch },
    { key: "transactions", label: "Transactions", icon: "receipt_long", kind: "link", to: "/transactions" },
    { key: "ledger", label: "Ledger", icon: "wallet", kind: "link", to: "/ledger" },
    { key: "settings", label: "Settings", icon: "settings", kind: "link", to: "/settings" },
  ];

  return (
    <>
      <div className="px-6 py-7 border-b border-hairline">
        <div className="wordmark text-[15px] text-ink">OWÓ&nbsp;REACH</div>
        <div className="text-[12px] text-ink-soft mt-1">Distributions · Ops console</div>
      </div>
      <nav className="flex-1 py-4">
        {items.map((n) =>
          n.kind === "link" ? (
            <Link
              key={n.key}
              to={n.to}
              onClick={onNavigate}
              className={`nav-link ${n.key === active ? "is-active" : ""}`}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </Link>
          ) : (
            <button
              key={n.key}
              type="button"
              onClick={n.onClick}
              disabled={routing === n.key}
              className={`nav-link w-full text-left ${n.key === active ? "is-active" : ""} ${
                routing === n.key ? "opacity-60 cursor-wait" : ""
              }`}
            >
              <Icon name={routing === n.key ? "loader" : n.icon} className={routing === n.key ? "animate-spin" : ""} />
              <span>{n.label}</span>
            </button>
          )
        )}
      </nav>
      <div className="px-6 py-5 border-t border-hairline">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-ink text-white flex items-center justify-center label-caps text-[11px]">
            AD
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink truncate">Admin Ops</div>
            <div className="text-[11px] text-ink-soft truncate">admin@oworeach.com</div>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="mt-4 flex items-center gap-3 text-[13px] text-ink-soft hover:text-ink transition-colors"
        >
          <Icon name="logout" size={20} />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

/**
 * Shared authenticated app shell: sidebar + top bar, identical on every page.
 * `active` selects the highlighted nav item and the top-bar breadcrumb.
 */
export default function AppShell({ active, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  // Real health check against GET /api/health, not a decorative dot. Polling
  // interval lives in the query definition.
  const health = useHealth();
  const apiOnline = health.isPending ? null : !health.isError;

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  // The click only asks; the dialog's confirm is what actually leaves. Closing
  // the mobile drawer first so the dialog isn't stacked behind it.
  const requestSignOut = () => {
    setMobileOpen(false);
    setConfirmingSignOut(true);
  };

  const signOut = () => {
    setConfirmingSignOut(false);
    navigate("/");
  };

  return (
    <div className="flex min-h-screen bg-white text-ink">
      {/* Permanent rail, desktop only */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-hairline bg-white h-screen sticky top-0">
        <SidebarContent active={active} onNavigate={() => {}} onSignOut={requestSignOut} />
      </aside>

      {/* Mobile drawer — Radix Dialog under the hood, so focus-trap, ESC-to-close,
          and backdrop click are handled for us instead of hand-rolled. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="md:hidden flex flex-col p-0">
          <SidebarContent active={active} onNavigate={() => setMobileOpen(false)} onSignOut={requestSignOut} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between h-14 px-5 md:px-8 border-b border-hairline bg-white sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden text-ink"
              aria-label="Menu"
              onClick={() => setMobileOpen((v) => !v)}
            >
              <Icon name="menu" size={22} />
            </button>
            <span className="wordmark text-[13px] text-ink md:hidden">OWÓ&nbsp;REACH</span>
            <span className="label-caps text-ink-soft hidden md:inline">
              {NAV_LABELS[active] ?? ""}
            </span>
            <span className="hidden md:inline w-px h-4 bg-hairline" />
            <span className="hidden md:inline label-caps text-[11px] text-ink-soft">
              Sandbox environment
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <span
              className={`hidden sm:inline-flex items-center gap-2 label-caps text-[11px] ${
                apiOnline === false ? "text-state-failed" : "text-reach"
              }`}
              title={apiOnline === false ? "Could not reach the API on :3000" : "API reachable"}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${apiOnline === false ? "bg-state-failed" : "bg-reach"}`} />
              {apiOnline === false ? "Rails offline" : "Rails online"}
            </span>
            <Link to="/home" className="btn btn-primary !py-2 !px-4">
              New run
            </Link>
          </div>
        </header>

        <LedgerBar />

        <main className="flex-1 overflow-y-auto hide-scrollbar">{children}</main>
      </div>

      <ConfirmDialog
        open={confirmingSignOut}
        onOpenChange={setConfirmingSignOut}
        icon="logout"
        title="Sign out"
        description="You'll be returned to the sign-in screen. Nothing in progress is lost, Runs and the ledger are stored on the server."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={signOut}
      />
    </div>
  );
}