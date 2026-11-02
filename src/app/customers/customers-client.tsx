"use client";

// Customers — design.md §12.1, §12.2.
// The list is who someone is and what they bought. Aadhaar, PAN and bank sit
// on the Customer's own page, where access to them is a deliberate step and is
// logged (DESIGN §2.6, ARCHITECTURE §9.3) — not a column read past every day.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { LIST_TD, LIST_TH } from "@/components/ui/list-table";
import { type StaffRole } from "@/lib/tasks";

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/** Sort choices, keyed by the row field each one reads. */
const SORTS = {
  customerId: "Customer ID",
  name: "Name",
  city: "City",
  project: "Project",
  closingLoyaltyUsed: "Closing Loyalty Points",
} as const;

export type CustomerRowView = {
  id: string;
  personId: string;
  customerId: string;
  name: string;
  mobileMasked: string;
  city: string;
  project: string | null;
  plotNumber: string | null;
  plotType: string | null;
  plotId: string | null;
  /** The other deals, "Project · Plot N", besides the one the row shows. */
  otherBookings: string[];
  /** v2.1 §21 — Customer-closing Loyalty events qualified (no cap since 27 Oct 2026). */
  closingLoyaltyUsed: number;
};

/** RESIDENTIAL → Residential. A type is a word, not a shout. */
function typeWord(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function CustomersClient({
  role,
  actorName,
  staffAccountId,
  rows,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: CustomerRowView[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<keyof typeof SORTS>("customerId");

  const visible = rows
    .filter(
      (r) =>
        search.trim() === "" ||
        `${r.customerId} ${r.name} ${r.city} ${r.project ?? ""} ${r.plotNumber ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
    )
    // filter() already returned a fresh array, so sorting it in place is safe.
    .sort((a, b) => {
      // Loyalty is the one number here, and the used-up end is the interesting
      // one — it reads high to low. Every other column reads A to Z.
      if (sortBy === "closingLoyaltyUsed") return b[sortBy] - a[sortBy];
      const x = a[sortBy] ?? "";
      const y = b[sortBy] ?? "";
      // A Customer with nothing in that column sorts last, not first.
      if (!x || !y) return x ? -1 : y ? 1 : 0;
      return x.localeCompare(y);
    });

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      {/* Owner 2 Nov — the same page as Members: one rhythm, one header
          height (min-h-9 holds the line a header button would), one grid. */}
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex min-h-9 flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={filterClass}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as keyof typeof SORTS)}
            aria-label="Sort by"
          >
            {/* optgroup says "Sort by" once, in the place the browser already
                reserves for it, instead of at the head of every option. */}
            <optgroup label="Sort by">
              {Object.entries(SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </optgroup>
          </select>
          <Input
            className="h-9 w-80"
            placeholder="Search Customer ID, name, city, Project or Plot"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tooltip.Provider delayDuration={0}>
        <div className="overflow-x-auto">
          {/* A rule between rows, not a filled block behind each one: ten of
              them fit on a laptop screen without the page turning into stripes. */}
          {/* Owner 2 Nov — edge to edge, equal spacing, every column centred.
              A grid, not table layout: each column takes its content's width
              and the spare width is shared equally between all six, so the
              gaps match and the row rule still runs unbroken. The roles keep
              it a table for screen readers. Same grid as Members. */}
          <table role="table" className="grid w-full min-w-[62rem] grid-cols-[repeat(6,auto)] text-xs">
            <thead role="rowgroup" className="contents text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr role="row" className="contents">
                <th role="columnheader" className={LIST_TH}>Customer ID</th>
                <th role="columnheader" className={LIST_TH}>Name</th>
                <th role="columnheader" className={LIST_TH}>Mobile</th>
                <th role="columnheader" className={LIST_TH}>City</th>
                <th role="columnheader" className={LIST_TH}>Plot · Type / Project</th>
                <th role="columnheader" className={LIST_TH}>More Bookings</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="contents">
              {visible.length === 0 && (
                <tr role="row" className="contents">
                  <td role="cell" className="col-span-full px-3 py-10 text-center text-sm text-muted-foreground">
                    No Customers yet. A Customer ID is created when the first Hold is placed, or
                    at the first Booking Request when no Hold came before it.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <tr key={row.id} role="row" className="group contents">
                  <td role="cell" className={LIST_TD}>
                    <button
                      type="button"
                      className="block font-bold text-primary hover:underline"
                      onClick={() => router.push(`/customers/${row.id}`)}
                    >
                      {row.customerId}
                    </button>
                  </td>
                  <td role="cell" className={LIST_TD}>
                    <Link href={`/customers/${row.id}`} className="text-foreground hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td role="cell" className={`${LIST_TD} tabular-nums`}>{row.mobileMasked}</td>
                  <td role="cell" className={LIST_TD}>{row.city}</td>
                  {/* Owner 2 Nov — Plot No. · Type, the Project under it. */}
                  <td role="cell" className={LIST_TD}>
                    <span
                      className="block truncate text-foreground"
                      title={row.plotNumber ? `${row.plotNumber}${row.plotType ? ` · ${typeWord(row.plotType)}` : ""}` : undefined}
                    >
                      {row.plotNumber && row.plotId ? (
                        <Link href={`/plots/${row.plotId}`} className="font-semibold text-primary hover:underline">
                          {row.plotNumber}
                        </Link>
                      ) : (
                        (row.plotNumber ?? "—")
                      )}
                      {row.plotType && <span className="text-muted-foreground"> · {typeWord(row.plotType)}</span>}
                    </span>
                    {row.project && (
                      <span className="block truncate text-[11px] font-medium text-foreground" title={row.project}>
                        {row.project}
                      </span>
                    )}
                  </td>
                  {/* Owner 2 Nov — the other deals have their own column: a
                      "+2" pill, and the list on hover or keyboard focus. */}
                  <td role="cell" className={LIST_TD}>
                    {row.otherBookings.length > 0 ? (
                          // Portalled, so the table's scroll box cannot clip it.
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                aria-label={`${row.otherBookings.length} more booked: ${row.otherBookings.join(", ")}`}
                                className="inline-flex h-6 min-w-[2.25rem] cursor-default items-center justify-center rounded-full border border-border bg-secondary px-2 text-xs font-semibold tabular-nums text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              >
                                +{row.otherBookings.length}
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                side="bottom"
                                align="center"
                                sideOffset={6}
                                className="z-50 rounded-xl border border-border/80 bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-lg backdrop-blur-md"
                              >
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Also booked
                                </p>
                                <ul className="space-y-0.5">
                                  {row.otherBookings.map((deal) => (
                                    <li key={deal} className="whitespace-nowrap">{deal}</li>
                                  ))}
                                </ul>
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Tooltip.Provider>
      </div>
    </AppShell>
  );
}
