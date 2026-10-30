// Plot detail page — /plots/[plotId]
//
// Laid out as the Customer and Member profiles are (owner, 28 Oct 2026): Back
// and alert badges on the left of the top line, History · the one next step ·
// More on the right; a header card with Size (sides and area) and In the name of; Layout · PLC ·
// Completion side by side; then every deal on the Plot in one table. History
// opens from its button. Payment schedule and commission are the Booking
// page's — the Plot and its Bookings stay two pages, linked both ways.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Layers, MapPin, Percent } from "lucide-react";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Row } from "@/components/fact-row";
import { Section, Stat } from "@/components/record-section";
import { PersonLink } from "@/components/person-link";
import {
  canEditPlotDetails,
  canSetRestriction,
  displayStatus,
  humaniseRestriction,
  buildPlcSnapshot,
  isOpenSide,
  locationChargeLabel,
  shortSides,
} from "@/lib/domain/inventory";
import { DEAL_CANCELLED_MESSAGE } from "@/lib/domain/acquisition";
import { getPlot } from "@/lib/services/inventory-service";
import { listPendingHoldRequests } from "@/lib/services/hold-service";
import { plcRules } from "@/lib/services/plc-service";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { formatIst, formatIstDateTime, formatPlotSize, formatQuantity } from "@/lib/tasks";
import { newestFirst, type HistoryItem } from "@/lib/profile-history";
import { TYPE_LABEL } from "@/app/acquisitions/types";
import HistoryButton from "@/app/members/[id]/history-button";
import ShowMore from "@/app/members/[id]/show-more";
import PlotActions from "./plot-actions";
import HoldRequestDecision from "./hold-request-decision";

export const dynamic = "force-dynamic";

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

const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

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

/** Where a Booking stands, in the words the Booking screens use. */
const OUTCOME_LABEL: Record<string, string> = {
  REQUEST_PENDING: "Waiting Approval",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  DELIVERED: "Delivered",
  REQUEST_REJECTED: "Request rejected",
  REQUEST_CANCELLED: "Request cancelled",
  CANCELLED: "Cancelled",
  BUYBACK_COMPLETED: "Bought back",
  REFUND_PENDING: "Refund pending",
};

/** The Bookings that still hold the Plot. Anything else is a past deal. */
const LIVE_BOOKING = new Set([
  "REQUEST_PENDING",
  "BOOKED",
  "PAYMENT_COMPLETED",
  "REFUND_PENDING",
  "DELIVERED",
]);

const SIDES = ["NORTH", "EAST", "SOUTH", "WEST"] as const;

/** Make Available is green, as on Plot Inventory's rows (owner, 28 Oct 2026).
 *  Its own copy: a server page cannot read a value out of a "use client" file. */
const MAKE_AVAILABLE = "bg-emerald-600 text-white hover:bg-emerald-600/90";

function statusVariant(status: string) {
  if (status === "AVAILABLE") return "success" as const;
  if (status === "PAYMENT_COMPLETED") return "purple" as const;
  if (status === "HOLD") return "warning" as const;
  if (status === "NOT_AVAILABLE") return "outline" as const;
  return "info" as const;
}

/** PLOT_MADE_AVAILABLE — read as words, not as a constant. */
const humanise = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

const SUB = "block text-[11px] font-normal text-muted-foreground";
/** Every column centred under its heading, as on the Customer and Member pages. */
const CTH = "px-2 pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const CTD = "px-2 py-2.5 text-center align-middle";

