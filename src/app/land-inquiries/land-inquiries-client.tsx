"use client";

// The Land Inquiries list — Land Inquiry spec §23.3, §24, §25.
//
// The filter bar writes query parameters and lets the server answer. It is not
// a client-side filter over a preloaded array, because this table is the one
// that grows without limit.

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { RemarkSelect } from "@/components/ui/remark-select";
import {
  RECEIVED_FROM_LABEL,
  type LandInquiryReceivedFrom,
  type LandInquiryStage,
  type LandInquiryStatus,
} from "@/lib/domain/land-inquiry";
import { type StaffRole } from "@/lib/tasks";
import { changeLandInquiryStageAction, changeLandInquiryStatusAction } from "./actions";

const filterClass =
  "h-9 w-auto appearance-none rounded-lg border border-input bg-card pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

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
  status: LandInquiryStatus;
  stage: LandInquiryStage;
  version: number;
  archived: boolean;
};

export default function LandInquiriesClient({
  role,
  actorName,
  staffAccountId,
  canManage,
  canReopen,
  canSeeArchived,
  rows,
  page,
  totalPages,
  totalRows,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  canManage: boolean;
  canReopen: boolean;
  canSeeArchived: boolean;
  rows: LandInquiryRowView[];
  page: number;
  totalPages: number;
  totalRows: number;
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
          <SelectArrow>
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
          </SelectArrow>
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
          {/* Fixed layout, as on the Dashboard: widths are set once here, so a
              long name or address cannot re-cut every column under it, and
              each row's first line sits level with the heading's text. */}
          <table className="w-full min-w-[68rem] table-fixed text-xs">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Inquiry No.</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Received From</th>
                <th className="px-3 py-2 font-semibold">Owner</th>
                <th className="px-3 py-2 font-semibold">Location</th>
                <th className="px-3 py-2 font-semibold">Land Area</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No land inquiries found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-accent/40">
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                      <Link href={`/land-inquiries/${row.id}`} className="text-primary hover:underline">
                        {row.inquiryNo}
                      </Link>
                      {row.archived && (
                        <span className="block text-[10px] font-normal uppercase text-muted-foreground">
                          archived
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{row.date}</td>
                    {/* Who it came from leads, and what they are sits under it.
                        A 3% Club inquiry has no person, so it prints once. */}
                    <td className="px-3 py-2.5">
                      <span className="block truncate" title={row.source}>
                        {row.source}
                      </span>
                      {row.source !== RECEIVED_FROM_LABEL[row.receivedFrom] && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {RECEIVED_FROM_LABEL[row.receivedFrom]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex min-w-0 items-baseline gap-1">
                        <span className="truncate" title={row.primaryOwner ?? undefined}>
                          {row.primaryOwner ?? "—"}
                        </span>
                        {row.additionalOwners > 0 && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            +{row.additionalOwners}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block truncate" title={row.location ?? undefined}>
                        {row.location ?? "—"}
                      </span>
                      {row.exactLocation && (
                        <span className="block truncate text-[11px] text-muted-foreground" title={row.exactLocation}>
                          {row.exactLocation}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.area ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusCell row={row} canManage={canManage} canReopen={canReopen} />
                    </td>
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

/**
 * The list reads an inquiry as Working, Approved or Closed. Approved is a
 * Working inquiry at Approved for Acquisition, so the drop-down moves the stage
 * for it and the status for Close and Reopen — the same commands, and the same
 * permission checks, as the inquiry screen.
 */
type ListStatus = "WORKING" | "APPROVED" | "CLOSED";

const LIST_STATUS: Record<ListStatus, { label: string; variant: "info" | "success" | "secondary"; select: string }> = {
  WORKING: { label: "Working", variant: "info", select: "border-input bg-card text-foreground" },
  APPROVED: { label: "Approved", variant: "success", select: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" },
  CLOSED: { label: "Closed", variant: "secondary", select: "border-input bg-secondary text-foreground" },
};

const newKey = () => globalThis.crypto.randomUUID();

/**
 * The browser's own select arrow sat against the right border. The select is
 * drawn without it and this chevron sits clear of the edge instead, in the
 * wrapper's text colour.
 */
function SelectArrow({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`relative flex w-fit ${className}`}>
      {children}
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
    </span>
  );
}

function StatusCell({
  row,
  canManage,
  canReopen,
}: {
  row: LandInquiryRowView;
  canManage: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = React.useState<"CLOSE" | "REOPEN" | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const current: ListStatus =
    row.status === "CLOSED" ? "CLOSED" : row.stage === "APPROVED_FOR_ACQUISITION" ? "APPROVED" : "WORKING";
  // ponytail: Approved goes back to Working only from the inquiry screen's
  // Change Stage, which asks for the reason a step back needs.
  const options: ListStatus[] =
    current === "CLOSED"
      ? canReopen ? ["CLOSED", "WORKING"] : []
      : current === "APPROVED" ? ["APPROVED", "CLOSED"] : ["WORKING", "APPROVED", "CLOSED"];

  if (row.archived || !canManage || options.length === 0) {
    // Pulled out by its padding and border, as the select below is, so the
    // word sits under the heading and on the row's first line.
    return (
      <Badge variant={LIST_STATUS[current].variant} className="-my-[3px] -ml-2 px-2">
        {LIST_STATUS[current].label}
      </Badge>
    );
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Action failed.");
    setAsking(null);
    setReason("");
    router.refresh();
  }

  function choose(next: ListStatus) {
    if (next === current) return;
    setError(null);
    if (next === "APPROVED") {
      void run(() =>
        changeLandInquiryStageAction(
          { id: row.id, version: row.version, stage: "APPROVED_FOR_ACQUISITION", reason: "" },
          newKey()
        )
      );
      return;
    }
    setAsking(next === "CLOSED" ? "CLOSE" : "REOPEN");
  }

  return (
    <>
      {/* The arrow takes the select's own ink: green on Approved. */}
      <SelectArrow className={`-my-2 -ml-2 ${current === "APPROVED" ? "text-emerald-700" : ""}`}>
        <select
          className={`h-8 w-28 appearance-none rounded-lg border pl-2 pr-7 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60 ${LIST_STATUS[current].select}`}
          value={current}
          disabled={busy}
          onChange={(e) => choose(e.target.value as ListStatus)}
          aria-label={`Status of ${row.inquiryNo}`}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {LIST_STATUS[o].label}
            </option>
          ))}
        </select>
      </SelectArrow>
      {error && !asking && <p className="mt-1 max-w-[12rem] text-[11px] text-destructive">{error}</p>}

      {asking && (
        <Modal
          title={asking === "CLOSE" ? `Close ${row.inquiryNo}` : `Reopen ${row.inquiryNo}`}
          onClose={() => {
            setAsking(null);
            setReason("");
            setError(null);
          }}
        >
          <div className="space-y-3">
            <Field label={asking === "CLOSE" ? "Close reason" : "Reopen reason"}>
              <RemarkSelect
                presets={asking === "CLOSE" ? "closeInquiry" : "reopenInquiry"}
                value={reason}
                onChange={setReason}
                required
              />
            </Field>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setAsking(null);
                  setReason("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy || !reason.trim()}
                onClick={() =>
                  void run(() =>
                    changeLandInquiryStatusAction(
                      asking === "CLOSE"
                        ? { id: row.id, version: row.version, status: "CLOSED", reason }
                        : // Closing parks the stage at Rejected / Closed, so a reopen starts again at New.
                          { id: row.id, version: row.version, status: "WORKING", reason, restoredStage: "NEW" },
                      newKey()
                    )
                  )
                }
              >
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
