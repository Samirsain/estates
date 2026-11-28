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
import { PAYMENT_DECISION_REASONS, readApproval, shownReceiptTrackingId, validPlotTokens } from "@/lib/domain/payment-percent";
import { decryptSensitive, encryptSensitive } from "@/lib/security/identity";
import { lockBooking } from "@/lib/services/command";
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

export async function savePlotTokensAction(bookingId: string, plotId: string, tokens: string): Promise<CalculatorResult> {
  await mdOnly();
  if (typeof tokens !== "string" || !validPlotTokens(tokens) || typeof bookingId !== "string" || typeof plotId !== "string") {
    return { ok: false, error: "Check the plot and token quantity." };
  }
  return db.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: {
      plotId: true, status: true, activeProcess: true, calculatorBasis: true,
    } });
    if (!booking || booking.plotId !== plotId || booking.status !== "BOOKED" || booking.activeProcess !== "NONE") {
      return { ok: false, error: "Reopen the current booked plot to set its tokens." };
    }
    if (booking.calculatorBasis) {
      if (decryptSensitive(booking.calculatorBasis.tokenCipher) !== tokens) {
        return { ok: false, error: "This booking already has saved tokens. Its saved quantity has been loaded." };
      }
    } else {
      await tx.calculatorPriceBasis.create({ data: { bookingId, tokenCipher: encryptSensitive(tokens) } });
    }
    return { ok: true, message: "Plot tokens saved." };
  });
}

export async function loadCalculatorBookingAction(bookingId: string) {
  await mdOnly();
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      calculatorBasis: { select: { tokenCipher: true } },
      status: true,
      activeProcess: true,
      paymentReceivedPercent: true,
      plotId: true,
      project: { select: { name: true, projectCode: true } },
      primaryPerson: { select: { fullName: true, customerProfile: { select: { customerId: true } } } },
      paymentEntries: {
        orderBy: [{ paidOn: "desc" }, { recordedAt: "desc" }],
        select: {
          id: true,
          percent: true,
          paidOn: true,
          recordedAt: true,
          status: true,
          externalReference: { select: { rawValue: true } },
        },
      },
      verificationRequests: {
        where: { status: "PENDING" },
        orderBy: { requestedAt: "asc" },
        select: { id: true, claimedPaidOn: true, mode: true, reference: true },
      },
      scheduleVersions: { where: { status: "PENDING" }, select: { id: true } },
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
    tokens: booking.calculatorBasis ? decryptSensitive(booking.calculatorBasis.tokenCipher) : null,
    plotId: booking.plotId,
    project: `${booking.project.projectCode} · ${booking.project.name}`,
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
      status: e.status,
      oldPlot: !!moved && e.recordedAt < moved.createdAt,
    })),
    claims: booking.verificationRequests.map((r) => ({
      id: r.id,
      claimedPaidOn: r.claimedPaidOn.toISOString(),
      mode: r.mode,
      reference: shownReceiptTrackingId(r.reference, r.id),
    })),
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
    if (!await db.calculatorPriceBasis.count({ where: { bookingId: rest.bookingId } })) {
      return { ok: false, error: "Save the plot tokens before recording a receipt." };
    }

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
