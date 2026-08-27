"use server";

// Booking and Payment server actions — DESIGN.md §10, §11.
// Every action re-checks permission on the server. Hiding a button is never the
// control (DESIGN §1), and the domain services re-check state on top of this.

import { revalidatePath } from "next/cache";
import type { SoldByType } from "@prisma/client";
import { requireStaff } from "@/lib/security/current-actor";
import { instalmentStatus, type BookingRejectReason } from "@/lib/domain/booking";
import { CommandError } from "@/lib/services/command";
import {
  cancelBooking,
  changeOwnershipShares,
  decideBookingRequest,
  decidePrimaryCustomerChange,
  getBooking,
  decideSoldByCorrection,
  requestPrimaryCustomerChange,
  requestSoldByCorrection,
  reviseBookingRequest,
  submitBookingRequest,
  type BookingPartyInput,
} from "@/lib/services/booking-service";
import { db } from "@/lib/db";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { plcSnapshotHistory } from "@/lib/services/project-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { listCommissionForBooking, markCommissionPaid } from "@/lib/services/commission-service";
import {
  recordCompletion,
  recordFinalBuyers,
  reopenDelivered,
} from "@/lib/services/completion-service";
import {
  confirmPaymentReceived,
  correctPaymentReceived,
  decideScheduleRevision,
  reviseSchedule,
} from "@/lib/services/payment-service";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

function refresh() {
  revalidatePath("/bookings");
  revalidatePath("/plots");
  revalidatePath("/dashboard");
}

export type PartyInput = { personId: string; role: "PRIMARY" | "ADDITIONAL"; sharePercent: string };
export type ScheduleRowInput = { seq: number; percent: string; dueDate: string };

/** A blank share means "sole buyer, treated as 100%" (PRD §12.1). */
function toParties(rows: PartyInput[]): BookingPartyInput[] {
  return rows.map((r) => ({
    personId: r.personId,
    role: r.role,
    sharePercent: r.sharePercent.trim() === "" ? null : r.sharePercent.trim(),
  }));
}

function toSchedule(rows: ScheduleRowInput[]) {
  return rows.map((r) => ({ seq: r.seq, percent: r.percent.trim(), dueDate: new Date(r.dueDate) }));
}

export async function submitBookingRequestAction(
  input: {
    plotId: string;
    holdId: string;
    enquiryId: string;
    parties: PartyInput[];
    soldByType: SoldByType;
    soldByPersonId: string;
    bookingDate: string;
    bookingDateReason: string;
    customerType: string;
    remark: string;
    schedule: ScheduleRowInput[];
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BOOKING_REQUEST_SUBMIT");
  try {
    const result = await submitBookingRequest({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      plotId: input.plotId,
      holdId: input.holdId || null,
      enquiryId: input.enquiryId || null,
      parties: toParties(input.parties),
      soldByType: input.soldByType,
      soldByPersonId: input.soldByPersonId || null,
      bookingDate: new Date(input.bookingDate),
      bookingDateReason: input.bookingDateReason || null,
      customerType: input.customerType || null,
      remark: input.remark || null,
      schedule: toSchedule(input.schedule),
    });
    refresh();
    return {
      ok: true,
      message:
        `Booking Request ${result.requestNo} submitted. The reviewed values are locked and Accounts ` +
        `has a verification task.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function reviseBookingRequestAction(
  input: {
    bookingId: string;
    parties: PartyInput[];
    soldByType: SoldByType;
    soldByPersonId: string;
    bookingDate: string;
    bookingDateReason: string;
    customerType: string;
    remark: string;
    schedule: ScheduleRowInput[];
    reason: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BOOKING_REQUEST_SUBMIT");
  try {
    const result = await reviseBookingRequest({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      parties: toParties(input.parties),
      soldByType: input.soldByType,
      soldByPersonId: input.soldByPersonId || null,
      bookingDate: new Date(input.bookingDate),
      bookingDateReason: input.bookingDateReason || null,
      customerType: input.customerType || null,
      remark: input.remark || null,
      schedule: toSchedule(input.schedule),
      reason: input.reason,
    });
    refresh();
    return {
      ok: true,
      message: `Review version ${result.reviewVersion} created. The previous version stays in History.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideBookingRequestAction(
  input: {
    bookingId: string;
    approve: boolean;
    rejectReason: BookingRejectReason | "";
    requestClaimedPayment: boolean;
    note: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BOOKING_DECIDE");
  try {
    const result = await decideBookingRequest({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      approve: input.approve,
      rejectReason: input.rejectReason || undefined,
      requestClaimedPayment: input.requestClaimedPayment,
      note: input.note,
    });
    refresh();
    return {
      ok: true,
      message: result.bookingNumber
        ? `Approved. Booking Number ${result.bookingNumber} issued and the Plot is Booked.`
        : "Rejected. The Plot and Hold are restored to their exact previous state.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelBookingAction(
  bookingId: string,
  reason: string,
  remark: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BOOKING_CANCEL_REQUEST");
  try {
    const result = await cancelBooking({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      reason,
      remark: remark || null,
    });
    refresh();
    return {
      ok: true,
      message: result.refundPending
        ? "Formal cancellation started. The Booking is Refund Pending and Accounts has a verification task."
        : "Booking Request cancelled. No Refund Pending, and the linked Enquiry stays Active.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function confirmPaymentReceivedAction(
  input: { bookingId: string; percent: string; paidOn: string; reference: string; remark: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PAYMENT_RECEIVED_CONFIRM");
  try {
    const result = await confirmPaymentReceived({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      remark: input.remark || undefined,
    });
    refresh();
    return {
      ok: true,
      message: result.paymentCompleted
        ? "Payment confirmed. Payment Received is 100% and the Booking is Payment Completed."
        : `Payment confirmed. Payment Received is now ${result.progressPercent}%.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function correctPaymentReceivedAction(
  input: {
    entryId: string;
    percent: string;
    paidOn: string;
    reference: string;
    reason: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PAYMENT_CORRECT");
  try {
    const result = await correctPaymentReceived({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      entryId: input.entryId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      reason: input.reason,
    });
    refresh();
    return {
      ok: true,
      message:
        `Correction recorded. The original entry and its reference stay as Superseded, and ` +
        `Payment Received is now ${result.progressPercent}%.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function reviseScheduleAction(
  input: { bookingId: string; schedule: ScheduleRowInput[]; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("SCHEDULE_REVISE");
  try {
    await reviseSchedule({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      lines: toSchedule(input.schedule),
      reason: input.reason,
    });
    refresh();
    return { ok: true, message: "Revision submitted. Accounts has a verification task." };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideScheduleRevisionAction(
  bookingId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("SCHEDULE_DECIDE");
  try {
    await decideScheduleRevision({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      approve,
      note,
    });
    refresh();
    return {
      ok: true,
      message: approve
        ? "Revision approved. Received portions carried forward and the old schedule stays in History."
        : "Revision rejected. The live schedule is unchanged.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function changeOwnershipSharesAction(
  input: { bookingId: string; parties: PartyInput[]; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("OWNERSHIP_SHARE_CHANGE");
  try {
    await changeOwnershipShares({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      parties: toParties(input.parties),
      reason: input.reason,
    });
    refresh();
    return { ok: true, message: "Ownership shares updated. Old and new both stay in History." };
  } catch (error) {
    return toResult(error);
  }
}

export async function requestPrimaryCustomerChangeAction(
  input: { bookingId: string; toPersonId: string; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PRIMARY_CUSTOMER_CHANGE_RAISE");
  try {
    await requestPrimaryCustomerChange({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      toPersonId: input.toPersonId,
      reason: input.reason,
    });
    refresh();
    return {
      ok: true,
      message: "Change submitted. The old Customer stays official until Accounts approves.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function decidePrimaryCustomerChangeAction(
  bookingId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PRIMARY_CUSTOMER_CHANGE_APPROVE");
  try {
    await decidePrimaryCustomerChange({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      approve,
      note,
    });
    refresh();
    return {
      ok: true,
      message: approve
        ? "Approved. The new Customer is official; Booking Number, Plot and payment carry forward unchanged."
        : "Rejected. The old Customer remains official and nothing else changed.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §6.11 — Accounts records Paid, or Paid Early with compulsory remarks. No
 * additional MD/Admin approval is required.
 */
export async function markCommissionPaidAction(
  input: { recordId: string; early: boolean; paidOn: string; reference: string; remarks: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    const result = await markCommissionPaid({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      recordId: input.recordId,
      early: input.early,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      remarks: input.remarks,
    });
    refresh();
    return {
      ok: true,
      message:
        result.payment === "PAID_EARLY"
          ? "Recorded as Paid Early. Eligibility keeps updating separately and no second payment task is raised."
          : "Commission recorded as Paid.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §6.10 — CRM or Admin raises the correction with a compulsory reason and
 * supporting remark. Nothing moves until Admin or MD approves it.
 */
export async function requestSoldByCorrectionAction(
  input: {
    bookingId: string;
    toSoldByType: SoldByType;
    toSoldByPersonId: string;
    reason: string;
    supportingNote: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("SOLD_BY_CORRECTION_RAISE");
  try {
    await requestSoldByCorrection({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      toSoldByType: input.toSoldByType,
      toSoldByPersonId: input.toSoldByPersonId || null,
      reason: input.reason,
      supportingNote: input.supportingNote,
    });
    refresh();
    return {
      ok: true,
      message:
        "Sold By Correction raised. The attribution is unchanged until Admin or MD approves it.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideSoldByCorrectionAction(
  bookingId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("SOLD_BY_CORRECTION_APPROVE");
  try {
    await decideSoldByCorrection({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      approve,
      note,
    });
    refresh();
    return {
      ok: true,
      message: approve
        ? "Approved. Old commission records are superseded, new ones created, and Accounts has the impact review. Booking and Payment history are unchanged."
        : "Rejected. The attribution and every commission record stay as they are.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Full Booking record for the detail panel (DESIGN §10.4). */
/* ------------------------------------------- Allotment / Registry (PRD §4) */

export type FinalBuyerRowInput = {
  personId: string;
  /** Blank means "sole final buyer, treated as 100%" (PRD §12.1). */
  sharePercent: string;
  dateOfBirth: string;
  address: string;
};

export async function recordFinalBuyersAction(
  bookingId: string,
  rows: FinalBuyerRowInput[],
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("FINAL_BUYER_RECORD");
  try {
    const result = await recordFinalBuyers({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      buyers: rows.map((row) => ({
        personId: row.personId,
        sharePercent: row.sharePercent.trim() === "" ? null : row.sharePercent.trim(),
        dateOfBirth: new Date(row.dateOfBirth),
        address: row.address,
      })),
    });
    refresh();
    return {
      ok: true,
      message: result.complete
        ? "Final buyer details are complete. Allotment or Registry may now be recorded."
        : "Final buyer details saved. Some details are still outstanding.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export type CompletionRouteInput =
  | {
      route: "ALLOTMENT";
      allotmentDate: string;
      allotmentNumber: string;
      allotmentGivenTo: string;
      pattaIssued: "YES" | "DONT_KNOW";
      pattaDate: string;
    }
  | { route: "REGISTRY"; advocateName: string; registryDate: string };

/** One route only — Delivered follows from it, with no Confirm Delivery step. */
export async function recordCompletionAction(
  bookingId: string,
  input: CompletionRouteInput,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMPLETION_RECORD");
  try {
    await recordCompletion({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      completion:
        input.route === "ALLOTMENT"
          ? {
              route: "ALLOTMENT",
              allotmentGiven: true,
              allotmentDate: new Date(input.allotmentDate),
              allotmentNumber: input.allotmentNumber,
              allotmentGivenTo: input.allotmentGivenTo,
              pattaStatus: input.pattaIssued,
              pattaDate: input.pattaIssued === "YES" ? new Date(input.pattaDate) : null,
            }
          : {
              route: "REGISTRY",
              advocateName: input.advocateName,
              registryDate: new Date(input.registryDate),
            },
    });
    refresh();
    return {
      ok: true,
      message:
        input.route === "ALLOTMENT"
          ? "Allotment recorded. The Booking and Plot are Delivered and papers are legally transferred."
          : "Registry recorded. The Booking and Plot are Delivered and papers are legally transferred.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/** PRD §4.4 — MD/Admin only, with a compulsory reason and full history kept. */
export async function reopenDeliveredAction(
  bookingId: string,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("DELIVERY_REOPEN");
  try {
    await reopenDelivered({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      reason,
    });
    refresh();
    return {
      ok: true,
      message: "Delivered reopened. The Booking is back to Payment Completed and the completion work is queued.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function loadBookingDetail(bookingId: string) {
  await requireStaff();
  const booking = await getBooking(bookingId);
  if (!booking) return null;
  const commissions = await listCommissionForBooking(bookingId);

  // PLC spec §15.3 — the panel shows the frozen snapshot. The correction chain
  // is only fetched when this snapshot actually replaced an earlier one.
  const plcHistory = booking.plcSnapshot?.supersedes
    ? await plcSnapshotHistory(booking.plcSnapshot.id)
    : [];

  return {
    id: booking.id,
    /**
     * PLC spec §15.3 — frozen total, breakdown, version, snapshot date and
     * whether this is the original freeze or a correction. Percentage only:
     * no rupee value is derived from it anywhere.
     */
    plc: booking.plcSnapshot
      ? {
          totalPercent: booking.plcSnapshot.totalPercent.toFixed(3),
          components: booking.plcSnapshot.components as Array<{
            code: string;
            label: string;
            percent: string;
          }>,
          version: booking.plcSnapshot.ruleVersion.version,
          frozenAt: booking.plcSnapshot.frozenAt.toISOString(),
          isCurrent: booking.plcSnapshot.isCurrent,
          correctionReason: booking.plcSnapshot.correctionReason,
          correctedBy: booking.plcSnapshot.correctedBy,
          history: plcHistory.map((snapshot) => ({
            totalPercent: snapshot.totalPercent.toFixed(3),
            version: snapshot.ruleVersion.version,
            frozenAt: snapshot.frozenAt.toISOString(),
            isCurrent: snapshot.isCurrent,
            correctionReason: snapshot.correctionReason,
            correctedBy: snapshot.correctedBy,
          })),
        }
      : null,
    parties: booking.parties.map((p) => ({
      personId: p.personId,
      name: p.person.fullName,
      role: p.role,
      kind: p.kind,
      sharePercent: p.sharePercent?.toFixed(2) ?? null,
      effectiveFrom: p.effectiveFrom.toISOString(),
      effectiveTo: p.effectiveTo?.toISOString() ?? null,
      changeReason: p.changeReason,
    })),
    reviewVersions: booking.reviewVersions.map((v) => ({
      version: v.version,
      status: v.status,
      submittedByRef: v.submittedByRef,
      submittedAt: v.submittedAt.toISOString(),
      decidedByRef: v.decidedByRef,
      decidedAt: v.decidedAt?.toISOString() ?? null,
      rejectReason: v.rejectReason,
      decisionNote: v.decisionNote,
      snapshot: v.snapshot,
    })),
    scheduleVersions: booking.scheduleVersions.map((s) => ({
      version: s.version,
      status: s.status,
      reason: s.reason,
      createdByRef: s.createdByRef,
      decisionNote: s.decisionNote,
      instalments: s.instalments.map((i) => ({
        seq: i.seq,
        scheduled: i.scheduledPercent.toFixed(2),
        received: i.receivedPercent.toFixed(2),
        remaining: i.scheduledPercent.sub(i.receivedPercent).toFixed(2),
        dueDate: i.dueDate.toISOString(),
        // Derived here so Upcoming / Received / Overdue comes from the one rule
        // rather than being re-implemented in the browser (PRD §10.1).
        status: instalmentStatus({
          seq: i.seq,
          scheduledPercent: i.scheduledPercent,
          receivedPercent: i.receivedPercent,
          dueDate: i.dueDate,
        }),
      })),
    })),
    paymentEntries: booking.paymentEntries.map((e) => ({
      id: e.id,
      percent: e.percent.toFixed(2),
      paidOn: e.paidOn.toISOString(),
      recordedAt: e.recordedAt.toISOString(),
      status: e.status,
      reference: e.externalReference.rawValue,
      referenceStatus: e.externalReference.status,
      confirmedByRef: e.confirmedByRef,
      reason: e.reason,
      remark: e.remark,
      correctsEntryId: e.correctsEntryId,
    })),
    // DESIGN §14.1 — eligibility and payment are shown as two separate fields.
    commissions: commissions.map((c) => ({
      id: c.id,
      type: c.type,
      beneficiary: c.beneficiaryPerson.fullName,
      beneficiaryRole: c.beneficiaryRole,
      percent: c.percent.toFixed(2),
      milestonePercent: c.milestonePercent.toFixed(0),
      eligibility: c.eligibility,
      holdReason: c.holdReason,
      payment: c.payment,
      paidOn: c.paidOn?.toISOString() ?? null,
      paymentRemarks: c.paymentRemarks,
      reference: c.externalReference?.rawValue ?? null,
      ruleVersion: c.ruleVersion,
      isCurrent: c.isCurrent,
      closedReason: c.closedReason,
    })),
    soldByCorrections: booking.soldByCorrections.map((c) => ({
      status: c.status,
      fromSoldByType: c.fromSoldByType,
      toSoldByType: c.toSoldByType,
      reason: c.reason,
      supportingNote: c.supportingNote,
      requestedByRef: c.requestedByRef,
      requestedAt: c.requestedAt.toISOString(),
      decisionNote: c.decisionNote,
    })),
    customerChanges: booking.customerChanges.map((c) => ({
      status: c.status,
      reason: c.reason,
      requestedByRef: c.requestedByRef,
      requestedAt: c.requestedAt.toISOString(),
      decisionNote: c.decisionNote,
    })),
    // PRD §4 — one live completion at most; reopened rows stay as history.
    completions: booking.completions.map((c) => ({
      id: c.id,
      route: c.route,
      allotmentDate: c.allotmentDate?.toISOString() ?? null,
      allotmentNumber: c.allotmentNumber,
      allotmentGivenTo: c.allotmentGivenTo,
      pattaStatus: c.pattaStatus,
      pattaDate: c.pattaDate?.toISOString() ?? null,
      advocateName: c.advocateName,
      registryDate: c.registryDate?.toISOString() ?? null,
      papersLegallyTransferred: c.papersLegallyTransferred,
      deliveredAt: c.deliveredAt.toISOString(),
      completedByRef: c.completedByRef,
      reopenedAt: c.reopenedAt?.toISOString() ?? null,
      reopenedByRef: c.reopenedByRef,
      reopenReason: c.reopenReason,
    })),
    events: booking.events.map((e) => ({
      at: e.at.toISOString(),
      actorRef: e.actorRef,
      action: e.action,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      reason: e.reason,
      detail: e.detail,
    })),
  };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof loadBookingDetail>>>;

/* -------------------------------- Cancellation decision (PRD §15.4) */

/**
 * The Accounts decision on a formal cancellation. Approval cancels the Booking
 * and returns the Plot; rejection restores the exact previous state.
 */
export async function decideCancellationAction(
  input: {
    bookingId: string;
    approve: boolean;
    note: string;
    noPaymentReceived?: boolean;
    reference?: string;
    actionDate?: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("CANCELLATION_DECIDE");
  try {
    const result = await decideCancellation({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      approve: input.approve,
      note: input.note,
      noPaymentReceived: input.noPaymentReceived,
      reference: input.reference || null,
      actionDate: input.actionDate ? new Date(input.actionDate) : null,
    });
    refresh();
    return {
      ok: true,
      message:
        result.status === "CANCELLED"
          ? "Cancellation approved. The Booking is Cancelled and the Plot has returned through the restriction-aware rule."
          : "Cancellation rejected. The exact previous Booking, Plot, payment and commission state is restored.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/* ------------------------------------------- Change Plot (PRD §5.3) */

/** Same Project only. Cross-Project movement needs Cancel Booking and a new Request. */
export async function submitChangePlotAction(
  bookingId: string,
  toPlotId: string,
  remark: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("CHANGE_PLOT_RAISE");
  try {
    await submitChangePlot({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId,
      toPlotId,
      remark,
    });
    refresh();
    return {
      ok: true,
      message:
        "Change Plot raised. The replacement Plot is reserved with its own PLC snapshot and Accounts must record the applicable percentage.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideChangePlotAction(
  input: {
    bookingId: string;
    approve: boolean;
    note: string;
    appliedPercent?: string;
    schedule?: ScheduleRowInput[];
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("CHANGE_PLOT_DECIDE");
  try {
    const result = await decideChangePlot({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bookingId: input.bookingId,
      approve: input.approve,
      note: input.note,
      appliedPercent: input.appliedPercent,
      schedule: input.schedule ? toSchedule(input.schedule) : undefined,
    });
    refresh();
    return {
      ok: true,
      message:
        result.status === "APPROVED"
          ? "Change Plot approved. The same Booking Number continues on the replacement Plot and the old Plot has returned to inventory."
          : "Change Plot rejected. The original Plot and the replacement are restored exactly.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Same-Project replacements a Change Plot may move to (PRD §5.3). */
export async function loadChangePlotOptions(bookingId: string) {
  await requireStaff("CHANGE_PLOT_RAISE");
  const booking = await getBooking(bookingId);
  if (!booking) return [];

  const plots = await db.plot.findMany({
    where: {
      projectId: booking.projectId,
      id: { not: booking.plotId },
      OR: [
        { status: "AVAILABLE" },
        // A Hold held by the same Customer may be moved onto (PRD §5.3).
        { holds: { some: { status: "ACTIVE", personId: booking.primaryPersonId } } },
      ],
    },
    include: { holds: { where: { status: "ACTIVE" }, include: { person: true } } },
    orderBy: { plotNumber: "asc" },
    take: 200,
  });

  return plots.map((plot) => ({
    id: plot.id,
    label: `${plot.plotType.replaceAll("_", " ")} ${plot.plotNumber}`,
    status: plot.status,
    heldBySameCustomer: plot.holds.some((hold) => hold.personId === booking.primaryPersonId),
  }));
}
