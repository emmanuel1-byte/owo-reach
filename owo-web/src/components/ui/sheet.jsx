import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils.js";

// shadcn/ui "Sheet" component, re-themed with Owó Reach's own tokens
// (hairline borders, ink/white palette) instead of the shadcn defaults.
// Used for the mobile nav drawer so focus-trapping, ESC-to-close, and
// backdrop click all come for free instead of being hand-rolled.
//
// Both pieces are wrapped in forwardRef because Radix's Dialog internals
// attach a ref to Overlay/Content directly (for focus + exit-animation
// tracking) — without forwardRef that ref lands on a plain function
// component and React warns, and Radix can't manage it correctly.

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef(function SheetOverlay({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Overlay
      ref={ref}
      className={cn("fixed inset-0 z-40 bg-ink/30", className)}
      {...props}
    />
  );
});

const SheetContent = React.forwardRef(function SheetContent(
  { side = "left", className, children, ...props },
  ref
) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 h-screen w-64 bg-white shadow-instrument flex flex-col outline-none",
          side === "left" && "inset-y-0 left-0",
          side === "right" && "inset-y-0 right-0",
          className
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});

export { Sheet, SheetTrigger, SheetClose, SheetContent };