/** ALT/GV/2026/021 may wrap after a slash in a narrow card, never mid-number. */
function slashBreaks(text: string) {
  return text.split("/").map((part, i, all) => (
    <span key={i}>
      {part}
      {i < all.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </span>
  ));
}

/** "Show N more" only when there are more; a short table is just the table. */
function MaybeMore({ count, children }: { count: number; children: React.ReactNode }) {
  return count > 0 ? <ShowMore count={count}>{children}</ShowMore> : <>{children}</>;
}

/**
 * The Plot at its own proportions, with what each side abuts. An open side is
 * the single emphasis, by weight rather than by a second colour.
 */
function PlotShape({
  plotNumber,
  widthFt,
  lengthFt,
  sides,
}: {
  plotNumber: string;
  widthFt: string;
  lengthFt: string;
  sides: Partial<Record<(typeof SIDES)[number], { label: string; open: boolean }>>;
}) {
  const w = Number(widthFt);
  const l = Number(lengthFt);
  if (!(w > 0) || !(l > 0)) return null;

  // East and West labels sit beside the shape, where the margin is all the room
  // they have. A long one ("Park / Playground · Central Park P-1") breaks at its
  // " · " and the margin widens to its longest line, so it stays in the card.
  // ponytail: ~7 units a character at 12px is an estimate, not a measurement.
  const CHAR = 7;
  const rows = (side: (typeof SIDES)[number]) => {
    const label = sides[side]?.label;
    if (!label) return [];
    const beside = side === "EAST" || side === "WEST";
    return beside && label.length * CHAR > 108 ? label.split(" · ") : [label];
  };
  const widest = Math.max(0, ...[...rows("EAST"), ...rows("WEST")].map((row) => row.length));

  // The Plot drawn 30% smaller than it was (owner, 28 Oct 2026). Only the
  // shape shrinks: the side labels keep their size, so they stay readable.
  const scale = 147 / Math.max(w, l);
  // A narrow Plot is drawn just wide enough for its number to clear the two
  // length labels standing inside its east and west edges (~22 units in each),
  // so "AH-05" never sits on "60 ft"; a shallow one just tall enough for it to
  // clear the width labels above and below.
  // ponytail: ~9.5 units a character at 15px bold is an estimate, not a measurement.
  const bw = Math.max(62, w * scale, plotNumber.length * 9.5 + 44);
  const bh = Math.max(64, l * scale);
  // North and south labels are centred over the shape; a long one widens the
  // margins rather than running out of the card.
  const across = Math.max(0, ...[...rows("NORTH"), ...rows("SOUTH")].map((row) => row.length * CHAR));
  const padX = Math.max(150, 42 + widest * CHAR, (across - bw) / 2 + 8);
  const padY = 52;
  const x = padX;
  const y = padY;
  const x2 = x + bw;
  const y2 = y + bh;
  const cx = x + bw / 2;
  const cy = y + bh / 2;

  const edge = {
    NORTH: { x1: x, y1: y, x2, y2: y },
    SOUTH: { x1: x, y1: y2, x2, y2 },
    WEST: { x1: x, y1: y, x2: x, y2 },
    EAST: { x1: x2, y1: y, x2, y2 },
  } as const;

  const marks = {
    NORTH: { letter: [cx, y - 14], label: [cx, y - 34], anchor: "middle" },
    SOUTH: { letter: [cx, y2 + 16], label: [cx, y2 + 36], anchor: "middle" },
    WEST: { letter: [x - 14, cy], label: [x - 30, cy], anchor: "end" },
    EAST: { letter: [x2 + 14, cy], label: [x2 + 30, cy], anchor: "start" },
  } as const;

  const spoken = SIDES.filter((side) => sides[side])
    .map((side) => `${side.toLowerCase()} ${sides[side]!.label}`)
    .join(", ");

  return (
    <figure className="m-0 w-full">
      <svg
        viewBox={`0 0 ${bw + padX * 2} ${bh + padY * 2}`}
        // Never drawn wider than its own units, so a wide card does not
        // enlarge it back to the size it was cut down from.
        style={{ maxWidth: `${bw + padX * 2}px` }}
        className="mx-auto block h-auto w-full overflow-visible text-foreground"
        role="img"
        aria-label={`Plot ${plotNumber}, ${widthFt} by ${lengthFt} feet${spoken ? `, bounded by ${spoken}` : ""}`}
      >
        {SIDES.map((side) => (
          <line
            key={side}
            {...edge[side]}
            strokeWidth={sides[side]?.open ? 3 : 1.5}
            className={sides[side]?.open ? "stroke-current" : "stroke-border"}
          />
        ))}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[15px] font-bold"
        >
          {plotNumber}
        </text>
        {/* Width along the north and south edges, length along east and west,
            just inside the lines they measure. */}
        {(
          [
            [cx, y + 14, 0, widthFt],
            [cx, y2 - 14, 0, widthFt],
            [x + 14, cy, -90, lengthFt],
            [x2 - 14, cy, 90, lengthFt],
          ] as const
        ).map(([tx, ty, rotate, ft], i) => (
          <text
            key={i}
            x={tx}
            y={ty}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={rotate ? `rotate(${rotate} ${tx} ${ty})` : undefined}
            className="text-[11px] font-medium tabular-nums text-foreground/75"
            fill="currentColor"
          >
            {formatQuantity(ft)} ft
          </text>
        ))}
        {/* The compass letter on each side, and what that side abuts just
            beyond it. The drawing now has the card's full width, so the
            viewBox is scaled up rather than down and this text renders larger
            than its nominal size instead of smaller. */}
        {SIDES.map((side) => {
          const mark = marks[side];
          return (
            <g key={side}>
              <text
                x={mark.letter[0]}
                y={mark.letter[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-current text-[13px] font-bold"
              >
                {side.charAt(0)}
              </text>
              {sides[side] && (
                <text
                  x={mark.label[0]}
                  y={mark.label[1] - (rows(side).length - 1) * 7}
                  textAnchor={mark.anchor}
                  dominantBaseline="middle"
                  className="text-[12px] font-medium text-foreground/75"
                  fill="currentColor"
                >
                  {rows(side).map((row, i) => (
                    <tspan key={i} x={mark.label[0]} dy={i ? 14 : 0}>
                      {row}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        Plot {plotNumber} at its own proportions, with what each side abuts.
      </figcaption>
    </figure>
  );
}

type SideRow = { side?: unknown; kind?: unknown; roadWidthFt?: unknown; reference?: unknown };

/** One side as a sentence: "Road · 30 ft", "Park / Playground · P-2". */
function sideText(b: SideRow | undefined): string {
  if (!b?.kind) return "Not recorded";
  const kind = BOUNDARY_KIND_LABEL[String(b.kind)] ?? String(b.kind);
  const width = b.kind === "ROAD" && b.roadWidthFt ? ` · ${formatQuantity(String(b.roadWidthFt))} ft` : "";
  const reference = b.reference ? ` · ${String(b.reference)}` : "";
  return `${kind}${width}${reference}`;
}

/** PLOT_DETAILS_CORRECTED's before and after, as "Width: 30 → 40 · North: Road · 30 ft → Park". */
function correctionDetail(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const changes: string[] = [];
  for (const [key, label, numeric] of [
    ["widthFt", "Width", true],
    ["lengthFt", "Length", true],
    ["areaSqFt", "Area sq ft", true],
    ["exactAreaSqFt", "Exact area sq ft", true],
    ["exactAreaReason", "Override reason", false],
  ] as const) {
    // A correction recorded before a field was audited carries neither side of
    // it, and must not read as "blank → something".
    if (!(key in before) && !(key in after)) continue;
    const show = (value: unknown) =>
      value == null || value === "" ? "blank" : numeric ? formatQuantity(String(value)) : String(value);
    const from = show(before[key]);
    const to = show(after[key]);
    if (from !== to) changes.push(`${label}: ${from} → ${to}`);
  }
  const sidesOf = (value: unknown) => (Array.isArray(value) ? (value as SideRow[]) : []);
  for (const side of SIDES) {
    const from = sideText(sidesOf(before.boundaries).find((b) => b.side === side));
    const to = sideText(sidesOf(after.boundaries).find((b) => b.side === side));
    if (from !== to) changes.push(`${humanise(side)}: ${from} → ${to}`);
  }
  return changes.join(" · ");
}

export default async function PlotDetailPage({ params }: { params: Promise<{ plotId: string }> }) {
  const actor = await requireStaff();
  const { plotId } = await params;
  // The Plot and everything about it load in one wave: each query needs only
  // the id from the URL, not the Plot row.
  const [plot, bookings, movedAway, acquisitions, enquiries, corrections, requests, plcCorrections] =
    await Promise.all([
    getPlot(plotId),
    db.booking.findMany({
      where: { plotId },
      include: {
        primaryPerson: { include: { customerProfile: { select: { customerId: true } } } },
        soldByPerson: {
          select: {
            id: true,
            fullName: true,
            memberProfile: { select: { memberId: true } },
            customerProfile: { select: { customerId: true } },
          },
        },
        parties: {
          where: { kind: "COMMERCIAL", effectiveTo: null },
          include: { person: { include: { customerProfile: { select: { customerId: true } } } } },
          orderBy: { role: "asc" },
        },
        completions: { where: { reopenedAt: null } },
        // The charge as it stood when this Booking froze it (PLC spec §7.1).
        plcSnapshot: { include: { ruleVersion: { select: { version: true } } } },
        scheduleVersions: { where: { status: "ACTIVE" }, include: { instalments: true } },
        cancellations: { orderBy: { requestedAt: "desc" }, take: 1 },
      },
      orderBy: { submittedAt: "desc" },
    }),
    // A Booking that moved to another Plot through Change Plot leaves only this.
    db.changePlotRequest.findMany({
      where: { fromPlotId: plotId, status: "APPROVED" },
      include: {
        booking: {
          select: {
            id: true,
            bookingNumber: true,
            primaryPerson: { include: { customerProfile: { select: { customerId: true } } } },
          },
        },
        toPlot: { select: { id: true, plotNumber: true } },
      },
      orderBy: { requestedAt: "desc" },
    }),
    db.acquisition.findMany({
      where: { plotId },
      include: {
        sellerPerson: { include: { customerProfile: { select: { customerId: true } } } },
      },
      orderBy: { submittedAt: "desc" },
    }),
    db.enquiry.findMany({
      where: { plotId, status: "ACTIVE" },
      include: {
        person: {
          include: {
            customerProfile: { select: { customerId: true } },
            memberProfile: { select: { memberId: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // The Plot event says a correction happened; the audit row holds old and new.
    db.auditEvent.findMany({
      where: { entity: "Plot", entityId: plotId, action: "PLOT_DETAILS_CORRECTED" },
      orderBy: { at: "desc" },
      take: 50,
    }),
    // The same queue Plot Inventory reads, so the #1, #2 here match the row there.
    listPendingHoldRequests(plotId),
    // A corrected PLC is a new snapshot superseding the old one, with the
    // compulsory reason on it (PLC spec §11.1) — not a PLOT_DETAILS_CORRECTED
    // audit row, so the history has to read it from the snapshots themselves.
    db.plcSnapshot.findMany({
      where: { plotId, supersededById: { not: null } },
      include: {
        supersededBy: { include: { ruleVersion: { select: { version: true } } } },
        ruleVersion: { select: { version: true } },
      },
      orderBy: { frozenAt: "desc" },
      take: 50,
    }),
  ]);
  if (!plot) notFound();

  const canReviewRequests = can(actor.role, "HOLD_REQUEST_REVIEW", actor.extraPermissions);

  const now = Date.now();
  const current = bookings.find((b) => LIVE_BOOKING.has(b.status)) ?? null;
  const earlier = bookings.filter((b) => b !== current);
  const liveAcquisition =
    acquisitions.find((a) => a.status === "PENDING_APPROVAL" || a.status === "APPROVED") ?? null;
  const completion = current?.completions[0] ?? null;
  const version = plot.project.plcRuleVersions[0] ?? null;

  const bySide = new Map(plot.boundaries.map((b) => [b.side, b]));
  const boundaries = plot.boundaries.map((b) => ({
    side: b.side,
    kind: b.kind,
    roadWidthFt: b.roadWidthFt?.toString(),
  }));
  const position = locationChargeLabel(boundaries).join(" · ");

  /* Every charge the sides earn, each named with the sides that earned it, and
     the total under them. A Road side with no width cannot be banded and
     buildPlcSnapshot throws rather than guess (PLC spec §5.3), so the reason
     shows where the numbers would be. */
  let plc: {
    total: string;
    components: { label: string; percent: string; evidence: string }[];
  } | null = null;
  let plcIssue: string | null = version ? null : "No published PLC version";
  if (version) {
    try {
      const snapshot = buildPlcSnapshot(boundaries, plcRules(version.components));
      plc = {
        total: snapshot.totalPercent.toFixed(2),
        components: snapshot.components.map((c) => ({
          label: c.label,
          percent: Number(c.percent).toFixed(2),
          evidence: shortSides(c.evidence),
        })),
      };
    } catch (error) {
      plcIssue = error instanceof Error ? error.message : "PLC could not be worked out";
    }
  }

  // Stored precision — area is stored to four decimals and a Plot is sold on it.
  const num = (value: { toString(): string }) => formatQuantity(value.toString());
  const conv = (value: { toDecimalPlaces(n: number): { toString(): string } }) =>
    formatQuantity(value.toDecimalPlaces(2).toString());

  /* -------------------------------------------------------- process message */

  const shown = displayStatus(
    plot.status as Parameters<typeof displayStatus>[0],
    plot.project.status as Parameters<typeof displayStatus>[1]
  );
  const dealCancelled = plot.status === "NOT_AVAILABLE" && acquisitions[0]?.status === "CANCELLED";
  const overdue =
    current?.status === "BOOKED" &&
    (current.scheduleVersions[0]?.instalments ?? []).some(
      (i) => i.dueDate.getTime() < now && i.receivedPercent.lessThan(i.scheduledPercent)
    );
  const messages = [
    current?.activeProcess === "CHANGE_PLOT_PENDING" ? "Change Plot Under Process" : null,
    current?.activeProcess === "BUYBACK_PENDING" ||
    acquisitions.some((a) => a.type === "BUYBACK" && a.status === "PENDING_APPROVAL")
      ? "Buyback Under Process"
      : null,
    overdue ? "Payment Pending" : null,
    dealCancelled ? DEAL_CANCELLED_MESSAGE : shown.because,
  ].filter((m): m is string => Boolean(m));

  /* ---------------------------------------------------------------- actions */

  // What can be started on this Plot now. Each opens the screen that already
  // does it — Plot Inventory's own dialog, or the Booking — on this Plot.
  const inInventory = (open: string) => `/plots?plot=${plot.id}&open=${open}`;
  // `danger` actions end something; they sit last and read red, as on the Booking page.
  const actions: Array<{ label: string; href: string; danger?: boolean }> = [];
  const allowed = (action: Parameters<typeof can>[1]) => can(actor.role, action, actor.extraPermissions);
  if (plot.status === "NOT_AVAILABLE" && allowed("PLOT_MAKE_AVAILABLE")) {
    actions.push({ label: "Make Available", href: inInventory("AVAILABLE") });
    // One action for the two steps: once it is Available, the Hold form opens.
    if (allowed("HOLD_CREATE")) {
      actions.push({ label: "Make Available & Hold", href: inInventory("AVAILABLE_HOLD") });
    }
  }
  // The first action a status allows is the page's one button; the rest go
  // under More. So each status lists the step that moves the Plot on first.
  if (plot.status === "AVAILABLE") {
    if (allowed("BOOKING_REQUEST_SUBMIT")) actions.push({ label: "Start Booking", href: inInventory("BOOK") });
    if (allowed("HOLD_CREATE")) actions.push({ label: "Hold", href: inInventory("HOLD") });
  }
  if (plot.status === "HOLD") {
    if (allowed("BOOKING_REQUEST_SUBMIT")) actions.push({ label: "Book", href: inInventory("BOOK") });
    if (allowed("HOLD_EXTEND_FIRST")) actions.push({ label: "Extend Hold", href: inInventory("EXTEND") });
    if (allowed("HOLD_CREATE")) {
      actions.push({ label: "Cancel Hold", href: inInventory("CANCEL_HOLD"), danger: true });
    }
  }
  if (current) {
    const booking = `/bookings/${current.id}`;
    const label =
      current.status === "REQUEST_PENDING"
        ? "View Request"
        : current.status === "DELIVERED"
          ? "View Delivery"
          : "Open Booking";
    actions.push({ label, href: booking });

    // Each of these opens the Booking page's own form on this Booking, under
    // the same rule its button there follows. Delivered offers none of them.
    if (current.status === "REQUEST_PENDING" && allowed("BOOKING_CANCEL_REQUEST")) {
      actions.push({ label: "Cancel Request", href: `${booking}?open=CANCEL`, danger: true });
    }
    if (["BOOKED", "PAYMENT_COMPLETED"].includes(current.status)) {
      if (allowed("BOOKING_CANCEL_REQUEST")) {
        actions.push({ label: "Cancel Booking", href: `${booking}?open=CANCEL`, danger: true });
      }
      if (current.activeProcess === "NONE" && allowed("CHANGE_PLOT_RAISE")) {
        actions.push({ label: "Change Plot", href: `${booking}?open=CHANGE_PLOT` });
      }
    }
    // Final buyers and the route, in the one form Plot Inventory already has.
    if (
      current.status === "PAYMENT_COMPLETED" &&
      allowed("FINAL_BUYER_RECORD") &&
      allowed("COMPLETION_RECORD")
    ) {
      actions.push({ label: "Prepare Allotment / Registry", href: inInventory("DELIVER") });
    }
  }

  /* ---------------------------------------------------------------- history */

  const history = newestFirst([
    // A correction is read from its audit row, which carries old and new.
    ...plot.events
      .filter((e) => e.action !== "PLOT_DETAILS_CORRECTED")
      .map(
        (e): HistoryItem => ({
          at: e.at,
          title: humanise(e.action),
          detail:
            [
              e.fromStatus !== e.toStatus && e.toStatus
                ? `${e.fromStatus ? STATUS_LABEL[e.fromStatus] : "New"} → ${STATUS_LABEL[e.toStatus]}`
                : null,
              // A new Plot has no "from"; unrestricted to unrestricted is no change.
              (e.fromRestriction ?? "NONE") !== e.toRestriction && e.toRestriction
                ? `Restriction: ${humaniseRestriction(e.fromRestriction ?? "NONE")} → ${humaniseRestriction(e.toRestriction)}`
                : null,
              e.reason,
            ]
              .filter(Boolean)
              .join(" — ") || undefined,
          by: e.actorRef,
        })
      ),
    ...corrections.map(
      (c): HistoryItem => ({
        at: c.at,
        title: "Plot details corrected",
        detail:
          [
            correctionDetail(
              (c.beforeMasked ?? {}) as Record<string, unknown>,
              (c.afterMasked ?? {}) as Record<string, unknown>
            ),
            c.reason,
          ]
            .filter(Boolean)
            .join(" — ") || undefined,
        by: c.actorRef,
      })
    ),
    // "PLC: 7.00% → 9.00% — Park side recorded" (PLC spec §11.1).
    ...plcCorrections.map(
      (snapshot): HistoryItem => ({
        at: snapshot.supersededBy!.frozenAt,
        title: "PLC corrected",
        detail:
          [
            `PLC: ${snapshot.totalPercent.toFixed(2)}% → ${snapshot.supersededBy!.totalPercent.toFixed(2)}%`,
            snapshot.supersededBy!.correctionReason,
          ]
            .filter(Boolean)
            .join(" — "),
        by: "SYSTEM",
      })
    ),
  ]);

  const pastDeals = [
    ...earlier.map((b) => ({
      id: b.id,
      what: b.bookingNumber ?? "Booking Request",
      href: `/bookings/${b.id}`,
      who: b.primaryPerson,
      outcome:
        b.status === "CANCELLED" && b.cancellations[0]
          ? b.cancellations[0].noPaymentReceived
            ? "Cancelled · no payment received"
            : "Cancelled · refunded"
          : (OUTCOME_LABEL[b.status] ?? humanise(b.status)),
      at: b.submittedAt,
    })),
    ...movedAway.map((c) => ({
      id: c.id,
      what: c.booking.bookingNumber ?? "Booking Request",
      href: `/bookings/${c.booking.id}`,
      who: c.booking.primaryPerson,
      outcome: `Moved to ${c.toPlot.plotNumber} through Change Plot`,
      at: c.decidedAt ?? c.requestedAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  /* The Hold, for the PLC it froze and for whose name the Plot is in. */
  const hold = plot.holds[0] ?? null;
  /* The PLC frozen on whatever holds the Plot now, against what the sides
     would earn today. Only worth a line when the two differ — a Plot whose
     rules have not moved says nothing. */
  const frozen = current?.plcSnapshot ?? hold?.plcSnapshot ?? null;
  const frozenPercent = frozen ? frozen.totalPercent.toFixed(2) : null;
  const frozenDiffers = Boolean(plc && frozenPercent && frozenPercent !== plc.total);

  // The first action this status allows is the one button. Beside it, only a
  // Restriction menu (Not for Sale, Pledge) and Edit Plot Details (owner,
  // 28 Oct 2026); Hold is done from Plot Inventory.
  const primary = actions.find((a) => !a.danger) ?? null;
  const canSetup = can(actor.role, "PLOT_SETUP");
  const canRestrict = can(actor.role, "PLOT_RESTRICTION_MANAGE") && canSetRestriction(plot.status);

  /* Whose name the Plot is in: the Booking's Primary Customer, else the seller
     on a live Buyback / Resale, else whoever it is held for. */
  const holder = current
    ? {
        person: current.primaryPerson,
        hint: (
          <>
            <Link href={`/bookings/${current.id}`} className="text-primary hover:underline">
              {current.bookingNumber ?? "Booking Request"}
            </Link>
            {` · ${current.paymentReceivedPercent.toFixed(0)}% received`}
          </>
        ),
      }
    : liveAcquisition
      ? { person: liveAcquisition.sellerPerson, hint: `Seller · ${TYPE_LABEL[liveAcquisition.type] ?? "Buyback / Resale"}` }
      : hold
        ? { person: hold.person, hint: `Held until ${formatIstDateTime(hold.expiresAt)}` }
        : null;

  /* ------------------------------------- Bookings and Hold Requests */

  // Everything that has held, asked for or bought this Plot, in one table: the
  // live deal first, then what is waiting on it, then the past, newest first.
  type DealRow = { key: string; what: React.ReactNode; who: React.ReactNode; outcome: React.ReactNode; at: Date };
  const who = (person: { id: string; fullName: string; customerProfile?: { customerId: string } | null; memberProfile?: { memberId: string } | null }) => {
    const code = person.customerProfile?.customerId ?? person.memberProfile?.memberId;
    return (
      <span className="block">
        <PersonLink personId={person.id} name={code ?? person.fullName} />
        {code && <span className="block text-foreground">{person.fullName}</span>}
      </span>
    );
  };
  const link = (href: string, text: string) => (
    <Link href={href} className="font-semibold text-primary hover:underline">
      {text}
    </Link>
  );

  const live: DealRow[] = [];
  if (current) {
    live.push({
      key: current.id,
      // The live deal is its own number in a badge (owner, 28 Oct 2026).
      what: (
        <Link href={`/bookings/${current.id}`} title="Holding this Plot now">
          <Badge variant="info" className="font-semibold hover:underline">
            {current.bookingNumber ?? "Booking Request"}
          </Badge>
        </Link>
      ),
      // ID and name only (owner, 28 Oct 2026); shares and mobiles are the Booking page's.
      who: current.parties.map((p) => <span key={p.id}>{who(p.person)}</span>),
      // The status, and the payment received under it.
      outcome: (
        <>
          {OUTCOME_LABEL[current.status] ?? humanise(current.status)}
          <span className={SUB}>{current.paymentReceivedPercent.toFixed(0)}% received</span>
        </>
      ),
      at: current.submittedAt,
    });
  } else if (hold) {
    live.push({
      key: hold.id,
      what: (
        <Badge variant="info" className="font-semibold" title="Holding this Plot now">
          Hold
        </Badge>
      ),
      // ID and name only (owner, 28 Oct 2026).
      who: who(hold.person),
      outcome: hold.status === "FROZEN" ? "Frozen by a Booking Request" : `Until ${formatIstDateTime(hold.expiresAt)}`,
      at: hold.createdAt,
    });
  }
  // DESIGN §9.3 — each request names the actual buyer, and expires at the
  // working-day cut-off; after that it cannot be approved.
  for (const r of requests) {
    live.push({
      key: r.id,
      what: <span className="font-semibold">Hold Request #{r.queuePosition}</span>,
      // The requesting Member's ID and name only (owner, 28 Oct 2026); the
      // buyer is named in the Approve / Reject dialog.
      who: (
        <span className="block">
          <PersonLink personId={r.member.person.id} name={r.member.memberId} as="member" />
          <span className="block text-foreground">{r.member.person.fullName}</span>
        </span>
      ),
      outcome: (
        <>
          Expires {formatIstDateTime(r.expiresAt)}
          {canReviewRequests && (
            <span className="mt-1 flex justify-center">
              <HoldRequestDecision requestId={r.id} buyer={r.person.fullName} />
            </span>
          )}
        </>
      ),
      at: r.expiresAt,
    });
  }

  const past: DealRow[] = [
    ...acquisitions.map((a) => ({
      key: a.id,
      what: link(`/acquisitions/${a.id}`, TYPE_LABEL[a.type] ?? "Buyback / Resale"),
      who: (
        <>
          {who(a.sellerPerson)}
          <span className={SUB}>Seller</span>
        </>
      ),
      // The status, and the payment given under it — as the Booking row shows payment received.
      outcome: (
        <>
          {a.status === "CANCELLED" ? "Deal Cancelled" : humanise(a.status)}
          <span className={SUB}>{a.paymentGivenPercent.toFixed(0)}% given</span>
        </>
      ),
      at: a.submittedAt,
    })),
    ...pastDeals.map((d) => ({
      key: d.id,
      what: link(d.href, d.what),
      who: who(d.who),
      outcome: d.outcome,
      at: d.at,
    })),
    // The ENQ number is off the screens (ID Guide §5): who and when say which.
    ...enquiries.map((e) => ({
      key: e.id,
      what: <span className="font-semibold">Enquiry</span>,
      who: who(e.person),
      outcome: humanise(e.status),
      at: e.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const deals = [...live, ...past];
  const FIRST = 5;

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Back and what needs attention on the left; History, the one next
            step and More on the right — as on the Customer and Member pages. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/plots"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Plot Inventory
            </Link>
            {messages.map((message) => (
              <Badge key={message} variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {message}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <HistoryButton
              rows={history.map((h) => ({ at: formatIstDateTime(h.at), title: h.title, detail: h.detail, by: h.by }))}
            />
            {primary && (
              <Button size="sm" asChild className={primary.label === "Make Available" ? MAKE_AVAILABLE : undefined}>
                <Link href={primary.href}>{primary.label}</Link>
              </Button>
            )}
            {(canSetup || canRestrict) && (
            <PlotActions
              plot={{
                id: plot.id,
                plotNumber: plot.plotNumber,
                status: plot.status,
                widthFt: plot.widthFt?.toString() ?? "",
                lengthFt: plot.lengthFt?.toString() ?? "",
                exactAreaSqFt: plot.exactAreaSqFt?.toString() ?? "",
                exactAreaReason: plot.exactAreaReason ?? "",
                boundaries: plot.boundaries.map((b) => ({
                  side: b.side,
                  kind: b.kind,
                  roadWidthFt: b.roadWidthFt?.toString() ?? "",
                  reference: b.reference ?? "",
                })),
              }}
              // The edit dialog still validates sides against the Project's rules.
              components={
                version
                  ? plcRules(version.components).map((c) => ({
                      category: c.category,
                      threshold: c.threshold == null ? null : String(c.threshold),
                      percent: String(c.percent),
                    }))
                  : []
              }
              restriction={plot.restriction}
              // The same rules the services enforce, so no button is live when
              // the server is going to refuse it.
              canSetup={canSetup}
              canEdit={canEditPlotDetails(plot.status)}
              canRestrict={canRestrict}
            />
            )}
          </div>
        </div>

        {/* 1 Header · 2 Summary */}
        <Card className="p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MapPin className="h-6 w-6" />
            </div>
            <div className="min-w-fit flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{plot.plotNumber}</h1>
                <Badge variant={statusVariant(shown.status)}>{STATUS_LABEL[shown.status] ?? shown.status}</Badge>
                {plot.isResale && <Badge variant="outline">Resale</Badge>}
                {plot.restriction !== "NONE" && (
                  <Badge variant="destructive">{humaniseRestriction(plot.restriction)}</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {plot.project.name} · {PLOT_TYPE_LABEL[plot.plotType] ?? plot.plotType}
              </p>
              {plot.restriction !== "NONE" && plot.restrictionReason && (
                <p className="mt-1 max-w-prose text-xs text-red-700">{plot.restrictionReason}</p>
              )}
            </div>

            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              {/* One Size: the sides, then the area in all three units, moved up
                  from under the drawing (owner, 29 Oct 2026), two to a line at one
                  size and centred under one heading. An irregular Plot has no
                  sides, so its square feet come first. */}
              <Stat
                label="Size & Area"
                className="text-center"
                value={
                  <span className="grid grid-cols-[auto_auto] gap-x-4">
                    {plot.widthFt && plot.lengthFt && (
                      <span>{formatPlotSize(plot.widthFt.toString(), plot.lengthFt.toString())}</span>
                    )}
                    <span>{num(plot.areaSqFt)} sq ft</span>
                    <span>{conv(plot.areaSqYd)} sq yd</span>
                    <span>
                      {conv(plot.areaSqM)} sq m{plot.exactAreaSqFt ? " · exact" : ""}
                    </span>
                  </span>
                }
              />
              <Stat
                label="In the name of"
                value={
                  holder ? (
                    <>
                      <PersonLink
                        personId={holder.person.id}
                        name={holder.person.customerProfile?.customerId ?? holder.person.fullName}
                      />
                      {holder.person.customerProfile && (
                        <span className="block text-foreground">{holder.person.fullName}</span>
                      )}
                    </>
                  ) : (
                    "—"
                  )
                }
                hint={holder?.hint ?? "Not allocated"}
              />
            </dl>
          </div>
        </Card>

        {/* 3 Layout · 4 PLC · 5 Completion. The drawing takes half the row: in a
            third its side labels shrank below reading size. PLC and Completion
            stack in the other half and Completion stretches, so both halves end
            on one line instead of three cards stopping at three heights (owner,
            29 Oct 2026). On a tablet the drawing takes the whole row and the
            other two share the next. */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* No heading: the drawing says what it is (owner, 28 Oct 2026). It sits
              in the middle of whatever height the other half gives the row. */}
          <Card className="flex flex-col justify-center p-4 md:p-5">
            {plot.widthFt && plot.lengthFt ? (
              <PlotShape
                plotNumber={plot.plotNumber}
                widthFt={plot.widthFt.toString()}
                lengthFt={plot.lengthFt.toString()}
                sides={Object.fromEntries(
                  SIDES.map((side) => {
                    const b = bySide.get(side);
                    if (!b) return [side, undefined];
                    const kind = BOUNDARY_KIND_LABEL[b.kind] ?? b.kind;
                    const label =
                      b.kind === "ROAD" && b.roadWidthFt
                        ? `${kind} · ${num(b.roadWidthFt)} ft`
                        : b.reference
                          ? `${kind} · ${b.reference}`
                          : kind;
                    return [side, { label, open: isOpenSide(b.kind) }];
                  })
                )}
              />
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground">An irregular Plot has no sides to draw.</p>
            )}
            {/* Area moved up beside Size (owner, 29 Oct 2026). An exact-area
                override still explains itself under the drawing: what the sides
                multiply to is the other half of the reason it exists. */}
            {((plot.exactAreaSqFt && plot.widthFt && plot.lengthFt) || plot.exactAreaReason) && (
              <div className="mt-3 border-t border-border/60 pt-3">
                {plot.exactAreaSqFt && plot.widthFt && plot.lengthFt && (
                  <Row
                    label="Width × Length area"
                    value={<span className="tabular-nums">{num(plot.widthFt.mul(plot.lengthFt))} sq ft</span>}
                  />
                )}
                {plot.exactAreaReason && <Row label="Override reason" value={plot.exactAreaReason} />}
              </div>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[auto_1fr]">
            {/* What the sides earn, and the sentence they add up to. */}
            <Section title={plc ? `PLC · ${plc.total}%` : "PLC"} icon={<Percent className="h-3.5 w-3.5" />}>
              {plc ? (
                plc.components.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No location charge on this Plot.</p>
                ) : (
                  plc.components.map((c) => (
                    <Row
                      key={c.label}
                      label={c.label}
                      value={<span className="tabular-nums">{c.percent}%</span>}
                      hint={c.evidence || undefined}
                    />
                  ))
                )
              ) : (
                <p className="text-xs text-muted-foreground">{plcIssue}</p>
              )}
              {position && (
                <p className="mt-3 border-t border-border/60 pt-3 text-xs">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Position </span>
                  <span className="font-semibold text-foreground">{position}</span>
                </p>
              )}
              {/* The frozen figure is the one that counts (PLC spec §10.3); this
                  only says the rules have moved since it was frozen. */}
              {frozenDiffers && (
                <p className="mt-2 text-[11px] text-amber-800">
                  Frozen on this deal at {frozenPercent}% (version {frozen!.ruleVersion.version},{" "}
                  {formatIst(frozen!.frozenAt)}); today&apos;s rules give {plc!.total}%.
                </p>
              )}
            </Section>

            <Section title="Completion" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
              {completion ? (
                completion.route === "ALLOTMENT" ? (
                  <>
                    <Row label="Route" value="Allotment" />
                    <Row
                      label="Allotment Date"
                      value={completion.allotmentDate ? formatIst(completion.allotmentDate) : "—"}
                    />
                    <Row label="Allotment Number" value={completion.allotmentNumber ? slashBreaks(completion.allotmentNumber) : "—"} />
                    <Row label="Given To" value={completion.allotmentGivenTo ?? "—"} />
                    <Row
                      label="Patta"
                      value={completion.pattaStatus === "YES" ? "Yes" : "Don't Know"}
                      hint={completion.pattaDate ? formatIst(completion.pattaDate) : undefined}
                    />
                    <Row label="Delivered On" value={formatIst(completion.deliveredAt)} />
                  </>
                ) : (
                  <>
                    <Row label="Route" value="Registry" />
                    <Row label="Advocate" value={completion.advocateName ?? "—"} />
                    <Row
                      label="Registry Date"
                      value={completion.registryDate ? formatIst(completion.registryDate) : "—"}
                    />
                    <Row label="Delivered On" value={formatIst(completion.deliveredAt)} />
                  </>
                )
              ) : (
                <p className="text-xs text-muted-foreground">Not completed yet.</p>
              )}
            </Section>
          </div>
        </div>

        {/* 6 Bookings and Hold Requests (owner's names, 28 Oct 2026) — the live deal, Hold Requests waiting on it,
            Buybacks, earlier Bookings and open Enquiries, one row each. The
            payment schedule and commission are the Booking page's. */}
        <Section title={`Bookings and Hold Requests (${deals.length})`} icon={<Layers className="h-3.5 w-3.5" />}>
          {deals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Booking, Hold, Buyback or Enquiry on this Plot yet.</p>
          ) : (
            <MaybeMore count={deals.length - FIRST}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-xs">
                  <thead className="border-b border-border/60">
                    <tr>
                      <th className={CTH}>Deal</th>
                      <th className={CTH}>Person</th>
                      <th className={CTH}>Status</th>
                      <th className={CTH}>Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {deals.map((d, i) => (
                      <tr key={d.key} className={i >= FIRST ? "hidden group-data-[open]/more:table-row" : undefined}>
                        <td className={CTD}>{d.what}</td>
                        <td className={CTD}>{d.who}</td>
                        <td className={CTD}>{d.outcome}</td>
                        <td className={`${CTD} whitespace-nowrap tabular-nums text-muted-foreground`}>{formatIst(d.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MaybeMore>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
