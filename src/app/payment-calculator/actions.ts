"use server";

// Private Payment Calculator — the MD's server calls (revised brief §4.2, §8).
// Every one is MD-only on the server and refuses to run while the trial flag
// is off. None accepts or returns a rupee figure: the deal value and the
// payments live in the MD's browser and never arrive here.

import { revalidatePath } from "next/cache";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { actionErrorText } from "@/lib/action-error";
import { requireStaff } from "@/lib/security/current-actor";
import { beginCalculatorPasskey, finishCalculatorPasskey, paymentCalculatorAccess } from "@/lib/security/payment-calculator-access";
import { PAYMENT_DECISION_REASONS, readApproval, shownReceiptTrackingId } from "@/lib/domain/payment-percent";
import { activeSchedule, reversePaymentReceived } from "@/lib/services/payment-service";
import { approveVerifiedPayment, rejectPaymentVerification } from "@/lib/services/payment-verification-service";

export type CalculatorResult = { ok: true; message: string } | { ok: false; error: string };

async function mdOnly() {
  const actor = await requireStaff("PAYMENT_CALCULATOR_APPROVE");
  if ((await paymentCalculatorAccess(actor))?.step !== "unlocked") {
    throw new Error("Worksheet locked. Reopen it from the header search and use your passkey.");
  }
  return actor;
}

export async function beginCalculatorPasskeyAction(key: string | null) {
  return beginCalculatorPasskey(await requireStaff("PAYMENT_CALCULATOR_APPROVE"), key);
}

export async function finishCalculatorPasskeyAction(response: RegistrationResponseJSON | AuthenticationResponseJSON) {
  return finishCalculatorPasskey(await requireStaff("PAYMENT_CALCULATOR_APPROVE"), response);
}

