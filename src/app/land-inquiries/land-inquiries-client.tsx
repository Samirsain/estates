"use client";

// The Land Inquiries list — Land Inquiry spec §23.3, §24, §25.
//
// The filter bar writes query parameters and lets the server answer. It is not
// a client-side filter over a preloaded array, because this table is the one
// that grows without limit.

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RATE_BASIS_LABEL,
  RECEIVED_FROM_LABEL,
  STAGE_LABEL,
  STAGE_ORDER,
  type LandInquiryReceivedFrom,
  type LandInquiryStage,
  type LandInquiryStatus,
  type LandRateBasis,
} from "@/lib/domain/land-inquiry";
import { type StaffRole } from "@/lib/tasks";

const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export type LandInquiryRowView = {
  id: string;
  inquiryNo: string;
  date: string;
  receivedFrom: LandInquiryReceivedFrom;
  source: string;
  primaryOwner: string | null;
  additionalOwners: number;
  location: string | null;
  exactLocation: string | null;
  area: string | null;
  askingRate: string | null;
  askingRateBasis: LandRateBasis | null;
  status: LandInquiryStatus;
  stage: LandInquiryStage;
  assignedTo: string | null;
  archived: boolean;
};

export function stageVariant(stage: LandInquiryStage) {
  if (stage === "REJECTED_CLOSED") return "destructive" as const;
  if (stage === "APPROVED_FOR_ACQUISITION") return "success" as const;
  if (stage === "NEW") return "outline" as const;
  return "info" as const;
}

/** Indian grouping, so a rate reads the way it is spoken (spec §16). */
export const inr = (value: string) =>
  `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function LandInquiriesClient({
  role,
  actorName,
  staffAccountId,
  canManage,
  canSeeArchived,
  rows,
  page,
  totalPages,
  totalRows,
  staff,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  canManage: boolean;
  canSeeArchived: boolean;
  rows: LandInquiryRowView[];
  page: number;
  totalPages: number;
  totalRows: number;
  staff: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const value = (key: string) => params.get(key) ?? "";

  /** Every filter change is a navigation, so the URL is the state. */
  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, v] of Object.entries(next)) {
      if (v) query.set(key, v);
      else query.delete(key);
    }
    // Any change to a filter starts again at the first page: page 4 of a
    // different query is a page nobody asked for.
    if (!("page" in next)) query.delete("page");
    router.push(`/land-inquiries${query.size ? `?${query}` : ""}`);
  }

  const [search, setSearch] = React.useState(value("q"));
  React.useEffect(() => setSearch(value("q")), [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = params.size > 0;

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-7xl space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Land Inquiries</h1>
            <p className="text-xs text-muted-foreground">
              Land offered to the company, before any of it becomes an acquisition.
            </p>
          </div>
          {canManage && (
            <Link href="/land-inquiries/new">
              <Button size="sm" variant="gradient">
                <Plus className="mr-1 h-4 w-4" /> New Land Inquiry
              </Button>
            </Link>
          )}
        </header>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: search });
          }}
        >
          <Input
            className="h-9 w-72"
            placeholder="Search Inquiry No., owner, mobile, District, Tehsil or Khasra"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={filterClass}
            value={value("receivedFrom")}
            onChange={(e) => apply({ receivedFrom: e.target.value })}
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            {(Object.keys(RECEIVED_FROM_LABEL) as LandInquiryReceivedFrom[]).map((k) => (
              <option key={k} value={k}>
                {RECEIVED_FROM_LABEL[k]}
              </option>
            ))}
          </select>
          <select
            className={filterClass}
            value={value("status")}
            onChange={(e) => apply({ status: e.target.value })}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="WORKING">Working</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select
            className={filterClass}
            value={value("stage")}
            onChange={(e) => apply({ stage: e.target.value })}
            aria-label="Filter by stage"
          >
            <option value="">All stages</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            className={filterClass}
            value={value("assignedToId")}
            onChange={(e) => apply({ assignedToId: e.target.value })}
            aria-label="Filter by assignee"
          >
            <option value="">All assignees</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={filterClass}
            value={value("dateFrom")}
            onChange={(e) => apply({ dateFrom: e.target.value })}
            aria-label="From date"
          />
          <input
            type="date"
            className={filterClass}
            value={value("dateTo")}
            onChange={(e) => apply({ dateTo: e.target.value })}
            aria-label="To date"
          />
          {canSeeArchived && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-input"
                checked={value("archived") === "1"}
                onChange={(e) => apply({ archived: e.target.checked ? "1" : "" })}
              />
              Include archived
            </label>
          )}
          {filtered && (
            <Button type="button" size="sm" variant="ghost" onClick={() => router.push("/land-inquiries")}>
              Clear filters
            </Button>
          )}
        </form>

        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card">
          <table className="w-full min-w-[64rem] text-xs">
            <thead className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Inquiry No.</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Received From</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Land Area</th>
                <th className="px-3 py-2">Asking Rate</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Assigned To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                    No land inquiries found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-accent/40">
                    <td className="px-3 py-2 font-semibold">
                      <Link href={`/land-inquiries/${row.id}`} className="text-primary hover:underline">
                        {row.inquiryNo}
                      </Link>
                      {row.archived && (
                        <span className="ml-2 text-[10px] uppercase text-muted-foreground">archived</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-2">
                      <span>{RECEIVED_FROM_LABEL[row.receivedFrom]}</span>
                      <span className="block text-[11px] text-muted-foreground">{row.source}</span>
                    </td>
                    <td className="px-3 py-2">
                      {row.primaryOwner ?? "—"}
                      {row.additionalOwners > 0 && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          +{row.additionalOwners}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.location ?? "—"}
                      {row.exactLocation && (
                        <span className="block max-w-[16rem] truncate text-[11px] text-muted-foreground">
                          {row.exactLocation}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.area ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.askingRate ? (
                        <>
                          {inr(row.askingRate)}
                          {row.askingRateBasis && (
                            <span className="block text-[11px] text-muted-foreground">
                              {RATE_BASIS_LABEL[row.askingRateBasis]}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={row.status === "WORKING" ? "info" : "secondary"}>
                        {row.status === "WORKING" ? "Working" : "Closed"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={stageVariant(row.stage)}>{STAGE_LABEL[row.stage]}</Badge>
                    </td>
                    <td className="px-3 py-2">{row.assignedTo ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {totalRows} inquir{totalRows === 1 ? "y" : "ies"} · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => apply({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => apply({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
