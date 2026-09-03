"use client";

// Plot Inventory table and state actions — DESIGN.md §7.
// Actions are hidden by permission for clarity; the server re-checks every one.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronsUpDown, Plus, X, Trash2, Pencil, Lock, Pause, Calendar, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { PersonLink } from "@/components/person-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import type { SoldByType } from "@prisma/client";
import { PersonPicker, personLabel } from "@/components/person-picker";
// ponytail: the two dialogs are imported from the Bookings screen's own module,
// so /plots ships that module too. Pull them into their own file if the
// inventory bundle starts to matter.
import {
  BookingFormDialog,
  DeliverDialog,
  PaymentPercentInput,
  ReviewDialog,
  type BookableView,
  type BookingRowView,
  type MemberView,
  type PersonView,
} from "@/app/bookings/bookings-client";
import {
  confirmPaymentReceivedAction,
  decideBookingRequestAction,
  loadBookingDetail,
  recordCompletionAction,
  recordFinalBuyersAction,
  submitBookingRequestAction,
  type BookingDetail,
} from "@/app/bookings/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatIst,
  formatIstDate,
  formatPercent,
  formatDimension,
  formatPlotSize,
  formatQuantity,
  istDay,
  remainingPercent,
  type StaffRole,
} from "@/lib/tasks";
// The grid computes Area and Location Charge live from the same domain rules
// the server runs on save, which is the only way the two cannot disagree. It
// costs decimal.js in the client bundle (~30 kB). Recomputing in float here
// would be smaller and wrong, so the size is the right trade.
import {
  buildPlcSnapshot,
  calculateAreas,
  displayStatus,
  locationChargeLabel,
  plcDisplayComponents,
  type PlotStatus,
  type ProjectStatus,
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
  requestExtensionAction,
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
  status: string;
  /** Most recent HOLD_CREATED reasons on this Plot, newest first. */
  pastHolds: Array<{ at: string; actorRef: string; reason: string | null }>;
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
    /** What the charge is for, already shortened for display. */
    components: Array<{ label: string; evidence: string }>;
  } | null;
  plcIssue: string | null;
  hold: {
    id: string;
    heldForName: string;
    heldForPersonId: string;
    expiresAt: string;
    extensionCount: number;
    pendingExtension: boolean;
    pendingExtensionId: string | null;
    pendingExtensionReason: string | null;
    extensions: Array<{
      at: string;
      byRef: string;
      reason: string;
      hours: number;
      status: string;
      decidedByRef: string | null;
      decisionNote: string | null;
    }>;
    /** Frozen behind a Booking Request — the timer is not running (PRD §10.5). */
    frozen: boolean;
  } | null;
};

