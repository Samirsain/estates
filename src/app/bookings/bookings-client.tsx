"use client";

// Bookings — DESIGN.md §10, §11.
// Actions are hidden by permission for clarity; the server re-checks every one
// and the domain services re-check state on top of that (DESIGN §1).

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { formatIst, istDay, type StaffRole } from "@/lib/tasks";
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
  plot: string;
  primaryCustomer: string;
  soldByType: string;
  soldByName: string | null;
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
  label: string;
  lifecycle: string;
  holdId: string | null;
  holdPersonId: string | null;
  holdPersonName: string | null;
};

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

type PersonView = { id: string; fullName: string; mobileMasked: string };
type MemberView = { personId: string; label: string };

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
  raiseSoldBy: boolean;
  approveSoldBy: boolean;
  recordFinalBuyers: boolean;
  recordCompletion: boolean;
  reopenDelivered: boolean;
};

/** DESIGN §4.2 — the exact approved wording. */
const STATUS_LABEL: Record<string, string> = {
  REQUEST_PENDING: "Waiting for Booking Approval",
  REQUEST_REJECTED: "Request Rejected",
  REQUEST_CANCELLED: "Request Cancelled",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  REFUND_PENDING: "Refund Pending",
  CANCELLED: "Cancelled",
  DELIVERED: "Delivered",
};

const PROCESS_LABEL: Record<string, string> = {
  NONE: "",
  REFUND_PENDING: "Refund Pending",
  CHANGE_PLOT_PENDING: "Change Plot Under Process",
  BUYBACK_PENDING: "Buyback Under Process",
  PRIMARY_CUSTOMER_CHANGE_UNDER_REVIEW: "Primary Customer Change Under Review",
  SOLD_BY_CORRECTION_UNDER_REVIEW: "Sold By Correction Under Review",
  MANAGEMENT_ACTION_REQUIRED: "Management Action Required",
};

/** DESIGN §4.2 — eligibility and payment are two separate badges. */
const ELIGIBILITY_LABEL: Record<string, string> = {
  MILESTONE_PENDING: "Milestone Pending",
  READY: "Ready",
  ON_HOLD: "On Hold",
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

function statusVariant(status: string) {
  if (status === "BOOKED" || status === "PAYMENT_COMPLETED") return "success" as const;
  if (status === "REQUEST_PENDING") return "warning" as const;
  if (status.startsWith("REQUEST_") || status === "CANCELLED") return "outline" as const;
  return "info" as const;
}

type Dialog =
  | { kind: "NEW" }
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
  people: PersonView[];
  members: MemberView[];
  permissions: Permissions;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<BookingDetail | null>(null);

  const visible = rows.filter(
    (r) =>
      (statusFilter === "ALL" || r.status === statusFilter) &&
      (search.trim() === "" ||
        `${r.bookingNumber ?? ""} ${r.requestNo} ${r.project} ${r.plot} ${r.primaryCustomer}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

  async function openDetail(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setDetail(await loadBookingDetail(id));
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

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {visible.length} of {rows.length} · percentages only, no rupee value · times in Asia/Kolkata
            </p>
          </div>
          {permissions.submit && (
            <Button size="sm" variant="gradient" onClick={() => setDialog({ kind: "NEW" })}>
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
          <Input
            className="h-9 w-64"
            placeholder="Search Booking Number, Request ID, Plot or Customer"
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
              {notice.text}
            </p>
          </Card>
        )}

        <Card className="overflow-x-auto p-2">
          <table className="w-full min-w-[52rem] border-separate border-spacing-y-1 text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Project · Plot</th>
                <th className="px-3 py-2">Primary Customer</th>
                <th className="px-3 py-2">Sold By</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Payment Received</th>
                <th className="px-3 py-2">Actions</th>
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
                <React.Fragment key={row.id}>
                  <tr className="bg-secondary align-top">
                    <td className="rounded-l-xl px-3 py-3">
                      <button
                        type="button"
                        className="text-left font-semibold hover:underline"
                        onClick={() => openDetail(row.id)}
                        aria-expanded={openId === row.id}
                      >
                        {row.bookingNumber ?? row.requestNo}
                      </button>
                      <span className="block text-[11px] text-muted-foreground">
                        {row.bookingNumber ? `Request ${row.requestNo}` : "Temporary Request ID"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {row.project}
                      <span className="block text-[11px] text-muted-foreground">{row.plot}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">{row.primaryCustomer}</td>
                    <td className="px-3 py-3 text-xs">
                      {SOLD_BY_LABEL[row.soldByType] ?? row.soldByType}
                      {row.soldByName && (
                        <span className="block text-[11px] text-muted-foreground">{row.soldByName}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant(row.status)}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                      {row.activeProcess !== "NONE" && (
                        <span className="mt-1 block text-[11px] text-amber-800">
                          {PROCESS_LABEL[row.activeProcess]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-xs tabular-nums">
                      {row.paymentReceivedPercent}%
                    </td>
                    <td className="rounded-r-xl px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.status === "REQUEST_PENDING" && permissions.decide && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: "DECIDE", row, approve: true })}
                            >
                              Review
                            </Button>
                          </>
                        )}
                        {row.status === "REQUEST_PENDING" && permissions.submit && (
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "REVISE", row })}>
                            New version
                          </Button>
                        )}
                        {["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
                          permissions.confirmPayment && (
                            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "PAY", row })}>
                              Confirm Payment
                            </Button>
                          )}
                        {["REQUEST_PENDING", "BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
                          permissions.cancel && (
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "CANCEL", row })}>
                              Cancel Booking
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                  {openId === row.id && (
                    <tr>
                      <td colSpan={7} className="px-1 pb-3">
                        <BookingDetailPanel
                          row={row}
                          detail={detail}
                          people={people}
                          permissions={permissions}
                          onAction={setDialog}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {dialog?.kind === "NEW" && (
        <BookingFormDialog
          title="Start Booking Request"
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
          fixedPlotLabel={`${dialog.row.project} · ${dialog.row.plot}`}
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
          consequence={`Payment Received This Time is incremental, not cumulative. It lands on the oldest unpaid instalment first. Current progress is ${dialog.row.paymentReceivedPercent}%.`}
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
          <Field label="Payment Received This Time (%)">
            <Input name="percent" type="number" step="0.0001" min="0.0001" max="100" required />
          </Field>
          <Field label="Payment Date">
            <Input name="paidOn" type="date" defaultValue={istDay(new Date())} max={istDay(new Date())} required />
          </Field>
          <Field label="Payment Reference No.">
            <Input name="reference" required />
          </Field>
          <Field label="Remark — optional">
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
            <select name="toPersonId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select a Person
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} · {p.mobileMasked}
                </option>
              ))}
            </select>
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
              ? `${dialog.label}. Eligibility is not Ready, so this is Paid Early: remarks are compulsory, no MD or Admin approval is required, eligibility keeps updating separately, and no second payment task is raised at the normal milestone. It can never be marked Paid again.`
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
          <Field label={dialog.early ? "Remarks — compulsory" : "Remarks — optional"}>
            <Input name="remarks" required={dialog.early} minLength={dialog.early ? 3 : undefined} />
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
      <Card className="p-4 text-xs text-muted-foreground">Loading Booking details…</Card>
    );
  }

  const currentParties = detail.parties.filter((p) => p.effectiveTo === null);
  const liveSchedule = detail.scheduleVersions.find((s) => s.status === "ACTIVE");
  const pendingSchedule = detail.scheduleVersions.find((s) => s.status === "PENDING");
  const pendingCustomerChange = detail.customerChanges.find((c) => c.status === "PENDING");
  const pendingSoldBy = detail.soldByCorrections.find((c) => c.status === "PENDING");

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        {(["OVERVIEW", "PAYMENT", "COMMISSION", "HISTORY"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1 text-xs ${
              tab === t ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-accent"
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
              Waiting for Booking Approval — submitted values are locked. To change a reviewed field,
              cancel this request version and create a new version.
            </p>
          )}
          {pendingCustomerChange && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
              <p className="font-semibold">Primary Customer Change Under Review</p>
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
              <p className="font-semibold">Sold By Correction Under Review</p>
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
              Customers and ownership shares
            </h3>
            <ul className="mt-2 space-y-1 text-xs">
              {currentParties.map((p) => (
                <li key={`${p.personId}-${p.effectiveFrom}`} className="flex justify-between gap-3">
                  <span>
                    {p.name}
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {p.role === "PRIMARY" ? "Primary Customer" : "Additional Customer"}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {p.sharePercent ? `${p.sharePercent}%` : "100% (sole buyer)"}
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
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Frozen from PLC version {detail.plc.version} · {formatIst(detail.plc.frozenAt)}
                    {detail.plc.correctionReason ? " · corrected" : " · original freeze"}
                    {detail.plc.isCurrent ? "" : " · superseded"}
                  </span>
                </div>

                <ul className="space-y-0.5">
                  {detail.plc.components.map((c) => (
                    <li key={c.code} className="flex justify-between gap-3">
                      <span>
                        {c.label}
                        <span className="ml-2 text-[11px] text-muted-foreground">{c.code}</span>
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
                            {formatIst(h.frozenAt)} · version {h.version}
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
                  A later PLC version does not change this Booking. The snapshot it froze is what
                  applies.
                </p>
              </div>
            )}
          </section>

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

              {row.status !== "REFUND_PENDING" &&
                row.activeProcess !== "CHANGE_PLOT_PENDING" &&
                !(
                  ["BOOKED", "PAYMENT_COMPLETED"].includes(row.status) &&
                  row.activeProcess === "NONE" &&
                  permissions.raiseChangePlot
                ) && (
                  <p className="text-xs text-muted-foreground">
                    No exception workflow applies to this Booking right now.
                  </p>
                )}
            </div>
          </section>

          <CompletionSection
            row={row}
            detail={detail}
            permissions={permissions}
            onAction={onAction}
          />

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Review versions
            </h3>
            <ul className="mt-2 space-y-1 text-xs">
              {detail.reviewVersions.map((v) => (
                <li key={v.version} className="flex flex-wrap justify-between gap-2">
                  <span>
                    Version {v.version} · <Badge variant="outline">{v.status}</Badge>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {v.submittedByRef} · {formatIst(v.submittedAt)}
                    {v.decisionNote ? ` · ${v.decisionNote}` : ""}
                    {v.rejectReason ? ` · ${v.rejectReason.replaceAll("_", " ")}` : ""}
                  </span>
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
              <p className="font-semibold">
                Schedule revision version {pendingSchedule.version} waiting for the Accounts decision
              </p>
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
                    <th className="py-1">Type</th>
                    <th className="py-1">Beneficiary</th>
                    <th className="py-1 text-right">%</th>
                    <th className="py-1 text-right">Milestone</th>
                    <th className="py-1">Eligibility</th>
                    <th className="py-1">Payment</th>
                    <th className="py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.commissions.map((c) => (
                    <tr key={c.id} className={c.isCurrent ? "" : "text-muted-foreground"}>
                      <td className="py-1">
                        {c.type}
                        {!c.isCurrent && (
                          <span className="ml-2 rounded border border-border/60 px-1 text-[10px]">
                            Superseded
                          </span>
                        )}
                      </td>
                      <td className="py-1">{c.beneficiary}</td>
                      <td className="py-1 text-right tabular-nums">{c.percent}</td>
                      <td className="py-1 text-right tabular-nums">{c.milestonePercent}%</td>
                      <td className="py-1">
                        <Badge
                          variant={
                            c.eligibility === "READY"
                              ? "success"
                              : c.eligibility === "ON_HOLD"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {ELIGIBILITY_LABEL[c.eligibility] ?? c.eligibility}
                        </Badge>
                        {c.holdReason && (
                          <span className="mt-1 block text-[11px] text-amber-800">
                            {HOLD_LABEL[c.holdReason] ?? c.holdReason}
                          </span>
                        )}
                      </td>
                      <td className="py-1">
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
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            Paid Early — {c.paymentRemarks}
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
                      <td className="py-1">
                        {c.isCurrent && permissions.processCommission && c.payment === "NOT_PAID" && (
                          <Button
                            size="sm"
                            variant={c.eligibility === "READY" ? "outline" : "ghost"}
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
    </Card>
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plot} · {row.primaryCustomer}
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
function ReviewDialog({
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
  const pending = detail?.reviewVersions.find((v) => v.status === "PENDING");
  const isMaker = row.submittedByRef === selfRef;

  return (
    <Modal
      title={`Accounts Verification — Booking ${row.requestNo}`}
      description="The submitted snapshot is read-only. There is no Revise on this decision."
      onClose={onClose}
      wide
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.project} · {row.plot} · {row.primaryCustomer}
        </p>
        <p className="mt-1 text-muted-foreground">
          Submitted by {row.submittedByRef} on {formatIst(row.submittedAt)} · Booking Date{" "}
          {formatIst(row.bookingDate)} · Sold By {SOLD_BY_LABEL[row.soldByType] ?? row.soldByType}
        </p>
      </div>

      {isMaker && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-700">
          You submitted this request. A Booking Request must be decided by a different staff account
          (PRD §3.3), so this decision will be refused.
        </p>
      )}

      {pending ? (
        <pre className="max-h-64 overflow-auto rounded-xl border border-border/60 bg-secondary p-3 text-[11px] leading-relaxed">
          {JSON.stringify(pending.snapshot, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">Loading the submitted snapshot…</p>
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

type FormOut = {
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

function BookingFormDialog({
  title,
  bookable,
  people,
  members,
  busy,
  fixedPlotLabel,
  requireReason,
  onClose,
  onSubmit,
}: {
  title: string;
  bookable: BookableView[];
  people: PersonView[];
  members: MemberView[];
  busy: boolean;
  fixedPlotLabel?: string;
  requireReason?: boolean;
  onClose: () => void;
  onSubmit: (form: FormOut) => void;
}) {
  const today = istDay(new Date());
  const [plotId, setPlotId] = React.useState("");
  const [soldByType, setSoldByType] = React.useState<FormOut["soldByType"]>("THREE_PERCENT_CLUB");
  const [parties, setParties] = React.useState<PartyInput[]>([
    { personId: "", role: "PRIMARY", sharePercent: "" },
  ]);
  const [schedule, setSchedule] = React.useState<ScheduleRowInput[]>([
    { seq: 1, percent: "100", dueDate: today },
  ]);

  const plot = bookable.find((p) => p.id === plotId);
  const shareTotal = parties.reduce((sum, p) => sum + (Number(p.sharePercent) || 0), 0);
  const scheduleTotal = schedule.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);

  return (
    <Modal
      title={title}
      description="Submitted values are frozen for the Accounts review. Changing one later needs a new version."
      onClose={onClose}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            plotId,
            holdId: plot?.holdId ?? "",
            enquiryId: "",
            parties,
            soldByType,
            soldByPersonId: String(f.get("soldByPersonId") ?? ""),
            bookingDate: String(f.get("bookingDate")),
            bookingDateReason: String(f.get("bookingDateReason") ?? ""),
            customerType: String(f.get("customerType") ?? ""),
            remark: String(f.get("remark") ?? ""),
            schedule,
            reason: String(f.get("reason") ?? ""),
          });
        }}
      >
        {fixedPlotLabel ? (
          <p className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
            {fixedPlotLabel} — the Plot cannot change on a new version. Cross-Plot movement uses
            Change Plot after approval.
          </p>
        ) : (
          <Field label="Plot — Available, or a live Hold for this buyer">
            <select
              className={inputClass}
              required
              value={plotId}
              onChange={(e) => setPlotId(e.target.value)}
            >
              <option value="" disabled>
                Select a Plot
              </option>
              {bookable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.holdPersonName ? ` — on Hold for ${p.holdPersonName}` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}

        {plot?.holdPersonName && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-800">
            This Plot is on Hold for {plot.holdPersonName}. The Primary Customer must be that Person,
            and the remaining Hold time freezes on submission.
          </p>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Customers and ownership shares
            </h3>
            <span className={`text-[11px] ${parties.length > 1 && shareTotal !== 100 ? "text-red-700" : "text-muted-foreground"}`}>
              {parties.length === 1 ? "Sole buyer — leave the share blank for 100%" : `Total ${shareTotal}%`}
            </span>
          </div>
          {parties.map((party, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <select
                className={`${inputClass} flex-1`}
                required
                value={party.personId}
                onChange={(e) =>
                  setParties(parties.map((p, i) => (i === index ? { ...p, personId: e.target.value } : p)))
                }
              >
                <option value="" disabled>
                  Select a Person
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} · {p.mobileMasked}
                  </option>
                ))}
              </select>
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
                placeholder="Share %"
                type="number"
                step="0.0001"
                min="0"
                max="100"
                value={party.sharePercent}
                onChange={(e) =>
                  setParties(
                    parties.map((p, i) => (i === index ? { ...p, sharePercent: e.target.value } : p))
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
        </section>

        <div className="grid gap-3 md:grid-cols-2">
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
          {soldByType !== "THREE_PERCENT_CLUB" && (
            <Field label={soldByType === "MEMBER" ? "Selling Member" : "Closing Customer"}>
              <select name="soldByPersonId" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Select
                </option>
                {(soldByType === "MEMBER"
                  ? members.map((m) => ({ id: m.personId, label: m.label }))
                  : people.map((p) => ({ id: p.id, label: `${p.fullName} · ${p.mobileMasked}` }))
                ).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Booking Date">
            <Input name="bookingDate" type="date" defaultValue={today} max={today} required />
          </Field>
          <Field label="Reason — compulsory only if backdated">
            <Input name="bookingDateReason" />
          </Field>
          <Field label="Customer Type">
            <select name="customerType" className={inputClass} defaultValue="">
              <option value="">Not recorded</option>
              <option value="END_USER">End User</option>
              <option value="INVESTOR">Investor</option>
            </select>
          </Field>
          <Field label="Remark — optional">
            <Input name="remark" />
          </Field>
        </div>

        <ScheduleEditor schedule={schedule} setSchedule={setSchedule} total={scheduleTotal} minDate={today} />

        {requireReason && (
          <Field label="Reason for replacing the pending version — compulsory">
            <Input name="reason" required minLength={3} />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
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
  total,
  minDate,
}: {
  schedule: ScheduleRowInput[];
  setSchedule: (rows: ScheduleRowInput[]) => void;
  total: number;
  minDate: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payment schedule — percentage only
        </h3>
        <span className={`text-[11px] tabular-nums ${total === 100 ? "text-emerald-700" : "text-red-700"}`}>
          Total {total}% — must be exactly 100%
        </span>
      </div>
      {schedule.map((line, index) => (
        <div key={index} className="flex flex-wrap gap-2">
          <span className="flex h-10 w-8 items-center justify-center text-xs text-muted-foreground">
            {line.seq}
          </span>
          <Input
            className="w-32"
            type="number"
            step="0.0001"
            min="0.0001"
            max="100"
            required
            value={line.percent}
            onChange={(e) =>
              setSchedule(schedule.map((r, i) => (i === index ? { ...r, percent: e.target.value } : r)))
            }
          />
          <Input
            className="w-48"
            type="date"
            min={minDate}
            required
            value={line.dueDate}
            onChange={(e) =>
              setSchedule(schedule.map((r, i) => (i === index ? { ...r, dueDate: e.target.value } : r)))
            }
          />
          {schedule.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setSchedule(
                  schedule.filter((_, i) => i !== index).map((r, i) => ({ ...r, seq: i + 1 }))
                )
              }
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
        onClick={() =>
          setSchedule([...schedule, { seq: schedule.length + 1, percent: "", dueDate: minDate }])
        }
      >
        Add instalment
      </Button>
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
  const total = schedule.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
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
        <ScheduleEditor schedule={schedule} setSchedule={setSchedule} total={total} minDate={today} />
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
  const total = parties.reduce((sum, p) => sum + (Number(p.sharePercent) || 0), 0);

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
            <select
              className={`${inputClass} flex-1`}
              required
              value={party.personId}
              onChange={(e) =>
                setParties(parties.map((p, i) => (i === index ? { ...p, personId: e.target.value } : p)))
              }
            >
              <option value="" disabled>
                Select a Person
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} · {p.mobileMasked}
                </option>
              ))}
            </select>
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
              max="100"
              placeholder="Share %"
              value={party.sharePercent}
              onChange={(e) =>
                setParties(parties.map((p, i) => (i === index ? { ...p, sharePercent: e.target.value } : p)))
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
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Processing…" : "Confirm change"}
          </Button>
        </div>
      </form>
    </Modal>
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
        <Field label={type === "MEMBER" ? "Selling Member" : "Closing Customer"}>
          <select name="toSoldByPersonId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Select
            </option>
            {(type === "MEMBER"
              ? members.map((m) => ({ id: m.personId, label: m.label }))
              : people.map((p) => ({ id: p.id, label: `${p.fullName} · ${p.mobileMasked}` }))
            ).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
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

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Allotment / Registry
      </h3>

      {!atCompletion && !delivered && (
        <p className="mt-2 text-xs text-muted-foreground">
          Available once Payment Received reaches 100% and the Booking is Payment Completed.
        </p>
      )}

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
                      {buyer.sharePercent ? `${buyer.sharePercent}%` : "100% (sole buyer)"}
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

type FinalBuyerRow = {
  personId: string;
  sharePercent: string;
  dateOfBirth: string;
  address: string;
};

function FinalBuyersDialog({
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

  const [rows, setRows] = React.useState<FinalBuyerRow[]>(
    commercial.length > 0
      ? commercial.map((p) => ({
          personId: p.personId,
          sharePercent: p.sharePercent ?? "",
          dateOfBirth: "",
          address: "",
        }))
      : [{ personId: "", sharePercent: "", dateOfBirth: "", address: "" }]
  );

  const update = (index: number, patch: Partial<FinalBuyerRow>) =>
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <Modal title="Final buyer details" wide onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plot}
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
              <Field label={index === 0 ? "Primary Customer" : "Additional Customer"}>
                <select
                  className={inputClass}
                  value={buyer.personId}
                  onChange={(e) => update(index, { personId: e.target.value })}
                  required
                >
                  <option value="">Select a Person</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName} · {person.mobileMasked}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ownership share % (blank = sole buyer)">
                <Input
                  value={buyer.sharePercent}
                  onChange={(e) => update(index, { sharePercent: e.target.value })}
                  inputMode="decimal"
                />
              </Field>
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
                  { personId: "", sharePercent: "", dateOfBirth: "", address: "" },
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

function CompletionDialog({
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
      description="One route only. There is no Allotment-then-Registry sequence (PRD §4.1)."
      onClose={onClose}
    >
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plot}
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plot} · {row.primaryCustomer}
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
    Array<{ id: string; label: string; lifecycle: string; heldBySameCustomer: boolean }>
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plot}
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
          {row.bookingNumber ?? row.requestNo} · {row.project} {row.plot}
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
              <p className="text-xs font-medium text-muted-foreground">
                Revised payment schedule — must total exactly 100%
              </p>
              <ScheduleEditor
                schedule={schedule}
                setSchedule={setSchedule}
                total={schedule.reduce((sum, r) => sum + Number(r.percent || 0), 0)}
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
