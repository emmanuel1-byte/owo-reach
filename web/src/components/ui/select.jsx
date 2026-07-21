import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils.js";

// shadcn/ui "Select", re-themed onto Owó Reach's own field styling
// (.field look: hairline border, 3px radius, Inter 15px) instead of
// hand-rolling a native <select> + absolutely-positioned chevron per page.

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({ className, children, disabled, ...props }) {
  return (
    <SelectPrimitive.Trigger
      disabled={disabled}
      className={cn(
        "field flex w-full items-center justify-between gap-2 cursor-pointer",
        "disabled:cursor-default disabled:bg-surface-sunk disabled:text-ink-soft",
        "data-[placeholder]:text-ink-soft",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={18} className="text-ink-soft shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          "z-50 overflow-hidden bg-white border border-hairline rounded shadow-instrument",
          "min-w-[var(--radix-select-trigger-width)]",
          className
        )}
        position="popper"
        sideOffset={4}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex items-center gap-2 rounded-sm py-2 pl-3 pr-8 text-[14px] text-ink cursor-pointer select-none",
        "data-[highlighted]:bg-surface-sunk data-[highlighted]:outline-none",
        "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
        <Check size={14} className="text-ink" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
