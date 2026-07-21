import Icon from "./Icon.jsx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog.jsx";


export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  tone = "default",
  busy = false,
  icon = "error",
  confirmIcon = icon,
  cancelIcon = "check",
}) {
  function handleConfirm() {
    if (!busy) onConfirm?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="confirm-desc">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-surface-sunk">
          <DialogTitle className="label-caps text-ink-soft">{title}</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-ink-soft hover:text-ink"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-col gap-3">
            {/* <span
              className={tone === "danger" ? "shrink-0 mt-0.5 s-failed" : "shrink-0 mt-0.5 text-ink-soft"}
            >
              <Icon name={icon} size={18} />
            </span> */}
            <span className="text-center text-ink">Are you sure?</span>
            <DialogDescription id="confirm-desc" className="text-[14px] text-center text-ink leading-relaxed">
              {description}
            </DialogDescription>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              className="btn btn-secondary flex-1"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              <Icon name={cancelIcon} size={16} />
              {cancelLabel}
            </button>
            <button
              className={`flex-1 ${tone === "danger" ? "btn btn-danger" : "btn btn-primary"}`}
              onClick={handleConfirm}
              disabled={busy}
            >
              <Icon name={confirmIcon} size={16} />
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
