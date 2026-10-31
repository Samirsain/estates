"use client";

// Bookings — design.md §10, §11.
// Actions are hidden by permission for clarity; the server re-checks every one
// and the domain services re-check state on top of that (DESIGN §1).

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Layers,
  Percent,
  Plus,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { PersonLink } from "@/components/person-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Section, Stat } from "@/components/record-section";
import HistoryButton from "@/app/members/[id]/history-button";
import ShowMore from "@/app/members/[id]/show-more";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { PersonPicker, personLabel } from "@/components/person-picker";
import { capShare, round2, shareRoom, shareSum } from "@/lib/domain/shares";
import {
  addDays,
  fillDatesForward,
  fillForward,
  removeRow,
  scheduleTotal,
} from "@/lib/domain/schedule-edit";
import { eligibilityLabel, rateLabel } from "@/lib/domain/commission";
import {
  formatIst,
  formatIstDate,
  formatIstDateTime,
  formatDimension,
  formatPlotSize,
  formatQuantity,
  istDay,
  remainingPercent,
  type StaffRole,
} from "@/lib/tasks";
import {
  cancelBookingAction,
  changeOwnershipSharesAction,
  confirmPaymentReceivedAction,
  correctPaymentReceivedAction,
  decideBookingRequestAction,
  decidePrimaryCustomerChangeAction,
  decideScheduleRevisionAction,
  decideSoldByCorrectionAction,
  loadBookingDetail,
  approveBeforeOldRecoveryAction,
  approveCommissionPaidEarlyAction,
  clearRecoveryAction,
  closeAdjustmentAction,
  openRecoveryAction,
  rejectCommissionPaidEarlyAction,
  setOffRecoveryAction,
  requestCommissionPaidEarlyAction,
  markCommissionPaidAction,
  requestPrimaryCustomerChangeAction,
  recordCompletionAction,
  recordFinalBuyersAction,
  reopenDeliveredAction,
  requestSoldByCorrectionAction,
  loadChangePlotOptions,
  decideCancellationAction,
  submitChangePlotAction,
  decideChangePlotAction,
  type CompletionRouteInput,
  reviseBookingRequestAction,
  reviseScheduleAction,
  submitBookingRequestAction,
  type ActionResult,
  type BookingDetail,
  type PartyInput,
  type ScheduleRowInput,
} from "./actions";
import { RemarkSelect } from "@/components/ui/remark-select";

export type BookingRowView = {
  id: string;
  requestNo: string;
  bookingNumber: string | null;
  project: string;
  /** The Booking page links back to its Plot's page. */
  plotId: string;
  plotNumber: string;
  /** CONSTANT_CASE from the schema — pass through `humanise` before showing it. */
  plotType: string;
  /** Feet as stored. Both null on an irregular Plot, which has area only. */
  plotWidthFt: string | null;
  plotLengthFt: string | null;
  plotAreaSqFt: string;
  primaryCustomer: string;
  /** CUS-3390 — absent only on a Person who has not reached one yet. */
  primaryCustomerId: string | null;
  primaryCustomerPersonId: string;
  /** CUSTOMER or MEMBER, frozen with the Booking Request (v2.1 §20). */
  originalClassification: string | null;
  /** v2.1 §15, §16 — the Project commission version frozen on the request. Null = Disabled. */
  commissionTerms: { version: number; direct: string | null; loyalty: string | null } | null;
  /** docss/11 — the Royalty token rate frozen on the request. */
  royaltyTokens: number | null;
  /** MEM-0012, where the buyer holds an Active Member profile today. */
  buyerMemberIdNow: string | null;
  soldByType: string;
  soldByName: string | null;
  /** MEM-0012 or CUS-3390 — the 3% Club sells under no code. */
  soldByCode: string | null;
  soldByPersonId: string | null;
  status: string;
  activeProcess: string;
  paymentReceivedPercent: string;
  bookingDate: string;
  submittedAt: string;
  submittedByRef: string;
  pendingReviewVersion: number | null;
};

export type BookableView = {
  id: string;
  projectId: string;
  projectName: string;
  plotNumber: string;
  plotType: string;
  status: string;
  widthFt: string | null;
  lengthFt: string | null;
  areaSqFt: string;
  areaSqYd: string;
  /** One of the named positions a Plot can hold — see locationChargeLabel. */
  locationCharge: string[];
  /** v2.1 §9 — the Project's Active commission settings; null when none are approved. */
  commissionTerms: { version: number; direct: string | null; loyalty: string | null } | null;
  holdId: string | null;
  holdPersonId: string | null;
  holdPersonName: string | null;
};

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export type PersonView = {
  id: string;
  fullName: string;
  mobileMasked: string;
  /** CUS-3390 / MEM-0012, where the Person holds that profile at all. */
  customerId: string | null;
  memberId: string | null;
};
export type MemberView = { personId: string; memberId: string; fullName: string };

type Permissions = {
  submit: boolean;
  decide: boolean;
  cancel: boolean;
  confirmPayment: boolean;
  correctPayment: boolean;
  reviseSchedule: boolean;
  decideSchedule: boolean;
  changeShares: boolean;
  decideCancellation: boolean;
  raiseChangePlot: boolean;
  decideChangePlot: boolean;
  raiseCustomerChange: boolean;
  approveCustomerChange: boolean;
  processCommission: boolean;
  approvePaidEarly: boolean;
  requestPaidEarly: boolean;
  handleRecovery: boolean;
  raiseSoldBy: boolean;
  approveSoldBy: boolean;
  recordFinalBuyers: boolean;
  recordCompletion: boolean;
  reopenDelivered: boolean;
};

const rowButton = "h-7 px-2 text-[11px]";

/** Every column centred under its heading, as on the Customer and Member pages. */
const CTH = "px-2 pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const CTD = "px-2 py-2.5 text-center align-middle";

/** "Show N more" only when there are more; a short list is just the list. */
function MaybeMore({ count, children }: { count: number; children: React.ReactNode }) {
  return count > 0 ? <ShowMore count={count}>{children}</ShowMore> : <>{children}</>;
}

/** DIRECT, INVITE_OVERRIDE — read as words, not as constants. */
const humanise = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

/**
 * DESIGN §4.2 wording, with one change the owner asked for: everything that is
 * waiting on somebody's decision says Waiting Approval, in those words, on
 * every screen — a Plot, a Booking Request, an Acquisition. "Under Review" was
 * the same state under a different name.
 */
const STATUS_LABEL: Record<string, string> = {
  REQUEST_PENDING: "Waiting Approval",
  REQUEST_REJECTED: "Request Rejected",
  REQUEST_CANCELLED: "Request Cancelled",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  REFUND_PENDING: "Refund Pending",
  CANCELLED: "Cancelled",
  DELIVERED: "Delivered",
  // The end of a Buyback, and a status like any other here: without a label it
  // printed as BUYBACK_COMPLETED and was missing from the status filter.
  BUYBACK_COMPLETED: "Buyback Completed",
};

/**
 * A process with no label here is not shown at all — Buyback is run and read
 * on Acquisitions, and repeating it against the Booking only crowds the
 * status the Booking is actually in.
 */
const PROCESS_LABEL: Record<string, string> = {
  NONE: "",
  BUYBACK_PENDING: "",
  REFUND_PENDING: "Refund Pending",
  CHANGE_PLOT_PENDING: "Change Plot Under Process",
  PRIMARY_CUSTOMER_CHANGE_UNDER_REVIEW: "Primary Customer Change — Waiting Approval",
  SOLD_BY_CORRECTION_UNDER_REVIEW: "Sold By Correction — Waiting Approval",
  MANAGEMENT_ACTION_REQUIRED: "Selling Buyback/Resale Plot",
};

const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Recovery Pending",
  CANCELLED: "Cancelled",
};

const HOLD_LABEL: Record<string, string> = {
  AADHAAR_PENDING: "Aadhaar Pending",
  BANK_VERIFICATION_PENDING: "Bank Verification Pending",
  RERA_PENDING: "RERA Pending",
  RERA_EXPIRED: "RERA Expired",
  MEMBER_COMMISSION_HOLD: "Member Commission Hold",
  MEMBER_DEACTIVATED: "Member Deactivated",
  REFUND_PENDING: "Refund Pending",
  CHANGE_PLOT_PENDING: "Change Plot Pending",
  BUYBACK_PENDING: "Buyback Pending",
  PAYMENT_PENDING: "Payment Pending",
  CLOSER_KYC_PENDING: "Closer KYC Pending",
  CUSTOMER_TERMS_PENDING: "Customer Terms Pending",
  RECOVERY_OUTSTANDING: "Recovery Pending",
  OLD_RECOVERY_PENDING: "Waiting for the old beneficiary's Recovery",
  RECOVERY_CIRCUMVENTION_REVIEW: "Recovery Review",
};

/** v2.1 §9 — one line, the same everywhere a Booking states its terms. */
export function termsLine(t: { version: number; direct: string | null; loyalty: string | null }) {
  const rate = (r: string | null) => (r ? `${rateLabel(r)}%` : "Disabled");
  return `Commission settings v${t.version} · Commission ${rate(t.direct)} · Loyalty Points ${rate(t.loyalty)}`;
}

const SOLD_BY_LABEL: Record<string, string> = {
  THREE_PERCENT_CLUB: "3% Club",
  MEMBER: "Member",
  CUSTOMER: "Customer",
};

const REJECT_REASONS = [
  ["PAYMENT_SCHEDULE_INCORRECT", "Payment Schedule Incorrect"],
  ["INCOMPLETE_DETAILS", "Incomplete Details"],
  ["PAYMENT_NOT_RECEIVED", "Payment Not Received"],
  ["OTHER", "Other"],
] as const;

const CANCEL_REASONS = ["Payment Not Received", "Loan Denied", "Other"] as const;

/** Everything the row knows about its Status, for the list table's hover. */
function statusTooltip(row: BookingRowView): string {
  const lines = [STATUS_LABEL[row.status] ?? row.status];
  if (PROCESS_LABEL[row.activeProcess]) lines.push(PROCESS_LABEL[row.activeProcess]);
  // The REQ number is off the screens (ID Guide §5); before approval the
  // Booking has no number to show.
  if (row.bookingNumber) lines.push(row.bookingNumber);
  lines.push(`Booking Date: ${formatIstDate(row.bookingDate)}`);
  lines.push(`Submitted by ${row.submittedByRef} on ${formatIst(row.submittedAt)}`);
  lines.push(`Payment Received: ${row.paymentReceivedPercent}%`);
  if (row.pendingReviewVersion !== null) lines.push("Waiting on the Accounts decision");
  return lines.join("\n");
}

function statusVariant(status: string) {
  if (status === "PAYMENT_COMPLETED") return "purple" as const;
  if (status === "BOOKED") return "success" as const;
  if (status === "REQUEST_PENDING") return "warning" as const;
  if (status.startsWith("REQUEST_") || status === "CANCELLED") return "outline" as const;
  return "info" as const;
}

/**
 * A payment percentage with its ceiling enforced in the box.
 *
 * `max` on a number input only blocks the submit — it does nothing to the
 * digits going in, so a field capped at 70 still let 100 be typed and only
 * argued about it afterwards. Clamping on input means the number in the box is
 * always one the record can actually take. The server still decides: this is
 * the courtesy, not the rule (progressAfter refuses anything above 100%).
 *
 * Payment Received and Payment Given are separate datasets and must never be
 * totalled together (prd-complete §1) — but the ceiling on one entry is the same
 * arithmetic on both, so the field is shared and the caller passes its own max.
 */
export function PaymentPercentInput({
  max,
  defaultValue,
}: {
  max: string;
  defaultValue?: string;
}) {
  return (
    <Input
      name="percent"
      type="number"
      step="0.0001"
      min="0.0001"
      max={max}
      defaultValue={defaultValue}
      required
      onInput={(event) => {
        const field = event.currentTarget;
        if (Number(field.value) > Number(max)) field.value = max;
      }}
    />
  );
}

type Dialog =
  | { kind: "NEW"; plotId?: string; personId?: string }
  | { kind: "REVISE"; row: BookingRowView }
  | { kind: "DECIDE"; row: BookingRowView; approve: boolean }
  | { kind: "CANCEL"; row: BookingRowView }
  | { kind: "PAY"; row: BookingRowView }
  | { kind: "CORRECT"; row: BookingRowView; entryId: string; percent: string; reference: string }
  | { kind: "SCHEDULE"; row: BookingRowView }
  | { kind: "SCHEDULE_DECIDE"; row: BookingRowView; approve: boolean }
  | { kind: "SHARES"; row: BookingRowView }
  | { kind: "CUSTOMER_CHANGE"; row: BookingRowView }
  | { kind: "CUSTOMER_CHANGE_DECIDE"; row: BookingRowView; approve: boolean }
  | { kind: "COMMISSION_PAY"; row: BookingRowView; recordId: string; label: string; early: boolean }
  | { kind: "COMMISSION_EARLY_APPROVE"; row: BookingRowView; recordId: string; label: string }
  | { kind: "COMMISSION_EARLY_REQUEST"; row: BookingRowView; recordId: string; label: string }
  | { kind: "COMMISSION_EARLY_REJECT"; row: BookingRowView; recordId: string; label: string }
  | { kind: "RECOVERY_OPEN"; row: BookingRowView; recordId: string; label: string }
  | { kind: "BEFORE_RECOVERY_APPROVE"; row: BookingRowView; recordId: string; label: string }
  | { kind: "ADJUSTMENT_CLOSE"; row: BookingRowView; recordId: string; label: string }
  | { kind: "RECOVERY_CLEAR"; row: BookingRowView; recoveryId: string; label: string }
  | { kind: "RECOVERY_SET_OFF"; row: BookingRowView; recoveryId: string; recordId: string; label: string }
  | { kind: "SOLD_BY"; row: BookingRowView }
  | { kind: "SOLD_BY_DECIDE"; row: BookingRowView; approve: boolean }
  | { kind: "FINAL_BUYERS"; row: BookingRowView }
  | { kind: "COMPLETION"; row: BookingRowView }
  | { kind: "DELIVER"; row: BookingRowView }
  | { kind: "REOPEN"; row: BookingRowView }
  | { kind: "CANCEL_DECIDE"; row: BookingRowView; approve: boolean }
  | { kind: "CHANGE_PLOT"; row: BookingRowView }
  | { kind: "CHANGE_PLOT_DECIDE"; row: BookingRowView; approve: boolean }
  | null;

