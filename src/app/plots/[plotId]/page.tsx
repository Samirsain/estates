// Plot detail page — /plots/[plotId]
//
// Built to system/Plot_Profile_Revised_Requirements.md, top to bottom: Header ›
// Dimensions › Boundaries › Layout › Current Allocation · Booking › Completion ›
// Past Deals › History. Removed on purpose: Details Locked, the Location Charge
// (PLC %) and everything about its version and snapshot, and the Hold details
// section — the Hold actions stay, through the buttons at the top.
//
// Laid out like the Customer and Member profiles: actions on the top line, a
// header card, then cards of the same shape. Payment schedule and commission
// are the Booking page's; this page shows the percentage received and links there.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  FileText,
  History,
  Layers,
  MapPin,
  Percent,
  Ruler,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Row } from "@/components/fact-row";
import { PersonLink } from "@/components/person-link";
import {
  canEditPlotDetails,
  canSetRestriction,
  displayStatus,
  humaniseRestriction,
  isOpenSide,
  locationChargeLabel,
} from "@/lib/domain/inventory";
import { DEAL_CANCELLED_MESSAGE } from "@/lib/domain/acquisition";
import { getPlot } from "@/lib/services/inventory-service";
import { listPendingHoldRequests } from "@/lib/services/hold-service";
import { plcRules } from "@/lib/services/plc-service";
import { requireStaff } from "@/lib/security/current-actor";
import { maskMobile } from "@/lib/security/identity";
import { can } from "@/lib/security/permissions";
import { formatIst, formatIstDateTime, formatPlotSize, formatQuantity } from "@/lib/tasks";
import { newestFirst, type HistoryItem } from "@/lib/profile-history";
import { eligibilityLabel, type CommissionType } from "@/lib/domain/commission";
import { TYPE_LABEL } from "@/app/acquisitions/types";
import { PaymentButton } from "@/app/customers/[id]/payment-button";
import { AddTaskButton } from "@/app/members/[id]/add-task-button";
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

/** What became of an earlier Booking, in the words the Booking screens use. */
const OUTCOME_LABEL: Record<string, string> = {
  REQUEST_REJECTED: "Request rejected",
  REQUEST_CANCELLED: "Request withdrawn",
  CANCELLED: "Cancelled",
  BUYBACK_COMPLETED: "Bought back",
  REFUND_PENDING: "Refund pending",
};

const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  CANCELLED: "Cancelled",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Accounts Adjustment Required",
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
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-2.5 pr-4 align-top";

/** The beneficiary on a commission line: id and name, as every screen prints them. */
const BENEFICIARY = {
  select: {
    id: true,
    fullName: true,
    memberProfile: { select: { memberId: true } },
    customerProfile: { select: { customerId: true } },
  },
} as const;

/** One list-row shape for Past Deals: what, who, and how it ended. */
const DEAL_ROW =
  "flex flex-col gap-1 py-2.5 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4";

/** Every block on the page is the same card: a quiet title, then its content. */
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Sized by its own content: two cards side by side no longer stretch the
    // shorter one into an empty box.
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="mt-3 min-w-0">{children}</div>
    </Card>
  );
}

