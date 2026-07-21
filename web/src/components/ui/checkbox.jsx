import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils.js";

// shadcn/ui "Checkbox", re-themed to the Owó Reach palette. Replaces the
// plain <input type="checkbox"> used in both SignIn and SignUp so the
// checked state, focus ring, and box styling live in one place.
function Checkbox({ className, ...props }) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-hairline bg-white",
        "data-[state=checked]:bg-ink data-[state=checked]:border-ink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
        <Check size={12} strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
