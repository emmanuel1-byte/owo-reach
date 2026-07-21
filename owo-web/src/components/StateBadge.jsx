import { statusMeta, runStatusMeta, ledgerTypeMeta } from "../lib/statusMeta.js";

export function BeneficiaryStateBadge({ status, className = "" }) {
  const meta = statusMeta(status);
  return (
    <span className={`state justify-center ${meta.cls} ${className}`}>
      <span className={`dot ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function RunStateBadge({ status, className = "" }) {
  const meta = runStatusMeta(status);
  return (
    <span className={`state justify-center ${meta.cls} ${className}`}>
      <span className={`dot ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function LedgerTypeBadge({ type, className = "" }) {
  const meta = ledgerTypeMeta(type);
  return (
    <span className={`state ${meta.cls} ${className}`}>
      <span className={`dot ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
