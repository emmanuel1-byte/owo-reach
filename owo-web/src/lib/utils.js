import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui helper: merges conditional class names and resolves
// conflicting Tailwind utilities (e.g. two different `p-*` values).
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
