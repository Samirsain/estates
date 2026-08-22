"use client";

// Plot Inventory table and state actions — DESIGN.md §7.
// Actions are hidden by permission for clarity; the server re-checks every one.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { formatIst, formatPercent, formatQuantity, istDay, type StaffRole } from "@/lib/tasks";
// The grid computes Area and Location Charge live from the same domain rules
// the server runs on save, which is the only way the two cannot disagree. It
// costs decimal.js in the client bundle (~30 kB). Recomputing in float here
// would be smaller and wrong, so the size is the right trade.
import {
  buildPlcSnapshot,
  calculateAreas,
  plcComponentLabels,
  type Boundary,
  type PlcComponentRule,
} from "@/lib/domain/inventory";
import {
  cancelHoldAction,
  createHoldAction,
  decideHoldExtensionAction,
  decideHoldRequestAction,
  makeAvailableAction,
  prepareInventoryAction,
  updatePlotDetailsAction,
  requestExtensionAction,
  setRestrictionAction,
  type ActionResult,
} from "./actions";

export type PlotRowView = {
  id: string;
  project: string;
  projectId: string;
  plotType: string;
  plotNumber: string;
  areaSqYd: string;
  areaSqFt: string;
  areaSqM: string;
  lifecycle: string;
  restriction: string;
  restrictionReason: string | null;
  isResale: boolean;
  widthFt: string;
  lengthFt: string;
  exactAreaSqFt: string;
  exactAreaReason: string;
  boundaries: BoundaryRow[];
  /** PLC spec §15.2 — effective total and the deduplicated breakdown behind it. */
  plc: {
    version: number;
    totalPercent: string;
    /** `evidence` names the sides that qualified (PLC spec §7.1). Older frozen
     *  snapshots predate it, so it is optional rather than assumed. */
    components: Array<{ label: string; percent: string; evidence?: string }>;
  } | null;
  plcIssue: string | null;
  facing: string;
  hold: {
    id: string;
    heldForName: string;
    expiresAt: string;
    extensionCount: number;
    pendingExtension: boolean;
    pendingExtensionId: string | null;
    pendingExtensionReason: string | null;
    /** Frozen behind a Booking Request — the timer is not running (PRD §10.5). */
    frozen: boolean;
  } | null;
};

export type HoldRequestView = {
  id: string;
  project: string;
  plot: string;
  plotLifecycle: string;
  buyer: string;
  member: string;
  createdAt: string;
  expiresAt: string;
  queuePosition: number;
};

export type BoundaryRow = {
  side: string;
  kind: string;
  roadWidthFt: string;
  reference: string;
};

type ProjectView = {
  id: string;
  name: string;
  lifecycle: string;
  /** The configured bands, so the grid derives the same PLC the server will. */
  plcComponents: Array<{ category: string; threshold: string | null; percent: string }>;
};

const LIFECYCLE_LABEL: Record<string, string> = {
  NOT_AVAILABLE: "Not Available",
  AVAILABLE: "Available",
  HOLD: "Hold",
  WAITING_FOR_BOOKING_APPROVAL: "Waiting for Booking Approval",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  REFUND_PENDING: "Refund Pending",
  DELIVERED: "Delivered",
};

const RESTRICTION_LABEL: Record<string, string> = {
  NONE: "—",
  NOT_YET_RELEASED: "Not Yet Released",
  NOT_FOR_SALE: "Not for Sale",
  PLEDGE: "Pledge",
};

const inputClass =
  "h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";


/** PRD §16.2 Plot Types, written the way a person reads them. */
const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

const SIDES = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
const BOUNDARY_KINDS = [
  "ROAD",
  "PLOT",
  "COMMERCIAL",
  "INFORMAL_SECTOR",
  "PARK",
  "PLAYGROUND",
  "FACILITIES",
  "PUBLIC_UTILITY",
  "OTHER",
] as const;

const BOUNDARY_KIND_LABEL: Record<string, string> = {
  ROAD: "Road",
  PLOT: "Plot",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
  PARK: "Park",
  PLAYGROUND: "Playground",
  FACILITIES: "Facilities",
  PUBLIC_UTILITY: "Public Utility",
  OTHER: "Other",
};

function emptyBoundaries(): BoundaryRow[] {
  return SIDES.map((side) => ({ side, kind: "PLOT", roadWidthFt: "", reference: "" }));
}

/**
 * The live read-out beside Width and Length. It calls the same two domain rules
 * the server calls on save, so what the grid shows and what is stored cannot
 * drift apart — and a bad row says why instead of silently showing nothing.
 */
type Preview = {
  areaSqFt: string;
  areaSqYd: string;
  areaSqM: string;
  plc: string;
  issue: string | null;
};

