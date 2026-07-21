import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";

/**
 * The shared "this didn't work" panel — a missing run, a failed load, an
 * unknown URL. One component so every dead end reads the same way: say what
 * happened in plain language, then give a way out. Never a bare status code.
 *
 * `code` is optional and shown small; the title carries the meaning.
 */
export default function ErrorState({
  code,
  title = "Something went wrong",
  description,
  icon = "error",
  action = { to: "/home", label: "Back to start" },
  onRetry,
}) {
  return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-surface-sunk text-ink-soft mb-5">
        <Icon name={icon} size={22} />
      </div>

      {code && <div className="label-caps text-[11px] text-ink-soft mb-2">Error {code}</div>}

      <h1 className="text-[22px] font-semibold text-ink mb-3">{title}</h1>

      {description && (
        <p className="text-body text-ink-soft leading-relaxed mb-8 max-w-md mx-auto">
          {description}
        </p>
      )}

      <div className="flex items-center justify-center gap-3">
        {onRetry && (
          <button className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
        {action && (
          <Link to={action.to} className="btn btn-primary">
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