/** A sub-list heading inside Past Deals. */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>
  );
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

  const scale = 200 / Math.max(w, l);
  const bw = Math.max(76, w * scale);
  const bh = Math.max(76, l * scale);
  const padX = 92;
  const padY = 46;
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
    NORTH: { letter: [cx, y - 12], label: [cx, y - 30], anchor: "middle" },
    SOUTH: { letter: [cx, y2 + 22], label: [cx, y2 + 40], anchor: "middle" },
    WEST: { letter: [x - 12, cy], label: [x - 28, cy], anchor: "end" },
    EAST: { letter: [x2 + 12, cy], label: [x2 + 28, cy], anchor: "start" },
  } as const;

  const spoken = SIDES.filter((side) => sides[side])
    .map((side) => `${side.toLowerCase()} ${sides[side]!.label}`)
    .join(", ");

  return (
    <figure className="m-0 w-full max-w-[18rem]">
      <svg
        viewBox={`0 0 ${bw + padX * 2} ${bh + padY * 2}`}
        className="block h-auto w-full overflow-visible text-foreground"
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
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[15px] font-bold"
        >
          {plotNumber}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[11px] font-medium"
        >
          {formatPlotSize(widthFt, lengthFt)}
        </text>
        {SIDES.map((side) => {
          const mark = marks[side];
          return (
            <g key={side}>
              <text
                x={mark.letter[0]}
                y={mark.letter[1]}
                textAnchor={mark.anchor}
                dominantBaseline="middle"
                className="fill-current text-[12px] font-bold"
              >
                {side.charAt(0)}
              </text>
              {sides[side] && (
                <text
                  x={mark.label[0]}
                  y={mark.label[1]}
                  textAnchor={mark.anchor}
                  dominantBaseline="middle"
                  className="text-[11px] text-muted-foreground"
                  fill="currentColor"
                >
                  {sides[side]!.label}
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
  const plot = await getPlot(plotId);
  if (!plot) notFound();

  const [bookings, movedAway, acquisitions, enquiries, corrections, pendingRequests] = await Promise.all([
    db.booking.findMany({
      where: { plotId: plot.id },
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
        scheduleVersions: { where: { status: "ACTIVE" }, include: { instalments: true } },
        cancellations: { orderBy: { requestedAt: "desc" }, take: 1 },
        commissions: {
          where: { isCurrent: true },
          include: { beneficiaryPerson: BENEFICIARY },
          orderBy: { type: "asc" },
        },
      },
      orderBy: { submittedAt: "desc" },
    }),
    // A Booking that moved to another Plot through Change Plot leaves only this.
    db.changePlotRequest.findMany({
      where: { fromPlotId: plot.id, status: "APPROVED" },
      include: {
        booking: {
          select: {
            id: true,
            bookingNumber: true,
            requestNo: true,
            primaryPerson: { include: { customerProfile: { select: { customerId: true } } } },
          },
        },
        toPlot: { select: { id: true, plotNumber: true } },
      },
      orderBy: { requestedAt: "desc" },
    }),
    db.acquisition.findMany({
      where: { plotId: plot.id },
      include: {
        sellerPerson: { include: { customerProfile: { select: { customerId: true } } } },
        // Buying Commission hangs off the Acquisition, not a Booking.
        commissions: { where: { isCurrent: true }, include: { beneficiaryPerson: BENEFICIARY } },
      },
      orderBy: { submittedAt: "desc" },
    }),
    db.enquiry.findMany({
      where: { plotId: plot.id, status: "ACTIVE" },
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
      where: { entity: "Plot", entityId: plot.id, action: "PLOT_DETAILS_CORRECTED" },
      orderBy: { at: "desc" },
      take: 50,
    }),
    listPendingHoldRequests(),
  ]);

  // The same queue Plot Inventory reads, so the #1, #2 here match the row there.
  const requests = pendingRequests.filter((r) => r.plotId === plot.id);
  const canReviewRequests = can(actor.role, "HOLD_REQUEST_REVIEW", actor.extraPermissions);

  const now = Date.now();
  const current = bookings.find((b) => LIVE_BOOKING.has(b.status)) ?? null;
  const earlier = bookings.filter((b) => b !== current);
  const liveAcquisition =
    acquisitions.find((a) => a.status === "PENDING_APPROVAL" || a.status === "APPROVED") ?? null;
  const completion = current?.completions[0] ?? null;
  const version = plot.project.plcRuleVersions[0] ?? null;
  // The commission on the deal holding this Plot now: the Booking's sale
  // commission and any Buying Commission on a live Buyback or Resale.
  const commissions = [...(current?.commissions ?? []), ...(liveAcquisition?.commissions ?? [])];

  const bySide = new Map(plot.boundaries.map((b) => [b.side, b]));
  const boundaries = plot.boundaries.map((b) => ({
    side: b.side,
    kind: b.kind,
    roadWidthFt: b.roadWidthFt?.toString(),
  }));
  const position = locationChargeLabel(boundaries).join(" · ");
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
  if (plot.status === "AVAILABLE") {
    if (allowed("HOLD_CREATE")) actions.push({ label: "Hold", href: inInventory("HOLD") });
    if (allowed("BOOKING_REQUEST_SUBMIT")) actions.push({ label: "Start Booking", href: inInventory("BOOK") });
  }
  if (plot.status === "HOLD") {
    if (allowed("HOLD_EXTEND_FIRST")) actions.push({ label: "Extend Hold", href: inInventory("EXTEND") });
    if (allowed("HOLD_CREATE")) {
      actions.push({ label: "Cancel Hold", href: inInventory("CANCEL_HOLD"), danger: true });
    }
    if (allowed("BOOKING_REQUEST_SUBMIT")) actions.push({ label: "Book", href: inInventory("BOOK") });
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
  const canFollowUp =
    current !== null && ["BOOKED", "PAYMENT_COMPLETED"].includes(current.status) && allowed("TASK_CREATE");
  const canRecordPayment =
    current?.status === "BOOKED" &&
    current.paymentReceivedPercent.lessThan(100) &&
    allowed("PAYMENT_RECEIVED_CONFIRM");

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
  ]);

  /** A person as every screen prints one: the id leads, the name under it. */
  const person = (
    p: { id: string; fullName: string; primaryMobile?: string; customerProfile: { customerId: string } | null },
    options: { mobile?: boolean } = {}
  ) => (
    <>
      <PersonLink personId={p.id} name={p.customerProfile?.customerId ?? p.fullName} />
      {p.customerProfile && <span className={SUB}>{p.fullName}</span>}
      {options.mobile && p.primaryMobile && <span className={SUB}>{maskMobile(p.primaryMobile)}</span>}
    </>
  );

  const shareTotal = current
    ? current.parties.reduce(
        (sum, p) => sum + (p.sharePercent ? Number(p.sharePercent) : current.parties.length === 1 ? 100 : 0),
        0
      )
    : 0;

  const paymentGiven = liveAcquisition ? (
    <Link href={`/acquisitions/${liveAcquisition.id}`} className="text-primary hover:underline">
      <span className="tabular-nums">{liveAcquisition.paymentGivenPercent.toFixed(2)}%</span>
      <span className={SUB}>{TYPE_LABEL[liveAcquisition.type] ?? "Buyback / Resale"}</span>
    </Link>
  ) : null;

  const pastDeals = [
    ...earlier.map((b) => ({
      id: b.id,
      what: b.bookingNumber ?? b.requestNo,
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
      what: c.booking.bookingNumber ?? c.booking.requestNo,
      href: `/bookings/${c.booking.id}`,
      who: c.booking.primaryPerson,
      outcome: `Moved to ${c.toPlot.plotNumber} through Change Plot`,
      at: c.decidedAt ?? c.requestedAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const hasPast = pastDeals.length + acquisitions.length + enquiries.length > 0;

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Back on the left; everything that can be done to this Plot on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/plots"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Plot Inventory
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions
              .filter((a) => !a.danger)
              .map((a) => (
                <Button key={a.label} size="sm" variant="outline" asChild>
                  <Link href={a.href}>{a.label}</Link>
                </Button>
              ))}
            {canFollowUp && current && (
              <AddTaskButton
                label="Follow-up"
                record={{
                  kind: "Booking",
                  id: current.id,
                  name: `${current.bookingNumber ?? current.requestNo} · ${plot.plotNumber}`,
                }}
              />
            )}
            {canRecordPayment && current && (
              <PaymentButton
                bookings={[
                  {
                    id: current.id,
                    label: `${current.bookingNumber ?? current.requestNo} · ${plot.project.name} · ${plot.plotNumber}`,
                    receivedPercent: current.paymentReceivedPercent.toString(),
                  },
                ]}
              />
            )}
            {actions
              .filter((a) => a.danger)
              .map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant="outline"
                  className="border-red-500/40 text-red-700 hover:bg-red-500/5"
                  asChild
                >
                  <Link href={a.href}>{a.label}</Link>
                </Button>
              ))}
            <Button size="sm" variant="outline" asChild>
              <Link href={`/calculator?plot=${plot.id}`}>
                <Calculator className="mr-1.5 h-3.5 w-3.5" />
                Open in Calculator
              </Link>
            </Button>
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
              // The edit dialog still validates sides against the Project's
              // rules; the page itself no longer shows a charge.
              components={
                version
                  ? plcRules(version.components).map((c) => ({
                      category: c.category,
                      threshold: c.threshold == null ? null : String(c.threshold),
                      percent: String(c.percent),
                    }))
                  : []
              }
              currentRestriction={plot.restriction}
              // The same two rules the services enforce, so the page never
              // offers an action the server is going to refuse.
              canEditDetails={can(actor.role, "PLOT_SETUP") && canEditPlotDetails(plot.status)}
              canRestrict={can(actor.role, "PLOT_RESTRICTION_MANAGE") && canSetRestriction(plot.status)}
            />
          </div>
        </div>

        {/* 1 Header */}
        <Card className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MapPin className="h-6 w-6" />
            </div>
            <div className="min-w-0">
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
                {position ? ` · ${position}` : ""}
              </p>
              {plot.restriction !== "NONE" && plot.restrictionReason && (
                <p className="mt-1 max-w-prose text-xs text-red-700">{plot.restrictionReason}</p>
              )}
              {messages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {messages.map((message) => (
                    <Badge key={message} variant="warning">
                      {message}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* 2 Dimensions · 3 Boundaries · 4 Layout — one card in three columns:
            the measurements, the four sides, and the drawing of both. Three
            cards stretched to the drawing's height left two of them half empty. */}
        <Section title="Dimensions · Boundaries · Layout" icon={<Ruler className="h-3.5 w-3.5" />}>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem]">
          <div className="min-w-0">
            <SubHeading>Dimensions</SubHeading>
            <Row
              label="Width × Length"
              value={
                plot.widthFt && plot.lengthFt
                  ? formatPlotSize(plot.widthFt.toString(), plot.lengthFt.toString())
                  : "Irregular Plot"
              }
            />
            <Row
              label={plot.exactAreaSqFt ? "Area (exact)" : "Area"}
              value={<span className="tabular-nums">{num(plot.areaSqFt)} sq ft</span>}
              hint={
                <span className="tabular-nums">
                  {conv(plot.areaSqYd)} sq yd · {conv(plot.areaSqM)} sq m
                </span>
              }
            />
            {/* With both sides and an override, what the sides multiply to is
                the other half of the reason the override exists. */}
            {plot.exactAreaSqFt && plot.widthFt && plot.lengthFt && (
              <Row
                label="Width × Length area"
                value={<span className="tabular-nums">{num(plot.widthFt.mul(plot.lengthFt))} sq ft</span>}
              />
            )}
            {plot.exactAreaReason && <Row label="Override reason" value={plot.exactAreaReason} />}
          </div>

          <div className="min-w-0">
            <SubHeading>Boundaries</SubHeading>
            {SIDES.map((side) => {
              const b = bySide.get(side);
              return (
                <Row
                  key={side}
                  label={humanise(side)}
                  value={b ? BOUNDARY_KIND_LABEL[b.kind] ?? b.kind : "Not recorded"}
                  hint={
                    b?.kind === "ROAD" && b.roadWidthFt
                      ? `${num(b.roadWidthFt)} ft wide`
                      : (b?.reference ?? undefined)
                  }
                />
              );
            })}
          </div>

          <div className="min-w-0">
            <SubHeading>Layout</SubHeading>
            {plot.widthFt && plot.lengthFt ? (
              <div className="mt-2 flex justify-center">
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
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">An irregular Plot has no sides to draw.</p>
            )}
          </div>
          </div>
        </Section>

        {/* 5 Current Allocation · Booking · 6 Completion */}
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Section title="Current Allocation · Booking" icon={<FileText className="h-3.5 w-3.5" />}>
            {current ? (
              <>
                <Row label="Customer" value={person(current.primaryPerson, { mobile: true })} />
                <Row
                  label={current.bookingNumber ? "Booking" : "Request"}
                  value={
                    <Link href={`/bookings/${current.id}`} className="text-primary hover:underline">
                      {current.bookingNumber ?? current.requestNo}
                    </Link>
                  }
                  hint={current.bookingNumber ? undefined : "Waiting approval"}
                />
                <Row label="Booking Date" value={formatIst(current.bookingDate)} />
                <Row
                  label="Sold By"
                  value={
                    current.soldByType === "THREE_PERCENT_CLUB" || !current.soldByPerson ? (
                      "3% Club"
                    ) : (
                      <>
                        <PersonLink
                          personId={current.soldByPerson.id}
                          name={
                            (current.soldByType === "MEMBER"
                              ? current.soldByPerson.memberProfile?.memberId
                              : current.soldByPerson.customerProfile?.customerId) ?? current.soldByPerson.fullName
                          }
                          as={current.soldByType === "MEMBER" ? "member" : undefined}
                        />
                        <span className={SUB}>{current.soldByPerson.fullName}</span>
                      </>
                    )
                  }
                />
                <Row
                  label="Ownership"
                  value={
                    <>
                      {current.parties.map((p) => (
                        <span key={p.id} className="block">
                          <PersonLink
                            personId={p.personId}
                            name={p.person.customerProfile?.customerId ?? p.person.fullName}
                          />
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {p.role === "PRIMARY" ? "Primary" : "Additional"} ·{" "}
                          </span>
                          <span className="tabular-nums">
                            {p.sharePercent ? `${Number(p.sharePercent).toFixed(2)}%` : "100%"}
                          </span>
                        </span>
                      ))}
                    </>
                  }
                  hint={
                    current.parties.length > 1 && shareTotal !== 100 ? (
                      <span className="text-amber-800">Shares total {shareTotal.toFixed(2)}%, not 100%</span>
                    ) : undefined
                  }
                />
                <Row
                  label="Payment Received"
                  value={<span className="tabular-nums">{current.paymentReceivedPercent.toFixed(2)}%</span>}
                />
                {paymentGiven && <Row label="Payment Given" value={paymentGiven} />}
              </>
            ) : liveAcquisition ? (
              <>
                <Row label="Seller" value={person(liveAcquisition.sellerPerson, { mobile: true })} />
                <Row label="Payment Given" value={paymentGiven} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No Booking on this Plot.</p>
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
                  <Row label="Allotment Number" value={completion.allotmentNumber ?? "—"} />
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
                  <Row label="Delivered On" value={formatIst(completion.deliveredAt)} />
                  <Row label="Advocate" value={completion.advocateName ?? "—"} />
                  <Row
                    label="Registry Date"
                    value={completion.registryDate ? formatIst(completion.registryDate) : "—"}
                  />
                </>
              )
            ) : (
              <p className="text-xs text-muted-foreground">Not completed yet.</p>
            )}
          </Section>
        </div>

        {/* Commission on the deal holding this Plot — percentages only, never a
            rupee amount. Superseded lines stay on the Booking page. */}
        {(current || liveAcquisition) && (
          <Section title="Commission" icon={<Percent className="h-3.5 w-3.5" />}>
            {commissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No commission on this deal.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-xs">
                  <thead className="border-b border-border/50">
                    <tr>
                      <th className={TH}>Type</th>
                      <th className={TH}>Beneficiary</th>
                      <th className={`${TH} text-right`}>%</th>
                      <th className={`${TH} text-right`}>Milestone</th>
                      <th className={TH}>Eligibility</th>
                      <th className={`${TH} pr-0`}>Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {commissions.map((c) => {
                      const who = c.beneficiaryPerson;
                      const code = who.memberProfile?.memberId ?? who.customerProfile?.customerId;
                      return (
                        <tr key={c.id}>
                          <td className={`${TD} font-medium`}>
                            {c.type === "LOYALTY" ? "Loyalty Bonus" : humanise(c.type)}
                          </td>
                          <td className={TD}>
                            <PersonLink
                              personId={who.id}
                              name={code ?? who.fullName}
                              as={who.memberProfile ? "member" : undefined}
                              className="font-semibold"
                            />
                            {code && <span className={SUB}>{who.fullName}</span>}
                          </td>
                          <td className={`${TD} text-right font-medium tabular-nums`}>{c.percent.toFixed(2)}%</td>
                          <td className={`${TD} text-right tabular-nums`}>{c.milestonePercent.toFixed(0)}%</td>
                          <td className={TD}>
                            {eligibilityLabel(c.eligibility, c.type as CommissionType)}
                            {c.holdReason && (
                              <span className="block text-[11px] text-amber-700">{humanise(c.holdReason)}</span>
                            )}
                          </td>
                          <td className={`${TD} pr-0`}>
                            {PAYMENT_LABEL[c.payment] ?? c.payment}
                            {c.paidOn && <span className={SUB}>Paid {formatIst(c.paidOn)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* DESIGN §9.3 — each request names the actual buyer, and expires at the
            working-day cut-off; after that it cannot be approved. */}
        {requests.length > 0 && (
          <Section title={`Member Hold Requests (${requests.length})`} icon={<Users className="h-3.5 w-3.5" />}>
            <ul className="divide-y divide-border/40 text-xs">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-semibold text-foreground">
                      #{r.queuePosition} · For <PersonLink personId={r.person.id} name={r.person.fullName} />
                    </span>
                    <span className={SUB}>
                      Requested by <PersonLink personId={r.member.person.id} name={r.member.memberId} as="member" />{" "}
                      · {r.member.person.fullName} · expires {formatIstDateTime(r.expiresAt)}
                    </span>
                  </span>
                  {canReviewRequests && <HoldRequestDecision requestId={r.id} buyer={r.person.fullName} />}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 7 Past Deals */}
        <Section title="Past Deals" icon={<Layers className="h-3.5 w-3.5" />}>
          {!hasPast ? (
            <p className="text-xs text-muted-foreground">No earlier deals, acquisitions or open enquiries.</p>
          ) : (
            <div className="space-y-4">
              {pastDeals.length > 0 && (
                <div>
                  <SubHeading>Earlier Bookings</SubHeading>
                  <ul className="divide-y divide-border/40 text-xs">
                    {pastDeals.map((d) => (
                      <li key={d.id} className={DEAL_ROW}>
                        <Link href={d.href} className="font-semibold text-primary hover:underline">
                          {d.what}
                        </Link>
                        <span className="min-w-0 truncate">
                          <PersonLink personId={d.who.id} name={d.who.customerProfile?.customerId ?? d.who.fullName} />
                          <span className="text-muted-foreground"> · {d.who.fullName}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground sm:text-right">
                          <span className="text-foreground">{d.outcome}</span> · {formatIst(d.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {acquisitions.length > 0 && (
                <div>
                  <SubHeading>Acquisitions</SubHeading>
                  <ul className="divide-y divide-border/40 text-xs">
                    {acquisitions.map((a) => (
                      <li key={a.id} className={DEAL_ROW}>
                        <Link href={`/acquisitions/${a.id}`} className="font-semibold text-primary hover:underline">
                          {TYPE_LABEL[a.type] ?? "Buyback / Resale"}
                        </Link>
                        <span className="min-w-0 truncate">
                          <span className="text-muted-foreground">Seller </span>
                          <PersonLink
                            personId={a.sellerPerson.id}
                            name={a.sellerPerson.customerProfile?.customerId ?? a.sellerPerson.fullName}
                          />
                          <span className="text-muted-foreground">
                            {" "}
                            · Payment Given {a.paymentGivenPercent.toFixed(2)}%
                          </span>
                        </span>
                        <span className="text-[11px] text-muted-foreground sm:text-right">
                          <span className="text-foreground">
                            {a.status === "CANCELLED" ? "Deal Cancelled" : humanise(a.status)}
                          </span>{" "}
                          · {formatIst(a.submittedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {enquiries.length > 0 && (
                <div>
                  <SubHeading>Open Enquiries</SubHeading>
                  <ul className="divide-y divide-border/40 text-xs">
                    {enquiries.map((e) => (
                      <li key={e.id} className={DEAL_ROW}>
                        <span className="font-medium">{e.enquiryNo}</span>
                        <span className="min-w-0 truncate">
                          <PersonLink
                            personId={e.person.id}
                            name={
                              e.person.customerProfile?.customerId ??
                              e.person.memberProfile?.memberId ??
                              e.person.fullName
                            }
                          />
                          <span className="text-muted-foreground"> · {e.person.fullName}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground sm:text-right">
                          <span className="text-foreground">{humanise(e.status)}</span> · {formatIst(e.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* 8 History */}
        <Section title="History" icon={<History className="h-3.5 w-3.5" />}>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-xs">
              {history.map((h, index) => (
                <li key={index} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{h.title}</span>
                    {h.detail && <span className={SUB}>{h.detail}</span>}
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground">
                    {formatIstDateTime(h.at)}
                    {h.by && <span className="block">{h.by}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
