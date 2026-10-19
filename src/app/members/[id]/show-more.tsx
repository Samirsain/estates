"use client";

// "Show N more" for a long list or table on the Member page. The toggle stays
// under the last row, and the extra rows live in the same table, so opening it
// never shifts a column or repeats the headings. Rows that start hidden carry
// `hidden group-data-[open]/more:table-row` (or `:block` for a list).

import React from "react";
import { ChevronDown } from "lucide-react";

export default function ShowMore({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="group/more" data-open={open ? "" : undefined}>
      {children}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
      >
        {open ? "Show less" : `Show ${count} more`}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
