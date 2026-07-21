import { cn } from "../../lib/utils.js";
import { Table, TableBody, TableCell, TableRow } from "./table.jsx";

/**
 * A placeholder in the shape of the thing that's loading. Preferred over a
 * spinner or a line of "Loading…" text: the layout lands in its final shape, so
 * nothing jumps when the data arrives.
 */
export function Skeleton({ className }) {
  return <div className={cn("skeleton animate-shimmer h-4", className)} />;
}

/**
 * Skeleton rows sized to a real table. `widths` are Tailwind width classes, one
 * per column, so the placeholder echoes the column rhythm rather than showing
 * uniform grey bars.
 */
export function TableSkeleton({ rows = 5, widths = [], minWidth }) {
  return (
    <Table minWidth={minWidth}>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          // Rows fade down the list so the placeholder itself reads as filling
          // in, rather than appearing as one grey block.
          <TableRow
            key={r}
            className="hover:bg-transparent row-enter"
            style={{ "--row": r }}
          >
            {widths.map((w, c) => (
              <TableCell key={c}>
                <Skeleton className={cn(w)} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
