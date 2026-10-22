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
  /** v2.1 §21 — Customer-closing Loyalty events qualified, of three for life. */
  closingLoyaltyUsed: number;
};

/** The fact, and under it what qualifies it. Every cell reads the same way. */
/**
 * A fact and what qualifies it — two lines, and never a third. A long Project
 * name used to wrap onto a second line and push its own qualifier onto a
 * third, so one long name made the whole row taller than the ones around it.
 * Both lines truncate and the full text is on hover.
 */
function Cell({
  value,
  under,
  title,
}: {
  value: React.ReactNode;
  under?: React.ReactNode;
  title?: string;
}) {
  return (
    <>
      <span className="block truncate text-foreground" title={title}>
        {value}
      </span>
      {under && (
        <span className="block truncate text-[11px] text-muted-foreground">{under}</span>
      )}
    </>
  );
}

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
      <div className="mx-auto max-w-6xl space-y-3">
        <header>
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
            className="h-9 w-72"
            placeholder="Search Customer ID, name, city, Project or Plot"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tooltip.Provider delayDuration={0}>
        <div className="overflow-x-auto">
          {/* A rule between rows, not a filled block behind each one: ten of
              them fit on a laptop screen without the page turning into stripes. */}
          <table className="w-full min-w-[58rem] border-collapse text-xs">
            {/* Widths follow what each column can actually hold: a masked
                mobile is always ten characters, a Customer ID nine and a
                Member ID eight, so they are given exactly that and no more.
                The two that vary without a ceiling — the name and the Project
                — take what is left. */}
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="w-[7rem] px-3 py-1.5">Customer ID</th>
                <th className="w-[9.5rem] px-3 py-1.5">Name</th>
                <th className="w-[7.5rem] px-3 py-1.5">Mobile</th>
                <th className="w-[7.5rem] px-3 py-1.5">City</th>
                <th className="w-[11rem] px-3 py-1.5">Project</th>
                <th className="w-[8rem] px-3 py-1.5">Plot</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6}className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No Customers yet. A Customer ID is created when the first Hold is placed, or
                    at the first Booking Request when no Hold came before it.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="h-14 border-b border-border/60 align-middle last:border-0 hover:bg-secondary/50 [&>td]:px-3 [&>td]:py-1.5"
                >
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      className="block font-bold text-primary hover:underline"
                      onClick={() => router.push(`/customers/${row.id}`)}
                    >
                      {row.customerId}
                    </button>
                  </td>
                  <td className="max-w-[9.5rem]">
                    <Link
                      href={`/customers/${row.id}`}
                      className="block truncate text-foreground hover:underline"
                      title={row.name}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{row.mobileMasked}</td>
                  <td className="truncate" title={row.city}>{row.city}</td>
                  <td className="max-w-[11rem]">
                    <Cell
                      value={row.project ?? "—"}
                      title={row.project ?? undefined}
                      under={
                        row.otherBookings.length > 0 ? (
                          // Portalled, so the table's scroll box cannot clip it.
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <span
                                tabIndex={0}
                                className="cursor-default underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
                              >
                                +{row.otherBookings.length} more booked
                              </span>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                side="bottom"
                                align="start"
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
                        ) : null
                      }
                    />
                  </td>
                  <td className="max-w-[8rem]">
                    <Cell
                      value={
                        row.plotNumber && row.plotId ? (
                          <Link
                            href={`/plots/${row.plotId}`}
                            className="text-primary hover:underline"
                          >
                            {row.plotNumber}
                          </Link>
                        ) : (
                          (row.plotNumber ?? "—")
                        )
                      }
                      title={row.plotNumber ?? undefined}
                      under={row.plotType ? typeWord(row.plotType) : null}
                    />
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