export type HoldRequestView = {
  id: string;
  project: string;
  plot: string;
  plotStatus: string;
  buyer: string;
  buyerPersonId: string;
  member: string;
  memberPersonId: string;
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

export type ProjectView = {
  id: string;
  name: string;
  city?: string | null;
  location?: string | null;
  status: string;
  /** The configured bands, so the grid derives the same PLC the server will. */
  plcComponents: Array<{ category: string; threshold: string | null; percent: string; remark?: string | null }>;
};

function projectFullLabel(p: { name: string; city?: string | null; location?: string | null }): string {
  const loc = [p.location, p.city].filter(Boolean).join(", ");
  return loc ? `${p.name} — ${loc}` : p.name;
}

const STATUS_LABEL: Record<string, string> = {
  NOT_AVAILABLE: "Not Available",
  AVAILABLE: "Available",
  HOLD: "Hold",
  WAITING_FOR_BOOKING_APPROVAL: "Waiting Approval",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  REFUND_PENDING: "Refund Pending",
  DELIVERED: "Delivered",
};

/**
 * The order the status groups read in when the Action column is grouped.
 *
 * Lifecycle order, with what can still be sold first: a list grouped by what
 * can be done to a row should open on the rows something can be done to, not
 * on the ones that are finished or were never for sale. A status missing from
 * this list sorts to the end rather than disappearing.
 */
const STATUS_GROUP_ORDER = [
  "AVAILABLE",
  "HOLD",
  "WAITING_FOR_BOOKING_APPROVAL",
  "BOOKED",
  "PAYMENT_COMPLETED",
  "DELIVERED",
  "REFUND_PENDING",
  "NOT_AVAILABLE",
];

const statusRank = (status: string) => {
  const at = STATUS_GROUP_ORDER.indexOf(status);
  return at === -1 ? STATUS_GROUP_ORDER.length : at;
};

/**
 * The row's own buttons. `sm` (h-8, text-xs) reads as a footnote next to the
 * data; the default (h-10) is a page-level button and makes every row as tall
 * as itself. This sits between the two — one class, so the four of them cannot
 * drift apart.
 */
/**
 * Why this Plot is in this state, for the status badge to carry on hover.
 *
 * The row shows what the state is; the reason lives on the Plot's page. This is
 * the middle ground — the answer without the trip, on the word that raised the
 * question. A native title rather than a tooltip component: it needs no script,
 * and a screen reader reads it out where a styled div would not.
 */
function statusReason(plot: PlotRowView, because: string | null): string | null {
  const parts: string[] = [];

  if (because) parts.push(because);

  if (plot.hold) {
    parts.push(`Held for ${plot.hold.heldForName}`);
    parts.push(
      plot.hold.frozen
        ? "Timer frozen — a Booking Request is under review"
        : `Expires ${formatIst(plot.hold.expiresAt)}`
    );
    if (plot.hold.extensionCount > 0) {
      parts.push(`${plot.hold.extensionCount} extension(s) so far`);
    }
    // The newest HOLD_CREATED reason on this Plot is this Hold's own.
    const held = plot.pastHolds.find((h) => h.reason?.trim());
    if (held?.reason) parts.push(`Reason: ${held.reason}`);
  }

  if (plot.restriction === "NOT_YET_RELEASED") {
    parts.push("Not yet released — prepared but never made Available");
  } else if (plot.restriction !== "NONE") {
    const label = RESTRICTION_REASON_LABEL[plot.restriction] ?? plot.restriction;
    parts.push(plot.restrictionReason ? `${label}: ${plot.restrictionReason}` : label);
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

const RESTRICTION_REASON_LABEL: Record<string, string> = {
  // The same word the Projects screen and the Change restriction dialog use.
  NOT_YET_RELEASED: "Unreleased",
  NOT_FOR_SALE: "Not for Sale",
  PLEDGE: "Pledge",
};

/**
 * Why a Plot is restricted, for the tooltip on its badge. Not for Sale and
 * Pledge carry a compulsory reason somebody typed; Unreleased is not a decision
 * anybody made about this Plot, so it explains itself.
 */
const restrictionWhy = (plot: PlotRowView): string =>
  plot.restriction === "NOT_YET_RELEASED"
    ? "Prepared but never made Available."
    : (plot.restrictionReason ?? "No reason recorded.");

const EXTENSION_STATUS_LABEL: Record<string, string> = {
  PENDING: "waiting approval",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// One width for every row action, so two buttons on a row are the same
// button twice over rather than one wider than the other. Longer labels
// still grow past it.
/*
 * The action column is one fixed box on every row, and whatever is in it
 * divides that box evenly. One button fills the whole width; two take half
 * each with the gap between them. So a row with Cancel and Book ends exactly
 * where a row with Make Available ends, and the column has one edge instead of
 * one per row. Width lives here and nowhere else.
 */
const rowActions = "flex w-28 items-center gap-1.5";
const rowButton = "h-7 flex-1 basis-0 px-1.5 text-[11px]";

// Status is a column, so its pills are one width — a ragged edge that changes
// shape with the length of the word inside it is not a column. "Waiting
// Approval" is four times the length of "Hold", so the long one wraps inside
// the same pill instead of stretching it and dragging the whole column out
// with it. Every screen says Waiting Approval — a Plot, a Booking Request and
// an Acquisition are all waiting on the same kind of decision.
const statusBadge = "w-[7.5rem] justify-center whitespace-normal text-center leading-tight";

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

  // Square feet is the number that gets saved, so the preview shows all of it.
  // The conversions under it are rounded to two — they are read, not entered.
  const show = (d: { toString(): string }) => formatQuantity(d.toString());
  const conv = (d: { toDecimalPlaces(n: number): { toString(): string } }) =>
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
    ? { areaSqFt: show(areas.areaSqFt), areaSqYd: conv(areas.areaSqYd), areaSqM: conv(areas.areaSqM) }
    : { areaSqFt: "—", areaSqYd: "—", areaSqM: "—" };

  if (components.length === 0) {
    return { ...measured, plc: "—", issue: "No published PLC version" };
  }

  // A Road whose width has not been typed yet is unfinished, not wrong. The
  // snapshot refuses it — correctly, because a band cannot be decided without a
  // width — but showing that refusal the instant Custom is picked scolds the
  // operator for not having typed something they are about to type. Save still
  // validates: prepareInventory builds the same snapshot on the server.
  if (boundaries.some((b) => b.kind === "ROAD" && !String(b.roadWidthFt ?? "").trim())) {
    return { ...measured, plc: "—", issue: null };
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
          : `${boundary.side.toLowerCase()} side reference`
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
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-foreground bg-secondary border border-border select-none"
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
          {/* Two lines, never three: a Custom road puts its width beside the
              PLC select rather than under it, so choosing Custom does not make
              this side taller than the three next to it. */}
          {isRoad && hasPreconfiguredRoads ? (
            <div className="flex items-center gap-1 min-w-0">
              <select
                className="h-7 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
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
                <option value="custom">Custom</option>
                {roads.map((r, ri) => {
                  const pct = r.percent.includes(".") ? r.percent.replace(/0+$/, "").replace(/\.$/, "") : r.percent;
                  const nameStr = r.remark ? `${r.remark} (${r.threshold}ft, ${pct}%)` : `Road ${r.threshold}ft (${pct}%)`;
                  return <option key={ri} value={`${r.threshold}|${r.remark || ""}`}>{nameStr}</option>;
                })}
              </select>
              {isCustomRoad && (
                <input
                  className="h-7 w-14 shrink-0 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                  inputMode="decimal"
                  placeholder="ft"
                  aria-label={`${boundary.side.toLowerCase()} road width in feet`}
                  value={boundary.roadWidthFt ?? ""}
                  onChange={(e) => onChange({ roadWidthFt: e.target.value })}
                />
              )}
            </div>
          ) : (
            <input
              className="h-7 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              inputMode={isRoad ? "decimal" : undefined}
              placeholder={isRoad ? "Width ft" : detailLabel}
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
      {hasPreconfiguredRoads ? (
        <div className="flex w-full items-center gap-1 min-w-0">
          {roadSelect}
          {isCustomRoad && React.cloneElement(detailInput, { id: `${boundary.side}-detail`, className: "h-8 w-16 shrink-0 rounded-lg border border-input bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" })}
        </div>
      ) : (
        React.cloneElement(detailInput, { id: `${boundary.side}-detail` })
      )}
    </div>
  );
}

/**
 * What this Plot was held for before, beside the field asking why it is being
 * held now. A Plot held and let go three times is worth knowing about before
 * holding it a fourth, and the reason was already being recorded — it just had
 * nowhere to be read.
 */
function PastHolds({ rows }: { rows: PlotRowView["pastHolds"] }) {
  const withReason = rows.filter((r) => r.reason?.trim());
  if (withReason.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-secondary px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">Held before on this Plot</p>
      <ul className="mt-1 space-y-0.5">
        {withReason.map((r, i) => (
          <li key={i} className="text-[11px] text-foreground">
            <span className="text-muted-foreground">
              {formatIst(r.at)} · {r.actorRef} ·{" "}
            </span>
            {r.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Why this Hold exists and why it has been extended before, beside the field
 * asking for one more reason.
 *
 * A further extension is Admin's decision (PRD §8.5), and deciding it against
 * nothing is deciding it blind. Every reason here was already being recorded —
 * on the Hold's own PlotEvent and on each HoldExtensionRequest — with nowhere
 * to be read at the moment it mattered.
 */
function HoldHistory({ plot }: { plot: PlotRowView }) {
  const extensions = plot.hold?.extensions ?? [];
  // The newest HOLD_CREATED event on this Plot is this Hold's own reason.
  const held = plot.pastHolds.find((h) => h.reason?.trim());
  if (extensions.length === 0 && !held) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-secondary px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">This Hold so far</p>
      <ul className="mt-1 space-y-1">
        {extensions.map((e, i) => (
          <li key={i} className="text-[11px] text-foreground">
            <span className="text-muted-foreground">
              {formatIst(e.at)} · {e.byRef} · +{e.hours}h ·{" "}
              {EXTENSION_STATUS_LABEL[e.status] ?? e.status} ·{" "}
            </span>
            {e.reason}
            {e.decisionNote && (
              <span className="block text-muted-foreground">
                {e.decidedByRef}: {e.decisionNote}
              </span>
            )}
          </li>
        ))}
        {held && (
          <li className="text-[11px] text-foreground">
            <span className="text-muted-foreground">
              {formatIst(held.at)} · {held.actorRef} · held ·{" "}
            </span>
            {held.reason}
          </li>
        )}
      </ul>
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

function statusVariant(status: string) {
  if (status === "AVAILABLE") return "success" as const;
  if (status === "PAYMENT_COMPLETED") return "purple" as const;
  if (status === "HOLD") return "warning" as const;
  if (status === "NOT_AVAILABLE") return "outline" as const;
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
  members,
  bookable,
  pendingBookings,
  bookedBookings,
  completedBookings,
  staffRef,
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
  people: PersonView[];
  /** Active Members only — the Hold By list, and the Booking form's Sold By. */
  members: MemberView[];
  bookable: BookableView[];
  /** The one pending request per Plot waiting for approval, keyed by Plot id. */
  pendingBookings: Record<string, BookingRowView>;
  /** The one live Booking per Booked Plot, keyed by Plot id. */
  bookedBookings: Record<string, BookingRowView>;
  /** Paid in full and waiting on Allotment or Registry, keyed by Plot id. */
  completedBookings: Record<string, BookingRowView>;
  staffRef: string;
  permissions: {
    makeAvailable: boolean;
    hold: boolean;
    extend: boolean;
    decideExtension: boolean;
    setup: boolean;
    reviewRequests: boolean;
    book: boolean;
    decideBooking: boolean;
    confirmPayment: boolean;
    recordFinalBuyers: boolean;
    recordCompletion: boolean;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [projectFilter, setProjectFilter] = React.useState(initialProject);
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  // The Action column groups the rows by the status that decides their
  // buttons. Off by default, because the plain list is plot order and that is
  // how inventory is read out on site.
  const [grouped, setGrouped] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // "" until picked, "NEW" for a buyer typed on the form.
  const [holdPerson, setHoldPerson] = React.useState("");
  // Who got the Hold done, in the Booking form's own three answers. The 3%
  // Club is the default because it is what "the company closed it" means.
  const [holdSourceType, setHoldSourceType] =
    React.useState<SoldByType>("THREE_PERCENT_CLUB");
  const [holdSourcePerson, setHoldSourcePerson] = React.useState("");
  const [dialog, setDialog] = React.useState<
    | { kind: "HOLD"; plot: PlotRowView }
    | { kind: "AVAILABLE"; plot: PlotRowView }
    | { kind: "CANCEL_HOLD"; plot: PlotRowView }
    | { kind: "EXTEND"; plot: PlotRowView }
    | { kind: "DECIDE_REQUEST"; request: HoldRequestView; approve: boolean }
    | { kind: "DECIDE_EXTENSION"; plot: PlotRowView; approve: boolean }
    | { kind: "BOOK"; plot: PlotRowView }
    | { kind: "REVIEW"; row: BookingRowView }
    | { kind: "PAY"; plot: PlotRowView; row: BookingRowView }
    | { kind: "DELIVER"; row: BookingRowView }
    | null
  >(null);

  // The Booking behind a row — its submitted snapshot for a review, its parties
  // for final buyers. Too much to ship with every inventory row, so it is
  // fetched when one Booking is actually opened.
  const [bookingDetail, setBookingDetail] = React.useState<BookingDetail | null>(null);

  /** Members are Active by construction here, so this is the whole test. */
  const activeMemberPersonIds = React.useMemo(
    () => new Set(members.map((m) => m.personId)),
    [members]
  );
  // A Plot can read as Available and still not be bookable — a restriction, or
  // a Project not yet active. The form is built from `bookable`, so the button
  // only offers what the form can actually open on.
  const bookablePlotIds = React.useMemo(() => new Set(bookable.map((p) => p.id)), [bookable]);
  const customerOptions = React.useMemo(
    () =>
      people
        .filter((p) => p.customerId)
        .map((p) => ({ id: p.id, label: personLabel(p) })),
    [people]
  );

  const visible = rows.filter(
    (r) =>
      (projectFilter === "ALL" || r.projectId === projectFilter) &&
      (statusFilter === "ALL" || r.status === statusFilter) &&
      (search.trim() === "" ||
        `${r.plotNumber} ${r.project} ${r.hold?.heldForName ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

  /**
   * The status a row actually shows, which is not always the Plot's own — the
   * Plots of a Project that is not live show as Not Available. The grouping
   * follows what is on the screen, so one function answers for the row and for
   * the group it lands in.
   */
  const shownFor = (plot: PlotRowView) =>
    displayStatus(
      plot.status as PlotStatus,
      projects.find((p) => p.id === plot.projectId)?.status as ProjectStatus | undefined
    );

  // Grouped: every row that takes the same action sits with its own kind. The
  // sort is stable, so plot order survives inside a group and the ungrouped
  // list is left exactly as it was.
  const ordered = grouped
    ? [...visible].sort((a, b) => statusRank(shownFor(a).status) - statusRank(shownFor(b).status))
    : visible;

  const groupCounts = new Map<string, number>();
  for (const plot of ordered) {
    const status = shownFor(plot).status;
    groupCounts.set(status, (groupCounts.get(status) ?? 0) + 1);
  }

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
          </div>
          {permissions.setup && (
            <Button size="sm" variant="gradient" asChild>
              <Link href="/plots/prepare">
                <Plus className="mr-1 h-4 w-4" /> Prepare Inventory
              </Link>
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
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
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
              <p className="text-xs font-medium text-foreground">
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
                      {r.project} · <span className="text-primary">{r.plot}</span>
                      <Badge variant="outline" className="ml-2">
                        Queue #{r.queuePosition}
                      </Badge>
                    </p>
                    <p className="font-medium text-foreground">
                      For <PersonLink personId={r.buyerPersonId} name={r.buyer} /> · requested by{" "}
                      <PersonLink personId={r.memberPersonId} name={r.member} as="member" />
                    </p>
                    <p className="font-medium text-foreground">
                      Submitted {formatIst(r.createdAt)} · expires {formatIst(r.expiresAt)}
                      {r.plotStatus !== "AVAILABLE"
                        ? ` · Plot is now ${STATUS_LABEL[r.plotStatus] ?? r.plotStatus}`
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
            <p className="mt-1 text-xs font-medium text-foreground">
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
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-foreground">
                <tr>
                  <th className="px-3 py-1">Plot</th>
                  <th className="w-[9.5rem] px-3 py-1 text-center">Size (W × L)</th>
                  <th className="px-3 py-1 text-center">Area</th>
                  <th className="px-3 py-1 text-center">Status</th>
                  <th className="px-3 py-1 text-center">Location</th>
                  <th className="w-[5rem] px-3 py-1 text-center">PLC</th>
                  {/* Clicking the column groups the rows by the status that
                      decides their buttons — every Available together, every
                      Hold together — because a list read for what to do next
                      is read one action at a time. Clicking again returns to
                      plot order. It orders what is on the screen; the filters
                      above still decide what is on it. */}
                  <th className="px-3 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => setGrouped((on) => !on)}
                      aria-pressed={grouped}
                      title={grouped ? "Back to plot order" : "Group rows by status"}
                      className={`mx-auto inline-flex items-center gap-1 uppercase tracking-wide hover:text-primary ${
                        grouped ? "text-primary" : ""
                      }`}
                    >
                      Action
                      <ChevronsUpDown className="h-3 w-3" aria-hidden />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((plot, index) => {
                  // What a held Plot can have done to it, in the order it would
                  // be wanted. `ends` is what makes the item read as the one
                  // that stops something, wherever it lands in the list.
                  const holdActions: Array<{ label: string; ends?: boolean; run: () => void }> =
                    plot.status !== "HOLD" || !plot.hold
                      ? []
                      : [
                          ...(permissions.extend && !plot.hold.pendingExtension
                            ? [
                                {
                                  label: "Extend Hold",
                                  run: () => setDialog({ kind: "EXTEND", plot }),
                                },
                              ]
                            : []),
                          // PRD §8.5 — a further extension is Admin's decision,
                          // and reviewing it never pauses the Hold expiry.
                          ...(plot.hold.pendingExtension && permissions.decideExtension
                            ? [
                                {
                                  label: "Approve extension",
                                  run: () =>
                                    setDialog({ kind: "DECIDE_EXTENSION", plot, approve: true }),
                                },
                                {
                                  label: "Reject extension",
                                  ends: true,
                                  run: () =>
                                    setDialog({ kind: "DECIDE_EXTENSION", plot, approve: false }),
                                },
                              ]
                            : []),
                          ...(permissions.hold
                            ? [
                                {
                                  label: "Cancel Hold",
                                  ends: true,
                                  run: () => setDialog({ kind: "CANCEL_HOLD", plot }),
                                },
                              ]
                            : []),
                        ];

                  // The row payload carries these as plain strings; the values
                  // are Prisma enums either way, so this is the boundary cast
                  // rather than a widening.
                  const shown = shownFor(plot);
                  const why = statusReason(plot, shown.because);
                  // Only the first row of a group carries the heading, and only
                  // while the rows are grouped at all.
                  const opensGroup =
                    grouped &&
                    (index === 0 || shownFor(ordered[index - 1]).status !== shown.status);
                  const groupCount = groupCounts.get(shown.status) ?? 0;
                  return (
                  <React.Fragment key={plot.id}>
                  {opensGroup && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {STATUS_LABEL[shown.status] ?? shown.status}
                        <span className="ml-1.5 font-medium normal-case">
                          {groupCount} {groupCount === 1 ? "plot" : "plots"}
                        </span>
                      </td>
                    </tr>
                  )}
                  {/* A 1px outline and no fill: the row is a card in outline
                      only. A table in border-separate paints no border on the
                      <tr>, so the cells paint it — border-y across the row, and
                      the two end cells close it off. */}
                  <tr
                    // One vertical alignment for the whole row. Status, PLC and
                    // the action were centred while Plot, Size, Area and
                    // Location hung from the top, so every column started on a
                    // different line.
                    className="h-14 rounded-xl align-middle [&>td]:border-y [&>td]:border-border"
                  >
                    {/* The Plot is the subject; the Project and type are what
                        it belongs to, so they read under it rather than as a
                        column repeating one name down the whole list. */}
                    <td className="rounded-l-xl border-l border-border px-3 py-2">
                      <Link
                        href={`/plots/${plot.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {plot.plotNumber}
                      </Link>
                      <span className="block text-[11px] font-medium text-foreground">
                        {plot.project}
                        {/* The Project names the Plot; its type only classifies
                            it, and one word repeated down the whole column does
                            not need the same weight. */}
                        <span className="text-muted-foreground">
                          {" · "}
                          {PLOT_TYPE_LABEL[plot.plotType] ?? plot.plotType}
                        </span>
                      </span>
                    </td>
                    {/* The sides the Plot is measured by. An irregular Plot has
                        none — it carries an exact area instead, which the next
                        column already shows. */}
                    <td className="px-3 py-2 text-center tabular-nums">
                      {formatPlotSize(plot.widthFt, plot.lengthFt) ? (
                        // Width, the cross, length — three columns, not one
                        // string. A side that carries inches is wider than one
                        // that does not, so centring the whole size walks the
                        // × left and right down the column and grows the column
                        // to fit the longest row. Pinning the cross to the
                        // middle lines every row up on it and leaves the column
                        // one width.
                        <span className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-1.5 whitespace-nowrap font-semibold text-foreground">
                          <span className="text-right">{formatDimension(plot.widthFt)}</span>
                          <span className="text-muted-foreground">×</span>
                          <span className="text-left">{formatDimension(plot.lengthFt)}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-foreground">Irregular</span>
                      )}
                    </td>
                    {/* Area is what a Plot is bought by, so it carries weight.
                        Square metres are dropped: nobody quotes a plot in them
                        here, and the Plot's own page still has all three. */}
                    <td className="px-3 py-2 text-center tabular-nums">
                      {/* Both figures are quoted, so both are read at the same
                          size. Only the unit steps back. */}
                      <span className="block font-semibold text-foreground">
                        {formatQuantity(plot.areaSqFt)}
                        <span className="ml-1 text-[11px] font-medium text-foreground">
                          sq ft
                        </span>
                      </span>
                      <span className="block font-semibold text-foreground">
                        {formatQuantity(plot.areaSqYd)}
                        <span className="ml-1 text-[11px] font-medium text-foreground">
                          sq yd
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {/* One pill, not two. A restricted Plot is Not Available
                          by rule — plotReturnState keeps it there — so "Not
                          Available · Not for Sale" said the same thing twice
                          and buried the half that explains it. The restriction
                          takes the pill and the status is what it implies; the
                          reason is on hover. A Plot that is allocated keeps its
                          own status, because a Hold is not something a
                          restriction may hide.

                          Unreleased is a stage, Not for Sale and Pledge are
                          decisions that stop a sale — so only those two carry
                          the weight of the destructive tone. */}
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {plot.restriction !== "NONE" && shown.status === "NOT_AVAILABLE" ? (
                          <Badge
                            variant={
                              plot.restriction === "NOT_YET_RELEASED" ? "outline" : "destructive"
                            }
                            title={restrictionWhy(plot)}
                            className={`${statusBadge} cursor-help decoration-dotted underline-offset-4 hover:underline`}
                          >
                            {RESTRICTION_REASON_LABEL[plot.restriction] ?? plot.restriction}
                          </Badge>
                        ) : (
                          <Badge
                            variant={statusVariant(shown.status)}
                            title={why ?? undefined}
                            className={`${statusBadge} ${
                              why ? "cursor-help decoration-dotted underline-offset-4 hover:underline" : ""
                            }`}
                          >
                            {STATUS_LABEL[shown.status] ?? shown.status}
                          </Badge>
                        )}
                        {plot.isResale && (
                          <Badge variant="outline" className={statusBadge}>
                            RESALE
                          </Badge>
                        )}
                      </div>
                      {shown.because && (
                        <span className="mt-1 block text-[11px] font-medium text-foreground">
                          {shown.because}
                        </span>
                      )}
                      {plot.hold && (
                        <span className="mt-1 block text-[11px] font-medium text-foreground">
                          {plot.hold.frozen
                            ? "Hold timer frozen — Booking Request under review"
                            : `Expires ${formatIstDate(plot.hold.expiresAt)}`}
                        </span>
                      )}
                    </td>
                    {/* What the charge is for, not what it comes to. The
                        percentage is on the Plot's own page — a column of them
                        compares nothing useful, while "corner, park facing" is
                        what a Plot is picked by. This column takes the width the
                        action buttons were leaving empty.

                        plcIssue stays: that is not a detail, it is the reason
                        there is no charge at all. */}
                    <td className="px-3 py-2 text-center text-xs">
                      {plot.plc ? (
                        // One of the thirty names a position can have, not a
                        // phrase assembled per row: the column is read down.
                        // Every line is a name from the same catalogue — PARK
                        // FACING is not a footnote to NORTH-WEST CORNER, so it
                        // is not set smaller than it.
                        locationChargeLabel(plot.boundaries as Boundary[]).map((line) => (
                          <span key={line} className="block font-semibold text-foreground">
                            {line}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-amber-800">{plot.plcIssue}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-semibold tabular-nums">
                      {plot.plc ? `${Number(plot.plc.totalPercent).toFixed(2)}%` : "—"}
                    </td>
                    <td className="w-px whitespace-nowrap rounded-r-xl border-r border-border py-2 pl-3 pr-2">
                      {/* The thing to do to this Plot now, on the row — or a
                          menu, once there is more than one — and then Book.
                          Both solid: the row offers two things and neither is
                          the lesser one. What ends something still reads as
                          such — Cancel Hold is red inside the menu. */}
                      <div className={rowActions}>
                        {plot.status === "NOT_AVAILABLE" && permissions.makeAvailable && (
                          <Button className={rowButton} onClick={() => setDialog({ kind: "AVAILABLE", plot })}>
                            Make Available
                          </Button>
                        )}

                        {/* One other action, so no menu: a menu wrapping a
                            single item is worse than the item. */}
                        {plot.status === "AVAILABLE" && permissions.hold && (
                          <Button
                            className={rowButton}
                            onClick={() => {
                              setHoldPerson("");
                              setDialog({ kind: "HOLD", plot });
                            }}
                          >
                            Hold
                          </Button>
                        )}

                        {plot.status === "HOLD" && plot.hold && holdActions.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              {/* Named, not three dots. The Available row
                                  shows what it can do; a bare ··· made the
                                  held row the one place you had to open
                                  something to find out. */}
                              <Button className={rowButton}>Cancel</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {holdActions.map((action) => (
                                <DropdownMenuItem
                                  key={action.label}
                                  onSelect={action.run}
                                  className={action.ends ? "text-red-700 focus:text-red-700" : ""}
                                >
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        {/* Waiting on Accounts: the decision belongs on the row
                            that is blocked by it, not one screen away. */}
                        {plot.status === "WAITING_FOR_BOOKING_APPROVAL" &&
                          permissions.decideBooking &&
                          pendingBookings[plot.id] && (
                            <Button
                              className={rowButton}
                              onClick={() => {
                                const row = pendingBookings[plot.id];
                                setBookingDetail(null);
                                setDialog({ kind: "REVIEW", row });
                                loadBookingDetail(row.id).then(setBookingDetail);
                              }}
                            >
                              Review
                            </Button>
                          )}

                        {/* A Booked Plot is still taking payment, and the row is
                            where anyone reading inventory sees that. Fully paid
                            has no button — the gate is what remains, not the
                            status, because a correction can step the total back
                            below 100. */}
                        {plot.status === "BOOKED" &&
                          permissions.confirmPayment &&
                          bookedBookings[plot.id] &&
                          Number(remainingPercent(bookedBookings[plot.id].paymentReceivedPercent)) > 0 && (
                            <Button
                              className={rowButton}
                              onClick={() =>
                                setDialog({ kind: "PAY", plot, row: bookedBookings[plot.id] })
                              }
                            >
                              Payment
                            </Button>
                          )}

                        {/* Paid in full. One thing is left — the legal end of
                            the sale — and the dialog asks for both halves of
                            it: who the papers go to, and the route that
                            transfers them. */}
                        {plot.status === "PAYMENT_COMPLETED" &&
                          completedBookings[plot.id] &&
                          permissions.recordFinalBuyers &&
                          permissions.recordCompletion && (
                            <Button
                              className={rowButton}
                              onClick={() => {
                                const row = completedBookings[plot.id];
                                setBookingDetail(null);
                                setDialog({ kind: "DELIVER", row });
                                loadBookingDetail(row.id).then(setBookingDetail);
                              }}
                            >
                              Deliver
                            </Button>
                          )}

                        {/* A Booking may start from an Available Plot or from a
                            Hold — submitBookingRequest takes holdId as optional
                            and falls back to canAllocate. The form opens here:
                            every row has this button, so the Plot it starts on
                            is the row that was clicked, and it stays changeable
                            inside the form. */}
                        {permissions.book && bookablePlotIds.has(plot.id) && (
                          <Button
                            className={`${rowButton} bg-[hsl(var(--accent-book))] text-white hover:bg-[hsl(var(--accent-book))]/90`}
                            onClick={() => setDialog({ kind: "BOOK", plot })}
                          >
                            Book
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  </React.Fragment>
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
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <>
              <Field label="Customer">
                {/* Customers only, because placing the Hold is what makes one:
                    a walk-in typed here is issued a Customer ID by the same
                    match-or-create the Enquiry form uses. */}
                <PersonPicker
                  required
                  value={holdPerson}
                  onChange={setHoldPerson}
                  newOptionLabel="+ New Customer — enter name and mobile"
                  placeholder="Search by Customer ID, name or mobile"
                  options={customerOptions}
                />
              </Field>
              {holdPerson === "NEW" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input name="fullName" placeholder="Full name" required />
                  <Input name="mobile" placeholder="Mobile" inputMode="numeric" required />
                </div>
              )}

              {/* Two questions, in the order they are asked on the phone: who
                  it is for, and who got it done — the Booking form's Sold By,
                  asked here so the credit is on the record from the Hold. Kind
                  and name share one row, so choosing Member does not push a
                  second field into the form. */}
              <Field label="Hold By">
                <div className="flex gap-2">
                  <select
                    className={`${inputClass} w-36 shrink-0`}
                    value={holdSourceType}
                    onChange={(e) => {
                      setHoldSourceType(e.target.value as SoldByType);
                      setHoldSourcePerson("");
                    }}
                  >
                    <option value="THREE_PERCENT_CLUB">3% Club</option>
                    <option value="MEMBER">Member</option>
                    <option value="CUSTOMER">Customer</option>
                  </select>
                  {holdSourceType !== "THREE_PERCENT_CLUB" && (
                    <PersonPicker
                      className="flex-1"
                      required
                      value={holdSourcePerson}
                      onChange={setHoldSourcePerson}
                      placeholder={
                        holdSourceType === "MEMBER"
                          ? "Search by Member ID or name"
                          : "Search by Customer ID, name or mobile"
                      }
                      // Only what the choice beside it says. `members` is
                      // Active Members by construction, and an Active Member is
                      // kept out of the Customer list because the credit would
                      // have to be recorded as Member anyway (PRD §6.7).
                      options={
                        holdSourceType === "MEMBER"
                          ? members.map((m) => ({
                              id: m.personId,
                              label: `${m.memberId} · ${m.fullName}`,
                            }))
                          : customerOptions.filter((o) => !activeMemberPersonIds.has(o.id))
                      }
                    />
                  )}
                </div>
              </Field>

              <PastHolds rows={dialog.plot.pastHolds} />
            </>
          }
          onSubmit={(f) =>
            run(() =>
              createHoldAction(
                dialog.plot.id,
                holdPerson === "NEW" ? "" : holdPerson,
                newKey(),
                holdPerson === "NEW"
                  ? {
                      fullName: String(f.get("fullName") ?? ""),
                      mobile: String(f.get("mobile") ?? ""),
                    }
                  : null,
                {
                  type: holdSourceType,
                  personId:
                    holdSourceType === "THREE_PERCENT_CLUB" ? null : holdSourcePerson,
                }
              )
            )
          }
        />
      )}

      {dialog?.kind === "BOOK" && (
        <BookingFormDialog
          title="Start Booking Request"
          initialPlotId={dialog.plot.id}
          // Every row has its own Book button, so clicking one has already
          // chosen the Plot. Changing it inside the form would only ever be a
          // way to book something other than the row that was clicked.
          fixedPlot={{
            project: dialog.plot.project,
            plot: `${dialog.plot.plotType.replaceAll("_", " ")} ${dialog.plot.plotNumber}`,
          }}
          bookable={bookable}
          people={people}
          members={members}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(form) => run(() => submitBookingRequestAction(form, newKey()))}
        />
      )}

      {dialog?.kind === "REVIEW" && (
        <ReviewDialog
          row={dialog.row}
          detail={bookingDetail}
          selfRef={staffRef}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) =>
            run(() =>
              decideBookingRequestAction({ ...input, bookingId: dialog.row.id }, newKey())
            )
          }
        />
      )}

      {dialog?.kind === "DELIVER" && (
        <DeliverDialog
          row={dialog.row}
          detail={bookingDetail}
          people={people}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={({ buyers, completion }) =>
            run(async () => {
              // Two commands, in order, because they are two rules: the buyers
              // are recorded first and the route refuses to run without them.
              // Stopping on the first failure means a rejected route never
              // leaves half a delivery behind.
              const saved = await recordFinalBuyersAction(dialog.row.id, buyers, newKey());
              if (!saved.ok) return saved;
              return recordCompletionAction(dialog.row.id, completion, newKey());
            })
          }
        />
      )}

      {/* DESIGN §11.1 — the Payment Received form is these four fields and no
          others, and it is the same server action the Bookings screen calls.
          Confirming it here saves finding the Booking for a Plot you are
          already looking at. */}
      {dialog?.kind === "PAY" && (
        <ConfirmDialog
          title="Confirm Payment Received"
          plot={dialog.plot}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              confirmPaymentReceivedAction(
                {
                  bookingId: dialog.row.id,
                  percent: String(f.get("percent")),
                  paidOn: String(f.get("paidOn")),
                  reference: String(f.get("reference")),
                  remark: String(f.get("remark") ?? ""),
                },
                newKey()
              )
            )
          }
          fields={
            <>
              {/* Not max 100: 100 is the whole Booking, and this field is one
                  payment against what is left of it. A Booking already at 30%
                  can only take 70 more, and the server refuses the rest — the
                  field should say so before the form is sent. */}
              <Field label={`Payment Received This Time (%) — ${remainingPercent(dialog.row.paymentReceivedPercent)}% remaining`}>
                <PaymentPercentInput max={remainingPercent(dialog.row.paymentReceivedPercent)} />
              </Field>
              <Field label="Payment Date">
                <Input
                  name="paidOn"
                  type="date"
                  defaultValue={istDay(new Date())}
                  max={istDay(new Date())}
                  required
                />
              </Field>
              <Field label="Payment Reference No.">
                <Input name="reference" required />
              </Field>
              <Field label="Remark">
                <Input name="remark" />
              </Field>
            </>
          }
        />
      )}

      {dialog?.kind === "AVAILABLE" && (
        <ConfirmDialog
          title="Make Available"
          plot={dialog.plot}
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
              <HoldHistory plot={dialog.plot} />
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
  consequence?: string;
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
        {consequence && <p className="mt-1 text-muted-foreground">{consequence}</p>}
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
  status: string;
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
  const locked = !["AVAILABLE", "NOT_AVAILABLE"].includes(plot.status);

  return (
    <Modal title={`Edit Plot Details — ${plot.plotNumber}`} onClose={onClose}>
      {/* Modal spaces its children by 16px. Every block here was a child, so
          seven gaps cost more height than any single control on the form. One
          wrapper makes them one child, spaced by this. */}
      <div className="space-y-2">
      {locked && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          This Plot is {STATUS_LABEL[plot.status] ?? plot.status}. The
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
/**
 * Preparing inventory is a data-entry session, not a question. Twenty rows of
 * plot number, dimensions and four boundaries each do not belong in a dialog
 * floating over the list they are about — so this renders the form and the page
 * around it supplies the chrome.
 */
/**
 * The Prepare Inventory tracks, named once so the sticky header and every row
 * cannot drift apart — a heading over the wrong field is worse than no heading.
 */
const PREPARE_GRID = "lg:grid-cols-[3.5rem_5rem_9rem_1fr_10.5rem_5rem_7rem_2rem]";

export function PrepareInventoryForm({
  projects,
  busy,
  onCancel,
  onSubmit,
}: {
  projects: ProjectView[];
  busy: boolean;
  onCancel: () => void;
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
    <div className="space-y-4">

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

      {/* ── Column header ──
          Sticky, because at row fifteen the question is which column this is. */}
      <div
        className={`sticky top-0 z-10 hidden border-b border-border bg-background/95 px-3 pb-1 pt-2 backdrop-blur-sm lg:grid ${PREPARE_GRID} lg:gap-3`}
      >
        {/* One label per control, in the same track, so a heading sits directly
            above the thing it names. Area, PLC and Irregular used to share the
            last track under one heading and carried their own inline labels
            instead — three names floating in a wide gap. */}
        {["Sr No", "Plot No.", "Type", "Dimensions (W × L ft)", "Area", "PLC", "Irregular"].map(
          (h) => (
            <span key={h} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {h}
            </span>
          )
        )}
      </div>

      {/* ── Plot rows ──
          No inner scroll box. Capping these at 58vh was right inside a dialog
          and wrong on a page: it left the rows in a letterbox while the page
          behind it did not move, so twenty rows meant scrolling a window
          instead of reading a list. */}
      <div className="space-y-2">
        {rows.map((row, i) => {
          const preview = derivePreview(row, row.boundaries, project?.plcComponents ?? []);
          return (
          <div
              key={i}
              // Alternating ground: twenty identical cards are twenty places to
              // lose your line. The serial alone was not enough to hold it.
              // A stronger line than the hairline used elsewhere. This is a
              // data-entry grid, not chrome: the row edge has to be findable at
              // a glance when twenty of them are stacked.
              className={`overflow-hidden rounded-xl border-2 border-muted-foreground/20 transition-colors hover:border-primary/50 ${
                i % 2 === 0 ? "bg-card" : "bg-secondary/60"
              }`}
            >
              {/* ── Top line: plot details ── */}
              <div className={`grid grid-cols-1 ${PREPARE_GRID} gap-3 items-center px-3 py-2 border-b border-border`}>
                {/* Row serial */}
                <span className="hidden lg:flex items-center justify-center text-[11px] font-bold tabular-nums text-muted-foreground select-none bg-secondary rounded h-6 w-6 border border-border">
                  {i + 1}
                </span>

                {/* Plot No. */}
                <input
                  className="h-8 w-full rounded-lg border border-border bg-muted px-2 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:bg-card transition-colors"
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

                {/* Area — plain figures, no box: these are read, not pressed.
                    The number carries the weight, the unit stays quiet beside
                    it, and an unfilled row says nothing rather than 0.00. */}
                <div className="flex items-baseline gap-2 tabular-nums">
                  {[
                    { value: preview.areaSqFt, unit: "sq ft", title: "Area in Square Feet" },
                    { value: preview.areaSqYd, unit: "sq yd", title: "Area in Square Yards" },
                  ].map((area) => (
                    <span
                      key={area.unit}
                      title={area.title}
                      // The figure right-aligned against a unit of fixed width,
                      // so twenty rows of different digit counts still line up
                      // in two columns instead of drifting.
                      className="flex flex-1 items-baseline justify-end gap-1"
                    >
                      <span
                        className={`text-xs font-semibold ${
                          area.value === "—" ? "text-muted-foreground/60" : "text-foreground"
                        }`}
                      >
                        {area.value}
                      </span>
                      <span className="w-8 shrink-0 text-[10px] text-muted-foreground">{area.unit}</span>
                    </span>
                  ))}
                </div>

                {/* PLC */}
                <span className="tabular-nums text-xs font-bold text-foreground bg-secondary border border-border px-2 py-0.5 rounded text-center">
                  {preview.plc}
                </span>

                {/* Irregular */}
                <label
                  title="Irregular plot — type the area instead of width × length"
                  className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground has-[:checked]:border-primary/50 has-[:checked]:text-foreground"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
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
                  Irregular
                </label>

                {/* Remove — its own track, so nothing above it shifts when the
                    second row appears and it can be gone. */}
                {rows.length > 1 ? (
                  <button
                    type="button"
                    title="Remove this plot"
                    className="justify-self-center p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span aria-hidden className="hidden lg:block" />
                )}
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
            {/* The same pair every dialog in the app ends with: the way out on
                the left in outline, the commit on the right. The overrides that
                were here made Cancel a third kind of button. */}
            <Button type="button" variant="outline" size="sm" className="w-24" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-w-[8rem]"
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

      <p className="text-[10px] text-muted-foreground text-right">Prepared {istDay(new Date())}.</p>
    </div>
  );
}
