import { useState } from "react";
import Icon from "./Icon.jsx";

/**
 * The inline editor for one beneficiary on the review screen — used both to
 * correct an existing row and to add a new one. It only collects and validates
 * input; the actual re-verification (Name Enquiry, flag recompute) happens on
 * the server when `onSave` fires. Amounts are edited in naira and handed back
 * in kobo, the unit everything else in the app speaks.
 */
export default function BeneficiaryForm({ initial, banks = [], onSave, onCancel, busy = false }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [amount, setAmount] = useState(
    initial?.amountKobo != null ? String(initial.amountKobo / 100) : "",
  );
  const [rail, setRail] = useState(initial?.rail ?? "BANK");
  const [bankCode, setBankCode] = useState(initial?.bankCode ?? "");
  const [account, setAccount] = useState(initial?.accountNumber ?? "");

  const amountKobo = Math.round((parseFloat(amount) || 0) * 100);
  const bankReady = rail === "PAYCODE" || (account.trim() !== "" && bankCode !== "");
  const valid = name.trim() !== "" && phone.trim() !== "" && amountKobo > 0 && bankReady;

  function submit() {
    if (!valid || busy) return;
    const payload = { name: name.trim(), phone: phone.trim(), amountKobo };
    if (rail === "BANK") {
      payload.accountNumber = account.trim();
      payload.bankCode = bankCode;
    }
    onSave(payload);
  }

  return (
    <div className="bg-surface-sunk border border-hairline rounded-[4px] p-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="field-label">Beneficiary name</label>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Amina Okafor"
            disabled={busy}
            autoFocus
          />
        </div>

        <div>
          <label className="field-label">Phone</label>
          <input
            className="field"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0803… or +234…"
            inputMode="tel"
            disabled={busy}
          />
        </div>

        <div>
          <label className="field-label">Amount (₦)</label>
          <input
            className="field tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
            disabled={busy}
          />
        </div>
      </div>

      {/* Rail picker — a paycode needs no bank details, a transfer needs both. */}
      <div className="mt-4">
        <span className="field-label">How they're paid</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRail("BANK")}
            disabled={busy}
            className={`btn ${rail === "BANK" ? "btn-primary" : "btn-secondary"} flex-1`}
          >
            Bank transfer
          </button>
          <button
            type="button"
            onClick={() => setRail("PAYCODE")}
            disabled={busy}
            className={`btn ${rail === "PAYCODE" ? "btn-primary" : "btn-secondary"} flex-1`}
          >
            <Icon name="qr_code_2" size={14} />
            Paycode
          </button>
        </div>
      </div>

      {rail === "BANK" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="field-label">Bank</label>
            <select
              className="field"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              disabled={busy}
            >
              <option value="">Select a bank…</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Account number</label>
            <input
              className="field tabular-nums"
              value={account}
              onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="10-digit account"
              inputMode="numeric"
              disabled={busy}
            />
          </div>
        </div>
      )}

      <p className="text-[12px] text-ink-soft mt-4">
        Saving re-checks the account against the bank and re-flags the row if
        anything's off.
      </p>

      <div className="flex items-center gap-3 mt-4">
        <button className="btn btn-secondary flex-1" onClick={onCancel} disabled={busy}>
          <Icon name="close" size={16} />
          Cancel
        </button>
        <button className="btn btn-primary flex-1" onClick={submit} disabled={!valid || busy}>
          <Icon name={busy ? "loader" : "check"} size={16} className={busy ? "animate-spin" : ""} />
          {busy ? "Verifying…" : "Save & verify"}
        </button>
      </div>
    </div>
  );
}