export default function BookingsClient({
  role,
  actorName,
  staffAccountId,
  staffRef,
  rows,
  bookable,
  focusId,
  startFor,
  initialOpen,
  people,
  members,
  permissions,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  staffRef: string;
  rows: BookingRowView[];
  bookable: BookableView[];
  /** A Plot id from ?plot=, so Plot Inventory's Book button lands on the form. */
  /** Set on /bookings/[id]: one Booking, full page, instead of the list. */
  focusId: string | null;
  /** A Person id from ?for= on a Customer profile: Start Booking opens for them. */
  startFor?: string | null;
  /** From a Plot's own page: ?open=CANCEL | CHANGE_PLOT starts that on the focused Booking. */
  initialOpen?: string | null;
  people: PersonView[];
  members: MemberView[];
  permissions: Permissions;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [projectFilter, setProjectFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const projects = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.project))).sort(),
    [rows]
  );
  // The Cancel Booking remark is compulsory only when the reason is Other.
  const [cancelReason, setCancelReason] = React.useState("");
  const [dialog, setDialog] = React.useState<Dialog>(() => {
    if (startFor && permissions.submit) return { kind: "NEW", personId: startFor };
    // Opened from the Plot's page on one Booking. Only what that Booking's own
    // buttons would offer is opened, under the same rules.
    const row = focusId ? rows.find((r) => r.id === focusId) : undefined;
    if (!row) return null;
    if (
      initialOpen === "CANCEL" &&
      ["REQUEST_PENDING", "BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
      permissions.cancel
    ) {
      return { kind: "CANCEL", row };
    }
    if (
      initialOpen === "CHANGE_PLOT" &&
      ["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
      row.activeProcess === "NONE" &&
      permissions.raiseChangePlot
    ) {
      return { kind: "CHANGE_PLOT", row };
    }
    return null;
  });
  const [openId, setOpenId] = React.useState<string | null>(focusId);
  const [detail, setDetail] = React.useState<BookingDetail | null>(null);

  // The full page is one Booking, so its detail is fetched on arrival rather
  // than waiting for a click that no longer exists.
  const focusRow = focusId ? (rows.find((r) => r.id === focusId) ?? null) : null;
  React.useEffect(() => {
    if (focusId) loadBookingDetail(focusId).then(setDetail);
  }, [focusId]);

  const visible = rows.filter(
    (r) =>
      (statusFilter === "ALL" || r.status === statusFilter) &&
      (projectFilter === "ALL" || r.project === projectFilter) &&
      (search.trim() === "" ||
        `${r.bookingNumber ?? ""} ${r.requestNo} ${r.project} ${r.plotType} ${r.plotNumber} ${r.primaryCustomer}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

  /**
   * Dialogs read `detail` — the submitted snapshot, the live schedule, the
   * parties — and only the row expander used to load it. Opened straight from
   * a row's button, they sat on data nobody had asked for: "Loading…" that
   * never finished. Opening a dialog asks for it too.
   */
  async function openDialog(next: Dialog) {
    setDialog(next);
    setCancelReason("");
    if (!next || !("row" in next)) return;
    if (detail?.id === next.row.id) return;
    // The row being acted on becomes the open row, so the panel underneath and
    // the dialog above it are never two different Bookings.
    setOpenId(next.row.id);
    setDetail(null);
    setDetail(await loadBookingDetail(next.row.id));
  }

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    setNotice(
      result.ok ? { kind: "ok", text: result.message ?? "Done." } : { kind: "error", text: result.error }
    );
    if (result.ok) {
      setDialog(null);
      if (openId) setDetail(await loadBookingDetail(openId));
      router.refresh();
    }
  }

  const newKey = () => globalThis.crypto.randomUUID();

  /**
   * The one next step on this Booking, beside History — as on the Customer and
   * Member pages. Everything else it allows waits under More.
   */
  function primaryAction(row: BookingRowView) {
    if (row.status === "REQUEST_PENDING" && permissions.decide) {
      return (
        <Button size="sm" onClick={() => openDialog({ kind: "DECIDE", row, approve: true })}>
          Review
        </Button>
      );
    }
    // Fully paid is the end of this button, not a form that opens and then
    // refuses. Payment Completed still qualifies while anything remains — a
    // correction can step the total back below 100 — so the gate is what is
    // left, not the status.
    if (
      ["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
      permissions.confirmPayment &&
      Number(remainingPercent(row.paymentReceivedPercent)) > 0
    ) {
      return (
        <Button size="sm" onClick={() => openDialog({ kind: "PAY", row })}>
          Record Payment
        </Button>
      );
    }
    // Paid in full: the one step left is the legal end of the sale (owner,
    // 28 Oct 2026). The form asks for both halves — the final buyers and the
    // route — as Plot Inventory's Deliver did.
    if (row.status === "PAYMENT_COMPLETED" && permissions.recordFinalBuyers && permissions.recordCompletion) {
      return (
        <Button size="sm" onClick={() => openDialog({ kind: "DELIVER", row })}>
          Delivered
        </Button>
      );
    }
    return null;
  }

  /** Every other change this Booking allows now, under the same rules as before. */
  function moreMenu(row: BookingRowView) {
    const loaded = detail?.id === row.id ? detail : null;
    const live = ["BOOKED", "PAYMENT_COMPLETED"].includes(row.status);
    const items: Array<{ label: string; open: Dialog; danger?: boolean }> = [];
    if (row.status === "REQUEST_PENDING" && permissions.submit) items.push({ label: "Revise request", open: { kind: "REVISE", row } });
    if (loaded) {
      if (live && permissions.changeShares) items.push({ label: "Change ownership shares", open: { kind: "SHARES", row } });
      if (live && permissions.raiseCustomerChange && !loaded.customerChanges.some((c) => c.status === "PENDING")) {
        items.push({ label: "Change Primary Customer", open: { kind: "CUSTOMER_CHANGE", row } });
      }
      if (
        (live || row.status === "DELIVERED") &&
        permissions.raiseSoldBy &&
        !loaded.soldByCorrections.some((c) => c.status === "PENDING")
      ) {
        items.push({ label: "Sold By Correction", open: { kind: "SOLD_BY", row } });
      }
      if (
        permissions.reviseSchedule &&
        loaded.scheduleVersions.some((v) => v.status === "ACTIVE") &&
        !loaded.scheduleVersions.some((v) => v.status === "PENDING")
      ) {
        items.push({ label: "Revise Payment Schedule", open: { kind: "SCHEDULE", row } });
      }
    }
    // PRD §5.1 — Change Plot applies before Delivered, one process at a time.
    if (live && row.activeProcess === "NONE" && permissions.raiseChangePlot) {
      items.push({ label: "Change Plot", open: { kind: "CHANGE_PLOT", row } });
    }
    if ((row.status === "REQUEST_PENDING" || live) && permissions.cancel) {
      items.push({ label: row.status === "REQUEST_PENDING" ? "Cancel Request" : "Cancel Booking", open: { kind: "CANCEL", row }, danger: true });
    }
    if (items.length === 0) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            More <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onSelect={() => openDialog(item.open)}
              className={item.danger ? "text-red-700 focus:text-red-700" : undefined}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  /** The Booking's events and every request version, newest first, for the History button. */
  function historyRows(d: BookingDetail) {
    return [
      ...d.events.map((e) => ({
        at: e.at,
        title: humanise(e.action),
        detail:
          [
            e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus
              ? `${STATUS_LABEL[e.fromStatus] ?? e.fromStatus} → ${STATUS_LABEL[e.toStatus] ?? e.toStatus}`
              : null,
            e.reason,
          ]
            .filter(Boolean)
            .join(" — ") || undefined,
        by: e.actorRef,
      })),
      ...d.reviewVersions.map((v) => ({
        at: v.decidedAt ?? v.submittedAt,
        title: `Request version ${v.version} — ${humanise(v.status)}`,
        detail:
          [v.decisionNote, v.rejectReason ? humanise(v.rejectReason) : null].filter(Boolean).join(" · ") || undefined,
        by: v.decidedByRef ?? v.submittedByRef,
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((h) => ({ ...h, at: formatIstDateTime(h.at) }));
  }

  const noticeCard = notice && (
    <Card
      className={`p-4 ${
        notice.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
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
        {notice.text}
      </p>
    </Card>
  );

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      {/* One Booking gets the page to itself. The row used to unfold this
          underneath the list, which put a form-length panel inside a table and
          left the actions stranded in a seventh column. */}
      {focusRow ? (
        <div className="space-y-4">
          {/* Back and what is under way on the left; History, the one next step
              and More on the right — as on the Customer, Member and Plot pages. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/bookings"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Bookings
              </Link>
              {PROCESS_LABEL[focusRow.activeProcess] && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {PROCESS_LABEL[focusRow.activeProcess]}
                </Badge>
              )}
              {/* A pending request's own schedule is decided by its Review, not as a revision. */}
              {focusRow.status !== "REQUEST_PENDING" &&
                detail?.id === focusRow.id &&
                detail.scheduleVersions.some((v) => v.status === "PENDING") && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Schedule revision waiting
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {detail?.id === focusRow.id && <HistoryButton rows={historyRows(detail)} />}
              {primaryAction(focusRow)}
              {moreMenu(focusRow)}
            </div>
          </div>
          {noticeCard}

          {/* 1 Header · 2 Summary. The Booking Number is generated, not chosen,
              and nobody reads a page to find out what it is: the title is who
              bought, the numbers sit on the line under it. */}
          <Card className="p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Receipt className="h-6 w-6" />
              </div>
              <div className="min-w-fit flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{focusRow.primaryCustomer}</h1>
                  <Badge variant={statusVariant(focusRow.status)}>
                    {STATUS_LABEL[focusRow.status] ?? focusRow.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">
                  <Link href={`/plots/${focusRow.plotId}`} className="font-medium text-primary hover:underline">
                    {focusRow.plotNumber} · {focusRow.project}
                  </Link>
                  <span className="text-muted-foreground"> · {humanise(focusRow.plotType)}</span>
                </p>
              </div>

              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                <Stat
                  label="Received"
                  value={`${Number(focusRow.paymentReceivedPercent)}%`}
                  hint={
                    Number(remainingPercent(focusRow.paymentReceivedPercent)) > 0
                      ? `${Number(remainingPercent(focusRow.paymentReceivedPercent))}% remaining`
                      : "Paid in full"
                  }
                />
                <Stat
                  label="Sold By"
                  value={
                    focusRow.soldByPersonId ? (
                      <>
                        <PersonLink
                          personId={focusRow.soldByPersonId}
                          name={focusRow.soldByCode ?? focusRow.soldByName ?? "—"}
                          as={focusRow.soldByType === "MEMBER" ? "member" : undefined}
                        />
                        {focusRow.soldByCode && focusRow.soldByName && (
                          <span className="block text-foreground">{focusRow.soldByName}</span>
                        )}
                      </>
                    ) : (
                      "3% Club"
                    )
                  }
                  hint={SOLD_BY_LABEL[focusRow.soldByType] ?? focusRow.soldByType}
                />
              </dl>
            </div>
          </Card>

          <BookingDetailPanel
            row={focusRow}
            detail={detail}
            people={people}
            permissions={permissions}
            onAction={setDialog}
          />
        </div>
      ) : (
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {visible.length} of {rows.length} · percentages only, no rupee value · times in Asia/Kolkata
            </p>
          </div>
          {permissions.submit && (
            <Button size="sm" variant="gradient" onClick={() => openDialog({ kind: "NEW" })}>
              <Plus className="mr-1 h-4 w-4" /> Start Booking
            </Button>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-2">
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
          <select
            className={filterClass}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Filter by project"
          >
            <option value="ALL">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-96"
            placeholder="Search Booking Number, Request ID, Plot or Customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {noticeCard}

        {/* Plot Inventory's table: a rule between rows, no block of colour
            behind each one. The Booking Number is the page it opens, not a
            column of its own. */}
        {visible.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm font-semibold">No Bookings match these filters.</p>
            <p className="mt-1 text-xs font-medium text-foreground">
              Start one from an Available Plot or a live Hold.
            </p>
          </Card>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-sm">
            <thead className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-1">Plot No.</th>
                <th className="px-3 py-1 text-center">Size (W × L)</th>
                <th className="px-3 py-1">Customer</th>
                <th className="px-3 py-1">Sold By</th>
                <th className="px-3 py-1 text-center">Status</th>
                <th className="px-3 py-1 text-center">Payment</th>
                <th className="px-3 py-1 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="h-14 border-b border-border/60 align-middle transition-colors hover:bg-secondary/50 [&>td]:px-3 [&>td]:py-2"
                >
                  {/* As on Plot Inventory: the Plot number is the way into the
                      Booking, with its Project and type under it. */}
                  <td>
                    <button
                      type="button"
                      className="block text-left font-semibold text-primary hover:underline"
                      onClick={() => router.push(`/bookings/${row.id}`)}
                    >
                      {row.plotNumber}
                    </button>
                    <span className="block text-[11px] font-medium text-foreground">
                      {row.project}
                      <span className="text-muted-foreground">
                        {" · "}
                        {humanise(row.plotType)}
                      </span>
                    </span>
                  </td>
                  {/* An irregular Plot has no width and length to print, only
                      the area somebody measured — so it prints that instead of
                      an empty cell. */}
                  <td className="whitespace-nowrap text-center tabular-nums">
                    {/* Same three columns as the Plot Inventory list: a side
                        with inches is wider than one without, so the cross is
                        pinned to the middle rather than left to wander down
                        the column. */}
                    {formatPlotSize(row.plotWidthFt, row.plotLengthFt) ? (
                      <span className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-1.5">
                        <span className="text-right">{formatDimension(row.plotWidthFt!)}</span>
                        <span className="text-muted-foreground">×</span>
                        <span className="text-left">{formatDimension(row.plotLengthFt!)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {formatQuantity(row.plotAreaSqFt)} sq ft
                      </span>
                    )}
                  </td>
                  {/* The id leads and opens the profile; the name underneath
                      confirms it without competing for the eye. */}
                  <td>
                    <PersonLink
                      personId={row.primaryCustomerPersonId}
                      name={row.primaryCustomerId ?? row.primaryCustomer}
                      className={row.primaryCustomerId ? "font-semibold" : undefined}
                    />
                    {row.primaryCustomerId && (
                      <span className="block text-[11px] text-muted-foreground">
                        {row.primaryCustomer}
                      </span>
                    )}
                  </td>
                  <td>
                    {/* MEM- is a Member and CUS- is a Customer, so the ID says
                        which kind of seller this is without a word above it
                        repeating the same thing. Only the 3% Club, which sells
                        under no ID, is named. */}
                    {row.soldByCode ? (
                      <PersonLink
                        personId={row.soldByPersonId}
                        name={row.soldByCode}
                        as={row.soldByType === "MEMBER" ? "member" : undefined}
                        className="font-medium tabular-nums"
                      />
                    ) : (
                      (SOLD_BY_LABEL[row.soldByType] ?? row.soldByType)
                    )}
                    {row.soldByName && (
                      <span className="block text-[11px] text-muted-foreground">
                        {row.soldByName}
                      </span>
                    )}
                  </td>
                  <td className="text-center" title={statusTooltip(row)}>
                    <Badge variant={statusVariant(row.status)} className="whitespace-nowrap">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {PROCESS_LABEL[row.activeProcess] && (
                      <span className="block text-[11px] text-amber-800">
                        {PROCESS_LABEL[row.activeProcess]}
                      </span>
                    )}
                  </td>
                  <td className="text-center tabular-nums">{row.paymentReceivedPercent}%</td>
                  {/* As on Acquisitions: Payment is the one action taken from
                      the list, gated exactly like Confirm Payment on the
                      Booking's page; once paid in full, Delivered takes its
                      place, gated like the page's Delivered (owner, 30 Oct
                      2026). The rest need the record in front of you. */}
                  <td className="text-center">
                    {["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
                    permissions.confirmPayment &&
                    Number(remainingPercent(row.paymentReceivedPercent)) > 0 ? (
                      <Button
                        className={rowButton}
                        variant="outline"
                        onClick={() => openDialog({ kind: "PAY", row })}
                      >
                        <Wallet className="mr-1 h-3 w-3" /> Payment
                      </Button>
                    ) : row.status === "PAYMENT_COMPLETED" &&
                      permissions.recordFinalBuyers &&
                      permissions.recordCompletion ? (
                      <Button className={rowButton} onClick={() => openDialog({ kind: "DELIVER", row })}>
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Delivered
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
      )}

      {dialog?.kind === "NEW" && (
        <BookingFormDialog
          title="Start Booking Request"
          initialPlotId={dialog.plotId}
          initialPersonId={dialog.personId}
          bookable={bookable}
          people={people}
          members={members}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(form) => run(() => submitBookingRequestAction(form, newKey()))}
        />
      )}

      {dialog?.kind === "REVISE" && (
        <BookingFormDialog
          title={`Send a corrected request — ${dialog.row.project} ${dialog.row.plotNumber}`}
          bookable={bookable}
          people={people}
          members={members}
          busy={busy}
          fixedPlot={{ project: dialog.row.project, plot: dialog.row.plotNumber }}
          requireReason
          onClose={() => setDialog(null)}
          onSubmit={(form) =>
            run(() =>
              reviseBookingRequestAction(
                {
                  bookingId: dialog.row.id,
                  parties: form.parties,
                  soldByType: form.soldByType,
                  soldByPersonId: form.soldByPersonId,
                  bookingDate: form.bookingDate,
                  bookingDateReason: form.bookingDateReason,
                  remark: form.remark,
                  schedule: form.schedule,
                  reason: form.reason ?? "",
                },
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "DECIDE" && (
        <ReviewDialog
          row={dialog.row}
          detail={detail}
          selfRef={staffRef}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) => run(() => decideBookingRequestAction({ ...input, bookingId: dialog.row.id }, newKey()))}
        />
      )}

      {dialog?.kind === "CANCEL" && (
        <ActionDialog
          title="Cancel Booking"
          row={dialog.row}
          consequence={
            dialog.row.status === "REQUEST_PENDING"
              ? "Before Accounts approval this closes the Booking Request only. It does not enter Refund Pending, no permanent cancellation is created, and the linked Enquiry stays Active."
              : "After approval this starts the formal cancellation. The Booking enters Refund Pending, the Plot is blocked and Accounts receives a refund verification task."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              cancelBookingAction(
                dialog.row.id,
                String(f.get("reason")),
                String(f.get("remark") ?? ""),
                newKey()
              )
            )
          }
        >
          <Field label="Cancellation Reason">
            <select
              name="reason"
              required
              className={inputClass}
              defaultValue=""
              onChange={(e) => setCancelReason(e.target.value)}
            >
              <option value="" disabled>
                Select a reason
              </option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Remark — compulsory for Other">
            <RemarkSelect presets="cancelBooking" name="remark" required={cancelReason === "Other"} />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "PAY" && (
        <ActionDialog
          title="Confirm Payment Received"
          row={dialog.row}
          consequence={`Payment Received This Time is incremental, not cumulative. It lands on the oldest unpaid instalment first. Received so far is ${dialog.row.paymentReceivedPercent}%, so at most ${remainingPercent(dialog.row.paymentReceivedPercent)}% remains.`}
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
                  payerName: String(f.get("payerName") ?? ""),
                  payerReference: String(f.get("payerReference") ?? ""),
                },
                newKey()
              )
            )
          }
        >
          {/* Not max 100: 100 is the whole Booking, and this field is one
              payment against what is left of it. */}
          <Field label={`Payment Received This Time (%) — ${remainingPercent(dialog.row.paymentReceivedPercent)}% remaining`}>
            <PaymentPercentInput max={remainingPercent(dialog.row.paymentReceivedPercent)} />
          </Field>
          <Field label="Payment Date">
            <Input name="paidOn" type="date" defaultValue={istDay(new Date())} max={istDay(new Date())} required />
          </Field>
          <Field label="Payment Reference No.">
            <Input name="reference" required />
          </Field>
          <Field label="Remark">
            <RemarkSelect presets="paymentReceived" name="remark" />
          </Field>
          {/* SSOT §22; CP §15 — recorded for Accounts review when the money did not come from the buyer. */}
          <details className="rounded-md border border-border/60 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Paid by someone other than the buyer?</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Third-party payer name">
                <Input name="payerName" />
              </Field>
              <Field label="Payer reference (account / UTR)">
                <Input name="payerReference" />
              </Field>
            </div>
          </details>
        </ActionDialog>
      )}

      {dialog?.kind === "CORRECT" && (
        <ActionDialog
          title="Correct Payment Entry"
          row={dialog.row}
          consequence={`The original entry of ${dialog.percent}% against reference ${dialog.reference} is never deleted — it and its reference become Superseded, and the replacement links to them. A correction must be verified by a different staff account.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              correctPaymentReceivedAction(
                {
                  entryId: dialog.entryId,
                  percent: String(f.get("percent")),
                  paidOn: String(f.get("paidOn")),
                  reference: String(f.get("reference")),
                  reason: String(f.get("reason")),
                },
                newKey()
              )
            )
          }
        >
          <Field label="Corrected percentage (%)">
            <Input name="percent" type="number" step="0.0001" min="0.0001" max="100" defaultValue={dialog.percent} required />
          </Field>
          <Field label="Payment Date">
            <Input name="paidOn" type="date" defaultValue={istDay(new Date())} max={istDay(new Date())} required />
          </Field>
          <Field label="Replacement Payment Reference No.">
            <Input name="reference" required />
          </Field>
          <Field label="Correction reason — compulsory">
            <RemarkSelect presets="correctPayment" name="reason" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "SCHEDULE" && (
        <ScheduleDialog
          row={dialog.row}
          detail={detail}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(schedule, reason) =>
            run(() => reviseScheduleAction({ bookingId: dialog.row.id, schedule, reason }, newKey()))
          }
        />
      )}

      {dialog?.kind === "SCHEDULE_DECIDE" && (
        <ActionDialog
          title={dialog.approve ? "Approve schedule revision" : "Reject schedule revision"}
          row={dialog.row}
          consequence={
            dialog.approve
              ? "Received portions carry forward locked. The old schedule stays in History as Superseded."
              : "The live schedule is unchanged and the revision stays in History as Rejected."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              decideScheduleRevisionAction(dialog.row.id, dialog.approve, String(f.get("note")), newKey())
            )
          }
        >
          <Field label="Remark — compulsory">
            <RemarkSelect presets="decideSchedule" name="note" required kind={dialog.approve ? "Approved" : "Rejected"} />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "SHARES" && (
        <SharesDialog
          row={dialog.row}
          detail={detail}
          people={people}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(parties, reason) =>
            run(() => changeOwnershipSharesAction({ bookingId: dialog.row.id, parties, reason }, newKey()))
          }
        />
      )}

      {dialog?.kind === "CUSTOMER_CHANGE" && (
        <ActionDialog
          title="Change Primary Customer"
          row={dialog.row}
          consequence={`${dialog.row.primaryCustomer} remains the official commercial Booking Customer until Accounts approves. The Booking Number, Plot, Payment Received percentage and Payment Reference Numbers all carry forward unchanged.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              requestPrimaryCustomerChangeAction(
                {
                  bookingId: dialog.row.id,
                  toPersonId: String(f.get("toPersonId")),
                  reason: String(f.get("reason")),
                },
                newKey()
              )
            )
          }
        >
          <Field label="Proposed new Primary Customer">
            <PersonPicker
              name="toPersonId"
              required
              options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
            />
          </Field>
          <Field label="Reason — compulsory">
            <RemarkSelect presets="changePrimary" name="reason" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "SOLD_BY" && (
        <Modal
          title={`Sold By Correction — ${dialog.row.bookingNumber ?? "Booking Request"}`}
          description="Nothing changes until MD approves. Booking and Payment history are never touched by this correction."
          onClose={() => setDialog(null)}
        >
          <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
            <p className="font-semibold text-foreground">
              Current: {SOLD_BY_LABEL[dialog.row.soldByType] ?? dialog.row.soldByType}
              {dialog.row.soldByName ? ` · ${dialog.row.soldByName}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              On approval the old commission records are superseded and new valid ones are created.
              Anything already Paid or Paid Early becomes Recovery Pending.
            </p>
          </div>
          <SoldByForm
            people={people}
            members={members}
            busy={busy}
            onClose={() => setDialog(null)}
            onSubmit={(form) =>
              run(() =>
                requestSoldByCorrectionAction({ ...form, bookingId: dialog.row.id }, newKey())
              )
            }
          />
        </Modal>
      )}

      {dialog?.kind === "SOLD_BY_DECIDE" && (
        <ActionDialog
          title={dialog.approve ? "Approve Sold By Correction" : "Reject Sold By Correction"}
          row={dialog.row}
          consequence={
            dialog.approve
              ? "The attribution moves, old commission records are superseded and new valid ones are created. Paid and Paid Early records become Recovery Pending. Booking and Payment history are unchanged."
              : "The attribution and every commission record stay exactly as they are."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              decideSoldByCorrectionAction(dialog.row.id, dialog.approve, String(f.get("note")), newKey())
            )
          }
        >
          <Field label="Remark — compulsory">
            <RemarkSelect presets="decideSoldBy" name="note" required kind={dialog.approve ? "Approved" : "Rejected"} />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "COMMISSION_PAY" && (
        <ActionDialog
          title={dialog.early ? "Mark Commission Paid Early" : "Mark Commission Paid"}
          row={dialog.row}
          consequence={
            dialog.early
              ? `${dialog.label}. Eligibility is not Ready, so this is Paid Early: MD has approved it, remarks are compulsory, eligibility keeps updating separately, and no second payment task is raised when the required payment is received. It can never be marked Paid again.`
              : `${dialog.label}. The record is Ready and is recorded as Paid against the reference below.`
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              markCommissionPaidAction(
                {
                  recordId: dialog.recordId,
                  early: dialog.early,
                  paidOn: String(f.get("paidOn")),
                  reference: String(f.get("reference")),
                  remarks: String(f.get("remarks") ?? ""),
                },
                newKey()
              )
            )
          }
        >
          <Field label="Paid Date">
            <Input name="paidOn" type="date" defaultValue={istDay(new Date())} max={istDay(new Date())} required />
          </Field>
          <Field label="Payment Reference No.">
            <Input name="reference" required />
          </Field>
          <Field label={dialog.early ? "Remarks — compulsory" : "Remarks"}>
            <RemarkSelect presets="commissionPaid" name="remarks" required={dialog.early} />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "COMMISSION_EARLY_APPROVE" && (
        <ActionDialog
          title="Approve Paid Early"
          row={dialog.row}
          consequence={`${dialog.label}. Approving lets Accounts process this commission before its eligibility conditions are met. Your name and the time are stored on the commission record permanently.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              approveCommissionPaidEarlyAction(
                { recordId: dialog.recordId, note: String(f.get("note")) },
                newKey()
              )
            )
          }
        >
          <Field label="Approval note — compulsory">
            <RemarkSelect presets="approvePaidEarly" name="note" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "BEFORE_RECOVERY_APPROVE" && (
        <ActionDialog
          title="Pay before the old Recovery"
          row={dialog.row}
          consequence={`${dialog.label}. The old beneficiary's paid record on this Booking is still to be recovered. Approving lets this corrected beneficiary be paid now.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => approveBeforeOldRecoveryAction({ recordId: dialog.recordId, note: String(f.get("note")) }, newKey()))
          }
        >
          <Field label="Note — compulsory">
            <RemarkSelect presets="payBeforeRecovery" name="note" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "RECOVERY_OPEN" && (
        <ActionDialog
          title="Open Recovery"
          row={dialog.row}
          consequence={`${dialog.label}. A Recovery is opened as Recovery Pending, due 15 calendar days after the notice date. New cash payouts to this Person are held until it is repaid or set off. No amount is recorded in the CRM.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              openRecoveryAction(
                {
                  recordId: dialog.recordId,
                  noticeOn: String(f.get("noticeOn")),
                  reference: String(f.get("reference")),
                  reason: String(f.get("reason")),
                },
                newKey()
              )
            )
          }
        >
          <Field label="Notice date">
            <Input name="noticeOn" type="date" defaultValue={istDay(new Date())} max={istDay(new Date())} required />
          </Field>
          <Field label="Accounts Recovery Reference">
            <Input name="reference" required />
          </Field>
          <Field label="Reason — compulsory">
            <RemarkSelect presets="openRecovery" name="reason" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "ADJUSTMENT_CLOSE" && (
        <ActionDialog
          title="Close adjustment without Recovery"
          row={dialog.row}
          consequence={`${dialog.label}. Nothing is to be recovered — for example the required payment was received again, or the new Plot did not lower the amount. The reason is kept.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => closeAdjustmentAction({ recordId: dialog.recordId, reason: String(f.get("reason")) }, newKey()))
          }
        >
          <Field label="Reason — compulsory">
            <RemarkSelect presets="closeAdjustment" name="reason" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "RECOVERY_CLEAR" && (
        <ActionDialog
          title="Recovery repaid"
          row={dialog.row}
          consequence={`${dialog.label}. The Recovery is cleared as repaid, and payouts it was holding are released if nothing else holds them.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => clearRecoveryAction({ recoveryId: dialog.recoveryId, note: String(f.get("note")) }, newKey()))
          }
        >
          <Field label="Note — compulsory">
            <RemarkSelect presets="recoveryRepaid" name="note" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "RECOVERY_SET_OFF" && (
        <ActionDialog
          title="Set off against Recovery"
          row={dialog.row}
          consequence={`${dialog.label}. This benefit is recorded as Paid by set-off instead of a cash payout. Say whether it settles the Recovery in full; the amounts are checked outside the CRM.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              setOffRecoveryAction(
                {
                  recoveryId: dialog.recoveryId,
                  recordId: dialog.recordId,
                  reference: String(f.get("reference")),
                  setOffOn: String(f.get("setOffOn")),
                  note: String(f.get("note")),
                  clearsRecovery: f.get("clears") === "on",
                },
                newKey()
              )
            )
          }
        >
          <Field label="Set-off date">
            <Input name="setOffOn" type="date" defaultValue={istDay(new Date())} max={istDay(new Date())} required />
          </Field>
          <Field label="Set-off reference">
            <Input name="reference" required />
          </Field>
          <Field label="Note — compulsory">
            <RemarkSelect presets="recoverySetOff" name="note" required />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="clears" defaultChecked />
            This settles the Recovery in full
          </label>
        </ActionDialog>
      )}

      {dialog?.kind === "COMMISSION_EARLY_REQUEST" && (
        <ActionDialog
          title="Request Paid Early"
          row={dialog.row}
          consequence={`${dialog.label}. MD receives a Paid Early Approval task. Nothing can be paid early until MD approves.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              requestCommissionPaidEarlyAction(
                { recordId: dialog.recordId, reason: String(f.get("reason")) },
                newKey()
              )
            )
          }
        >
          <Field label="Reason — compulsory">
            <RemarkSelect presets="requestPaidEarly" name="reason" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "COMMISSION_EARLY_REJECT" && (
        <ActionDialog
          title="Reject Paid Early"
          row={dialog.row}
          consequence={`${dialog.label}. The request is cleared; the commission waits for its normal eligibility, and Accounts may ask again.`}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              rejectCommissionPaidEarlyAction({ recordId: dialog.recordId, note: String(f.get("note")) }, newKey())
            )
          }
        >
          <Field label="Note — compulsory">
            <RemarkSelect presets="rejectPaidEarly" name="note" required />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "CUSTOMER_CHANGE_DECIDE" && (
        <ActionDialog
          title={dialog.approve ? "Approve Primary Customer change" : "Reject Primary Customer change"}
          row={dialog.row}
          consequence={
            dialog.approve
              ? "The new Customer becomes official. Both Customers remain permanently visible in History."
              : "The old Customer remains official. No payment or commission change is applied."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              decidePrimaryCustomerChangeAction(dialog.row.id, dialog.approve, String(f.get("note")), newKey())
            )
          }
        >
          <Field label="Remark — compulsory">
            <RemarkSelect presets="decidePrimary" name="note" required kind={dialog.approve ? "Approved" : "Rejected"} />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "FINAL_BUYERS" && (
        <FinalBuyersDialog
          row={dialog.row}
          detail={detail}
          people={people}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(rows) => run(() => recordFinalBuyersAction(dialog.row.id, rows, newKey()))}
        />
      )}

      {dialog?.kind === "DELIVER" && (
        <DeliverDialog
          row={dialog.row}
          detail={detail}
          people={people}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={({ buyers, completion }) =>
            run(async () => {
              // Two commands, in order: the route refuses to run without the
              // buyers, and stopping on the first failure never leaves half a
              // delivery behind.
              const saved = await recordFinalBuyersAction(dialog.row.id, buyers, newKey());
              if (!saved.ok) return saved;
              return recordCompletionAction(dialog.row.id, completion, newKey());
            })
          }
        />
      )}

      {dialog?.kind === "COMPLETION" && (
        <CompletionDialog
          row={dialog.row}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) => run(() => recordCompletionAction(dialog.row.id, input, newKey()))}
        />
      )}

      {dialog?.kind === "CANCEL_DECIDE" && (
        <CancellationDecisionDialog
          row={dialog.row}
          approve={dialog.approve}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) =>
            run(() => decideCancellationAction({ ...input, bookingId: dialog.row.id }, newKey()))
          }
        />
      )}

      {dialog?.kind === "CHANGE_PLOT" && (
        <ChangePlotDialog
          row={dialog.row}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(toPlotId, remark) =>
            run(() => submitChangePlotAction(dialog.row.id, toPlotId, remark, newKey()))
          }
        />
      )}

      {dialog?.kind === "CHANGE_PLOT_DECIDE" && (
        <ChangePlotDecisionDialog
          row={dialog.row}
          approve={dialog.approve}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) =>
            run(() => decideChangePlotAction({ ...input, bookingId: dialog.row.id }, newKey()))
          }
        />
      )}

      {dialog?.kind === "REOPEN" && (
        <ActionDialog
          title="Reopen a Delivered Booking"
          row={dialog.row}
          consequence="Exceptional MD correction. The Booking returns to Payment Completed, the completion record is kept as history, and the Allotment/Registry work is queued again."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => reopenDeliveredAction(dialog.row.id, String(f.get("reason")), newKey()))
          }
        >
          <Field label="Compulsory reason">
            <RemarkSelect presets="reopenDelivered" name="reason" required />
          </Field>
        </ActionDialog>
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------ detail panel */

function BookingDetailPanel({
  row,
  detail,
  people,
  permissions,
  onAction,
}: {
  row: BookingRowView;
  detail: BookingDetail | null;
  people: PersonView[];
  permissions: Permissions;
  onAction: (d: Dialog) => void;
}) {
  if (!detail || detail.id !== row.id) {
    return (
      <p className="py-6 text-xs text-muted-foreground">Loading Booking details…</p>
    );
  }

  // Who is buying (commercial) and who the papers go to (final registration)
  // are two lists that are usually the same people; the second is shown only
  // where it differs.
  const currentParties = detail.parties.filter((p) => p.kind === "COMMERCIAL" && p.effectiveTo === null);
  const finalBuyers = detail.parties.filter((p) => p.kind === "FINAL_REGISTRATION" && p.effectiveTo === null);
  const shareKey = (list: typeof currentParties) =>
    list
      .map((p) => `${p.personId}:${p.sharePercent ?? "100"}`)
      .sort()
      .join("|");
  const finalSame = finalBuyers.length > 0 && shareKey(finalBuyers) === shareKey(currentParties);
  const liveSchedule = detail.scheduleVersions.find((s) => s.status === "ACTIVE");
  // A pending request's own schedule is decided by its Review, not as a revision.
  const pendingSchedule =
    row.status === "REQUEST_PENDING" ? undefined : detail.scheduleVersions.find((s) => s.status === "PENDING");
  const pendingCustomerChange = detail.customerChanges.find((c) => c.status === "PENDING");
  const pendingSoldBy = detail.soldByCorrections.find((c) => c.status === "PENDING");
  const supersededEntries = detail.paymentEntries.filter((e) => e.status === "SUPERSEDED");
  // Current lines first; superseded ones stay visible under Show more rather
  // than being removed.
  const commissions = [...detail.commissions].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  const supersededCommissions = commissions.filter((c) => !c.isCurrent).length;

  /** A decision waiting on this Booking, with its Approve and Reject. */
  const waiting = (title: string, lines: React.ReactNode, canDecide: boolean, decide: (approve: boolean) => Dialog) => (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
      <p className="font-semibold">{title}</p>
      <div className="mt-1">{lines}</div>
      {canDecide && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => onAction(decide(true))}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction(decide(false))}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {row.status === "REQUEST_PENDING" && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
          Submitted values are locked while Accounts reviews them. To change one, use{" "}
          <span className="font-semibold">More → Revise request</span> — it replaces this request and keeps the old one in
          History.
        </p>
      )}

      {/* Decisions waiting on this Booking, each with its Approve and Reject. */}
      {row.status === "REFUND_PENDING" &&
        waiting(
          "Cancellation — Waiting for the Accounts decision",
          "Approving refunds and closes the Booking; rejecting restores it as it was.",
          permissions.decideCancellation,
          (approve) => ({ kind: "CANCEL_DECIDE", row, approve })
        )}
      {row.activeProcess === "CHANGE_PLOT_PENDING" &&
        waiting(
          "Change Plot — Waiting for the Accounts decision",
          "The new Plot is held for this Booking until the decision.",
          permissions.decideChangePlot,
          (approve) => ({ kind: "CHANGE_PLOT_DECIDE", row, approve })
        )}
      {pendingCustomerChange &&
        waiting(
          "Primary Customer Change — Waiting Approval",
          <p>
            {pendingCustomerChange.reason} · raised by {pendingCustomerChange.requestedByRef} on{" "}
            {formatIst(pendingCustomerChange.requestedAt)}
          </p>,
          permissions.approveCustomerChange,
          (approve) => ({ kind: "CUSTOMER_CHANGE_DECIDE", row, approve })
        )}
      {pendingSoldBy &&
        waiting(
          "Sold By Correction — Waiting Approval",
          <>
            <p>
              {SOLD_BY_LABEL[pendingSoldBy.fromSoldByType]} → {SOLD_BY_LABEL[pendingSoldBy.toSoldByType]} ·{" "}
              {pendingSoldBy.reason}
            </p>
            <p className="mt-1 text-[11px]">
              {pendingSoldBy.supportingNote} · raised by {pendingSoldBy.requestedByRef} on{" "}
              {formatIst(pendingSoldBy.requestedAt)}
            </p>
          </>,
          permissions.approveSoldBy,
          (approve) => ({ kind: "SOLD_BY_DECIDE", row, approve })
        )}
      {pendingSchedule &&
        waiting(
          "Schedule revision — Waiting for the Accounts decision",
          <>
            <p>{pendingSchedule.reason}</p>
            <ul className="mt-2 space-y-0.5">
              {pendingSchedule.instalments.map((i) => (
                <li key={i.seq} className="tabular-nums">
                  {i.seq}. {i.scheduled}% due {formatIst(i.dueDate)}
                </li>
              ))}
            </ul>
          </>,
          permissions.decideSchedule,
          (approve) => ({ kind: "SCHEDULE_DECIDE", row, approve })
        )}

      {/* 3 Customers · 4 PLC · 5 Commission and Rewards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Customers" icon={<Users className="h-3.5 w-3.5" />} fill>
          <ul className="space-y-1.5 text-xs">
            {currentParties.map((p) => (
              <li key={`${p.personId}-${p.effectiveFrom}`} className="flex justify-between gap-3">
                <span>
                  <PersonLink personId={p.personId} name={p.name} />
                  <span className="block text-[11px] text-muted-foreground">
                    {/* One buyer is the Customer. "Primary" only says something
                        when there is a second one to be primary over. */}
                    {currentParties.length === 1
                      ? "Customer"
                      : p.role === "PRIMARY"
                        ? "Primary Customer"
                        : "Additional Customer"}
                  </span>
                </span>
                <span className="tabular-nums">{p.sharePercent ? `${Number(p.sharePercent)}%` : "100%"}</span>
              </li>
            ))}
          </ul>
          {finalBuyers.length > 0 && !finalSame && (
            <p className="mt-3 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              Final buyers differ — see Allotment / Registry below.
            </p>
          )}
        </Section>

        {/* PLC spec §15.3 — the frozen Booking PLC. Percentage only: no rupee
            value is derived from it here or anywhere else. */}
        <Section
          title={detail.plc ? `PLC · ${Number(detail.plc.totalPercent).toFixed(2)}%` : "PLC"}
          icon={<Percent className="h-3.5 w-3.5" />}
          fill
        >
          {!detail.plc ? (
            <p className="text-xs text-muted-foreground">No PLC on this Booking.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {detail.plc.components.length === 0 ? (
                <p className="text-muted-foreground">No location charge on this Plot.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.plc.components.map((c) => (
                    <li key={c.category} className="flex justify-between gap-3">
                      <span>
                        {c.label}
                        <span className="block text-[11px] text-muted-foreground">{c.evidence}</span>
                      </span>
                      <span className="tabular-nums">{Number(c.percent).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              )}
              {detail.plc.correctionReason && (
                <p className="text-[11px] text-amber-800">
                  Corrected by {detail.plc.correctedBy} — {detail.plc.correctionReason}
                </p>
              )}
              {detail.plc.history.length > 1 && (
                <ul className="space-y-0.5 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  {detail.plc.history.map((h, index) => (
                    <li key={index} className="flex justify-between gap-3">
                      <span>
                        {formatIst(h.frozenAt)}
                        {h.correctionReason ? ` — ${h.correctionReason}` : " — original freeze"}
                      </span>
                      <span className="tabular-nums">
                        {Number(h.totalPercent).toFixed(2)}%{h.isCurrent ? "" : " (superseded)"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Section>

        {/* v2.1 §15, §16 — the terms frozen with the request. */}
        <Section title="Commission and Rewards" icon={<Layers className="h-3.5 w-3.5" />} fill>
          {row.commissionTerms ? (
            <ul className="space-y-1.5 text-xs">
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Commission</span>
                <span className="tabular-nums">
                  {row.commissionTerms.direct ? `${rateLabel(row.commissionTerms.direct)}%` : "Disabled"}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Loyalty Points</span>
                <span className="tabular-nums">
                  {row.commissionTerms.loyalty ? `${rateLabel(row.commissionTerms.loyalty)}%` : "Disabled"}
                </span>
              </li>
              {row.royaltyTokens !== null && (
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Royalty</span>
                  <span className="tabular-nums">{row.royaltyTokens} points</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No Commission and Rewards on this Booking.</p>
          )}
        </Section>
      </div>

      {/* 6 Payments — the schedule, then every confirmed entry. Part payment is
          allowed and there is no separate Partially Received status. */}
      <Section
        title="Payments"
        icon={<Wallet className="h-3.5 w-3.5" />}
        aside={<span className="text-[11px] text-muted-foreground tabular-nums">{Number(row.paymentReceivedPercent)}% received</span>}
      >
        {liveSchedule ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-xs">
              <thead className="border-b border-border/60">
                <tr>
                  <th className={CTH}>#</th>
                  <th className={CTH}>Due date</th>
                  <th className={CTH}>Scheduled</th>
                  <th className={CTH}>Received</th>
                  <th className={CTH}>Remaining</th>
                  <th className={CTH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {liveSchedule.instalments.map((i) => (
                  <tr key={i.seq}>
                    <td className={CTD}>{i.seq}</td>
                    <td className={`${CTD} tabular-nums`}>{formatIst(i.dueDate)}</td>
                    <td className={`${CTD} tabular-nums`}>{i.scheduled}%</td>
                    <td className={`${CTD} tabular-nums`}>{i.received}%</td>
                    <td className={`${CTD} tabular-nums`}>{i.remaining}%</td>
                    <td className={CTD}>
                      <Badge
                        variant={i.status === "RECEIVED" ? "success" : i.status === "OVERDUE" ? "destructive" : "outline"}
                      >
                        {i.status.charAt(0) + i.status.slice(1).toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            The schedule becomes live when Accounts approves the Booking Request.
          </p>
        )}

        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Payment entries</p>
          {detail.paymentEntries.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No payment confirmed yet.</p>
          ) : (
            <MaybeMore count={supersededEntries.length}>
              <ul className="mt-2 divide-y divide-border/40 text-xs">
                {[...detail.paymentEntries]
                  .sort((a, b) => Number(a.status === "SUPERSEDED") - Number(b.status === "SUPERSEDED"))
                  .map((e) => (
                    <li
                      key={e.id}
                      className={`flex-wrap items-center justify-between gap-2 py-2 ${
                        e.status === "SUPERSEDED" ? "hidden group-data-[open]/more:flex" : "flex"
                      }`}
                    >
                      <span className={e.status === "SUPERSEDED" ? "text-muted-foreground line-through" : ""}>
                        <span className="tabular-nums">{e.percent}%</span> · {e.reference}
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          paid {formatIst(e.paidOn)} · entered {formatIst(e.recordedAt)} · {e.confirmedByRef}
                        </span>
                        {e.payerName && (
                          <span className="ml-2 text-[11px] text-amber-800">
                            paid by {e.payerName}
                            {e.payerReference ? ` (${e.payerReference})` : ""}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant={e.status === "SUPERSEDED" ? "outline" : "success"}>
                          {e.status === "SUPERSEDED" ? "Corrected" : "Confirmed"}
                        </Badge>
                        {e.status === "CONFIRMED" && permissions.correctPayment && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              onAction({ kind: "CORRECT", row, entryId: e.id, percent: e.percent, reference: e.reference })
                            }
                          >
                            Correct
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </MaybeMore>
          )}
        </div>
      </Section>

      {/* 7 Commission — percentages only; the CRM stores no payout amount.
          Eligibility and payment are separate statuses. */}
      <Section title="Commission" icon={<Percent className="h-3.5 w-3.5" />}>
        {commissions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Commission is generated when Accounts approves the Booking Request.
          </p>
        ) : (
          <MaybeMore count={supersededCommissions}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-xs">
                <thead className="border-b border-border/60">
                  <tr>
                    <th className={CTH}>Type</th>
                    <th className={CTH}>Beneficiary</th>
                    <th className={CTH}>Rate</th>
                    <th className={CTH}>Ready at</th>
                    <th className={CTH}>Eligibility</th>
                    <th className={CTH}>Payment</th>
                    <th className={CTH}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-b border-border/40 align-middle leading-tight last:border-0 [&>td]:px-2 [&>td]:py-2 [&>td]:text-center ${
                        c.isCurrent ? "" : "hidden text-muted-foreground group-data-[open]/more:table-row"
                      }`}
                    >
                      <td>
                        {/* DIRECT and INVITE_OVERRIDE are how the database
                            spells them, not how a person reads them. */}
                        {humanise(c.type)}
                        {!c.isCurrent && (
                          <span className="ml-2 rounded border border-border/60 px-1 text-[10px]">
                            Superseded
                          </span>
                        )}
                      </td>
                      <td>
                        <PersonLink
                          personId={c.beneficiaryPersonId}
                          name={c.beneficiary}
                          // Three of the five beneficiary roles are Members;
                          // the other two are the Customer buying again.
                          as={c.beneficiaryRole.endsWith("MEMBER") ? "member" : undefined}
                        />
                      </td>
                      {/* The rate carries its unit: "3.00" beside a milestone
                          percentage read as two halves of one number. */}
                      <td className="tabular-nums">{c.percent}%</td>
                      <td className="tabular-nums">{c.milestonePercent}%</td>
                      <td>
                        <Badge
                          variant={
                            c.eligibility === "READY"
                              ? "success"
                              : c.eligibility === "ON_HOLD"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {/* DESIGN §4.2 — eligibility and payment are two
                              separate badges. */}
                          {eligibilityLabel(c.eligibility)}
                        </Badge>
                        {c.holdReason && (
                          <span className="block text-[11px] text-amber-800">
                            {HOLD_LABEL[c.holdReason] ?? c.holdReason}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge
                          variant={
                            c.payment === "PAID" || c.payment === "PAID_EARLY"
                              ? "success"
                              : c.payment === "ACCOUNTS_ADJUSTMENT_REQUIRED"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {PAYMENT_LABEL[c.payment] ?? c.payment}
                        </Badge>
                        {c.payment === "PAID_EARLY" && c.paymentRemarks && (
                          <span className="block text-[11px] text-muted-foreground">
                            Paid Early — {c.paymentRemarks}
                          </span>
                        )}
                        {c.earlyRequestedAt && !c.earlyApprovedAt && (
                          <span className="block text-[11px] text-muted-foreground">
                            Paid Early requested by {c.earlyRequestedByRef} — {c.earlyRequestReason}
                          </span>
                        )}
                        {c.earlyApprovedAt && (
                          <span className="block text-[11px] text-muted-foreground">
                            Early approved by {c.earlyApprovedByRef} · {formatIst(c.earlyApprovedAt)}
                          </span>
                        )}
                        {c.reference && (
                          <span className="block text-[11px] text-muted-foreground">
                            {c.reference}
                            {c.paidOn ? ` · ${formatIst(c.paidOn)}` : ""}
                          </span>
                        )}
                        {!c.isCurrent && c.closedReason && (
                          <span className="block text-[11px]">{c.closedReason}</span>
                        )}
                        {c.recoveries.map((rec) => (
                          <span key={rec.id} className="block text-[11px] text-amber-800">
                            {rec.recoveryNo} · {rec.reference} ·{" "}
                            {rec.status === "OUTSTANDING"
                              ? `Pending, due ${formatIst(rec.dueOn)}`
                              : `Cleared — ${rec.clearedHow === "SET_OFF" ? "set off" : "repaid"}`}
                          </span>
                        ))}
                      </td>
                      <td className="whitespace-nowrap">
                        {permissions.approvePaidEarly && c.isCurrent && c.holdReason === "OLD_RECOVERY_PENDING" && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              onAction({
                                kind: "BEFORE_RECOVERY_APPROVE",
                                row,
                                recordId: c.id,
                                label: `${c.type} ${c.percent}% to ${c.beneficiary}`,
                              })
                            }
                          >
                            Approve Before Recovery
                          </Button>
                        )}
                        {/* CP §54, §64 — Accounts answers an adjustment, clears
                            or sets off a Recovery. */}
                        {permissions.handleRecovery && c.adjustmentWaiting && (
                          <span className="inline-flex gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                onAction({
                                  kind: "ADJUSTMENT_CLOSE",
                                  row,
                                  recordId: c.id,
                                  label: `${c.type} ${c.percent}% to ${c.beneficiary}`,
                                })
                              }
                            >
                              No Recovery
                            </Button>
                            <Button
                              size="xs"
                              onClick={() =>
                                onAction({
                                  kind: "RECOVERY_OPEN",
                                  row,
                                  recordId: c.id,
                                  label: `${c.type} ${c.percent}% to ${c.beneficiary}`,
                                })
                              }
                            >
                              Open Recovery
                            </Button>
                          </span>
                        )}
                        {permissions.handleRecovery &&
                          c.recoveries
                            .filter((rec) => rec.status === "OUTSTANDING")
                            .map((rec) => (
                              <Button
                                key={rec.id}
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  onAction({
                                    kind: "RECOVERY_CLEAR",
                                    row,
                                    recoveryId: rec.id,
                                    label: `${rec.recoveryNo} from ${c.beneficiary}`,
                                  })
                                }
                              >
                                Mark Repaid
                              </Button>
                            ))}
                        {permissions.handleRecovery &&
                          c.isCurrent &&
                          c.payment === "NOT_PAID" &&
                          c.beneficiaryRecovery &&
                          (c.eligibility === "READY" || c.holdReason === "RECOVERY_OUTSTANDING") && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                const owed = c.beneficiaryRecovery;
                                if (!owed) return;
                                onAction({
                                  kind: "RECOVERY_SET_OFF",
                                  row,
                                  recoveryId: owed.id,
                                  recordId: c.id,
                                  label: `${c.type} ${c.percent}% to ${c.beneficiary} against ${owed.recoveryNo}`,
                                });
                              }}
                            >
                              Set Off
                            </Button>
                          )}
                        {/* CP §53 — Accounts requests Paid Early for an unready
                            record; MD approves or rejects it; only then does
                            Accounts see a Paid Early button. */}
                        {c.isCurrent &&
                          c.payment === "NOT_PAID" &&
                          c.eligibility !== "READY" &&
                          !c.earlyRequestedAt &&
                          permissions.requestPaidEarly && (
                            <Button
                              size="xs"
                              className="w-24"
                              variant="outline"
                              onClick={() =>
                                onAction({
                                  kind: "COMMISSION_EARLY_REQUEST",
                                  row,
                                  recordId: c.id,
                                  label: `${c.type} ${c.percent}% to ${c.beneficiary}`,
                                })
                              }
                            >
                              Request Early
                            </Button>
                          )}
                        {c.isCurrent &&
                          c.payment === "NOT_PAID" &&
                          c.earlyRequestedAt &&
                          !c.earlyApprovedAt &&
                          permissions.approvePaidEarly && (
                            <span className="inline-flex gap-1">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  onAction({
                                    kind: "COMMISSION_EARLY_REJECT",
                                    row,
                                    recordId: c.id,
                                    label: `${c.type} ${c.percent}% to ${c.beneficiary}`,
                                  })
                                }
                              >
                                Reject
                              </Button>
                              <Button
                                size="xs"
                                onClick={() =>
                                  onAction({
                                    kind: "COMMISSION_EARLY_APPROVE",
                                    row,
                                    recordId: c.id,
                                    label: `${c.type} ${c.percent}% to ${c.beneficiary}`,
                                  })
                                }
                              >
                                Approve Early
                              </Button>
                            </span>
                          )}
                        {c.isCurrent &&
                          permissions.processCommission &&
                          c.payment === "NOT_PAID" &&
                          (c.eligibility === "READY" || c.earlyApprovedAt) && (
                            <Button
                              size="xs"
                              className="w-24"
                              variant={c.eligibility === "READY" ? "default" : "outline"}
                              onClick={() =>
                                onAction({
                                  kind: "COMMISSION_PAY",
                                  row,
                                  recordId: c.id,
                                  label: `${c.type} ${c.percent}% to ${c.beneficiary}`,
                                  early: c.eligibility !== "READY",
                                })
                              }
                            >
                              {c.eligibility === "READY" ? "Mark Paid" : "Paid Early"}
                            </Button>
                          )}
                        {c.isCurrent &&
                          c.payment === "NOT_PAID" &&
                          c.earlyRequestedAt &&
                          !c.earlyApprovedAt &&
                          !permissions.approvePaidEarly && (
                            <span className="text-[11px] text-muted-foreground">
                              Paid Early awaiting MD
                            </span>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MaybeMore>
        )}
      </Section>

      <CompletionSection row={row} detail={detail} permissions={permissions} onAction={onAction} />

      {/* People are needed for the shares dialog rendered by the parent. */}
      <span className="hidden">{people.length}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- dialogs */

/** DESIGN §5.1 — record identifier, exact action, consequences, compulsory reason. */
function ActionDialog({
  title,
  row,
  consequence,
  busy,
  children,
  onClose,
  onSubmit,
}: {
  title: string;
  row: BookingRowView;
  consequence: string;
  busy: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? "Booking Request"} · {row.project} {row.plotNumber} · {row.primaryCustomer}
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
        {children}
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

/** DESIGN §10.3 — the immutable submitted snapshot with Approve and Reject. */
/**
 * The submitted snapshot, read out rather than dumped.
 *
 * This was `JSON.stringify(snapshot, null, 2)` in a <pre>: the exact bytes that
 * were frozen, and unreadable — a reviewer approving a Booking had to pick
 * percentages out of raw JSON and match personIds by eye. The values below are
 * still the snapshot's own, never the live record; only the names beside the
 * ids come from the loaded Booking, which for a pending request is the same
 * Person either way.
 */
type SubmittedSnapshot = {
  parties?: Array<{ role: string; personId: string; sharePercent: string | null }>;
  schedule?: Array<{ seq: number; dueDate: string; scheduledPercent: string }>;
  plcSnapshot?: {
    totalPercent: string | null;
    components?: Array<{ label: string; percent: string; category: string; evidence: string }>;
  } | null;
  remark?: string | null;
  /** v2.1 §16 — the commission version this request version froze. */
  commissionTerms?: {
    versionId: string;
    version: number;
    directPercent: string | null;
    loyaltyPercent: string | null;
  } | null;
};

function SubmittedSnapshotView({
  snapshot,
  detail,
}: {
  snapshot: SubmittedSnapshot;
  detail: BookingDetail;
}) {
  const nameFor = (personId: string) =>
    detail.parties.find((p) => p.personId === personId)?.name ?? "Person no longer on file";
  const parties = snapshot.parties ?? [];
  const schedule = snapshot.schedule ?? [];
  const plc = snapshot.plcSnapshot;

  return (
    <div className="space-y-4 rounded-xl border border-border/60 p-4 text-xs">
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Customers
        </h4>
        <ul className="mt-1 space-y-0.5">
          {parties.map((p) => (
            <li key={p.personId} className="flex justify-between gap-3">
              <span>
                {nameFor(p.personId)}
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {parties.length === 1
                    ? "Customer"
                    : p.role === "PRIMARY"
                      ? "Primary Customer"
                      : "Additional Customer"}
                </span>
              </span>
              <span className="tabular-nums">
                {p.sharePercent ? `${p.sharePercent}%` : "100%"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {plc && (
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plot Location Charge
          </h4>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {Number(plc.totalPercent ?? 0).toFixed(2)}%
          </p>
          <ul className="mt-1 space-y-0.5">
            {(plc.components ?? []).map((c) => (
              <li key={c.category} className="flex justify-between gap-3">
                <span>
                  {c.label}
                  <span className="ml-2 text-[11px] text-muted-foreground">{c.evidence}</span>
                </span>
                <span className="tabular-nums">{Number(c.percent).toFixed(2)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {snapshot.commissionTerms && (
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Commission terms
          </h4>
          <p className="mt-1">
            {termsLine({
              version: snapshot.commissionTerms.version,
              direct: snapshot.commissionTerms.directPercent,
              loyalty: snapshot.commissionTerms.loyaltyPercent,
            })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Frozen with this request. Approving it makes these terms permanent for the Booking.
          </p>
        </section>
      )}

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Payment schedule
        </h4>
        <ul className="mt-1 space-y-0.5">
          {schedule.map((i) => (
            <li key={i.seq} className="flex justify-between gap-3 tabular-nums">
              <span>
                {i.seq}. due {formatIstDate(i.dueDate)}
              </span>
              <span>{Number(i.scheduledPercent).toFixed(2)}%</span>
            </li>
          ))}
        </ul>
      </section>

      {snapshot.remark && (
        <section className="space-y-0.5 border-t border-border/50 pt-3 text-muted-foreground">
          <p>Remark: {snapshot.remark}</p>
        </section>
      )}
    </div>
  );
}

export function ReviewDialog({
  row,
  detail,
  selfRef,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  detail: BookingDetail | null;
  selfRef: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    approve: boolean;
    rejectReason: "PAYMENT_SCHEDULE_INCORRECT" | "INCOMPLETE_DETAILS" | "PAYMENT_NOT_RECEIVED" | "OTHER" | "";
    requestClaimedPayment: boolean;
    note: string;
  }) => void;
}) {
  const [approve, setApprove] = React.useState(true);
  // Detail is shared with the expanded row, so it may belong to another
  // Booking — the snapshot shown must be this one's or none.
  const ready = detail?.id === row.id;
  const pending = ready ? detail.reviewVersions.find((v) => v.status === "PENDING") : undefined;
  const isMaker = row.submittedByRef === selfRef;

  return (
    <Modal
      title={`Verify — Booking Payment · ${row.project} ${row.plotNumber}`}
      onClose={onClose}
      wide
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.project} · {row.plotNumber} · {row.primaryCustomer}
        </p>
        {/* Who, when, and who sold it. The Booking Date is usually the day it
            was submitted, so it earns its place only when it is not. */}
        <p className="mt-1 text-muted-foreground">
          {row.submittedByRef} · {formatIstDate(row.submittedAt)}
          {formatIstDate(row.bookingDate) !== formatIstDate(row.submittedAt) &&
            ` · booked ${formatIstDate(row.bookingDate)}`}{" "}
          · {SOLD_BY_LABEL[row.soldByType] ?? row.soldByType}
        </p>
      </div>

      {isMaker && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-700">
          You submitted this request. A Booking Request must be decided by a different staff
          account, so this decision will be refused.
        </p>
      )}

      {pending && ready ? (
        <SubmittedSnapshotView
          snapshot={pending.snapshot as SubmittedSnapshot}
          detail={detail}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {ready
            ? "This request has nothing waiting for a decision."
            : "Loading the submitted snapshot…"}
        </p>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            approve,
            rejectReason: approve ? "" : (String(f.get("rejectReason")) as "OTHER"),
            requestClaimedPayment: f.get("claimed") === "on",
            note: String(f.get("note")),
          });
        }}
      >
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={approve ? "default" : "outline"} onClick={() => setApprove(true)}>
            Approve
          </Button>
          <Button type="button" size="sm" variant={approve ? "outline" : "default"} onClick={() => setApprove(false)}>
            Reject
          </Button>
        </div>

        {approve ? (
          <p className="text-xs text-muted-foreground">
            Approval issues the permanent Booking Number, ends the Hold and makes the Plot Booked.
            Accounts may approve at 0% Payment Received.
          </p>
        ) : (
          <>
            <Field label="Rejection reason">
              <select name="rejectReason" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Select a reason
                </option>
                {REJECT_REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="claimed" className="mt-0.5" />
              <span>
                The request specifically claimed a payment had been received. Payment Not Received is
                valid only in that case — Accounts may approve at 0%, so zero payment alone is not a
                reason.
              </span>
            </label>
          </>
        )}

        <Field label="Remark — compulsory">
          <RemarkSelect presets="verifyBooking" name="note" required key={String(approve)} kind={approve ? "Approved" : "Rejected"} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Processing…" : approve ? "Confirm approval" : "Confirm rejection"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------- booking form */

export type FormOut = {
  plotId: string;
  holdId: string;
  enquiryId: string;
  parties: PartyInput[];
  soldByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId: string;
  bookingDate: string;
  bookingDateReason: string;
  remark: string;
  schedule: ScheduleRowInput[];
  reason?: string;
};

export function BookingFormDialog({
  title,
  initialPlotId,
  initialPersonId,
  bookable,
  people,
  members,
  busy,
  fixedPlot,
  requireReason,
  onClose,
  onSubmit,
}: {
  title: string;
  bookable: BookableView[];
  people: PersonView[];
  members: MemberView[];
  busy: boolean;
  /** Set when the Plot is decided before the form opens, and cannot change. */
  fixedPlot?: { project: string; plot: string };
  requireReason?: boolean;
  onClose: () => void;
  onSubmit: (form: FormOut) => void;
  initialPlotId?: string;
  /** The Primary Customer, when the form is opened for someone already chosen. */
  initialPersonId?: string;
}) {
  const today = istDay(new Date());
  const initial = bookable.find((p) => p.id === initialPlotId);
  const [projectId, setProjectId] = React.useState(initial?.projectId ?? "");
  const [plotId, setPlotId] = React.useState(initialPlotId ?? "");
  const [bookingDate, setBookingDate] = React.useState(today);
  const [soldByType, setSoldByType] = React.useState<FormOut["soldByType"]>("THREE_PERCENT_CLUB");
  // The first row is the Primary Customer, always. There is no role to choose:
  // an Additional Customer is what the button underneath adds.
  const [parties, setParties] = React.useState<PartyInput[]>([
    { personId: initialPersonId ?? "", role: "PRIMARY", sharePercent: "" },
  ]);
  // Opens blank rather than at 100: a schedule is nearly always staged, and a
  // pre-filled 100 has to be cleared before the second instalment can take
  // anything — the cap in fillForward leaves it nothing otherwise.
  const [schedule, setSchedule] = React.useState<ScheduleRowInput[]>([
    { seq: 1, percent: "", dueDate: today },
  ]);

  const projects = Array.from(
    new Map(bookable.map((p) => [p.projectId, p.projectName])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const projectPlots = bookable.filter((p) => p.projectId === projectId);
  const plot = bookable.find((p) => p.id === plotId);
  const shareTotal = shareSum(parties);
  const patch = (index: number, next: Partial<PartyInput>) =>
    setParties(parties.map((p, i) => (i === index ? { ...p, ...next } : p)));

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            plotId,
            holdId: plot?.holdId ?? "",
            enquiryId: "",
            // "NEW" is a marker for this form only. The action reads a blank
            // personId with a name and mobile beside it as a first-time buyer.
            parties: parties.map((p) =>
              p.personId === "NEW"
                ? { ...p, personId: "" }
                : { personId: p.personId, role: p.role, sharePercent: p.sharePercent }
            ),
            soldByType,
            soldByPersonId: String(f.get("soldByPersonId") ?? ""),
            bookingDate,
            bookingDateReason: String(f.get("bookingDateReason") ?? ""),
            remark: "",
            schedule,
            reason: String(f.get("reason") ?? ""),
          });
        }}
      >
        {fixedPlot ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project">
              <select className={inputClass} disabled>
                <option>{fixedPlot.project}</option>
              </select>
            </Field>
            <Field label="Plot">
              <select className={inputClass} disabled>
                <option>{fixedPlot.plot}</option>
              </select>
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project">
              <select
                className={inputClass}
                required
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setPlotId("");
                }}
              >
                <option value="" disabled>
                  Select a Project
                </option>
                {projects.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Plot — Available or Hold">
              <select
                className={inputClass}
                required
                disabled={!projectId}
                value={plotId}
                onChange={(e) => setPlotId(e.target.value)}
              >
                <option value="" disabled>
                  {projectId ? "Select a Plot" : "Select a Project first"}
                </option>
                {projectPlots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.plotType} {p.plotNumber}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {plot && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-xs">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium">
              {plot.holdPersonName
                ? `On Hold for ${plot.holdPersonName}`
                : plot.status.replaceAll("_", " ")}
            </dd>
            <dt className="text-muted-foreground">Size (W × L)</dt>
            <dd className="text-right tabular-nums font-medium">
              {formatPlotSize(plot.widthFt, plot.lengthFt)
                ? `${formatPlotSize(plot.widthFt, plot.lengthFt)} (${formatQuantity(plot.areaSqFt)} sq ft)`
                : `${formatQuantity(plot.areaSqFt)} sq ft · ${formatQuantity(plot.areaSqYd)} sq yd`}
            </dd>
            {plot.locationCharge.length > 0 && (
              <>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="text-right font-semibold text-foreground">
                  {plot.locationCharge.join(" · ")}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Commission</dt>
            <dd className={`text-right font-medium ${plot.commissionTerms ? "" : "text-red-700"}`}>
              {plot.commissionTerms
                ? termsLine(plot.commissionTerms).replace(/^Commission settings /, "")
                : "No approved settings — cannot be submitted"}
            </dd>
          </dl>
        )}

        {plot?.holdPersonName && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
            This Plot is on Hold for {plot.holdPersonName}. The Primary Customer must be that Person,
            and the remaining Hold time freezes on submission.
          </p>
        )}

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Customer
            </h3>
            {/* With several buyers the useful number is not the running total
                but what is still unallocated — that is the one that has to
                reach zero before this can be submitted. */}
            {parties.length > 1 && (
              <span
                className={`text-xs tabular-nums ${
                  shareTotal === 100 ? "text-muted-foreground" : "text-red-700"
                }`}
              >
                {shareTotal}%
                {shareTotal !== 100 && ` · ${shareSum([{ sharePercent: String(100 - shareTotal) }])}% left`}
              </span>
            )}
          </div>

          {parties.map((party, index) => (
            <div key={index} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <PersonPicker
                  className="flex-1"
                  required
                  value={party.personId}
                  onChange={(id) => patch(index, { personId: id })}
                  newOptionLabel="+ New Customer — enter details"
                  placeholder="Search a Customer by name, mobile or Customer ID"
                  options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
                />
                {parties.length > 1 && (
                  <Input
                    className="h-9 w-28 text-xs"
                    placeholder="Share %"
                    type="number"
                    step="0.0001"
                    min="0"
                    max={shareRoom(parties, index)}
                    value={party.sharePercent}
                    onChange={(e) =>
                      patch(index, { sharePercent: capShare(parties, index, e.target.value) })
                    }
                  />
                )}
                {index > 0 && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setParties(parties.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                )}
              </div>

              {party.personId === "NEW" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    className="h-9 text-xs"
                    placeholder="Full name"
                    required
                    value={party.fullName ?? ""}
                    onChange={(e) => patch(index, { fullName: e.target.value })}
                  />
                  <Input
                    className="h-9 text-xs"
                    placeholder="Mobile"
                    required
                    inputMode="numeric"
                    value={party.mobile ?? ""}
                    onChange={(e) => patch(index, { mobile: e.target.value })}
                  />
                  <Input
                    className="h-9 text-xs"
                    placeholder="City"
                    value={party.city ?? ""}
                    onChange={(e) => patch(index, { city: e.target.value })}
                  />
                </div>
              )}
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setParties([...parties, { personId: "", role: "ADDITIONAL", sharePercent: "" }])
            }
          >
            + Add Additional Customer
          </Button>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sold By">
            <select
              className={inputClass}
              value={soldByType}
              onChange={(e) => setSoldByType(e.target.value as FormOut["soldByType"])}
            >
              <option value="THREE_PERCENT_CLUB">3% Club</option>
              <option value="MEMBER">Member</option>
              <option value="CUSTOMER">Customer</option>
            </select>
          </Field>
          <Field label="Booking Date">
            <Input
              className="h-9 text-xs"
              type="date"
              max={today}
              required
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
            />
          </Field>
          {soldByType !== "THREE_PERCENT_CLUB" && (
            <SoldByPicker
              key={soldByType}
              name="soldByPersonId"
              type={soldByType}
              people={people}
              members={members}
            />
          )}
        </div>

        {/* Only a backdated Booking has to say why */}
        {bookingDate < today && (
          <Field label="Reason for the backdated Booking Date — compulsory">
            <RemarkSelect presets="backdatedBooking" name="bookingDateReason" className="h-9 text-xs" required />
          </Field>
        )}

        <ScheduleEditor schedule={schedule} setSchedule={setSchedule} minDate={today} />

        {requireReason && (
          <Field label="Reason for replacing this request — compulsory">
            <RemarkSelect presets="resendBooking" name="reason" className="h-9 text-xs" required />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={busy || (parties.length > 1 && shareTotal !== 100)}
          >
            {busy ? "Processing…" : "Confirm and submit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ScheduleEditor({
  schedule,
  setSchedule,
  minDate,
}: {
  schedule: ScheduleRowInput[];
  setSchedule: (rows: ScheduleRowInput[]) => void;
  minDate: string;
}) {
  const remaining = round2(100 - scheduleTotal(schedule));
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Payment Schedule
      </h3>
      {schedule.map((line, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <span className="flex h-9 w-6 items-center justify-center text-xs font-medium text-muted-foreground">
            {line.seq}
          </span>
          <Input
            className="h-9 w-24 min-w-0 text-xs sm:w-32"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            placeholder="%"
            value={line.percent}
            // A row that already holds a number is retyped, not edited: select
            // it on focus so the first keystroke replaces it.
            onFocus={(e) => e.target.select()}
            onChange={(e) =>
              setSchedule(
                fillForward(
                  schedule.map((r, i) => (i === index ? { ...r, percent: e.target.value } : r)),
                  index
                )
              )
            }
          />
          <Input
            className="h-9 w-40 min-w-0 flex-1 text-xs sm:w-44 sm:flex-none"
            type="date"
            min={index === 0 ? minDate : addDays(schedule[index - 1].dueDate, 1)}
            required
            value={line.dueDate}
            onChange={(e) =>
              setSchedule(
                fillDatesForward(
                  schedule.map((r, i) => (i === index ? { ...r, dueDate: e.target.value } : r)),
                  index
                )
              )
            }
          />
          {schedule.length > 1 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setSchedule(removeRow(schedule, index))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() =>
            setSchedule([
              ...schedule,
              {
                seq: schedule.length + 1,
                percent: String(Math.max(0, remaining)),
                dueDate: addDays(schedule[schedule.length - 1]?.dueDate ?? minDate, 30),
              },
            ])
          }
        >
          + Add instalment
        </Button>
        <p className={remaining === 0 ? "text-xs text-muted-foreground" : "text-xs text-red-700 font-medium"}>
          {remaining === 0
            ? "Total 100% — complete."
            : remaining > 0
              ? `Remaining ${remaining}%`
              : `Over by ${round2(-remaining)}%`}
        </p>
      </div>
    </section>
  );
}

function ScheduleDialog({
  row,
  detail,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  detail: BookingDetail | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (schedule: ScheduleRowInput[], reason: string) => void;
}) {
  const live = detail?.scheduleVersions.find((s) => s.status === "ACTIVE");
  const [schedule, setSchedule] = React.useState<ScheduleRowInput[]>(
    (live?.instalments ?? []).map((i) => ({
      seq: i.seq,
      percent: i.scheduled,
      dueDate: i.dueDate.slice(0, 10),
    }))
  );
  const today = istDay(new Date());

  return (
    <Modal
      title={`Revise Remaining Payment Schedule — ${row.bookingNumber ?? "Booking Request"}`}
      description="Received portions stay locked. Only the unpaid percentage may be split, combined or moved, and Accounts approves the revision."
      onClose={onClose}
      wide
    >
      {live && (
        <ul className="rounded-xl border border-border/60 bg-secondary p-3 text-[11px] text-muted-foreground">
          {live.instalments.map((i) => (
            <li key={i.seq} className="tabular-nums">
              {i.seq}. scheduled {i.scheduled}% · received {i.received}% · remaining {i.remaining}%
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(schedule, String(new FormData(e.currentTarget).get("reason")));
        }}
      >
        <ScheduleEditor schedule={schedule} setSchedule={setSchedule} minDate={today} />
        <Field label="Reason — compulsory">
          <RemarkSelect presets="reviseSchedule" name="reason" required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Processing…" : "Submit for Accounts approval"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SharesDialog({
  row,
  detail,
  people,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  detail: BookingDetail | null;
  people: PersonView[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (parties: PartyInput[], reason: string) => void;
}) {
  const current = (detail?.parties ?? []).filter((p) => p.effectiveTo === null);
  const [parties, setParties] = React.useState<PartyInput[]>(
    current.map((p) => ({
      personId: p.personId,
      role: p.role as PartyInput["role"],
      sharePercent: p.sharePercent ?? "",
    }))
  );
  const total = shareSum(parties);

  return (
    <Modal
      title={`Change ownership shares — ${row.bookingNumber ?? "Booking Request"}`}
      description="Old and new shares both stay in History. The Primary Customer cannot be replaced here — that needs Accounts approval."
      onClose={onClose}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(parties, String(new FormData(e.currentTarget).get("reason")));
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buyers</h3>
          <span className={`text-[11px] ${parties.length > 1 && total !== 100 ? "text-red-700" : "text-muted-foreground"}`}>
            {parties.length === 1 ? "Sole buyer — blank means 100%" : `Total ${total}%`}
          </span>
        </div>
        {parties.map((party, index) => (
          <div key={index} className="flex flex-wrap gap-2">
            <PersonPicker
              className="flex-1"
              required
              value={party.personId}
              onChange={(id) =>
                setParties(parties.map((p, i) => (i === index ? { ...p, personId: id } : p)))
              }
              options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
            />
            <select
              className={`${inputClass} w-40`}
              value={party.role}
              onChange={(e) =>
                setParties(
                  parties.map((p, i) =>
                    i === index ? { ...p, role: e.target.value as PartyInput["role"] } : p
                  )
                )
              }
            >
              <option value="PRIMARY">Primary Customer</option>
              <option value="ADDITIONAL">Additional Customer</option>
            </select>
            <Input
              className="w-28"
              type="number"
              step="0.0001"
              min="0"
              max={shareRoom(parties, index)}
              placeholder="Share %"
              value={party.sharePercent}
              onChange={(e) =>
                setParties(
                  parties.map((p, i) =>
                    i === index
                      ? { ...p, sharePercent: capShare(parties, index, e.target.value) }
                      : p
                  )
                )
              }
            />
            {parties.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setParties(parties.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setParties([...parties, { personId: "", role: "ADDITIONAL", sharePercent: "" }])}
        >
          Add Additional Customer
        </Button>
        <Field label="Reason — compulsory">
          <RemarkSelect presets="changeShares" name="reason" required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={busy || (parties.length > 1 && total !== 100)}
          >
            {busy ? "Processing…" : "Confirm change"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Sold By is picked by identity: the Member ID or the Customer ID chooses the
 * row, and the name sits under it — the code is what a form or a payout sheet
 * carries, the name is how the office checks it is the right person.
 */
function SoldByPicker({
  name,
  type,
  people,
  members,
}: {
  name: string;
  type: "MEMBER" | "CUSTOMER";
  people: PersonView[];
  members: MemberView[];
}) {
  const [picked, setPicked] = React.useState("");
  const options =
    type === "MEMBER"
      ? members.map((m) => ({ id: m.personId, code: m.memberId, name: m.fullName }))
      : people
          .filter((p) => p.customerId !== null)
          .map((p) => ({
            id: p.id,
            code: p.customerId!,
            name: `${p.fullName} · ${p.mobileMasked}`,
          }));
  const chosen = options.find((o) => o.id === picked);

  return (
    <Field label={type === "MEMBER" ? "Selling Member" : "Closing Customer"}>
      <PersonPicker
        name={name}
        required
        value={picked}
        onChange={setPicked}
        placeholder={
          type === "MEMBER"
            ? "Search a Member by name or Member ID"
            : "Search a Customer by name, mobile or Customer ID"
        }
        options={options.map((o) => ({ id: o.id, label: `${o.code} · ${o.name}` }))}
      />
      {chosen && (
        <p className="mt-1 leading-tight">
          <span className="text-xs font-semibold tabular-nums">{chosen.code}</span>
          <br />
          <span className="text-[11px] text-muted-foreground">{chosen.name}</span>
        </p>
      )}
    </Field>
  );
}

/** The Sold By picker, shared by the correction dialog. */
function SoldByForm({
  people,
  members,
  busy,
  onClose,
  onSubmit,
}: {
  people: PersonView[];
  members: MemberView[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: {
    toSoldByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
    toSoldByPersonId: string;
    reason: string;
    supportingNote: string;
  }) => void;
}) {
  const [type, setType] = React.useState<"THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER">("MEMBER");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          toSoldByType: type,
          toSoldByPersonId: String(f.get("toSoldByPersonId") ?? ""),
          reason: String(f.get("reason")),
          supportingNote: String(f.get("supportingNote")),
        });
      }}
    >
      <Field label="Corrected Sold By">
        <select
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value as "MEMBER")}
        >
          <option value="THREE_PERCENT_CLUB">3% Club</option>
          <option value="MEMBER">Member</option>
          <option value="CUSTOMER">Customer</option>
        </select>
      </Field>
      {type !== "THREE_PERCENT_CLUB" && (
        <SoldByPicker
          key={type}
          name="toSoldByPersonId"
          type={type}
          people={people}
          members={members}
        />
      )}
      <Field label="Reason — compulsory">
        <RemarkSelect presets="soldByCorrection" name="reason" required />
      </Field>
      <Field label="Supporting remark — compulsory">
        <Input name="supportingNote" required minLength={3} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Back
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Processing…" : "Raise correction"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------- Allotment / Registry (PRD §4) */

/**
 * One section, one route, and Delivered follows from it. There is no Confirm
 * Delivery button here because none exists in the model (PRD §4.4).
 */
function CompletionSection({
  row,
  detail,
  permissions,
  onAction,
}: {
  row: BookingRowView;
  detail: BookingDetail | null;
  permissions: Permissions;
  onAction: (d: Dialog) => void;
}) {
  const live = detail?.completions.find((c) => !c.reopenedAt) ?? null;
  const reopened = detail?.completions.filter((c) => c.reopenedAt) ?? [];
  const finalBuyers = (detail?.parties ?? []).filter(
    (p) => p.kind === "FINAL_REGISTRATION" && !p.effectiveTo
  );

  const atCompletion = row.status === "PAYMENT_COMPLETED";
  const delivered = row.status === "DELIVERED";

  // Nothing here until the money is in. The section used to draw itself just to
  // say so, on every Booking that had not got there yet — which is most of them.
  if (!atCompletion && !delivered) return null;

  return (
    <Section title="Allotment / Registry" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
      {(atCompletion || delivered) && (
        <div className="space-y-3 text-xs">
          <div>
            <p className="font-medium text-foreground">Final buyer details</p>
            {finalBuyers.length === 0 ? (
              <p className="text-muted-foreground">
                Not recorded. Aadhaar, Date of Birth and Address are required for every final buyer
                before a route can be recorded.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {finalBuyers.map((buyer) => (
                  <li
                    key={`${buyer.personId}-${buyer.effectiveFrom}`}
                    className="flex justify-between gap-3"
                  >
                    <span>
                      {buyer.name}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {buyer.role === "PRIMARY" ? "Primary" : "Additional"}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {buyer.sharePercent ? `${buyer.sharePercent}%` : "100%"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {live && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="font-medium text-emerald-700">
                Delivered · {live.route === "ALLOTMENT" ? "Allotment" : "Registry"} route
              </p>
              {live.route === "ALLOTMENT" ? (
                <p className="mt-1 text-muted-foreground">
                  Allotment {live.allotmentNumber} to {live.allotmentGivenTo} on{" "}
                  {live.allotmentDate ? formatIst(live.allotmentDate) : "—"} · Patta{" "}
                  {live.pattaStatus === "YES"
                    ? `issued ${live.pattaDate ? formatIst(live.pattaDate) : ""}`
                    : "not known"}
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Advocate {live.advocateName} · Registry{" "}
                  {live.registryDate ? formatIst(live.registryDate) : "—"}
                </p>
              )}
              <p className="mt-1 text-muted-foreground">
                Papers Legally Transferred: {live.papersLegallyTransferred ? "Yes" : "No"} · recorded
                by {live.completedByRef} · {formatIst(live.deliveredAt)}
              </p>
            </div>
          )}

          {reopened.map((completion) => (
            <p key={completion.id} className="text-muted-foreground">
              Reopened {completion.reopenedAt ? formatIst(completion.reopenedAt) : ""} by{" "}
              {completion.reopenedByRef} — {completion.reopenReason}
            </p>
          ))}

          <div className="flex flex-wrap gap-2">
            {atCompletion && permissions.recordFinalBuyers && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction({ kind: "FINAL_BUYERS", row })}
              >
                Record final buyer details
              </Button>
            )}
            {atCompletion && permissions.recordCompletion && (
              <Button size="sm" onClick={() => onAction({ kind: "COMPLETION", row })}>
                Record Allotment / Registry
              </Button>
            )}
            {delivered && permissions.reopenDelivered && (
              <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "REOPEN", row })}>
                Exceptional reopen
              </Button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

export type FinalBuyerRow = {
  personId: string;
  sharePercent: string;
  dateOfBirth: string;
  address: string;
  /** Asked only where the Person has none on file; blank otherwise. */
  aadhaar: string;
  /** Same, and blank is a decision here — "PAN Not Available" (§18.2). */
  pan: string;
};

export function FinalBuyersDialog({
  row,
  detail,
  people,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  detail: BookingDetail | null;
  people: PersonView[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (rows: FinalBuyerRow[]) => void;
}) {
  // The commercial buyers are the sensible starting point; the final
  // registration buyer may still differ, and both stay distinguishable.
  const commercial = (detail?.parties ?? []).filter(
    (p) => p.kind === "COMMERCIAL" && !p.effectiveTo
  );

  // Most sales register to the Customer who bought, with the details the CRM
  // already holds — so the form opens answered and is confirmed, not retyped.
  // It stays editable because the registry buyer may be somebody else, and
  // because a Person record can be missing the date or the address.
  const seed = (): FinalBuyerRow[] =>
    commercial.length > 0
      ? commercial.map((p) => ({
          personId: p.personId,
          sharePercent: p.sharePercent ?? "",
          dateOfBirth: p.dateOfBirth ?? "",
          address: p.address ?? "",
          aadhaar: "",
          pan: "",
        }))
      : [{ personId: "", sharePercent: "", dateOfBirth: "", address: "", aadhaar: "", pan: "" }];

  const [rows, setRows] = React.useState<FinalBuyerRow[]>(seed);
  // The Booking detail is fetched after the dialog opens, so the first render
  // has no parties to seed from. Re-seed once it lands, unless it has been
  // edited already.
  const seeded = React.useRef(commercial.length > 0);
  React.useEffect(() => {
    if (!seeded.current && commercial.length > 0) {
      seeded.current = true;
      setRows(seed());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const update = (index: number, patch: Partial<FinalBuyerRow>) =>
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <Modal title="Final buyer details" wide onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? "Booking Request"} · {row.project} {row.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">
          Aadhaar comes from the Person record and must already be recorded. A single final buyer may
          leave the share blank and is treated as 100%; several must total exactly 100%.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(rows);
        }}
      >
        <div className="space-y-3">
          {rows.map((buyer, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-border/50 p-3 md:grid-cols-4"
            >
              <Field
                label={
                  rows.length === 1
                    ? "Customer"
                    : index === 0
                      ? "Primary Customer"
                      : "Additional Customer"
                }
              >
                <PersonPicker
                  required
                  value={buyer.personId}
                  onChange={(id) => update(index, { personId: id })}
                  options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
                />
              </Field>
              {/* One buyer owns the whole Plot, so there is no share to type —
                  the field said "blank = sole buyer" and asked the reader to
                  work out that an empty box meant everything. It states 100%
                  instead, and only becomes a field when a second buyer makes
                  the split a real question (PRD §12.1). */}
              {rows.length === 1 ? (
                <Field label="Ownership share">
                  <p className="px-1 py-2 text-sm font-medium">100%</p>
                </Field>
              ) : (
                <Field label="Ownership share % — all buyers must total 100%">
                  <Input
                    max={shareRoom(rows, index)}
                    value={buyer.sharePercent}
                    onChange={(e) =>
                      update(index, { sharePercent: capShare(rows, index, e.target.value) })
                    }
                    inputMode="decimal"
                    required
                  />
                </Field>
              )}
              <Field label="Date of Birth">
                <Input
                  type="date"
                  value={buyer.dateOfBirth}
                  onChange={(e) => update(index, { dateOfBirth: e.target.value })}
                  required
                />
              </Field>
              <Field label="Address">
                <Input
                  value={buyer.address}
                  onChange={(e) => update(index, { address: e.target.value })}
                  required
                />
              </Field>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setRows((list) => [
                  ...list,
                  { personId: "", sharePercent: "", dateOfBirth: "", address: "", aadhaar: "", pan: "" },
                ])
              }
            >
              Add Additional Customer
            </Button>
            {rows.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRows((list) => list.slice(0, -1))}
              >
                Remove last
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : "Save final buyer details"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Delivery in one dialog: who the papers go to, then the route that transfers
 * them. prd-complete §18 splits these into two tasks and the Bookings screen still
 * shows them that way — but on an inventory row there is one thing left to do
 * to a paid-off Plot, and asking for it in two visits is two visits.
 *
 * It runs the two commands in order and stops if the first fails, so the
 * server-side rules are untouched: readyForCompletion() still refuses a route
 * whose final buyers are incomplete.
 */
export function DeliverDialog({
  row,
  detail,
  people,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  detail: BookingDetail | null;
  people: PersonView[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { buyers: FinalBuyerRow[]; completion: CompletionRouteInput }) => void;
}) {
  // The Booking is fetched after the dialog opens, and `detail` is shared with
  // whatever was opened before — so it is only this Booking's when the ids
  // agree. Same guard the review dialog uses.
  const ready = detail?.id === row.id;
  const commercial = (ready ? detail.parties : []).filter(
    (p) => p.kind === "COMMERCIAL" && !p.effectiveTo
  );
  const seed = (): FinalBuyerRow[] =>
    commercial.length > 0
      ? commercial.map((p) => ({
          personId: p.personId,
          sharePercent: p.sharePercent ?? "",
          dateOfBirth: p.dateOfBirth ?? "",
          address: p.address ?? "",
          aadhaar: "",
          pan: "",
        }))
      : [{ personId: "", sharePercent: "", dateOfBirth: "", address: "", aadhaar: "", pan: "" }];

  const [rows, setRows] = React.useState<FinalBuyerRow[]>(seed);
  // The Booking detail is fetched after the dialog opens, so the first render
  // has nothing to seed from. Re-seed once it lands, and only once.
  const seeded = React.useRef(commercial.length > 0);
  React.useEffect(() => {
    if (!seeded.current && commercial.length > 0) {
      seeded.current = true;
      setRows(seed());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const [route, setRoute] = React.useState<"ALLOTMENT" | "REGISTRY">("ALLOTMENT");
  const [pattaIssued, setPattaIssued] = React.useState<"YES" | "DONT_KNOW">("YES");

  const update = (index: number, patch: Partial<FinalBuyerRow>) =>
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const parties = ready ? detail.parties : [];

  /** Whether this buyer's Aadhaar is already on file, so the form stops asking. */
  const onFile = (personId: string) =>
    parties.some((p) => p.personId === personId && p.aadhaarRecorded);

  /** The Booking's parties say this Person has no Aadhaar — so it must be typed. */
  const knownMissing = (personId: string) =>
    parties.some((p) => p.personId === personId && !p.aadhaarRecorded);

  /** Whether this buyer's PAN is on file. Blank stays a valid decision. */
  const panOnFile = (personId: string) =>
    parties.some((p) => p.personId === personId && p.panRecorded);

  /** The Booking's own name for a party, so the row can state it, not offer it. */
  const buyerName = (personId: string) =>
    parties.find((p) => p.personId === personId)?.name ?? null;

  /**
   * "Primary" only means something once there is a second buyer to be primary
   * over. One buyer is the Customer, and calling them the Primary Customer asks
   * the reader to look for the other one.
   */
  const customerLabel = (index: number) =>
    rows.length === 1 ? "Customer" : index === 0 ? "Primary Customer" : "Additional Customer";

  // The Customer, the date and the address all come from the Booking, which is
  // fetched after the dialog opens. Drawn before it lands, the form appears
  // with an empty Customer and then rewrites itself under whoever is reading
  // it. Wait for it, then draw once.
  if (!ready) {
    return (
      <Modal title="Deliver" onClose={onClose}>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading the Booking…</p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Deliver"
      description="Final buyer details and one completion route. Recording it sets the Booking and Plot to Delivered."
      wide
      onClose={onClose}
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? "Booking Request"} · {row.project} {row.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">
          One buyer owns 100%. Add a Customer to split it, and the shares must then total exactly
          100%. Delivered is recorded once, and only MD can reopen it.
        </p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            buyers: rows,
            completion:
              route === "ALLOTMENT"
                ? {
                    route: "ALLOTMENT",
                    allotmentDate: String(f.get("allotmentDate")),
                    allotmentNumber: String(f.get("allotmentNumber")),
                    allotmentGivenTo: String(f.get("allotmentGivenTo")),
                    pattaIssued,
                    pattaDate: String(f.get("pattaDate") ?? ""),
                  }
                : {
                    route: "REGISTRY",
                    advocateName: String(f.get("advocateName")),
                    registryDate: String(f.get("registryDate")),
                  },
          });
        }}
      >
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Final buyer details
          </p>
          {rows.map((buyer, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-border/50 p-3 md:grid-cols-4"
            >
              {/* The Booking already names who bought the Plot, so the first
                  row states it rather than offering it back as a choice — a
                  picker here reads as "pick the buyer" on a sale that has one.
                  Changing the Customer is its own reviewed action. Additional
                  Customers are the ones actually being added, so they pick. */}
              {index === 0 && buyerName(buyer.personId) ? (
                <Field label={customerLabel(index)}>
                  <p className="px-1 py-2 text-sm font-medium">{buyerName(buyer.personId)}</p>
                </Field>
              ) : (
                <Field label={customerLabel(index)}>
                  <PersonPicker
                    required
                    value={buyer.personId}
                    onChange={(id) => update(index, { personId: id })}
                    options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
                  />
                </Field>
              )}
              {/* One buyer owns the whole Plot, so there is no share to type —
                  the field said "blank = sole buyer" and asked the reader to
                  work out that an empty box meant everything. It states 100%
                  instead, and only becomes a field when a second buyer makes
                  the split a real question (PRD §12.1). */}
              {rows.length === 1 ? (
                <Field label="Ownership share">
                  <p className="px-1 py-2 text-sm font-medium">100%</p>
                </Field>
              ) : (
                <Field label="Ownership share % — all buyers must total 100%">
                  <Input
                    max={shareRoom(rows, index)}
                    value={buyer.sharePercent}
                    onChange={(e) =>
                      update(index, { sharePercent: capShare(rows, index, e.target.value) })
                    }
                    inputMode="decimal"
                    required
                  />
                </Field>
              )}
              <Field label="Date of Birth">
                <Input
                  type="date"
                  value={buyer.dateOfBirth}
                  onChange={(e) => update(index, { dateOfBirth: e.target.value })}
                  required
                />
              </Field>
              <Field label="Address">
                <Input
                  value={buyer.address}
                  onChange={(e) => update(index, { address: e.target.value })}
                  required
                />
              </Field>
              {/* Asked only where there is none on file. An Aadhaar or PAN
                  already recorded is never re-asked and never overwritten from
                  here. The Aadhaar is required because a registry cannot be
                  recorded without one; the PAN is a decision, and leaving it
                  blank is "PAN Not Available" (§18.2). */}
              {buyer.personId && !onFile(buyer.personId) && (
                <Field label="Aadhaar Number">
                  <Input
                    value={buyer.aadhaar}
                    onChange={(e) => update(index, { aadhaar: e.target.value })}
                    inputMode="numeric"
                    placeholder={knownMissing(buyer.personId) ? "12 digits" : "12 digits, if not on file"}
                    // Required only where the Booking's own parties say this
                    // Person has none. An Additional Customer picked here may
                    // already have one on file, and demanding a number nobody
                    // has to hand would be a dead end — the server refuses a
                    // completion without one anyway, and says so.
                    required={knownMissing(buyer.personId)}
                  />
                </Field>
              )}
              {buyer.personId && !panOnFile(buyer.personId) && (
                <Field label="PAN — blank means not available">
                  <Input
                    value={buyer.pan}
                    onChange={(e) => update(index, { pan: e.target.value.toUpperCase() })}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </Field>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setRows((list) => [
                  ...list,
                  { personId: "", sharePercent: "", dateOfBirth: "", address: "", aadhaar: "", pan: "" },
                ])
              }
            >
              Add Additional Customer
            </Button>
            {rows.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRows((list) => list.slice(0, -1))}
              >
                Remove last
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Completion route — one only, there is no Allotment-then-Registry sequence
          </p>
          <Field label="Route">
            <select
              className={inputClass}
              value={route}
              onChange={(e) => setRoute(e.target.value as "ALLOTMENT" | "REGISTRY")}
            >
              <option value="ALLOTMENT">Allotment</option>
              <option value="REGISTRY">Registry</option>
            </select>
          </Field>

          {route === "ALLOTMENT" ? (
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Allotment Date">
                <Input type="date" name="allotmentDate" required />
              </Field>
              <Field label="Allotment Number">
                <Input name="allotmentNumber" required />
              </Field>
              <Field label="Allotment Given To">
                <Input name="allotmentGivenTo" required />
              </Field>
              <Field label="Patta Issued">
                <select
                  className={inputClass}
                  value={pattaIssued}
                  onChange={(e) => setPattaIssued(e.target.value as "YES" | "DONT_KNOW")}
                >
                  <option value="YES">Yes</option>
                  <option value="DONT_KNOW">Do not know</option>
                </select>
              </Field>
              {pattaIssued === "YES" && (
                <Field label="Patta Date">
                  <Input type="date" name="pattaDate" required />
                </Field>
              )}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Advocate Name">
                <Input name="advocateName" required />
              </Field>
              <Field label="Registry Date">
                <Input type="date" name="registryDate" required />
              </Field>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Recording…" : "Record and mark Delivered"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CompletionDialog({
  row,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CompletionRouteInput) => void;
}) {
  const [route, setRoute] = React.useState<"ALLOTMENT" | "REGISTRY">("ALLOTMENT");
  const [pattaIssued, setPattaIssued] = React.useState<"YES" | "DONT_KNOW">("YES");

  return (
    <Modal
      title="Record Allotment / Registry"
      description="One route only. There is no Allotment-then-Registry sequence."
      onClose={onClose}
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? "Booking Request"} · {row.project} {row.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">
          Completing the route sets the Booking and Plot to Delivered once, and Papers Legally
          Transferred becomes Yes automatically.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit(
            route === "ALLOTMENT"
              ? {
                  route: "ALLOTMENT",
                  allotmentDate: String(f.get("allotmentDate")),
                  allotmentNumber: String(f.get("allotmentNumber")),
                  allotmentGivenTo: String(f.get("allotmentGivenTo")),
                  pattaIssued,
                  pattaDate: String(f.get("pattaDate") ?? ""),
                }
              : {
                  route: "REGISTRY",
                  advocateName: String(f.get("advocateName")),
                  registryDate: String(f.get("registryDate")),
                }
          );
        }}
      >
        <Field label="Route">
          <select
            className={inputClass}
            value={route}
            onChange={(e) => setRoute(e.target.value as "ALLOTMENT" | "REGISTRY")}
          >
            <option value="ALLOTMENT">Allotment</option>
            <option value="REGISTRY">Registry</option>
          </select>
        </Field>

        {route === "ALLOTMENT" ? (
          <>
            <Field label="Allotment Date">
              <Input type="date" name="allotmentDate" required />
            </Field>
            <Field label="Allotment Number">
              <Input name="allotmentNumber" required />
            </Field>
            <Field label="Allotment Given To">
              <Input name="allotmentGivenTo" required />
            </Field>
            <Field label="Patta Issued">
              <select
                className={inputClass}
                value={pattaIssued}
                onChange={(e) => setPattaIssued(e.target.value as "YES" | "DONT_KNOW")}
              >
                <option value="YES">Yes</option>
                <option value="DONT_KNOW">Do not know</option>
              </select>
            </Field>
            {pattaIssued === "YES" && (
              <Field label="Patta Date">
                <Input type="date" name="pattaDate" required />
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="Advocate Name">
              <Input name="advocateName" required />
            </Field>
            <Field label="Registry Date">
              <Input type="date" name="registryDate" required />
            </Field>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Recording…" : "Record and mark Delivered"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------- Cancellation decision and Change Plot */

/**
 * PRD §15.4 — the Accounts decision on a formal cancellation. At 0% Accounts may
 * approve with No Payment Received; where payment exists the decision carries a
 * refund reference and an action date, never a rupee amount.
 */
function CancellationDecisionDialog({
  row,
  approve,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  approve: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    approve: boolean;
    note: string;
    noPaymentReceived?: boolean;
    reference?: string;
    actionDate?: string;
  }) => void;
}) {
  const hasPayment = Number(row.paymentReceivedPercent) > 0;
  const [noPayment, setNoPayment] = React.useState(!hasPayment);

  return (
    <Modal
      title={approve ? "Approve cancellation" : "Reject cancellation"}
      onClose={onClose}
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? "Booking Request"} · {row.project} {row.plotNumber} · {row.primaryCustomer}
        </p>
        <p className="mt-1 text-muted-foreground">
          {approve
            ? "The Booking becomes Cancelled and the Plot returns through the one restriction-aware rule. No RESALE tag is added."
            : "The exact previous Booking, Plot, payment and commission state is restored, and the rolling follow-up resumes."}
        </p>
        <p className="mt-1 text-muted-foreground">
          Payment Received on this Booking: {row.paymentReceivedPercent}%
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            approve,
            note: String(f.get("note")),
            noPaymentReceived: approve ? noPayment : undefined,
            reference: approve && !noPayment ? String(f.get("reference")) : undefined,
            actionDate: approve && !noPayment ? String(f.get("actionDate")) : undefined,
          });
        }}
      >
        {approve && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={noPayment}
              disabled={hasPayment}
              onChange={(e) => setNoPayment(e.target.checked)}
            />
            No Payment Received
            {hasPayment && " — unavailable, this Booking has verified payment"}
          </label>
        )}

        {approve && !noPayment && (
          <>
            <Field label="Refund Payment Reference No.">
              <Input name="reference" required />
            </Field>
            <Field label="Refund action date">
              <Input type="date" name="actionDate" required defaultValue={istDay(new Date())} />
            </Field>
          </>
        )}

        <Field label="Remark — compulsory">
          <RemarkSelect presets="decideCancellation" name="note" required kind={approve ? "Approved" : "Rejected"} />
        </Field>

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

/** PRD §5.3 — same Project only, and the same Booking Number continues. */
function ChangePlotDialog({
  row,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (toPlotId: string, remark: string) => void;
}) {
  const [options, setOptions] = React.useState<
    Array<{ id: string; label: string; status: string; heldBySameCustomer: boolean }>
  >([]);
  const [toPlotId, setToPlotId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    loadChangePlotOptions(row.id).then((found) => {
      if (!cancelled) setOptions(found);
    });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  return (
    <Modal
      title="Change Plot"
      description="Within the same Project only. Cross-Project movement needs Cancel Booking and a new Booking Request."
      onClose={onClose}
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? "Booking Request"} · {row.project} {row.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">
          The replacement Plot is reserved with its own PLC snapshot. Accounts then records the
          Payment Received percentage that applies to it — no rupee conversion happens anywhere.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit(toPlotId, String(f.get("remark")));
        }}
      >
        <Field label="Replacement Plot">
          <select
            className={inputClass}
            value={toPlotId}
            onChange={(e) => setToPlotId(e.target.value)}
            required
          >
            <option value="">
              {options.length === 0 ? "No eligible Plot in this Project" : "Select a Plot"}
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.heldBySameCustomer ? " · held by this Customer" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Remark — compulsory">
          <RemarkSelect presets="changePlot" name="remark" required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy || !toPlotId}>
            {busy ? "Processing…" : "Raise Change Plot"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Accounts records the applicable percentage and a revised schedule (PRD §5.3). */
function ChangePlotDecisionDialog({
  row,
  approve,
  busy,
  onClose,
  onSubmit,
}: {
  row: BookingRowView;
  approve: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    approve: boolean;
    note: string;
    appliedPercent?: string;
    schedule?: ScheduleRowInput[];
  }) => void;
}) {
  const [schedule, setSchedule] = React.useState<ScheduleRowInput[]>([
    { seq: 1, percent: "", dueDate: istDay(new Date()) },
  ]);

  return (
    <Modal
      title={approve ? "Approve Change Plot" : "Reject Change Plot"}
      wide={approve}
      onClose={onClose}
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? "Booking Request"} · {row.project} {row.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">
          {approve
            ? "The same Booking Number continues on the replacement Plot. Existing Payment Reference Numbers stay linked to this Booking, and the old Plot returns to inventory with no RESALE tag."
            : "The original Plot and the reserved replacement are both restored exactly. The temporary PLC snapshot leaves current use and stays in History."}
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            approve,
            note: String(f.get("note")),
            appliedPercent: approve ? String(f.get("appliedPercent")) : undefined,
            schedule: approve ? schedule : undefined,
          });
        }}
      >
        {approve && (
          <>
            <Field label="Payment Received % applicable to the replacement Plot">
              <Input
                name="appliedPercent"
                required
                inputMode="decimal"
                defaultValue={row.paymentReceivedPercent}
              />
            </Field>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Revised payment schedule</p>
              <ScheduleEditor
                schedule={schedule}
                setSchedule={setSchedule}
                minDate={istDay(new Date())}
              />
            </div>
          </>
        )}

        <Field label="Remark — compulsory">
          <RemarkSelect presets="decideChangePlot" name="note" required kind={approve ? "Approved" : "Rejected"} />
        </Field>

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
