"use client";

// Bookings — DESIGN.md §10, §11.
// Actions are hidden by permission for clarity; the server re-checks every one
// and the domain services re-check state on top of that (DESIGN §1).

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronLeft, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { PersonLink } from "@/components/person-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { PersonPicker, personLabel } from "@/components/person-picker";
import { capShare, shareRoom, shareSum } from "@/lib/domain/shares";
import { eligibilityLabel, type CommissionType } from "@/lib/domain/commission";
import {
  formatIst,
  formatIstDate,
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
  approveCommissionPaidEarlyAction,
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

export type BookingRowView = {
  id: string;
  requestNo: string;
  bookingNumber: string | null;
  project: string;
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
  /** CUSTOMER or MEMBER, frozen at Accounts approval and never rewritten. */
  originalClassification: string | null;
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
  raiseSoldBy: boolean;
  approveSoldBy: boolean;
  recordFinalBuyers: boolean;
  recordCompletion: boolean;
  reopenDelivered: boolean;
};

// One width and one height for every action in the Booking header, so three
// buttons on a line read as three of the same thing.
const headerButton = "h-8 w-[9rem]";

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
  MANAGEMENT_ACTION_REQUIRED: "Management Action Required",
};

const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Accounts Adjustment Required",
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
  COMMISSION_CONFLICT_ABOVE_4: "Commission Conflict — Above 4%",
};

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
  lines.push(row.bookingNumber ? `${row.bookingNumber} · ${row.requestNo}` : row.requestNo);
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
 * totalled together (main-PRD §1) — but the ceiling on one entry is the same
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
  | { kind: "NEW"; plotId?: string }
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
  | { kind: "SOLD_BY"; row: BookingRowView }
  | { kind: "SOLD_BY_DECIDE"; row: BookingRowView; approve: boolean }
  | { kind: "FINAL_BUYERS"; row: BookingRowView }
  | { kind: "COMPLETION"; row: BookingRowView }
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
  const [dialog, setDialog] = React.useState<Dialog>(null);
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
   * What can be done to this Booking now. These used to sit in the row, four
   * buttons wide in a column that was already carrying six others; they belong
   * with the detail that says whether doing them is the right call.
   */
  function actions(row: BookingRowView) {
    return (
      <>
        {row.status === "REQUEST_PENDING" && permissions.decide && (
          <Button size="sm" className={headerButton} onClick={() => openDialog({ kind: "DECIDE", row, approve: true })}>
            Review
          </Button>
        )}
        {row.status === "REQUEST_PENDING" && permissions.submit && (
          <Button
            size="sm"
            variant="outline"
            className={headerButton}
            onClick={() => openDialog({ kind: "REVISE", row })}
          >
            Revise request
          </Button>
        )}
        {/* Fully paid is the end of this button, not a form that opens and
            then refuses. Payment Completed still qualifies while anything
            remains — a correction can step the total back below 100 — so the
            gate is what is left, not the status. */}
        {["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
          permissions.confirmPayment &&
          Number(remainingPercent(row.paymentReceivedPercent)) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className={headerButton}
              onClick={() => openDialog({ kind: "PAY", row })}
            >
              Confirm Payment
            </Button>
          )}
        {["REQUEST_PENDING", "BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
          permissions.cancel && (
            // Outline, not ghost: three actions on one line, and the third had
            // no edge at all, so it read as a stray link rather than the third
            // button. Red says what it does; the shape says it is one of three.
            <Button
              size="sm"
              variant="outline"
              className={`${headerButton} border-red-500/40 text-red-700 hover:bg-red-500/5`}
              onClick={() => openDialog({ kind: "CANCEL", row })}
            >
              Cancel Booking
            </Button>
          )}
      </>
    );
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
        <div className="mx-auto max-w-6xl space-y-3">
          <Link
            href="/bookings"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Bookings
          </Link>
          {/* The Booking Number is generated, not chosen, and nobody reads a
              page to find out what it is. The title is who bought what; the
              numbers stay on the line that carries the other filing facts. */}
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{focusRow.primaryCustomer}</h1>
                <Badge variant={statusVariant(focusRow.status)}>
                  {STATUS_LABEL[focusRow.status] ?? focusRow.status}
                </Badge>
                {PROCESS_LABEL[focusRow.activeProcess] && (
                  <Badge variant="warning">{PROCESS_LABEL[focusRow.activeProcess]}</Badge>
                )}
                {/* The historical classification stays visible on the record
                    itself, not only as a count on the Dashboard. */}
                {focusRow.originalClassification && (
                  <Badge
                    variant="outline"
                    title="Frozen when commission was first generated, at Accounts approval, and never rewritten."
                  >
                    {focusRow.originalClassification === "MEMBER"
                      ? "Member business"
                      : "Customer business"}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm">
                {focusRow.project} · {focusRow.plotNumber}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {focusRow.bookingNumber
                  ? `${focusRow.bookingNumber} · ${focusRow.requestNo}`
                  : focusRow.requestNo}{" "}
                · booked {formatIstDate(focusRow.bookingDate)} · submitted by {focusRow.submittedByRef}
              </p>
              {/* The one case the classification has to explain itself: the
                  buyer has become a Member since, and the Booking still counts
                  as Customer business. Saying so is what stops a reader taking
                  it for a mistake. */}
              {focusRow.originalClassification === "CUSTOMER" && focusRow.buyerMemberIdNow && (
                <p className="mt-1 text-[11px] text-amber-800">
                  Customer business. {focusRow.primaryCustomer} has since been activated as{" "}
                  {focusRow.buyerMemberIdNow}, and this Booking keeps the classification it was
                  approved under — it is not recalculated as a Member self-purchase.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions(focusRow)}</div>
          </header>
          {noticeCard}
          <BookingDetailPanel
            row={focusRow}
            detail={detail}
            people={people}
            permissions={permissions}
            onAction={setDialog}
          />
        </div>
      ) : (
      <div className="mx-auto max-w-6xl space-y-3">
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
            className="h-9 w-64"
            placeholder="Search Booking Number, Request ID, Plot or Customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {noticeCard}

        {/* Same table as Customers and Enquiries: a rule between rows, no
            block of colour behind each one. The Booking Number is the page it
            opens, not a column of its own. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-xs">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5">Project</th>
                <th className="w-[9rem] px-3 py-1.5">Plot No.</th>
                <th className="w-[10rem] px-3 py-1.5 text-center">Size (W × L)</th>
                <th className="px-3 py-1.5">Customer</th>
                <th className="px-3 py-1.5">Sold By</th>
                <th className="w-[14rem] px-3 py-1.5">Status</th>
                <th className="w-[8rem] px-3 py-1.5 text-right">Payment Received</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No Bookings match these filters. Start one from an Available Plot or a live Hold.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="h-14 border-b border-border/60 align-middle leading-tight last:border-0 hover:bg-secondary/50 [&>td]:px-3 [&>td]:py-1"
                >
                  <td>{row.project}</td>
                  {/* The Plot number is the way into the Booking, and its type
                      qualifies it rather than competing with it. */}
                  <td>
                    <button
                      type="button"
                      className="block text-left font-semibold text-primary hover:underline"
                      onClick={() => router.push(`/bookings/${row.id}`)}
                    >
                      {row.plotNumber}
                    </button>
                    <span className="block text-[11px] text-muted-foreground">
                      {humanise(row.plotType)}
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
                    {row.originalClassification === "CUSTOMER" && row.buyerMemberIdNow && (
                      <span
                        className="block text-[11px] text-amber-800"
                        title="Frozen at Accounts approval. The buyer has since been activated as a Member; this Booking stays Customer business."
                      >
                        Customer business · now {row.buyerMemberIdNow}
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
                  <td title={statusTooltip(row)}>
                    <Badge variant={statusVariant(row.status)} className="whitespace-nowrap">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {PROCESS_LABEL[row.activeProcess] && (
                      <span className="block text-[11px] text-amber-800">
                        {PROCESS_LABEL[row.activeProcess]}
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{row.paymentReceivedPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {dialog?.kind === "NEW" && (
        <BookingFormDialog
          title="Start Booking Request"
          initialPlotId={dialog.plotId}
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
          title={`Replace review version — ${dialog.row.requestNo}`}
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
                  customerType: form.customerType,
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
            <select name="reason" required className={inputClass} defaultValue="">
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
            <Input name="remark" />
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
            <Input name="remark" />
          </Field>
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
            <Input name="reason" required minLength={3} />
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
            <Input name="note" required minLength={3} />
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
            <Input name="reason" required minLength={3} />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "SOLD_BY" && (
        <Modal
          title={`Sold By Correction — ${dialog.row.bookingNumber ?? dialog.row.requestNo}`}
          description="Nothing changes until Admin or MD approves. Booking and Payment history are never touched by this correction."
          onClose={() => setDialog(null)}
        >
          <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
            <p className="font-semibold text-foreground">
              Current: {SOLD_BY_LABEL[dialog.row.soldByType] ?? dialog.row.soldByType}
              {dialog.row.soldByName ? ` · ${dialog.row.soldByName}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              On approval the old commission records are superseded and new valid ones are created.
              Anything already Paid or Paid Early becomes Accounts Adjustment Required.
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
              ? "The attribution moves, old commission records are superseded and new valid ones are created. Paid and Paid Early records become Accounts Adjustment Required, and Accounts receives the impact review. Booking and Payment history are unchanged."
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
            <Input name="note" required minLength={3} />
          </Field>
        </ActionDialog>
      )}

      {dialog?.kind === "COMMISSION_PAY" && (
        <ActionDialog
          title={dialog.early ? "Mark Commission Paid Early" : "Mark Commission Paid"}
          row={dialog.row}
          consequence={
            dialog.early
              ? `${dialog.label}. Eligibility is not Ready, so this is Paid Early: MD has approved it, remarks are compulsory, eligibility keeps updating separately, and no second payment task is raised at the normal milestone. It can never be marked Paid again.`
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
            <Input name="remarks" required={dialog.early} minLength={dialog.early ? 3 : undefined} />
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
            <Input name="note" required minLength={3} />
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
            <Input name="note" required minLength={3} />
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
          consequence="Exceptional MD/Admin correction. The Booking returns to Payment Completed, the completion record is kept as history, and the Allotment/Registry work is queued again."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => reopenDeliveredAction(dialog.row.id, String(f.get("reason")), newKey()))
          }
        >
          <Field label="Compulsory reason">
            <Input name="reason" required minLength={3} />
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
  const [tab, setTab] = React.useState<"OVERVIEW" | "PAYMENT" | "COMMISSION" | "HISTORY">("OVERVIEW");

  if (!detail || detail.id !== row.id) {
    return (
      <p className="py-6 text-xs text-muted-foreground">Loading Booking details…</p>
    );
  }

  const hasExceptionAction =
    (row.status === "REFUND_PENDING" && permissions.decideCancellation) ||
    (row.activeProcess === "CHANGE_PLOT_PENDING" && permissions.decideChangePlot) ||
    (["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
      row.activeProcess === "NONE" &&
      permissions.raiseChangePlot);

  const currentParties = detail.parties.filter((p) => p.effectiveTo === null);
  const liveSchedule = detail.scheduleVersions.find((s) => s.status === "ACTIVE");
  const pendingSchedule = detail.scheduleVersions.find((s) => s.status === "PENDING");
  const pendingCustomerChange = detail.customerChanges.find((c) => c.status === "PENDING");
  const pendingSoldBy = detail.soldByCorrections.find((c) => c.status === "PENDING");

  return (
    <div className="space-y-5">
      {/* Tabs sit on a rule rather than inside a box — the panel is the page. */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {(["OVERVIEW", "PAYMENT", "COMMISSION", "HISTORY"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs ${
              tab === t
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {tab === "OVERVIEW" && (
        <div className="space-y-4">
          {row.status === "REQUEST_PENDING" && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
              Submitted values are locked while Accounts reviews them. To change one, cancel this
              request and submit a revised one.
            </p>
          )}
          {pendingCustomerChange && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
              <p className="font-semibold">Primary Customer Change — Waiting Approval</p>
              <p className="mt-1">
                {pendingCustomerChange.reason} · raised by {pendingCustomerChange.requestedByRef} on{" "}
                {formatIst(pendingCustomerChange.requestedAt)}
              </p>
              {permissions.approveCustomerChange && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onAction({ kind: "CUSTOMER_CHANGE_DECIDE", row, approve: true })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction({ kind: "CUSTOMER_CHANGE_DECIDE", row, approve: false })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}

          {pendingSoldBy && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
              <p className="font-semibold">Sold By Correction — Waiting Approval</p>
              <p className="mt-1">
                {SOLD_BY_LABEL[pendingSoldBy.fromSoldByType]} →{" "}
                {SOLD_BY_LABEL[pendingSoldBy.toSoldByType]} · {pendingSoldBy.reason}
              </p>
              <p className="mt-1 text-[11px]">
                {pendingSoldBy.supportingNote} · raised by {pendingSoldBy.requestedByRef} on{" "}
                {formatIst(pendingSoldBy.requestedAt)}
              </p>
              {permissions.approveSoldBy && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => onAction({ kind: "SOLD_BY_DECIDE", row, approve: true })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction({ kind: "SOLD_BY_DECIDE", row, approve: false })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Customers
            </h3>
            <ul className="mt-2 space-y-1 text-xs">
              {currentParties.map((p) => (
                <li key={`${p.personId}-${p.effectiveFrom}`} className="flex justify-between gap-3">
                  <span>
                    <PersonLink personId={p.personId} name={p.name} />
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {/* One buyer is the Customer. "Primary" only says
                          something when there is a second one to be primary
                          over, and otherwise sends the reader looking. */}
                      {currentParties.length === 1
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
            <div className="mt-3 flex flex-wrap gap-2">
              {["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) && permissions.changeShares && (
                <Button size="sm" variant="outline" onClick={() => onAction({ kind: "SHARES", row })}>
                  Change ownership shares
                </Button>
              )}
              {["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
                permissions.raiseCustomerChange &&
                !pendingCustomerChange && (
                  <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "CUSTOMER_CHANGE", row })}>
                    Change Primary Customer
                  </Button>
                )}
              {["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"].includes(row.status) &&
                permissions.raiseSoldBy &&
                !pendingSoldBy && (
                  <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "SOLD_BY", row })}>
                    Sold By Correction
                  </Button>
                )}
            </div>
          </section>

          {/* PLC spec §15.3 — the frozen Booking PLC. Percentage only: no rupee
              value is derived from it here or anywhere else. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plot Location Charge (PLC %)
            </h3>
            {!detail.plc ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No PLC snapshot is frozen against this Booking.
              </p>
            ) : (
              <div className="mt-2 space-y-2 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-base font-semibold tabular-nums">
                    {Number(detail.plc.totalPercent).toFixed(2)}%
                    <span className="ml-2 text-xs font-normal">
                      {detail.plc.position.join(" · ")}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Frozen {formatIst(detail.plc.frozenAt)}
                    {detail.plc.correctionReason ? " · corrected" : " · original freeze"}
                    {detail.plc.isCurrent ? "" : " · superseded"}
                  </span>
                </div>

                <ul className="space-y-0.5">
                  {detail.plc.components.map((c) => (
                    <li key={c.category} className="flex justify-between gap-3">
                      <span>
                        {c.label}
                        <span className="ml-2 text-[11px] text-muted-foreground">{c.evidence}</span>
                      </span>
                      <span className="tabular-nums">{Number(c.percent).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>

                {detail.plc.correctionReason && (
                  <p className="text-[11px] text-amber-800">
                    Corrected by {detail.plc.correctedBy} — {detail.plc.correctionReason}
                  </p>
                )}

                {detail.plc.history.length > 1 && (
                  <div className="border-t border-border/50 pt-2">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Correction history
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      {detail.plc.history.map((h, index) => (
                        <li key={index} className="flex justify-between gap-3">
                          <span>
                            {formatIst(h.frozenAt)}
                            {h.correctionReason ? ` — ${h.correctionReason}` : " — original freeze"}
                          </span>
                          <span className="tabular-nums">
                            {Number(h.totalPercent).toFixed(2)}%
                            {h.isCurrent ? "" : " (superseded)"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Frozen at submission — a later change to the Project PLC does not move it.
                </p>
              </div>
            )}
          </section>

          {/* Drawn only when there is an exception to act on. It used to render
              a heading and a line saying no exception applied — true of almost
              every Booking, almost all of the time, and three of the six things
              on this page were saying nothing in the same way. */}
          {hasExceptionAction && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Exception workflows
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {/* PRD §15.4 — the Accounts decision on a formal cancellation. */}
              {row.status === "REFUND_PENDING" && permissions.decideCancellation && (
                <>
                  <Button
                    size="sm"
                    onClick={() => onAction({ kind: "CANCEL_DECIDE", row, approve: true })}
                  >
                    Approve cancellation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction({ kind: "CANCEL_DECIDE", row, approve: false })}
                  >
                    Reject cancellation
                  </Button>
                </>
              )}

              {/* PRD §5.1 — Change Plot applies before Delivered, one process at a time. */}
              {["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
                row.activeProcess === "NONE" &&
                permissions.raiseChangePlot && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction({ kind: "CHANGE_PLOT", row })}
                  >
                    Change Plot
                  </Button>
                )}

              {row.activeProcess === "CHANGE_PLOT_PENDING" && permissions.decideChangePlot && (
                <>
                  <Button
                    size="sm"
                    onClick={() => onAction({ kind: "CHANGE_PLOT_DECIDE", row, approve: true })}
                  >
                    Approve Change Plot
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction({ kind: "CHANGE_PLOT_DECIDE", row, approve: false })}
                  >
                    Reject Change Plot
                  </Button>
                </>
              )}

            </div>
          </section>
          )}

          <CompletionSection
            row={row}
            detail={detail}
            permissions={permissions}
            onAction={onAction}
          />

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Review history
            </h3>
            <ul className="mt-2 space-y-1 text-xs">
              {detail.reviewVersions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Submitted by {v.submittedByRef} · {formatIst(v.submittedAt)}
                    {v.decisionNote ? ` · ${v.decisionNote}` : ""}
                    {v.rejectReason ? ` · ${v.rejectReason.replaceAll("_", " ")}` : ""}
                  </span>
                  <Badge variant="outline">{v.status.charAt(0) + v.status.slice(1).toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === "PAYMENT" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Payment Received progress: <span className="tabular-nums">{row.paymentReceivedPercent}%</span>.
            Part payment is allowed and there is no separate Partially Received status.
          </p>

          {pendingSchedule && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
              <p className="font-semibold">Schedule revision waiting for the Accounts decision</p>
              <p className="mt-1">{pendingSchedule.reason}</p>
              <ul className="mt-2 space-y-0.5">
                {pendingSchedule.instalments.map((i) => (
                  <li key={i.seq} className="tabular-nums">
                    {i.seq}. {i.scheduled}% due {formatIst(i.dueDate)}
                  </li>
                ))}
              </ul>
              {permissions.decideSchedule && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => onAction({ kind: "SCHEDULE_DECIDE", row, approve: true })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction({ kind: "SCHEDULE_DECIDE", row, approve: false })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}

          {liveSchedule ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1">#</th>
                    <th className="py-1 text-right">Scheduled %</th>
                    <th className="py-1 text-right">Received %</th>
                    <th className="py-1 text-right">Remaining %</th>
                    <th className="py-1">Due date</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveSchedule.instalments.map((i) => (
                    <tr key={i.seq}>
                      <td className="py-1">{i.seq}</td>
                      <td className="py-1 text-right tabular-nums">{i.scheduled}</td>
                      <td className="py-1 text-right tabular-nums">{i.received}</td>
                      <td className="py-1 text-right tabular-nums">{i.remaining}</td>
                      <td className="py-1">{formatIst(i.dueDate)}</td>
                      <td className="py-1">
                        <Badge
                          variant={
                            i.status === "RECEIVED"
                              ? "success"
                              : i.status === "OVERDUE"
                                ? "destructive"
                                : "outline"
                          }
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

          {permissions.reviseSchedule && liveSchedule && !pendingSchedule && (
            <Button size="sm" variant="outline" onClick={() => onAction({ kind: "SCHEDULE", row })}>
              Revise Remaining Payment Schedule
            </Button>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Payment entries
            </h3>
            {detail.paymentEntries.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No payment confirmed yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {detail.paymentEntries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className={e.status === "SUPERSEDED" ? "text-muted-foreground line-through" : ""}>
                      <span className="tabular-nums">{e.percent}%</span> · {e.reference}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        paid {formatIst(e.paidOn)} · entered {formatIst(e.recordedAt)} · {e.confirmedByRef}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={e.status === "SUPERSEDED" ? "outline" : "success"}>
                        {e.status === "SUPERSEDED" ? "Superseded" : "Confirmed"}
                      </Badge>
                      {e.status === "CONFIRMED" && permissions.correctPayment && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            onAction({
                              kind: "CORRECT",
                              row,
                              entryId: e.id,
                              percent: e.percent,
                              reference: e.reference,
                            })
                          }
                        >
                          Correct
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "COMMISSION" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Percentages only — the CRM stores no payout amount. Eligibility and payment are separate
            statuses, and a superseded record stays visible rather than being removed.
          </p>

          {detail.commissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Commission is generated when Accounts approves the Booking Request.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-[8rem] py-1.5 pr-3">Type</th>
                    <th className="py-1.5 pr-3">Beneficiary</th>
                    <th className="w-[4.5rem] py-1.5 pr-3 text-right">Rate</th>
                    <th className="w-[6rem] py-1.5 pr-3 text-right">Milestone</th>
                    <th className="w-[10rem] py-1.5 pr-3">Eligibility</th>
                    <th className="w-[12rem] py-1.5 pr-3">Payment</th>
                    <th className="w-[7rem] py-1.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.commissions.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-b border-border/60 align-middle leading-tight last:border-0 [&>td]:py-1.5 [&>td]:pr-3 ${
                        c.isCurrent ? "" : "text-muted-foreground"
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
                      <td className="text-right tabular-nums">{c.percent}%</td>
                      <td className="text-right tabular-nums">{c.milestonePercent}%</td>
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
                          {eligibilityLabel(c.eligibility, c.type as CommissionType)}
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
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {/* AC-03 — an unready record needs MD's approval before
                            Accounts sees a Paid Early button at all. */}
                        {c.isCurrent &&
                          c.payment === "NOT_PAID" &&
                          c.eligibility !== "READY" &&
                          // CR-013 — a 0% band has nothing to approve early.
                          c.eligibility !== "NO_BENEFIT" &&
                          !c.earlyApprovedAt &&
                          permissions.approvePaidEarly && (
                            <Button
                              size="xs"
                              className="w-24"
                              variant="outline"
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
                          )}
                        {c.isCurrent &&
                          permissions.processCommission &&
                          c.payment === "NOT_PAID" &&
                          c.eligibility !== "NO_BENEFIT" &&
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
                          c.eligibility !== "READY" &&
                          c.eligibility !== "NO_BENEFIT" &&
                          !c.earlyApprovedAt &&
                          !permissions.approvePaidEarly && (
                            <span className="text-[11px] text-muted-foreground">
                              Awaiting MD approval
                            </span>
                          )}
                        {c.isCurrent && c.eligibility === "NO_BENEFIT" && (
                          <span className="text-[11px] text-muted-foreground">
                            Position above 9 — nothing to pay
                          </span>
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

      {tab === "HISTORY" && (
        <ul className="space-y-2 text-xs">
          {detail.events.map((e, index) => (
            <li key={index} className="border-l border-border/60 pl-3">
              <p className="font-medium">{e.action.replaceAll("_", " ")}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatIst(e.at)} · {e.actorRef}
                {e.fromStatus && e.toStatus ? ` · ${e.fromStatus} → ${e.toStatus}` : ""}
              </p>
              {e.reason && <p className="text-[11px] text-muted-foreground">{e.reason}</p>}
            </li>
          ))}
        </ul>
      )}

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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plotNumber} · {row.primaryCustomer}
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
  customerType?: string | null;
  remark?: string | null;
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

      {(snapshot.customerType || snapshot.remark) && (
        <section className="space-y-0.5 border-t border-border/50 pt-3 text-muted-foreground">
          {snapshot.customerType && (
            <p>Customer Type: {snapshot.customerType.replaceAll("_", " ")}</p>
          )}
          {snapshot.remark && <p>Remark: {snapshot.remark}</p>}
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
      title={`Accounts Verification — Booking ${row.requestNo}`}
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
            ? "This request has no version waiting for a decision."
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
          <Input name="note" required minLength={3} />
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
  customerType: string;
  remark: string;
  schedule: ScheduleRowInput[];
  reason?: string;
};

export function BookingFormDialog({
  title,
  initialPlotId,
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
    { personId: "", role: "PRIMARY", sharePercent: "" },
  ]);
  const [schedule, setSchedule] = React.useState<ScheduleRowInput[]>([
    { seq: 1, percent: "100", dueDate: today },
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
            customerType: String(f.get("customerType") ?? ""),
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
                <dt className="text-muted-foreground">Location Charge</dt>
                <dd className="text-right font-semibold text-foreground">
                  {plot.locationCharge.join(" · ")}
                </dd>
              </>
            )}
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
          <Field label="Customer Type">
            <select name="customerType" className={inputClass} defaultValue="END_USER" required>
              <option value="END_USER">End User</option>
              <option value="INVESTOR">Investor</option>
            </select>
          </Field>
          {soldByType === "THREE_PERCENT_CLUB" ? (
            <div aria-hidden className="hidden sm:block" />
          ) : (
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
            <Input className="h-9 text-xs" name="bookingDateReason" required minLength={3} />
          </Field>
        )}

        <ScheduleEditor schedule={schedule} setSchedule={setSchedule} minDate={today} />

        {requireReason && (
          <Field label="Reason for replacing this request — compulsory">
            <Input className="h-9 text-xs" name="reason" required minLength={3} />
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

const round2 = (n: number) => Math.round(n * 100) / 100;


/**
 * The percentages fill forward. Every row keeps exactly what was typed and the
 * last row carries whatever is left of the 100 — type 30 into the first and the
 * second reads 70 on its own. Type into the last row as well and the shortfall
 * shows as Remaining, which the next instalment added picks up.
 */
function fillForward(rows: ScheduleRowInput[], typedIndex = -1): ScheduleRowInput[] {
  const out = rows.map((r, i) => ({ ...r, seq: i + 1 }));
  const last = out.length - 1;
  if (last < 1 || typedIndex === last) return out;
  const others = out.reduce((sum, r, i) => (i === last ? sum : sum + (Number(r.percent) || 0)), 0);
  out[last] = { ...out[last], percent: String(Math.max(0, round2(100 - others))) };
  return out;
}

const scheduleTotal = (rows: ScheduleRowInput[]) =>
  round2(rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0));

/** YYYY-MM-DD plus N calendar days — done in UTC so it never drifts across a DST edge. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Due dates fill forward too (PRD §11.4 — chronological, never before the one
 * before it): editing an earlier row so it lands after a later one carries
 * that later row's date up to match, rather than leaving the schedule invalid
 * for a validation message to catch later.
 */
function fillDatesForward(rows: ScheduleRowInput[], changedIndex: number): ScheduleRowInput[] {
  const out = rows.map((r) => ({ ...r }));
  for (let i = changedIndex + 1; i < out.length; i++) {
    if (out[i].dueDate <= out[i - 1].dueDate) {
      out[i] = { ...out[i], dueDate: addDays(out[i - 1].dueDate, 1) };
    }
  }
  return out;
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
            value={line.percent}
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
              onClick={() => setSchedule(fillForward(schedule.filter((_, i) => i !== index)))}
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
      title={`Revise Remaining Payment Schedule — ${row.bookingNumber ?? row.requestNo}`}
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
          <Input name="reason" required minLength={3} />
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
      title={`Change ownership shares — ${row.bookingNumber ?? row.requestNo}`}
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
          <Input name="reason" required minLength={3} />
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
        <Input name="reason" required minLength={3} />
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
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Allotment / Registry
      </h3>

      {(atCompletion || delivered) && (
        <div className="mt-2 space-y-3 text-xs">
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
    </section>
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plotNumber}
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
 * them. main-PRD §18 splits these into two tasks and the Bookings screen still
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">
          One buyer owns 100%. Add a Customer to split it, and the shares must then total exactly
          100%. Delivered is recorded once, and only MD or Admin can reopen it.
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plotNumber}
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plotNumber} · {row.primaryCustomer}
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
          <Input name="note" required minLength={3} />
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plotNumber}
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
          <Input name="remark" required minLength={3} />
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
    { seq: 1, percent: "100", dueDate: istDay(new Date()) },
  ]);

  return (
    <Modal
      title={approve ? "Approve Change Plot" : "Reject Change Plot"}
      wide={approve}
      onClose={onClose}
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plotNumber}
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
          <Input name="note" required minLength={3} />
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