function derivePreview(
  row: { widthFt: string; lengthFt: string; exactAreaSqFt: string; exactAreaReason: string },
  boundaries: readonly BoundaryRow[],
  components: readonly { category: string; threshold: string | null; percent: string }[]
): Preview {
  const blank: Preview = { areaSqFt: "—", areaSqYd: "—", areaSqM: "—", plc: "—", issue: null };

  // Two decimals is the display precision (PRD §23.1); the Decimal rounds, so
  // no area is rounded by a binary float on its way to the screen.
  const show = (d: { toDecimalPlaces(n: number): { toString(): string } }) =>
    formatQuantity(d.toDecimalPlaces(2).toString());

  let areas: ReturnType<typeof calculateAreas> | null = null;
  try {
    areas = row.exactAreaSqFt
      ? calculateAreas({
          kind: "EXACT",
          exactAreaSqFt: row.exactAreaSqFt,
          reason: row.exactAreaReason || "pending",
        })
      : row.widthFt && row.lengthFt
        ? calculateAreas({ kind: "REGULAR", widthFt: row.widthFt, lengthFt: row.lengthFt })
        : null;
  } catch {
    return { ...blank, issue: "Check Width and Length" };
  }

  const measured = areas
    ? { areaSqFt: show(areas.areaSqFt), areaSqYd: show(areas.areaSqYd), areaSqM: show(areas.areaSqM) }
    : { areaSqFt: "—", areaSqYd: "—", areaSqM: "—" };

  if (components.length === 0) {
    return { ...measured, plc: "—", issue: "No published PLC version" };
  }

  try {
    const effective = buildPlcSnapshot(
      boundaries.map((b) => ({
        side: b.side,
        kind: b.kind,
        roadWidthFt: b.roadWidthFt || null,
      })) as Boundary[],
      components as PlcComponentRule[]
    );
    return { ...measured, plc: formatPercent(effective.totalPercent.toString()), issue: null };
  } catch (error) {
    return {
      ...measured,
      plc: "—",
      issue: error instanceof Error ? error.message : "Charge unavailable",
    };
  }
}

/** What the side's second field is asking for, so it is never an unlabelled box. */
const REFERENCE_LABEL: Record<string, string> = {
  ROAD: "Road width ft",
  PLOT: "Plot no.",
  COMMERCIAL: "Commercial no.",
  INFORMAL_SECTOR: "Sector no.",
  PARK: "Park no.",
  PLAYGROUND: "Ground no.",
  FACILITIES: "Facility no.",
  PUBLIC_UTILITY: "Utility no.",
  OTHER: "Reference",
};

const SIDE_NAME: Record<string, string> = {
  NORTH: "North",
  EAST: "East",
  SOUTH: "South",
  WEST: "West",
};

/**
 * One side of one Plot: what it faces, and the one detail that kind carries.
 * Road width is the only compulsory detail — it decides the band.
 *
 * Two layouts, because the two callers have opposite constraints. The dialog
 * has width to spare and gets a labelled row; the bulk grid does not, and gets
 * a compact one. Both give the kind select a floor width: it is the field that
 * says what the side *is*, and it must never be the one that collapses.
 */