/** One Booking as the calculator reads it: percentages, dates and references only. */
export async function loadCalculatorBookingAction(bookingId: string) {
  await mdOnly();
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingNumber: true,
      requestNo: true,
      status: true,
      activeProcess: true,
      paymentReceivedPercent: true,
      plotId: true,
      project: { select: { name: true, projectCode: true } },
      plot: { select: { plotNumber: true } },
      primaryPerson: { select: { fullName: true, customerProfile: { select: { customerId: true } } } },
      paymentEntries: {
        orderBy: { paidOn: "asc" },
        select: {
          id: true,
          percent: true,
          paidOn: true,
          recordedAt: true,
          status: true,
          confirmedByRef: true,
          externalReference: { select: { rawValue: true } },
          verificationRequest: { select: { mode: true } },
        },
      },
      verificationRequests: {
        where: { status: "PENDING" },
        orderBy: { requestedAt: "asc" },
        select: { id: true, claimedPaidOn: true, mode: true, reference: true, requestedByRef: true },
      },
      scheduleVersions: { where: { status: "PENDING" }, select: { id: true } },
      commissions: { where: { isCurrent: true }, select: { milestonePercent: true, eligibility: true } },
    },
  });
  if (!booking) return null;
  const schedule = await activeSchedule(db, booking.id);
  // Change Plot carried the verified % across; entries before it are the old Plot's history.
  const moved = await db.paymentScheduleVersion.findFirst({
    where: { bookingId: booking.id, reason: { startsWith: "Change Plot" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return {
    id: booking.id,
    plotId: booking.plotId,
    number: booking.bookingNumber ?? booking.requestNo,
    project: `${booking.project.projectCode} · ${booking.project.name}`,
    plot: booking.plot.plotNumber,
    customer: booking.primaryPerson
      ? `${booking.primaryPerson.fullName}${booking.primaryPerson.customerProfile ? ` · ${booking.primaryPerson.customerProfile.customerId}` : ""}`
      : "Customer Pending",
    status: booking.status,
    activeProcess: booking.activeProcess,
    received: booking.paymentReceivedPercent.toFixed(),
    scheduleRevisionWaiting: booking.scheduleVersions.length > 0,
    instalments: (schedule?.instalments ?? []).map((i) => ({
      seq: i.seq,
      scheduled: i.scheduledPercent.toString(),
      received: i.receivedPercent.toFixed(),
      dueDate: i.dueDate.toISOString(),
    })),
    entries: booking.paymentEntries.map((e) => ({
      id: e.id,
      percent: e.percent.toFixed(),
      paidOn: e.paidOn.toISOString(),
      reference: shownReceiptTrackingId(e.externalReference.rawValue, e.id),
      mode: e.verificationRequest?.mode ?? null,
      approvedBy: e.confirmedByRef,
      status: e.status,
      oldPlot: !!moved && e.recordedAt < moved.createdAt,
    })),
    claims: booking.verificationRequests.map((r) => ({
      id: r.id,
      claimedPaidOn: r.claimedPaidOn.toISOString(),
      mode: r.mode,
      reference: shownReceiptTrackingId(r.reference, r.id),
      requestedByRef: r.requestedByRef,
    })),
    // Milestones still ahead, so the calculator can say a payment reaches one.
    // Eligibility itself stays the commission engine's (gte, never rounded up).
    milestones: [
      ...new Set(
        booking.commissions
          .filter((c) => c.eligibility === "MILESTONE_PENDING" && c.milestonePercent.gt(booking.paymentReceivedPercent))
          .map((c) => c.milestonePercent.toString())
      ),
    ].sort((a, b) => Number(a) - Number(b)),
  };
}

export type CalculatorBookingView = NonNullable<Awaited<ReturnType<typeof loadCalculatorBookingAction>>>;

/**
 * Approve a verified payment as a percentage. Strict allowlist (readApproval):
 * any other field — a price, an amount — refuses the whole call unlogged.
 */
export async function approveVerifiedPaymentAction(input: unknown): Promise<CalculatorResult> {
  try {
    const actor = await mdOnly();
    const read = readApproval(input);
    if (!read.ok) return read;
    const { paidOn, ...rest } = read.value;

    const result = await approveVerifiedPayment({
      ...rest,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      paidOn: new Date(`${paidOn}T00:00:00+05:30`),
    });
    revalidatePath("/bookings");
    revalidatePath("/dashboard");
    const now = result.progressPercent.replace(/\.?0+$/, "");
    return {
      ok: true,
      message: result.paymentCompleted
        ? `Saved ${rest.percent}% as paid. The booking is now fully paid.`
        : `Saved ${rest.percent}% as paid. ${now}% of the booking is paid now.`,
    };
  } catch (error) {
    return { ok: false, error: actionErrorText(error) };
  }
}

export async function rejectPaymentClaimAction(requestId: string, reason: string, key: string): Promise<CalculatorResult> {
  try {
    const actor = await mdOnly();
    if (!PAYMENT_DECISION_REASONS.some((item) => item === reason)) return { ok: false, error: "Choose a reason." };
    await rejectPaymentVerification({ idempotencyKey: key, actorRef: actor.staffAccountId, actorRole: actor.role, requestId, reason });
    revalidatePath("/bookings");
    revalidatePath("/dashboard");
    return { ok: true, message: "Marked as not accepted. The paid % did not change." };
  } catch (error) {
    return { ok: false, error: actionErrorText(error) };
  }
}

/**
 * Owner review, 25 Nov 2026 — MD reverses a whole payment (a bounced cheque, a
 * returned transfer). The entry and its history stay; the reason has no amount.
 */
export async function reversePaymentAction(entryId: string, reason: string, key: string): Promise<CalculatorResult> {
  try {
    const actor = await mdOnly();
    if (!PAYMENT_DECISION_REASONS.some((item) => item === reason)) return { ok: false, error: "Choose a reason." };
    const result = await reversePaymentReceived({ idempotencyKey: key, actorRef: actor.staffAccountId, actorRole: actor.role, entryId, reason });
    revalidatePath("/bookings");
    revalidatePath("/dashboard");
    return { ok: true, message: `Payment reversed. ${result.progressPercent.replace(/\.?0+$/, "")}% of the booking is paid now. The old entry stays in the history.` };
  } catch (error) {
    return { ok: false, error: actionErrorText(error) };
  }
}
