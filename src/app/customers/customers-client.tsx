"use client";

// Customers — DESIGN.md §12.1, §12.2.
// The list is who someone is and what they bought. Aadhaar, PAN and bank sit
// on the Customer's own page, where access to them is a deliberate step and is
// logged (DESIGN §2.6, ARCHITECTURE §9.3) — not a column read past every day.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  customerType: "Type",
  project: "Project",
  loyaltySlotsConsumed: "Loyalty",
} as const;

export type CustomerRowView = {
  id: string;
  personId: string;
  customerId: string;
  name: string;
  mobileMasked: string;
  city: string;
  customerType: string | null;
  project: string | null;
  plotNumber: string | null;
  plotType: string | null;
  plotId: string | null;
  otherBookings: number;
  royaltyMember: string | null;
  royaltyMemberName: string | null;
  royaltyMemberProfileId: string | null;
  royaltyLinkProvisional: boolean;
  loyaltySlotsConsumed: number;
};

/** The fact, and under it what qualifies it. Every cell reads the same way. */
function Cell({ value, under }: { value: React.ReactNode; under?: React.ReactNode }) {
  return (
    <>
      <span className="block text-foreground">{value}</span>
      {under && <span className="block text-[11px] text-muted-foreground">{under}</span>}
    </>
  );
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
  const [typeFilter, setTypeFilter] = React.useState("ALL");
  const [sortBy, setSortBy] = React.useState<keyof typeof SORTS>("customerId");

  const visible = rows
    .filter(
      (r) =>
        (typeFilter === "ALL" || (r.customerType ?? "") === typeFilter) &&
        (search.trim() === "" ||
          `${r.customerId} ${r.name} ${r.city} ${r.project ?? ""} ${r.plotNumber ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()))
    )
    // filter() already returned a fresh array, so sorting it in place is safe.
    .sort((a, b) => {
      // Loyalty is the one number here, and the used-up end is the interesting
      // one — it reads high to low. Every other column reads A to Z.
      if (sortBy === "loyaltySlotsConsumed") return b[sortBy] - a[sortBy];
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
          <p className="mt-1 text-xs text-muted-foreground">
            {visible.length} of {rows.length} · a Customer ID is created at the first Hold or
            Booking Request and is retained even if that request is rejected
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={filterClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by Customer Type"
          >
            <option value="ALL">All Customer Types</option>
            <option value="END_USER">End User</option>
            <option value="INVESTOR">Investor</option>
          </select>
          <select
            className={filterClass}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as keyof typeof SORTS)}
            aria-label="Sort by"
          >
            {/* optgroup says "Sort by" once, in the place the browser already
                reserves for it, instead of at the head of all six options. */}
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
                <th className="px-3 py-1.5">Name</th>
                <th className="w-[7.5rem] px-3 py-1.5">Mobile</th>
                <th className="w-[9rem] px-3 py-1.5">City</th>
                <th className="w-[7rem] px-3 py-1.5">Type</th>
                <th className="px-3 py-1.5">Project</th>
                <th className="w-[7rem] px-3 py-1.5">Plot</th>
                <th className="w-[8.5rem] px-3 py-1.5">Royalty linked to</th>
                <th className="w-[5rem] px-3 py-1.5 text-right">Loyalty</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
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
                  <td>
                    <Link href={`/customers/${row.id}`} className="block text-foreground hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{row.mobileMasked}</td>
                  <td>{row.city}</td>
                  <td>{row.customerType ? row.customerType.replaceAll("_", " ") : "—"}</td>
                  <td>
                    <Cell
                      value={row.project ?? "—"}
                      under={row.otherBookings > 0 ? `+${row.otherBookings} more booked` : null}
                    />
                  </td>
                  <td>
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
                      under={row.plotType}
                    />
                  </td>
                  <td className="whitespace-nowrap">
                    {/* The Member ID leads and opens the Member; the name under
                        it confirms who that is without competing for the eye —
                        the same shape the Members list uses for Invited by. */}
                    {row.royaltyMember && row.royaltyMemberProfileId ? (
                      <Link href={`/members/${row.royaltyMemberProfileId}`} className="group">
                        <span className="block text-primary group-hover:underline">
                          {row.royaltyMember}
                        </span>
                        {row.royaltyMemberName && (
                          <span className="block text-[11px] text-muted-foreground">
                            {row.royaltyLinkProvisional
                              ? `${row.royaltyMemberName} · provisional`
                              : row.royaltyMemberName}
                          </span>
                        )}
                      </Link>
                    ) : (
                      (row.royaltyMember ?? "—")
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {row.loyaltySlotsConsumed}/3
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