function SideControl({
  boundary,
  onChange,
  layout = "row",
}: {
  boundary: BoundaryRow;
  onChange: (patch: Partial<BoundaryRow>) => void;
  layout?: "row" | "inline";
}) {
  const detailLabel = REFERENCE_LABEL[boundary.kind] ?? "Reference";
  const isRoad = boundary.kind === "ROAD";

  const kindSelect = (
    <select
      className={`${inputClass} ${
        layout === "row" ? "h-9 text-xs" : "h-8 text-xs font-medium"
      } min-w-0 flex-1`}
      aria-label={`${boundary.side.toLowerCase()} boundary`}
      value={boundary.kind}
      onChange={(e) => onChange({ kind: e.target.value })}
    >
      {BOUNDARY_KINDS.map((kind) => (
        <option key={kind} value={kind}>
          {BOUNDARY_KIND_LABEL[kind]}
        </option>
      ))}
    </select>
  );

  const detailInput = (
    <input
      className={`${inputClass} ${
        layout === "row" ? "h-9 text-xs" : "h-8 text-xs font-normal"
      } min-w-0 flex-1`}
      inputMode={isRoad ? "decimal" : undefined}
      placeholder={isRoad ? "Width ft (req.)" : "Ref # (opt.)"}
      aria-label={
        isRoad
          ? `${boundary.side.toLowerCase()} road width in feet`
          : `${boundary.side.toLowerCase()} side reference, optional`
      }
      value={isRoad ? boundary.roadWidthFt : boundary.reference}
      onChange={(e) =>
        onChange(isRoad ? { roadWidthFt: e.target.value } : { reference: e.target.value })
      }
    />
  );

  if (layout === "inline") {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-card p-1.5 shadow-2xs transition-all hover:border-primary/40 focus-within:border-primary/50">
        <span
          title={`${SIDE_NAME[boundary.side]} Boundary`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary"
        >
          {boundary.side.charAt(0)}
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
          {kindSelect}
          {detailInput}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[3.5rem_minmax(8.5rem,1fr)_7rem_minmax(6rem,12rem)] items-center gap-2">
      <span className="text-xs font-medium text-foreground">{SIDE_NAME[boundary.side]}</span>
      {kindSelect}
      <label htmlFor={`${boundary.side}-detail`} className="text-right text-[11px] text-muted-foreground">
        {detailLabel}
      </label>
      {React.cloneElement(detailInput, { id: `${boundary.side}-detail` })}
    </div>
  );
}

/** The three derived areas, shown together because they are one measurement. */
function AreaReadout({ preview }: { preview: Preview }) {
  return (
    <div className="text-right tabular-nums">
      <p className="text-sm font-semibold text-foreground">
        {preview.areaSqFt}
        <span className="ml-1 text-[10px] font-normal text-muted-foreground">sq ft</span>
      </p>
      <p className="text-[11px] text-muted-foreground">
        {preview.areaSqYd} sq yd · {preview.areaSqM} sq m
      </p>
    </div>
  );
}

function lifecycleVariant(lifecycle: string) {
  if (lifecycle === "AVAILABLE") return "success" as const;
  if (lifecycle === "HOLD") return "warning" as const;
  if (lifecycle === "NOT_AVAILABLE") return "outline" as const;
  return "info" as const;
}

export default function PlotsClient({
  role,
  actorName,
  staffAccountId,
  rows,
  holdRequests,
  projects,
  people,
  permissions,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: PlotRowView[];
  holdRequests: HoldRequestView[];
  projects: ProjectView[];
  people: Array<{ id: string; fullName: string; primaryMobile: string }>;
  permissions: {
    makeAvailable: boolean;
    restriction: boolean;
    hold: boolean;
    extend: boolean;
    decideExtension: boolean;
    setup: boolean;
    editDetails: boolean;
    reviewRequests: boolean;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [projectFilter, setProjectFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<
    | { kind: "HOLD"; plot: PlotRowView }
    | { kind: "AVAILABLE"; plot: PlotRowView }
    | { kind: "RESTRICT"; plot: PlotRowView }
    | { kind: "CANCEL_HOLD"; plot: PlotRowView }
    | { kind: "EXTEND"; plot: PlotRowView }
    | { kind: "PREPARE" }
    | { kind: "EDIT_DETAILS"; plot: PlotRowView }
    | { kind: "DECIDE_REQUEST"; request: HoldRequestView; approve: boolean }
    | { kind: "DECIDE_EXTENSION"; plot: PlotRowView; approve: boolean }
    | null
  >(null);

  const visible = rows.filter(
    (r) =>
      (projectFilter === "ALL" || r.projectId === projectFilter) &&
      (statusFilter === "ALL" || r.lifecycle === statusFilter) &&
      (search.trim() === "" ||
        `${r.plotNumber} ${r.project} ${r.hold?.heldForName ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    setNotice(
      result.ok
        ? { kind: "ok", text: result.message ?? "Done." }
        : { kind: "error", text: result.error }
    );
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
    return result.ok;
  }

  const newKey = () => globalThis.crypto.randomUUID();

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Plot Inventory</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {visible.length} of {rows.length} Plots · Plot Location Charge is a percentage only ·
              times in Asia/Kolkata
            </p>
          </div>
          {permissions.setup && (
            <Button size="sm" variant="gradient" onClick={() => setDialog({ kind: "PREPARE" })}>
              <Plus className="mr-1 h-4 w-4" /> Prepare Inventory
            </Button>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={filterClass}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Filter by Project"
          >
            <option value="ALL">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className={filterClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {Object.entries(LIFECYCLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-56"
            placeholder="Search Plot Number or Customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {notice && (
          <Card
            className={`p-4 ${
              notice.kind === "ok"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-red-500/40 bg-red-500/5"
            }`}
          >
            <p
              role="status"
              className={`flex items-start gap-2 text-sm ${
                notice.kind === "ok" ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {notice.kind === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{notice.text}</span>
            </p>
          </Card>
        )}

        {/* DESIGN §9.3 — the Member Hold Request queue lives inside Plot
            Inventory, not as its own top-level tab. */}
        {permissions.reviewRequests && holdRequests.length > 0 && (
          <Card className="space-y-3 p-4">
            <div>
              <h2 className="text-sm font-semibold">Member Hold Requests — {holdRequests.length} Pending</h2>
              <p className="text-xs text-muted-foreground">
                Each request names the actual buyer. A request expires on the working-day cut-off and
                cannot be approved after that.
              </p>
            </div>
            <ul className="space-y-2">
              {holdRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/50 p-3"
                >
                  <div className="min-w-0 space-y-0.5 text-xs">
                    <p className="text-sm font-semibold">
                      {r.project} · <span className="font-mono text-primary">{r.plot}</span>
                      <Badge variant="outline" className="ml-2">
                        Queue #{r.queuePosition}
                      </Badge>
                    </p>
                    <p className="text-muted-foreground">
                      For {r.buyer} · requested by {r.member}
                    </p>
                    <p className="text-muted-foreground">
                      Submitted {formatIst(r.createdAt)} · expires {formatIst(r.expiresAt)}
                      {r.plotLifecycle !== "AVAILABLE"
                        ? ` · Plot is now ${LIFECYCLE_LABEL[r.plotLifecycle] ?? r.plotLifecycle}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setDialog({ kind: "DECIDE_REQUEST", request: r, approve: false })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setDialog({ kind: "DECIDE_REQUEST", request: r, approve: true })}
                    >
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {visible.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm font-semibold">No Plots match these filters.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length === 0
                ? permissions.setup
                  ? "Use Prepare Inventory to add Plots to a Project."
                  : "Inventory has not been prepared yet."
                : "Clear a filter to see more inventory."}
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] border-separate border-spacing-y-2 text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1">Project</th>
                  <th className="px-3 py-1">Plot Type / Number</th>
                  <th className="px-3 py-1">Area</th>
                  <th className="px-3 py-1">Status</th>
                  <th className="px-3 py-1">Plot Location Charge (PLC %)</th>
                  <th className="px-3 py-1">Restriction</th>
                  <th className="px-3 py-1">Customer</th>
                  <th className="px-3 py-1">Next action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((plot) => (
                  <tr key={plot.id} className="glass-card rounded-xl align-top">
                    <td className="rounded-l-xl px-3 py-3">{plot.project}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/plots/${plot.id}`}
                        className="font-mono font-semibold text-primary hover:underline"
                      >
                        {plot.plotNumber}
                      </Link>
                      <span className="block text-[11px] text-muted-foreground">
                        {PLOT_TYPE_LABEL[plot.plotType] ?? plot.plotType}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatQuantity(plot.areaSqYd)} sq yd
                      <span className="block text-[11px] text-muted-foreground">
                        {formatQuantity(plot.areaSqFt)} sq ft · {formatQuantity(plot.areaSqM)} sq m
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={lifecycleVariant(plot.lifecycle)}>
                        {LIFECYCLE_LABEL[plot.lifecycle] ?? plot.lifecycle}
                      </Badge>
                      {plot.isResale && (
                        <Badge variant="outline" className="ml-1">
                          RESALE
                        </Badge>
                      )}
                      {plot.hold && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {plot.hold.frozen
                            ? "Hold timer frozen — Booking Request under review"
                            : `Expires ${formatIst(plot.hold.expiresAt)}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {/* The total and what makes it up. The per-component
                          percentages, the sides that qualified each one and the
                          rule version are on the Plot's own page — a list this
                          wide cannot carry them and still be scannable. */}
                      {plot.plc ? (
                        <>
                          <span className="block text-sm font-semibold tabular-nums text-foreground">
                            {formatPercent(plot.plc.totalPercent)}
                          </span>
                          <span className="block text-[11px]">
                            {plot.plc.components.length === 0
                              ? "No component applies"
                              : plot.plc.components.map((c) => c.label).join(" · ")}
                          </span>
                        </>
                      ) : (
                        <span className="block text-[11px] text-amber-800">{plot.plcIssue}</span>
                      )}
                      <span className="block text-[11px]">{plot.facing}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {RESTRICTION_LABEL[plot.restriction] ?? plot.restriction}
                      {plot.restrictionReason && (
                        <span className="block text-[11px] text-muted-foreground">
                          {plot.restrictionReason}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {plot.hold ? (
                        <>
                          {plot.hold.heldForName}
                          <span className="block text-[11px] text-muted-foreground">
                            Extensions: {plot.hold.extensionCount}
                            {plot.hold.pendingExtension ? " · request pending" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="rounded-r-xl px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {plot.lifecycle === "NOT_AVAILABLE" && permissions.makeAvailable && (
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "AVAILABLE", plot })}>
                            Make Available
                          </Button>
                        )}
                        {plot.lifecycle === "AVAILABLE" && permissions.hold && (
                          <Button size="sm" onClick={() => setDialog({ kind: "HOLD", plot })}>
                            Hold
                          </Button>
                        )}
                        {["AVAILABLE", "NOT_AVAILABLE"].includes(plot.lifecycle) && permissions.restriction && (
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "RESTRICT", plot })}>
                            Restriction
                          </Button>
                        )}
                        {permissions.editDetails && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: "EDIT_DETAILS", plot })}
                          >
                            Edit Plot Details
                          </Button>
                        )}
                        {plot.lifecycle === "HOLD" &&
                          plot.hold &&
                          permissions.extend &&
                          !plot.hold.pendingExtension && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: "EXTEND", plot })}
                            >
                              Extend Hold
                            </Button>
                          )}
                        {/* PRD §8.5 — a further extension is Admin's decision, and
                            reviewing it never pauses the Hold expiry. */}
                        {plot.hold?.pendingExtension && permissions.decideExtension && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setDialog({ kind: "DECIDE_EXTENSION", plot, approve: true })}
                            >
                              Approve extension
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: "DECIDE_EXTENSION", plot, approve: false })}
                            >
                              Reject extension
                            </Button>
                          </>
                        )}
                        {plot.lifecycle === "HOLD" && plot.hold && permissions.hold && (
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "CANCEL_HOLD", plot })}>
                            Cancel Hold
                          </Button>
                        )}
                        {plot.lifecycle === "AVAILABLE" && (
                          <Button size="sm" variant="ghost" disabled title="Booking Requests arrive in Phase 3.">
                            Start Booking
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === "HOLD" && (
        <ConfirmDialog
          title="Hold Plot"
          plot={dialog.plot}
          consequence="A Hold runs for 72 hours from now and counts toward the Customer's three open Plot positions. The PLC snapshot is frozen at creation."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <>
              <Field label="Actual Customer / Person — required">
                <select name="personId" required className={inputClass} defaultValue="">
                  <option value="" disabled>
                    Select the actual Person
                  </option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} · {p.primaryMobile}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Remark (optional)">
                <Input name="remark" />
              </Field>
            </>
          }
          onSubmit={(f) =>
            run(() =>
              createHoldAction(
                dialog.plot.id,
                String(f.get("personId")),
                String(f.get("remark") ?? ""),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "AVAILABLE" && (
        <ConfirmDialog
          title="Make Available"
          plot={dialog.plot}
          consequence="The Plot becomes Available for Hold or Booking. This action does not also place a Hold — use Hold separately."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <Field label="Reason — compulsory">
              <Input name="reason" required minLength={3} />
            </Field>
          }
          onSubmit={(f) => run(() => makeAvailableAction(dialog.plot.id, String(f.get("reason")), newKey()))}
        />
      )}

      {dialog?.kind === "RESTRICT" && (
        <ConfirmDialog
          title="Change restriction"
          plot={dialog.plot}
          consequence="Not for Sale and Pledge keep the Plot Not Available, including whenever it returns from a Hold or a cancelled Booking."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <>
              <Field label="Restriction">
                <select name="restriction" className={inputClass} defaultValue={dialog.plot.restriction}>
                  {Object.entries(RESTRICTION_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {value === "NONE" ? "No restriction" : label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason — compulsory">
                <Input name="reason" required minLength={3} />
              </Field>
            </>
          }
          onSubmit={(f) =>
            run(() =>
              setRestrictionAction(
                dialog.plot.id,
                f.get("restriction") as "NONE",
                String(f.get("reason")),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "CANCEL_HOLD" && dialog.plot.hold && (
        <ConfirmDialog
          title="Cancel Hold"
          plot={dialog.plot}
          consequence="The Plot returns under its restriction rule: Available when unrestricted, Not Available when Not for Sale or Pledge is active."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <Field label="Reason — compulsory">
              <Input name="reason" required minLength={3} />
            </Field>
          }
          onSubmit={(f) =>
            run(() => cancelHoldAction(dialog.plot.hold!.id, String(f.get("reason")), newKey()))
          }
        />
      )}

      {dialog?.kind === "EXTEND" && dialog.plot.hold && (
        <ConfirmDialog
          title="Request Hold extension"
          plot={dialog.plot}
          consequence={`Requesting an extension does not pause the Hold timer. Current expiry: ${formatIst(
            dialog.plot.hold.expiresAt
          )}. ${
            dialog.plot.hold.extensionCount >= 1
              ? "This is a further extension, so Admin approval is required."
              : "This is the first extension, which CRM may approve."
          }`}
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <>
              <Field label="Additional hours">
                <input name="hours" type="number" min={1} max={168} defaultValue={24} className={inputClass} />
              </Field>
              <Field label="Reason — compulsory">
                <Input name="reason" required minLength={3} />
              </Field>
            </>
          }
          onSubmit={(f) =>
            run(() =>
              requestExtensionAction(
                dialog.plot.hold!.id,
                String(f.get("reason")),
                Number(f.get("hours")),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "DECIDE_EXTENSION" && dialog.plot.hold?.pendingExtensionId && (
        <ConfirmDialog
          title={dialog.approve ? "Approve Hold extension" : "Reject Hold extension"}
          plot={dialog.plot}
          consequence={`${
            dialog.approve
              ? "The new expiry applies from the original expiry, not from now."
              : "The Hold keeps its existing expiry."
          } Reviewing never pauses the timer — current expiry ${formatIst(
            dialog.plot.hold.expiresAt
          )}.${
            dialog.plot.hold.pendingExtensionReason
              ? ` Requested because: ${dialog.plot.hold.pendingExtensionReason}`
              : ""
          }`}
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <Field label="Remark">
              <Input name="note" />
            </Field>
          }
          onSubmit={(f) =>
            run(() =>
              decideHoldExtensionAction(
                dialog.plot.hold!.pendingExtensionId!,
                dialog.approve,
                String(f.get("note") ?? ""),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "DECIDE_REQUEST" && (
        <Modal
          title={dialog.approve ? "Approve Member Hold Request" : "Reject Member Hold Request"}
          onClose={() => setDialog(null)}
        >
          <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
            <p className="font-semibold text-foreground">
              {dialog.request.project} · {dialog.request.plot} · for {dialog.request.buyer}
            </p>
            <p className="mt-1 text-muted-foreground">
              {dialog.approve
                ? "Approval creates a 72-hour Hold for the named buyer and freezes the Plot's PLC snapshot. The buyer's three open Plot positions are re-checked now."
                : "The remark is shown to the Member. The Plot stays as it is."}
            </p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const note = String(new FormData(e.currentTarget).get("note"));
              run(() => decideHoldRequestAction(dialog.request.id, dialog.approve, note, newKey()));
            }}
          >
            <Field label="Remark — compulsory">
              <Input name="note" required minLength={3} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Processing…" : dialog.approve ? "Confirm approval" : "Confirm rejection"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === "EDIT_DETAILS" && (
        <EditPlotDetailsDialog
          plot={dialog.plot}
          components={projects.find((p) => p.id === dialog.plot.projectId)?.plcComponents ?? []}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(details, reason) =>
            run(() => updatePlotDetailsAction(dialog.plot.id, details, reason, newKey()))
          }
        />
      )}

      {dialog?.kind === "PREPARE" && (
        <PrepareInventoryDialog
          projects={projects}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(projectId, rows) => run(() => prepareInventoryAction(projectId, rows, newKey()))}
        />
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------------- dialogs */



/** DESIGN §5.1 — record identifier, exact action, consequences, compulsory reason. */
function ConfirmDialog({
  title,
  plot,
  consequence,
  fields,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  plot: PlotRowView;
  consequence: string;
  fields: React.ReactNode;
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {plot.project} · {plot.plotType.replaceAll("_", " ")} {plot.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">{consequence}</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        {fields}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Processing…" : "Confirm"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type GridRow = {
  plotNumber: string;
  plotType: string;
  widthFt: string;
  lengthFt: string;
  exactAreaSqFt: string;
  exactAreaReason: string;
  /** Set when the Plot is irregular: an area typed directly, with a reason. */
  irregular: boolean;
  /** The four sides. The Charge is read out of these, never typed (PLC spec §4.1). */
  boundaries: BoundaryRow[];
};

const EMPTY_ROW: GridRow = {
  plotNumber: "",
  plotType: "RESIDENTIAL",
  widthFt: "",
  lengthFt: "",
  exactAreaSqFt: "",
  exactAreaReason: "",
  irregular: false,
  boundaries: [],
};

/**
 * PRD §8.4 Edit Plot Details, under §8.7: a compulsory reason, and old/new kept
 * in History by the command. Dimensions and the four sides are the whole form —
 * there is no Location Charge field to correct, because correcting a side is
 * what corrects the Charge.
 */
/** Only the fields the correction touches — the list row carries far more. */
export type EditablePlot = {
  id: string;
  plotNumber: string;
  lifecycle: string;
  widthFt: string;
  lengthFt: string;
  exactAreaSqFt: string;
  exactAreaReason: string;
  boundaries: BoundaryRow[];
};

export function EditPlotDetailsDialog({
  plot,
  components,
  busy,
  onClose,
  onSubmit,
}: {
  plot: EditablePlot;
  components: Array<{ category: string; threshold: string | null; percent: string }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    details: {
      widthFt?: string;
      lengthFt?: string;
      exactAreaSqFt?: string;
      exactAreaReason?: string;
      boundaries: Array<{
        side: "NORTH";
        kind: "ROAD";
        roadWidthFt?: string;
        reference?: string;
      }>;
    },
    reason: string
  ) => void;
}) {
  const [form, setForm] = React.useState({
    widthFt: plot.widthFt,
    lengthFt: plot.lengthFt,
    exactAreaSqFt: plot.exactAreaSqFt,
    exactAreaReason: plot.exactAreaReason,
  });
  const [boundaries, setBoundaries] = React.useState<BoundaryRow[]>(() =>
    SIDES.map(
      (side) =>
        plot.boundaries.find((b) => b.side === side) ?? {
          side,
          kind: "PLOT",
          roadWidthFt: "",
          reference: "",
        }
    )
  );
  const [reason, setReason] = React.useState("");

  const preview = derivePreview(form, boundaries, components);
  const locked = !["AVAILABLE", "NOT_AVAILABLE"].includes(plot.lifecycle);

  return (
    <Modal title={`Edit Plot Details — ${plot.plotNumber}`} onClose={onClose} wide>
      {locked && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          This Plot is {LIFECYCLE_LABEL[plot.lifecycle] ?? plot.lifecycle}, so its details are locked
          (PRD §8.7). An authorised correction is still allowed and is recorded in full. A Location
          Charge already frozen against a Hold or Booking does not move with it — correct that
          snapshot separately.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Width ft">
          <Input
            inputMode="decimal"
            value={form.widthFt}
            onChange={(e) => setForm({ ...form, widthFt: e.target.value })}
          />
        </Field>
        <Field label="Length ft">
          <Input
            inputMode="decimal"
            value={form.lengthFt}
            onChange={(e) => setForm({ ...form, lengthFt: e.target.value })}
          />
        </Field>
        <Field label="Area sq ft — irregular Plot only">
          <Input
            inputMode="decimal"
            value={form.exactAreaSqFt}
            onChange={(e) => setForm({ ...form, exactAreaSqFt: e.target.value })}
          />
        </Field>
        <Field label="Reason for the area">
          <Input
            value={form.exactAreaReason}
            onChange={(e) => setForm({ ...form, exactAreaReason: e.target.value })}
          />
        </Field>
      </div>

      <p className="pt-2 text-xs font-medium text-muted-foreground">
        Boundaries — the Location Charge is read from these
      </p>
      {/* One side per line. Four of these side by side is what squeezed the
          kind select down to its chevron; the dialog has the height to spare. */}
      <div className="space-y-2">
        {boundaries.map((boundary, i) => (
          <SideControl
            key={boundary.side}
            boundary={boundary}
            onChange={(patch) =>
              setBoundaries((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-secondary px-4 py-3">
        <AreaReadout preview={preview} />
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Location Charge</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{preview.plc}</p>
        </div>
        {preview.issue && (
          <p className="w-full text-[11px] text-amber-800">{preview.issue}</p>
        )}
      </div>

      <Field label="Reason — compulsory, kept in History">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Back
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || reason.trim().length < 3}
          onClick={() =>
            onSubmit(
              {
                widthFt: form.widthFt || undefined,
                lengthFt: form.lengthFt || undefined,
                exactAreaSqFt: form.exactAreaSqFt || undefined,
                exactAreaReason: form.exactAreaReason || undefined,
                boundaries: boundaries.map((b) => ({
                  side: b.side as "NORTH",
                  kind: b.kind as "ROAD",
                  roadWidthFt: b.roadWidthFt || undefined,
                  reference: b.reference || undefined,
                })),
              },
              reason
            )
          }
        >
          {busy ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </Modal>
  );
}

/** PRD §16.4 — controlled Excel-style grid inside the CRM; no CSV upload. */
function PrepareInventoryDialog({
  projects,
  busy,
  onClose,
  onSubmit,
}: {
  projects: ProjectView[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (projectId: string, rows: Parameters<typeof prepareInventoryAction>[1]) => void;
}) {
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [rows, setRows] = React.useState<GridRow[]>([
    { ...EMPTY_ROW, boundaries: emptyBoundaries() },
  ]);
  const project = projects.find((p) => p.id === projectId);

  const update = (index: number, patch: Partial<GridRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const bands = project
    ? plcComponentLabels(
        project.plcComponents.map((c) => ({
          category: c.category as PlcComponentRule["category"],
          threshold: c.threshold,
          percent: c.percent,
        }))
      )
    : [];

  const named = rows.filter((r) => r.plotNumber.trim()).length;

  return (
    <Modal title="Prepare Inventory" onClose={onClose} wide>
      <p className="text-xs text-muted-foreground">
        Each Plot starts Not Available — Not Yet Released. Area and Location Charge fill in as you
        type; the Charge is read from the four sides, so there is nothing to select.
      </p>

      <div className="space-y-2">
        <Field label="Project">
          <select
            className={inputClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        {/* What this Project charges. Read-only: it is what the Charge below is
            computed against, and it belongs to Project setup, not to this grid. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-secondary/60 px-3 py-2">
          {bands.length === 0 ? (
            <span className="text-[11px] text-amber-800">
              No published Location Charge version — publish one in Project setup first.
            </span>
          ) : (
            bands.map((label, i) => (
              <span key={label} className="text-[11px] text-muted-foreground">
                {label}{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatPercent(project!.plcComponents[i].percent)}
                </span>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="max-h-[56vh] space-y-3 overflow-y-auto pr-1">
        {rows.map((row, i) => {
          const preview = derivePreview(row, row.boundaries, project?.plcComponents ?? []);
          return (
            <div
              key={i}
              className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs transition-all hover:border-border"
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="w-28">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Plot No.
                    </span>
                    <input
                      className={`${inputClass} h-9 font-mono font-medium`}
                      placeholder="e.g. 101"
                      value={row.plotNumber}
                      onChange={(e) => update(i, { plotNumber: e.target.value })}
                    />
                  </label>

                  <label className="w-36">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Type
                    </span>
                    <select
                      className={`${inputClass} h-9`}
                      value={row.plotType}
                      onChange={(e) => update(i, { plotType: e.target.value })}
                    >
                      {Object.entries(PLOT_TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {row.irregular ? (
                    <>
                      <label className="w-32">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Area sq ft
                        </span>
                        <input
                          className={`${inputClass} h-9`}
                          inputMode="decimal"
                          value={row.exactAreaSqFt}
                          onChange={(e) => update(i, { exactAreaSqFt: e.target.value })}
                        />
                      </label>
                      <label className="w-44">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Reason — compulsory
                        </span>
                        <input
                          className={`${inputClass} h-9`}
                          value={row.exactAreaReason}
                          onChange={(e) => update(i, { exactAreaReason: e.target.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <div className="flex items-end gap-2">
                      <label className="w-24">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Width ft
                        </span>
                        <input
                          className={`${inputClass} h-9`}
                          inputMode="decimal"
                          value={row.widthFt}
                          onChange={(e) => update(i, { widthFt: e.target.value })}
                        />
                      </label>
                      <span className="pb-2 text-xs font-semibold text-muted-foreground">×</span>
                      <label className="w-24">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Length ft
                        </span>
                        <input
                          className={`${inputClass} h-9`}
                          inputMode="decimal"
                          value={row.lengthFt}
                          onChange={(e) => update(i, { lengthFt: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2">
                  <AreaReadout preview={preview} />
                  <div className="border-l border-primary/20 pl-3 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      PLC Charge
                    </p>
                    <p className="text-base font-bold tabular-nums text-primary">
                      {preview.plc}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Boundaries (North · East · South · West)
                </span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {row.boundaries.map((boundary, b) => (
                    <SideControl
                      key={boundary.side}
                      layout="inline"
                      boundary={boundary}
                      onChange={(patch) =>
                        update(i, {
                          boundaries: row.boundaries.map((x, j) => (j === b ? { ...x, ...patch } : x)),
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/40">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border-input text-primary focus:ring-primary/40 h-4 w-4"
                    checked={row.irregular}
                    onChange={(e) =>
                      update(i, {
                        irregular: e.target.checked,
                        ...(e.target.checked
                          ? { widthFt: "", lengthFt: "" }
                          : { exactAreaSqFt: "", exactAreaReason: "" }),
                      })
                    }
                  />
                  <span>Irregular Plot — specify area directly</span>
                </label>
                <div className="flex items-center gap-3">
                  {preview.issue && (
                    <span className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      {preview.issue}
                    </span>
                  )}
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="text-xs font-medium text-destructive hover:underline"
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remove Plot
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRows((r) => [...r, { ...EMPTY_ROW, boundaries: emptyBoundaries() }])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Plot
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !projectId || named === 0}
            onClick={() =>
              onSubmit(
                projectId,
                rows
                  .filter((r) => r.plotNumber.trim())
                  .map((r) => ({
                    plotNumber: r.plotNumber,
                    plotType: r.plotType as "RESIDENTIAL",
                    widthFt: r.irregular ? undefined : r.widthFt || undefined,
                    lengthFt: r.irregular ? undefined : r.lengthFt || undefined,
                    exactAreaSqFt: r.irregular ? r.exactAreaSqFt || undefined : undefined,
                    exactAreaReason: r.irregular ? r.exactAreaReason || undefined : undefined,
                    boundaries: r.boundaries.map((b) => ({
                      side: b.side as "NORTH",
                      kind: b.kind as "ROAD",
                      roadWidthFt: b.roadWidthFt || undefined,
                      reference: b.reference || undefined,
                    })),
                  }))
              )
            }
          >
            {busy ? "Saving…" : named > 0 ? `Save ${named} Plot${named === 1 ? "" : "s"}` : "Save"}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Prepared on {istDay(new Date())} (IST).</p>
    </Modal>
  );
}
