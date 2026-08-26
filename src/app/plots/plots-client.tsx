"use client";

// Plot Inventory table and state actions — DESIGN.md §7.
// Actions are hidden by permission for clarity; the server re-checks every one.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Plus, X, Trash2, MoreHorizontal, Pencil, Lock, Pause, Calendar, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatIst, formatPercent, formatQuantity, istDay, type StaffRole } from "@/lib/tasks";
// The grid computes Area and Location Charge live from the same domain rules
// the server runs on save, which is the only way the two cannot disagree. It
// costs decimal.js in the client bundle (~30 kB). Recomputing in float here
// would be smaller and wrong, so the size is the right trade.
import {
  buildPlcSnapshot,
  calculateAreas,
  displayLifecycle,
  plcDisplayComponents,
  type PlotLifecycle,
  type ProjectLifecycle,
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
  city?: string | null;
  location?: string | null;
  lifecycle: string;
  /** The configured bands, so the grid derives the same PLC the server will. */
  plcComponents: Array<{ category: string; threshold: string | null; percent: string; remark?: string | null }>;
};

function projectFullLabel(p: { name: string; city?: string | null; location?: string | null }): string {
  const loc = [p.location, p.city].filter(Boolean).join(", ");
  return loc ? `${p.name} — ${loc}` : p.name;
}

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
  "FACILITIES",
  "PUBLIC_UTILITY",
  "OTHER",
] as const;

const BOUNDARY_KIND_LABEL: Record<string, string> = {
  ROAD: "Road",
  PLOT: "Plot",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
  PARK: "Park / Playground",
  PLAYGROUND: "Park / Playground",
  FACILITIES: "Facilities",
  PUBLIC_UTILITY: "Public Utility",
  OTHER: "Other Land",
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

export function parseDimension(input: string): string {
  const clean = input.trim();
  if (!clean) return "";

  // 1. If it's a standard integer or decimal (e.g. "25", "25.6", "25.5"), keep it as is.
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return clean;
  }

  // 2. Handle format like 25'6" or 25' 6" or 25ft 6in or 25'6
  const ftInRegex = /^(?:(\d+)\s*['’]|(\d+)\s*ft)?\s*(?:(\d+)\s*["”]|(\d+)\s*in|(\d+))?$/i;
  const match = clean.match(ftInRegex);
  if (match) {
    const feetStr = match[1] || match[2] || "0";
    const inchesStr = match[3] || match[4] || match[5] || "0";
    const feet = parseInt(feetStr, 10);
    const inches = parseInt(inchesStr, 10);
    if (!isNaN(feet) || !isNaN(inches)) {
      const decimalValue = feet + (inches / 12);
      return String(Number(decimalValue.toFixed(4)));
    }
  }

  // 3. Handle format like 25-6 (feet-inches with hyphen)
  const hyphenRegex = /^(\d+)-(\d+)$/;
  const hyphenMatch = clean.match(hyphenRegex);
  if (hyphenMatch) {
    const feet = parseInt(hyphenMatch[1], 10);
    const inches = parseInt(hyphenMatch[2], 10);
    if (!isNaN(feet) && !isNaN(inches)) {
      const decimalValue = feet + (inches / 12);
      return String(Number(decimalValue.toFixed(4)));
    }
  }

  // 4. Handle space-separated like 25 6
  const spaceRegex = /^(\d+)\s+(\d+)$/;
  const spaceMatch = clean.match(spaceRegex);
  if (spaceMatch) {
    const feet = parseInt(spaceMatch[1], 10);
    const inches = parseInt(spaceMatch[2], 10);
    if (!isNaN(feet) && !isNaN(inches)) {
      const decimalValue = feet + (inches / 12);
      return String(Number(decimalValue.toFixed(4)));
    }
  }

  return clean;
}

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
  const parsedWidth = parseDimension(row.widthFt);
  const parsedLength = parseDimension(row.lengthFt);
  try {
    areas = row.exactAreaSqFt
      ? calculateAreas({
          kind: "EXACT",
          exactAreaSqFt: row.exactAreaSqFt,
          reason: row.exactAreaReason || "pending",
        })
      : parsedWidth && parsedLength
        ? calculateAreas({ kind: "REGULAR", widthFt: parsedWidth, lengthFt: parsedLength })
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
  plcComponents = [],
}: {
  boundary: BoundaryRow;
  onChange: (patch: Partial<BoundaryRow>) => void;
  layout?: "row" | "inline";
  plcComponents?: Array<{ category: string; threshold: string | null; percent: string; remark?: string | null }>;
}) {
  const detailLabel = REFERENCE_LABEL[boundary.kind] ?? "Reference";
  const isRoad = boundary.kind === "ROAD";
  const roads = plcComponents.filter((c) => c.category === "ROAD_WIDTH");
  const hasPreconfiguredRoads = isRoad && roads.length > 0;

  const selectedRoad = roads.find(
    (r) =>
      r.threshold &&
      Number(r.threshold) === Number(boundary.roadWidthFt) &&
      (r.remark || "") === (boundary.reference || "")
  );

  const isCustomRoad = isRoad && !selectedRoad;

  const kindSelect = (
    <select
      className={`${inputClass} ${
        layout === "row" ? "h-8 text-xs" : "h-7 text-xs font-medium"
      } w-full min-w-0`}
      aria-label={`${boundary.side.toLowerCase()} boundary`}
      value={boundary.kind}
      onChange={(e) => {
        const nextKind = e.target.value;
        onChange({
          kind: nextKind,
          roadWidthFt: nextKind === "ROAD" ? "" : undefined,
          reference: "",
        });
      }}
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
        layout === "row" ? "h-8 text-xs" : "h-7 text-xs font-normal"
      } w-full min-w-0`}
      inputMode={isRoad ? "decimal" : undefined}
      // The label column this replaces said exactly this, in the same row, for
      // every one of the four sides.
      placeholder={isRoad ? "Width ft" : detailLabel}
      aria-label={
        isRoad
          ? `${boundary.side.toLowerCase()} road width in feet`
          : `${boundary.side.toLowerCase()} side reference, optional`
      }
      value={isRoad ? (boundary.roadWidthFt ?? "") : (boundary.reference ?? "")}
      onChange={(e) =>
        onChange(isRoad ? { roadWidthFt: e.target.value } : { reference: e.target.value })
      }
    />
  );

  const roadSelect = hasPreconfiguredRoads && (
    <select
      className={`${inputClass} ${
        layout === "row" ? "h-8 text-xs" : "h-7 text-xs font-medium"
      } w-full min-w-0`}
      value={selectedRoad ? `${selectedRoad.threshold}|${selectedRoad.remark || ""}` : "custom"}
      onChange={(e) => {
        const val = e.target.value;
        if (val === "custom") {
          onChange({ roadWidthFt: "", reference: "" });
        } else {
          const [threshold, remark] = val.split("|");
          onChange({
            roadWidthFt: threshold,
            reference: remark || "",
          });
        }
      }}
    >
      <option value="custom">Custom</option>
      {roads.map((r, ri) => {
        const pct = r.percent.includes(".") ? r.percent.replace(/0+$/, "").replace(/\.$/, "") : r.percent;
        const nameStr = r.remark ? `${r.remark} (${r.threshold}ft, ${pct}%)` : `Road ${r.threshold}ft (${pct}%)`;
        return (
          <option key={ri} value={`${r.threshold}|${r.remark || ""}`}>
            {nameStr}
          </option>
        );
      })}
    </select>
  );

  if (layout === "inline") {
    return (
      <div className="flex items-start gap-2 px-3 py-2 min-w-0">
        {/* Side letter badge - darker & bolder for clarity */}
        <span
          title={`${SIDE_NAME[boundary.side]} Boundary`}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-foreground bg-secondary border border-border/60 select-none"
        >
          {boundary.side.charAt(0)}
        </span>
        {/* Controls stacked */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <select
            className="h-7 w-full rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            aria-label={`${boundary.side.toLowerCase()} boundary`}
            value={boundary.kind}
            onChange={(e) => {
              const nextKind = e.target.value;
              onChange({
                kind: nextKind,
                roadWidthFt: nextKind === "ROAD" ? "" : undefined,
                reference: "",
              });
            }}
          >
            {BOUNDARY_KINDS.map((kind) => (
              <option key={kind} value={kind}>{BOUNDARY_KIND_LABEL[kind]}</option>
            ))}
          </select>
          {isRoad && hasPreconfiguredRoads && (
            <select
              className="h-7 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              value={selectedRoad ? `${selectedRoad.threshold}|${selectedRoad.remark || ""}` : "custom"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  onChange({ roadWidthFt: "", reference: "" });
                } else {
                  const [threshold, remark] = val.split("|");
                  onChange({ roadWidthFt: threshold, reference: remark || "" });
                }
              }}
            >
              <option value="custom">Custom width</option>
              {roads.map((r, ri) => {
                const pct = r.percent.includes(".") ? r.percent.replace(/0+$/, "").replace(/\.$/, "") : r.percent;
                const nameStr = r.remark ? `${r.remark} (${r.threshold}ft, ${pct}%)` : `Road ${r.threshold}ft (${pct}%)`;
                return <option key={ri} value={`${r.threshold}|${r.remark || ""}`}>{nameStr}</option>;
              })}
            </select>
          )}
          {(!hasPreconfiguredRoads || isCustomRoad) && (
            <input
              className="h-7 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              inputMode={isRoad ? "decimal" : undefined}
              placeholder={isRoad ? "Width ft" : "Ref # (opt.)"}
              value={isRoad ? (boundary.roadWidthFt ?? "") : (boundary.reference ?? "")}
              onChange={(e) =>
                onChange(isRoad ? { roadWidthFt: e.target.value } : { reference: e.target.value })
              }
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[3.25rem_1fr_1fr] items-start gap-1.5">
      <span className="pt-1.5 text-xs font-medium text-foreground">{SIDE_NAME[boundary.side]}</span>
      {kindSelect}
      <div className="flex w-full flex-col gap-1">
        {roadSelect}
        {(!hasPreconfiguredRoads || isCustomRoad) && (
          React.cloneElement(detailInput, { id: `${boundary.side}-detail` })
        )}
      </div>
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
  initialProject,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: PlotRowView[];
  holdRequests: HoldRequestView[];
  projects: ProjectView[];
  /** A Project id from ?project=, or "ALL". */
  initialProject: string;
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
  const [projectFilter, setProjectFilter] = React.useState(initialProject);
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
      <div className="mx-auto max-w-6xl space-y-4">
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
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <p
              role="status"
              className={`flex items-start gap-2 text-sm ${
                notice.kind === "ok" ? "text-emerald-700" : "text-destructive"
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
                {visible.map((plot) => {
                  // The row payload carries these as plain strings; the values
                  // are Prisma enums either way, so this is the boundary cast
                  // rather than a widening.
                  const shown = displayLifecycle(
                    plot.lifecycle as PlotLifecycle,
                    projects.find((p) => p.id === plot.projectId)?.lifecycle as
                      | ProjectLifecycle
                      | undefined
                  );
                  return (
                  <tr key={plot.id} className="card-surface rounded-xl align-top">
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
                      <Badge variant={lifecycleVariant(shown.lifecycle)}>
                        {LIFECYCLE_LABEL[shown.lifecycle] ?? shown.lifecycle}
                      </Badge>
                      {shown.because && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {shown.because}
                        </span>
                      )}
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
                  );
                })}
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
    <Modal title={`Edit Plot Details — ${plot.plotNumber}`} onClose={onClose}>
      {/* Modal spaces its children by 16px. Every block here was a child, so
          seven gaps cost more height than any single control on the form. One
          wrapper makes them one child, spaced by this. */}
      <div className="space-y-2">
      {locked && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          This Plot is {LIFECYCLE_LABEL[plot.lifecycle] ?? plot.lifecycle} (PRD §8.7). The
          correction is allowed and recorded, but a Location Charge already frozen against a Hold
          or Booking does not move with it.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Width ft">
          <Input
            className="h-8"
            value={form.widthFt}
            placeholder="25'6&quot; or 25-6"
            onChange={(e) => setForm({ ...form, widthFt: e.target.value })}
          />
        </Field>
        <Field label="Length ft">
          <Input
            className="h-8"
            value={form.lengthFt}
            placeholder="50'"
            onChange={(e) => setForm({ ...form, lengthFt: e.target.value })}
          />
        </Field>
      </div>

      {/* An irregular Plot is the exception, and its two fields were taking a
          third of the form to say nothing on every ordinary Plot. <details> is
          the native disclosure — no state, no handler, and the inputs stay
          mounted so a value already stored is still submitted. It opens itself
          when this Plot has one. */}
      <details open={Boolean(plot.exactAreaSqFt)} className="group">
        <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
          <span className="underline underline-offset-2 decoration-dotted">
            Irregular Plot — set the area by hand
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="Area sq ft">
            <Input
              className="h-8"
              inputMode="decimal"
              value={form.exactAreaSqFt}
              onChange={(e) => setForm({ ...form, exactAreaSqFt: e.target.value })}
            />
          </Field>
          <Field label="Reason for the area">
            <Input
              className="h-8"
              value={form.exactAreaReason}
              onChange={(e) => setForm({ ...form, exactAreaReason: e.target.value })}
            />
          </Field>
        </div>
      </details>

      <p className="text-[11px] text-muted-foreground">
        Boundaries — the Location Charge is read from these
      </p>
      {/* Two across at this width: four sides down one column spent four rows
          on four short controls, and the dialog has more width than height. */}
      <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
        {boundaries.map((boundary, i) => (
          <SideControl
            key={boundary.side}
            boundary={boundary}
            plcComponents={components}
            onChange={(patch) =>
              setBoundaries((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            }
          />
        ))}
      </div>

      {/* Derived, not entered — so it reads as a result beside the button that
          commits it, rather than as another panel to scroll past. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-secondary px-3 py-1.5">
        <AreaReadout preview={preview} />
        <p className="text-xs text-muted-foreground">
          Location Charge{" "}
          <span className="text-sm font-semibold tabular-nums text-foreground">{preview.plc}</span>
        </p>
        {preview.issue && <p className="w-full text-[11px] text-amber-800">{preview.issue}</p>}
      </div>

      <Field label="Reason — compulsory, kept in History">
        <Input
          className="h-8"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
        />
      </Field>

      <div className="flex justify-end gap-2">
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
                widthFt: parseDimension(form.widthFt) || undefined,
                lengthFt: parseDimension(form.lengthFt) || undefined,
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
  const [rows, setRows] = React.useState<GridRow[]>([]);
  const [bulkCount, setBulkCount] = React.useState("1");

  const project = projects.find((p) => p.id === projectId);

  const update = (index: number, patch: Partial<GridRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  /** Generate N sequential rows starting from bulkStart (numeric increment). */
  function handleBulkAdd() {
    const count = Math.max(1, Math.min(500, parseInt(bulkCount, 10) || 1));
    setRows((prev) => {
      const newRows: GridRow[] = Array.from({ length: count }, () => ({
        ...EMPTY_ROW,
        boundaries: emptyBoundaries(),
        plotNumber: "",
      }));
      return [...prev, ...newRows];
    });
  }

  const bands = project
    ? plcDisplayComponents(
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

      {/* ── Project selector + PLC bands ── */}
      <div className="space-y-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-16 shrink-0">
            Project
          </label>
          <select
            className="flex-1 h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {projectFullLabel(p)}
              </option>
            ))}
          </select>
        </div>

        {/* PLC rate strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-border bg-muted px-3 py-2">
          {bands.length === 0 ? (
            <span className="text-[11px] text-amber-700 font-medium">
              No published PLC version — publish one in Project setup first.
            </span>
          ) : (
            bands.map((band, i) => (
              <span key={i} className="text-[11px] text-muted-foreground">
                {band.label}{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatPercent(band.percent)}
                </span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── Column header ── */}
      <div className="hidden lg:grid lg:grid-cols-[2rem_5rem_9rem_13rem_1fr] gap-3 px-1 pt-2 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">#</span>
        {["Plot No.", "Type", "Dimensions (W × L ft)", "Boundaries"].map((h) => (
          <span key={h} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {h}
          </span>
        ))}
      </div>

      {/* ── Plot rows ── */}
      <div className="max-h-[58vh] space-y-2 overflow-y-auto pb-1 pr-0.5">
        {rows.map((row, i) => {
          const preview = derivePreview(row, row.boundaries, project?.plcComponents ?? []);
          return (
          <div
              key={i}
              className="rounded-xl border border-border bg-card transition-colors hover:border-border"
            >
              {/* ── Top line: plot details ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[2rem_5rem_9rem_13rem_1fr] gap-3 items-center px-3 py-2 border-b border-border">
                {/* Row serial */}
                <span className="hidden lg:flex items-center justify-center text-[11px] font-bold tabular-nums text-muted-foreground select-none bg-secondary rounded h-6 w-6 border border-border">
                  {i + 1}
                </span>

                {/* Plot No. */}
                <input
                  className="h-8 w-full rounded-lg border border-border bg-muted px-2 text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:bg-card transition-colors"
                  placeholder="Plot no."
                  value={row.plotNumber}
                  onChange={(e) => update(i, { plotNumber: e.target.value })}
                />

                {/* Type */}
                <select
                  className="h-8 w-full rounded-lg border border-border bg-muted px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:bg-card transition-colors"
                  value={row.plotType}
                  onChange={(e) => update(i, { plotType: e.target.value })}
                >
                  {Object.entries(PLOT_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>

                {/* Dimensions */}
                {row.irregular ? (
                  <input
                    className="h-8 w-full rounded-lg border border-border bg-muted px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:bg-card transition-colors"
                    placeholder="Area sq ft"
                    inputMode="decimal"
                    value={row.exactAreaSqFt}
                    onChange={(e) => update(i, { exactAreaSqFt: e.target.value })}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      className="h-8 w-full rounded-lg border border-border bg-muted px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:bg-card transition-colors"
                      placeholder="Width"
                      value={row.widthFt}
                      onChange={(e) => update(i, { widthFt: e.target.value })}
                    />
                    <span className="text-muted-foreground font-bold select-none">×</span>
                    <input
                      className="h-8 w-full rounded-lg border border-border bg-muted px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:bg-card transition-colors"
                      placeholder="Length"
                      value={row.lengthFt}
                      onChange={(e) => update(i, { lengthFt: e.target.value })}
                    />
                  </div>
                )}

                {/* PLC + controls */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PLC</span>
                  <span className="tabular-nums text-xs font-bold text-foreground bg-secondary border border-border px-2 py-0.5 rounded">{preview.plc}</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <label
                      title="Irregular plot — specify area directly"
                      className="flex items-center gap-1 cursor-pointer text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors select-none"
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-border accent-primary"
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
                      Irreg.
                    </label>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        title="Remove this plot"
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Bottom line: 4 boundaries with shaded background and dark vertical dividers ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 bg-muted/80 divide-x divide-y lg:divide-y-0 divide-border rounded-b-xl border-t border-border">
                {row.boundaries.map((boundary, b) => (
                  <SideControl
                    key={boundary.side}
                    layout="inline"
                    boundary={boundary}
                    plcComponents={project?.plcComponents}
                    onChange={(patch) =>
                      update(i, {
                        boundaries: row.boundaries.map((x, j) => (j === b ? { ...x, ...patch } : x)),
                      })
                    }
                  />
                ))}
              </div>

              {/* Validation issue */}
              {preview.issue && (
                <div className="px-3 py-1.5 border-t border-border rounded-b-xl bg-amber-50">
                  <span className="text-[11px] font-medium text-amber-700">{preview.issue}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer actions ── */}
      <div className="flex flex-col gap-3 pt-3 border-t border-border">

        {/* Bulk-add bar */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap shrink-0">
            Add plots
          </span>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={500}
                className="h-7 w-16 rounded-lg border border-border bg-card px-2 text-xs text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
                title="Number of plots to add"
              />
              <span className="text-[11px] text-muted-foreground">plots</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBulkAdd}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary hover:border-border transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add {parseInt(bulkCount, 10) > 1 ? `${parseInt(bulkCount, 10)} plots` : "plot"}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {rows.length > 0 ? `${rows.length} plot${rows.length === 1 ? "" : "s"} in grid` : "No plots yet — add some above"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-lg border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
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
                      widthFt: r.irregular ? undefined : parseDimension(r.widthFt) || undefined,
                      lengthFt: r.irregular ? undefined : parseDimension(r.lengthFt) || undefined,
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

      </div>

      <p className="text-[10px] text-muted-foreground text-right">Prepared {istDay(new Date())} (IST).</p>
    </Modal>
  );
}
