import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils.js";

// Centred modal counterpart to sheet.jsx — same Radix Dialog underneath (so
// focus trap, ESC, and backdrop dismissal are free), re-themed with Owó
// Reach's hairline-and-ink tokens rather than the shadcn defaults.

const Dialog = DialogPrimitive.Root;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

const DialogContent = React.forwardRef(function DialogContent({ className, children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/30 animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "pointer-events-auto w-[min(440px,100%)] max-h-full overflow-y-auto hide-scrollbar",
            "bg-white border border-hairline shadow-instrument outline-none animate-settle",
            className
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
});

export { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription };
