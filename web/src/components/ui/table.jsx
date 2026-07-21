import * as React from "react";
import { cn } from "../../lib/utils.js";

// shadcn/ui "Table", re-themed with Owó Reach's own tokens — the hairline
// rules, Outfit caps headers, and sunk hover row that the hand-rolled `.ledger`
// class used to carry. Same look, but the wrapper's horizontal scroll and the
// row/cell semantics now come with the component instead of being re-typed on
// every page.
//
// forwardRef throughout so callers can measure or scroll a specific row.

const Table = React.forwardRef(function Table({ className, minWidth, ...props }, ref) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        ref={ref}
        style={minWidth ? { minWidth } : undefined}
        className={cn("w-full border-collapse", className)}
        {...props}
      />
    </div>
  );
});

const TableHeader = React.forwardRef(function TableHeader({ className, ...props }, ref) {
  return <thead ref={ref} className={cn(className)} {...props} />;
});

const TableBody = React.forwardRef(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={cn(className)} {...props} />;
});

const TableRow = React.forwardRef(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={cn("hover:bg-surface-sunk transition-colors", className)}
      {...props}
    />
  );
});

const TableHead = React.forwardRef(function TableHead({ className, ...props }, ref) {
  return (
    <th
      ref={ref}
      className={cn(
        "font-display text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-soft",
        "text-left px-4 py-[0.7rem] border-b border-hairline",
        className
      )}
      {...props}
    />
  );
});

const TableCell = React.forwardRef(function TableCell({ className, ...props }, ref) {
  return (
    <td
      ref={ref}
      className={cn("px-4 py-[0.7rem] border-b border-hairline text-[14px]", className)}
      {...props}
    />
  );
});

// The double-rule summary row that closes a run's figures. Not a shadcn part —
// it's this product's own ledger convention, kept as a component so the markup
// doesn't have to remember the class name.
const TableTotalRow = React.forwardRef(function TableTotalRow({ className, ...props }, ref) {
  return <div ref={ref} className={cn("ledger-total", className)} {...props} />;
});

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableTotalRow };
