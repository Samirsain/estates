"use server";

// Booking and Payment server actions — design.md §10, §11.
// Every action re-checks permission on the server. Hiding a button is never the
// control (DESIGN §1), and the domain services re-check state on top of this.

import { actionErrorText } from "@/lib/action-error";
import {
  adjustmentsWaiting,
  approveBeforeOldRecovery,
  clearRecovery,
  closeAdjustmentWithoutRecovery,
  openRecovery,
  setOffRecovery,
} from "@/lib/services/recovery-service";
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
import {
  decidePaymentApproval,
  pendingPaymentApprovals,
  requestPaymentApproval,
  type PaymentStep,
} from "@/lib/services/payment-approval-service";
import { plcSnapshotHistory } from "@/lib/services/project-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import {
  approveCommissionPaidEarly,
  rejectCommissionPaidEarly,
  requestCommissionPaidEarly,
  listCommissionForBooking,
  markCommissionPaid,
} from "@/lib/services/commission-service";
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
  return { ok: false, error: actionErrorText(error, "Action failed.") };
}

function refresh() {
  revalidatePath("/bookings");
  revalidatePath("/plots");
  revalidatePath("/dashboard");
}

/**
 * Owner, 10 Nov 2026 — a payment step by anyone but MD waits for MD's approval
 * instead of running. Null for MD: the caller runs the step at once. Not
 * exported: a "use server" export is callable from the browser.
 */
async function holdForMd(
  actor: { staffAccountId: string; role: string },
  key: string,
  step: PaymentStep
): Promise<ActionResult | null> {
  if (actor.role === "MD") return null;
  const message = await requestPaymentApproval({ idempotencyKey: key, actorRef: actor.staffAccountId, actorRole: actor.role, step });
  refresh();
  revalidatePath("/members");
  revalidatePath("/customers");
  return { ok: true, message };
}

/** MD's decision on a payment step that waits for approval (Booking and Buyback pages). */
export async function decidePaymentApprovalAction(
  input: { approvalId: string; approve: boolean; note: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const message = await decidePaymentApproval({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...input,
    });
    refresh();
    revalidatePath("/acquisitions");
    revalidatePath("/members");
    revalidatePath("/customers");
    return { ok: true, message };
  } catch (error) {
    return toResult(error);
  }
}

export type PartyInput = {
  /** Empty when the buyer is being typed in for the first time. */
  personId: string;
  role: "PRIMARY" | "ADDITIONAL";
  sharePercent: string;
  fullName?: string;
  mobile?: string;
  city?: string;
};
export type ScheduleRowInput = { seq: number; percent: string; dueDate: string };

/**
 * A blank share means "sole buyer, treated as 100%".
 *
 * A buyer with no personId was typed into the form — a first-time Customer.
 * The name/mobile/city ride along unresolved; the service finds-or-creates the
 * Person itself, inside the same transaction and idempotency guard that
 * creates the Booking. Resolving it here instead, against the bare `db`
 * client, was the bug: a retried submission could miss the find and create the
 * buyer twice before the Booking's own guard ever saw the request.
 */
function toParties(rows: PartyInput[]): BookingPartyInput[] {
  return rows.map((r) => ({
    personId: r.personId,
    role: r.role,
    sharePercent: r.sharePercent.trim() === "" ? null : r.sharePercent.trim(),
    fullName: r.fullName,
    mobile: r.mobile,
    city: r.city,
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
    remark: string;
    schedule: ScheduleRowInput[];
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BOOKING_REQUEST_SUBMIT");
  try {
    await submitBookingRequest({
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
      remark: input.remark || null,
      schedule: toSchedule(input.schedule),
    });
    refresh();
    return {
      ok: true,
      message:
        `Booking Request submitted. The reviewed values are locked and Accounts ` +
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
      remark: input.remark || null,
      schedule: toSchedule(input.schedule),
      reason: input.reason,
    });
    refresh();
    return {
      ok: true,
      message: "The corrected request is with Accounts. The earlier one stays in History.",
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
  input: {
    bookingId: string;
    percent: string;
    paidOn: string;
    reference: string;
    remark: string;
    payerName?: string;
    payerReference?: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PAYMENT_RECEIVED_CONFIRM");
  try {
    const args = {
      bookingId: input.bookingId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      remark: input.remark || undefined,
      payerName: input.payerName,
      payerReference: input.payerReference,
    };
    const held = await holdForMd(actor, key, { kind: "PAYMENT_RECEIVED", args });
    if (held) return held;
    const result = await confirmPaymentReceived({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
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
    const args = {
      entryId: input.entryId,
      percent: input.percent,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      reason: input.reason,
    };
    const held = await holdForMd(actor, key, { kind: "PAYMENT_CORRECT", args });
    if (held) return held;
    const result = await correctPaymentReceived({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
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

/* ------------------------------------------- Recovery (SSOT §91; CP §54, §64) */

export async function openRecoveryAction(
  input: { recordId: string; noticeOn: string; reference: string; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    const result = await openRecovery({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      recordId: input.recordId,
      noticeOn: new Date(input.noticeOn),
      reference: input.reference,
      reason: input.reason,
    });
    refresh();
    return {
      ok: true,
      message: `Recovery ${result.recoveryNo} opened. New cash payouts to this Person are held until it is repaid or set off.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/** CP §64 T23 — MD pays the corrected beneficiary before the old Recovery. */
export async function approveBeforeOldRecoveryAction(input: { recordId: string; note: string }, key: string): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    await approveBeforeOldRecovery({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      recordId: input.recordId,
      note: input.note,
    });
    refresh();
    return { ok: true, message: "Approved. The corrected beneficiary may be paid before the old Recovery." };
  } catch (error) {
    return toResult(error);
  }
}

export async function closeAdjustmentAction(input: { recordId: string; reason: string }, key: string): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    await closeAdjustmentWithoutRecovery({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      recordId: input.recordId,
      reason: input.reason,
    });
    refresh();
    return { ok: true, message: "Adjustment closed without a Recovery." };
  } catch (error) {
    return toResult(error);
  }
}

export async function clearRecoveryAction(input: { recoveryId: string; note: string }, key: string): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    const args = { recoveryId: input.recoveryId, note: input.note };
    const held = await holdForMd(actor, key, { kind: "RECOVERY_REPAID", args });
    if (held) return held;
    await clearRecovery({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh();
    return { ok: true, message: "Recovery cleared as repaid. Held payouts are released if nothing else holds them." };
  } catch (error) {
    return toResult(error);
  }
}

export async function setOffRecoveryAction(
  input: { recoveryId: string; recordId: string; reference: string; setOffOn: string; note: string; clearsRecovery: boolean },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    const args = {
      recoveryId: input.recoveryId,
      recordId: input.recordId,
      reference: input.reference,
      setOffOn: new Date(input.setOffOn),
      note: input.note,
      clearsRecovery: input.clearsRecovery,
    };
    const held = await holdForMd(actor, key, { kind: "RECOVERY_SET_OFF", args });
    if (held) return held;
    const result = await setOffRecovery({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
    });
    refresh();
    return {
      ok: true,
      message: result.cleared
        ? "Set off — the benefit is Paid against the Recovery, and the Recovery is cleared."
        : "Set off — the benefit is Paid against the Recovery, which stays Recovery Pending for the rest.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/** CP §53 — Accounts asks MD to allow a Paid Early payment, with a reason. */
export async function requestCommissionPaidEarlyAction(
  input: { recordId: string; reason: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    await requestCommissionPaidEarly({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      recordId: input.recordId,
      reason: input.reason,
    });
    refresh();
    return { ok: true, message: "Paid Early requested. MD decides it on the Dashboard task." };
  } catch (error) {
    return toResult(error);
  }
}

/** CP §53 — MD refuses a Paid Early request; Accounts may ask again later. */
export async function rejectCommissionPaidEarlyAction(
  input: { recordId: string; note: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    await rejectCommissionPaidEarly({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      recordId: input.recordId,
      note: input.note,
    });
    refresh();
    return { ok: true, message: "Paid Early request rejected." };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * AC-03 — MD approves a Paid Early payment before Accounts may process it. The
 * approver and the time are stored on the commission record itself.
 */
export async function approveCommissionPaidEarlyAction(
  input: { recordId: string; note: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    await approveCommissionPaidEarly({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      recordId: input.recordId,
      note: input.note,
    });
    refresh();
    return { ok: true, message: "Paid Early approved by MD. Accounts may now process the payment." };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §6.11 with AC-03 — Accounts records Paid, or Paid Early with compulsory
 * remarks once MD has approved it.
 */
export async function markCommissionPaidAction(
  input: { recordId: string; early: boolean; paidOn: string; reference: string; remarks: string },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("COMMISSION_PROCESS");
  try {
    const args = {
      recordId: input.recordId,
      early: input.early,
      paidOn: new Date(input.paidOn),
      reference: input.reference,
      remarks: input.remarks,
    };
    const held = await holdForMd(actor, key, { kind: "COMMISSION_PAID", args });
    if (held) return held;
    const result = await markCommissionPaid({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
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
 * PRD §6.10 — CRM raises the correction with a compulsory reason and supporting
 * remark, and nothing moves until MD approves it. MD raising it is the approval.
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
    if (actor.role === "MD") {
      // Raising has committed by now. A refused approval leaves it Pending,
      // and a retry would be refused as "already pending": say where it is.
      try {
        await decideSoldByCorrection({
          idempotencyKey: `${key}:approve`,
          actorRef: actor.staffAccountId,
          actorRole: actor.role,
          bookingId: input.bookingId,
          approve: true,
          note: input.reason,
        });
      } catch (error) {
        refresh();
        return {
          ok: false,
          error: `The Sold By Correction is raised but not applied: ${actionErrorText(error)} It is waiting on this Booking for your decision.`,
        };
      }
    }
    refresh();
    return {
      ok: true,
      message:
        actor.role === "MD"
          ? "Sold By corrected. Old commission records are superseded and new ones created."
          : "Sold By Correction raised. The attribution is unchanged until MD approves it.",
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
        ? "Approved. Old commission records are superseded and new ones created. Booking and Payment history are unchanged."
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
  /** Blank where the Person already has one on file; never overwrites. */
  aadhaar?: string;
  /** Blank is the "PAN Not Available" decision, which blocks nothing. */
  pan?: string;
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
        aadhaar: row.aadhaar?.trim() || null,
        pan: row.pan?.trim() || null,
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
  // CP §64 T21 — which records have an Accounts adjustment waiting.
  const waiting = await adjustmentsWaiting(commissions.map((c) => c.id));

  // PLC spec §15.3 — the panel shows the frozen snapshot. The correction chain
  // is only fetched when this snapshot actually replaced an earlier one.
  const plcHistory = booking.plcSnapshot?.supersedes
    ? await plcSnapshotHistory(booking.plcSnapshot.id)
    : [];

  const receivedOnBySeq = new Map<number, Date>();
  for (const e of booking.paymentEntries) {
    if (e.status !== "CONFIRMED") continue;
    for (const a of e.allocations as { seq: number; percent: string }[]) {
      const last = receivedOnBySeq.get(a.seq);
      if (Number(a.percent) > 0 && (!last || e.paidOn > last)) receivedOnBySeq.set(a.seq, e.paidOn);
    }
  }
  // Owner, 10 Nov 2026 — payment steps Accounts entered, waiting for MD.
  const paymentApprovals = await pendingPaymentApprovals({ bookingId });

  return {
    id: booking.id,
    paymentApprovals: paymentApprovals.map((a) => ({
      id: a.id,
      label: a.label,
      requestedByRef: a.requestedByRef,
      requestedAt: a.requestedAt.toISOString(),
    })),
    /**
     * PLC spec §15.3 — frozen total, breakdown, version, snapshot date and
     * whether this is the original freeze or a correction. Percentage only:
     * no rupee value is derived from it anywhere.
     */
    plc: booking.plcSnapshot
      ? {
          totalPercent: booking.plcSnapshot.totalPercent.toFixed(3),
          // buildPlcSnapshot writes category/label/percent/evidence. The cast
          // used to claim a `code` field that has never existed, so the panel
          // keyed its list on undefined and printed nothing beside each label.
          components: booking.plcSnapshot.components as Array<{
            category: string;
            label: string;
            percent: string;
            evidence: string;
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
      // Final buyer details are mostly the Person record already on file. They
      // travel so the form arrives filled rather than asking for a date of
      // birth and an address the CRM is holding two tables away.
      dateOfBirth: p.person.dateOfBirth ? p.person.dateOfBirth.toISOString().slice(0, 10) : "",
      address: p.person.addressLine ?? "",
      // Whether it is on file, never the number. The form asks only when it
      // has to, and an Aadhaar is not sent to a browser to be re-displayed.
      aadhaarRecorded: p.person.aadhaarStatus !== "PENDING",
      panRecorded: p.person.panStatus !== "NOT_AVAILABLE",
      // As stored (four places): rounded to two, 33.3333 × 3 arrived as 99.99%
      // and 50.004/49.996 as 50/50 — which a resave then wrote back.
      sharePercent: p.sharePercent?.toString() ?? null,
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
    // Owner 3 Nov — the date each instalment was received: the latest
    // confirmed entry that put money on its seq (allocations are by seq, and a
    // schedule revision carries received by seq too).
    scheduleVersions: booking.scheduleVersions.map((s) => ({
      version: s.version,
      status: s.status,
      reason: s.reason,
      createdByRef: s.createdByRef,
      decisionNote: s.decisionNote,
      instalments: s.instalments.map((i) => ({
        seq: i.seq,
        // As stored (four places), like sharePercent: two showed a received
        // 9.996 as a fully paid 10 and a Revise rewrote 33.3333 as 33.33.
        scheduled: i.scheduledPercent.toString(),
        received: i.receivedPercent.toString(),
        remaining: i.scheduledPercent.sub(i.receivedPercent).toString(),
        dueDate: i.dueDate.toISOString(),
        receivedOn: receivedOnBySeq.get(i.seq)?.toISOString() ?? null,
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
      percent: e.percent.toString(),
      paidOn: e.paidOn.toISOString(),
      recordedAt: e.recordedAt.toISOString(),
      status: e.status,
      reference: e.externalReference.rawValue,
      referenceStatus: e.externalReference.status,
      confirmedByRef: e.confirmedByRef,
      reason: e.reason,
      remark: e.remark,
      payerName: e.payerName,
      payerReference: e.payerReference,
      correctsEntryId: e.correctsEntryId,
    })),
    // DESIGN §14.1 — eligibility and payment are shown as two separate fields.
    commissions: commissions.map((c) => ({
      id: c.id,
      type: c.type,
      beneficiary: c.beneficiaryPerson.fullName,
      beneficiaryPersonId: c.beneficiaryPersonId,
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
      // AC-03 — the stored MD approval, so the screen shows who approved a
      // Paid Early and when, rather than only that it happened.
      earlyApprovedByRef: c.earlyApprovedByRef,
      earlyApprovedAt: c.earlyApprovedAt?.toISOString() ?? null,
      earlyApprovalNote: c.earlyApprovalNote,
      // CP §53 — what Accounts asked for, while it waits for MD.
      earlyRequestedByRef: c.earlyRequestedByRef,
      earlyRequestedAt: c.earlyRequestedAt?.toISOString() ?? null,
      earlyRequestReason: c.earlyRequestReason,
      // CP §54, §64 — the adjustment and Recovery state Accounts acts on.
      adjustmentWaiting: waiting.has(c.id),
      recoveries: c.recoveries.map((r) => ({
        id: r.id,
        recoveryNo: r.recoveryNo,
        status: r.status,
        reference: r.reference,
        dueOn: r.dueOn.toISOString(),
        clearedHow: r.clearedHow,
      })),
      beneficiaryRecovery: c.beneficiaryPerson.recoveries[0]
        ? { id: c.beneficiaryPerson.recoveries[0].id, recoveryNo: c.beneficiaryPerson.recoveries[0].recoveryNo }
        : null,
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
    const args = {
      bookingId: input.bookingId,
      approve: input.approve,
      note: input.note,
      noPaymentReceived: input.noPaymentReceived,
      reference: input.reference || null,
      actionDate: input.actionDate ? new Date(input.actionDate) : null,
    };
    // Only an approval that pays a refund is a payment step; a rejection, or
    // an approval with no payment received, decides at once as before.
    if (input.approve && input.reference?.trim()) {
      const held = await holdForMd(actor, key, { kind: "REFUND", args });
      if (held) return held;
    }
    const result = await decideCancellation({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      ...args,
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
