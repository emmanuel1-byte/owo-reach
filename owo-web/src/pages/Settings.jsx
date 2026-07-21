import { useState } from "react";
import AppShell from "../components/AppShell.jsx";
import Icon from "../components/Icon.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.jsx";
import { useHealth } from "../lib/queries.js";
import { useToast } from "../lib/toast.jsx";

// The in-page sections the side nav jumps between.
const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "organisation", label: "Organisation" },
];

export default function Settings() {
  const toast = useToast();

  // Shares the shell's health query rather than issuing a second check.
  const health = useHealth();
  const checking = health.isPending;
  const apiOnline = !health.isError;

  // The app uses hash routing, so a plain <a href="#security"> would overwrite
  // the "#/settings" route and 404. Scroll to the section instead — no hash,
  // no navigation — and track which one is active for the nav highlight.
  const [activeSection, setActiveSection] = useState("profile");
  function goToSection(id) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // These settings have no backing endpoint in the current API — Owó Reach's
  // backend covers runs, beneficiaries, banks, webhooks, and the live event
  // stream, but not org/profile/key management. Rather than fake a save, we
  // say so plainly.
  function notWired(label) {
    toast.info(`${label} isn't backed by the API yet — this build only wires runs, beneficiaries, and webhooks.`);
  }

  return (
    <AppShell active="settings">
      <div className="border rounded-[12px] mx-auto px-6 md:mx-10 py-10 md:my-12">
        <header className="pb-6 mb-6 border-b border-hairline">
          <div className="label-caps text-ink-soft mb-2">Ops console</div>
          <h1 className="font-display text-display-sm text-ink">Settings</h1>
          <p className="text-body text-ink-soft mt-2">
            Manage your organisation preferences, security, and integrations.
          </p>
        </header>

        {/* This page is presentational — the backend has no profile/security/org
            endpoints yet, so nothing here saves. Say so up front. */}
        <div className="border-l-2 border-brass bg-surface-sunk p-4 mb-8 flex items-start gap-3">
          <Icon name="info" size={18} className="text-brass shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink-soft leading-relaxed">
            <span className="text-ink font-medium">Not integrated yet.</span> This Settings page is a
            preview — the fields below are read-only and nothing here saves, because the backend
            doesn't expose profile, security, or organisation endpoints in this build. The rest of the
            app (runs, payouts, ledger, and webhooks) is fully live.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-3 hidden lg:block">
            <nav className="sticky top-20 space-y-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToSection(s.id)}
                  className={`block w-full text-left py-2 pl-4 border-l-2 text-[14px] transition-colors ${
                    activeSection === s.id
                      ? "border-ink text-ink font-medium"
                      : "border-transparent text-ink-soft hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* <div className="w-[1px] border border-highline"></div> */}

          <div className="lg:col-span-9 space-y-12">
            {/* Profile */}
            <section id="profile" className="scroll-mt-20">
              <h2 className="font-display text-heading text-ink mb-4">Profile</h2>
              <div className="border border-hairline">
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="p-5 border-b sm:border-b-0 sm:border-r border-hairline">
                    <label className="field-label">Full name</label>
                    <input className="field" type="text" defaultValue="System Administrator" readOnly />
                  </div>
                  <div className="p-5 border-b border-hairline">
                    <label className="field-label">Email address</label>
                    <input className="field" type="email" defaultValue="admin@oworeach.com" readOnly />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-hairline">
                  <div className="p-5 border-b sm:border-b-0 sm:border-r border-hairline">
                    <label className="field-label">Role</label>
                    <span className="inline-flex items-center label-caps text-ink bg-surface-sunk border border-hairline px-2 py-1 rounded-sm">
                      Administrator
                    </span>
                  </div>
                  <div className="p-5 flex items-end justify-end bg-surface-sunk">
                    <button className="btn btn-secondary" onClick={() => notWired("Profile editing")}>Edit profile</button>
                  </div>
                </div>
              </div>
            </section>

            {/* Security */}
            <section id="security" className="scroll-mt-20">
              <h2 className="font-display text-heading text-ink mb-4">Security</h2>
              <div className="border border-hairline divide-y divide-hairline">
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-subheading font-display text-ink">Password</h3>
                  </div>
                  <button className="btn btn-primary self-start sm:self-auto" onClick={() => notWired("Password updates")}>
                    Update password
                  </button>
                </div>
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-subheading font-display text-ink">Sandbox MFA on transfers</h3>
                    <p className="text-[14px] max-w-[550px] text-ink-soft mt-1">
                      Monnify's sandbox requires OTP authorisation on bank transfers handled as a
                      maker-checker step on the Live batch screen.
                    </p>
                  </div>
                  <span className="state s-complete text-[12px]"><span className="dot dot--fill" />Enforced</span>
                </div>
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-subheading font-display text-ink">Audited code reveals</h3>
                    <p className="text-[14px] text-ink-soft mt-1">Every Paycode reveal is written to the event log. Always on.</p>
                  </div>
                  <span className="state s-issued text-[12px] self-start sm:self-auto"><span className="dot dot--ring" />Enforced</span>
                </div>
              </div>
            </section>

            {/* Organisation */}
            <section id="organisation" className="scroll-mt-20">
              <h2 className="font-display text-heading text-ink mb-4">Organisation</h2>
              <div className="border border-hairline">
                <div className="p-5 border-b border-hairline">
                  <label className="field-label">Business name</label>
                  <input className="field" type="text" defaultValue="Green Harvest Co-op" readOnly />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-hairline">
                  <div className="p-5 border-b sm:border-b-0 sm:border-r border-hairline">
                    <label className="field-label">Primary currency</label>
                    <Select defaultValue="NGN" disabled>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NGN">NGN — Nigerian Naira</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-5">
                    <label className="field-label">Fee schedule</label>
                    <div className="field !flex items-center !text-ink-soft cursor-default">
                      Flat ₦100.00 per Paycode
                    </div>
                  </div>
                </div>
                <div className="p-5 bg-surface-sunk flex justify-end">
                  <p className="text-[13px] text-ink-soft italic">
                    Organisation core details are set at the Monnify contract level, not per-run.
                  </p>
                </div>
              </div>
            </section>

            {/* API & webhooks
            <section id="api" className="scroll-mt-20 pb-10">
              <h2 className="font-display text-heading text-ink mb-4">API &amp; webhooks</h2>

              <div className="border border-hairline mb-6">
                <div className="p-5 border-b border-hairline flex items-center justify-between bg-surface-sunk">
                  <h3 className="text-subheading font-display text-ink">Backend connection</h3>
                  <span className={`state text-[12px] ${apiOnline === false ? "s-failed" : "s-complete"}`}>
                    <span className={`dot ${apiOnline === false ? "dot--fill" : "dot--fill"}`} />
                    {checking ? "Checking…" : apiOnline ? "Reachable" : "Unreachable"}
                  </span>
                </div>
                <div className="p-5">
                  <label className="field-label">Base URL</label>
                  <input className="field mono !text-[13px]" type="text" value="http://localhost:3000/api" readOnly />
                  <p className="text-[13px] text-ink-soft mt-2">
                    Proxied from this app's <span className="mono">/api</span> path in dev; served
                    from the same origin in production.
                  </p>
                </div>
              </div>

              <div className="border border-hairline">
                <div className="p-5 border-b border-hairline flex items-center justify-between bg-surface-sunk">
                  <h3 className="text-subheading font-display text-ink">Monnify webhook endpoint</h3>
                  <span className="state s-complete text-[12px]"><span className="dot dot--fill" />Active</span>
                </div>
                <div className="p-5 border-b border-hairline">
                  <label className="field-label">Endpoint path</label>
                  <input className="field mono !text-[13px]" type="text" defaultValue="/api/webhooks/monnify" readOnly />
                  <p className="text-[13px] text-ink-soft mt-2">
                    HMAC-SHA512 signature required on every request (see docs/PRD.md §9). Set the
                    public URL for this path in the Monnify dashboard — a Cloudflare Tunnel URL in
                    dev, your deployed URL in production.
                  </p>
                </div>
              </div>
            </section> */}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
