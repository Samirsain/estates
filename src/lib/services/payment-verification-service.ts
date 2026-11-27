// Confidential payment trial (revised brief, 25 Nov 2026) — payment claims and
// the MD's approval. No rupee figure reaches this file: a claim is a date, a
// mode and an opaque reference; an approval is a percentage the MD's browser
// worked out. The credit itself is the existing confirmPaymentReceived, so the
// oldest-first allocation, the 100% ceiling, references, commission, Royalty,
// Trip, completion and follow-up rules all apply unchanged.

import { normaliseReference, notFutureDated } from "@/lib/domain/booking";
import { MONETARY_TEXT_REFUSAL, monetaryText, receiptTrackingId, shownReceiptTrackingId } from "@/lib/domain/payment-percent";
import { blocked, lockBooking, lockKey, runCommand, type Tx } from "./command";
import { confirmPaymentReceived } from "./payment-service";
import { closeTasksFor, ensureTask } from "./task-service";

export const VERIFICATION_PURPOSE = "PAYMENT_VERIFICATION";
export const PAYMENT_MODES = ["UPI", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "CARD", "OTHER"] as const;
export type PaymentModeValue = (typeof PAYMENT_MODES)[number];

type Ctx = { idempotencyKey: string; actorRef: string; actorRole: string };

function refuseMoney(label: string, text: string | null | undefined) {
  if (text && monetaryText(text)) blocked(`${label}: ${MONETARY_TEXT_REFUSAL}`);
}

async function bookingName(tx: Tx, bookingId: string) {
  const b = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { bookingNumber: true, requestNo: true, plotId: true, project: { select: { name: true } }, plot: { select: { plotNumber: true } } },
  });
  return { recordName: `${b.bookingNumber ?? b.requestNo} · ${b.project.name} ${b.plot.plotNumber}`, plotId: b.plotId };
}

/** MD's task goes once nothing on the Booking waits for verification. */
async function closeIfNoneWaiting(tx: Tx, bookingId: string, actorRef: string, why: string) {
  const left = await tx.paymentVerificationRequest.count({ where: { bookingId, status: "PENDING" } });
  if (left === 0) await closeTasksFor(tx, "Booking", bookingId, actorRef, why, VERIFICATION_PURPOSE);
}

/**
 * Revised brief §4.3 — staff record what the customer says they paid. It is
 * not a verified payment: nothing moves until MD approves its percentage.
 */
export async function requestPaymentVerification(
  args: Ctx & { bookingId: string; claimedPaidOn: Date; mode: string; reference: string; note?: string | null }
) {
  const reference = args.reference.trim();
  const note = args.note?.trim() || null;
  if (!(PAYMENT_MODES as readonly string[]).includes(args.mode)) blocked("Pick how the customer paid.");
  if (!reference) blocked("Enter the payment reference — UTR, cheque or receipt number.");
  if (reference.length > 60) blocked("The reference is at most 60 characters.");
  if (note && note.length > 300) blocked("The note is at most 300 characters.");
  refuseMoney("Reference", reference);
  refuseMoney("Note", note);
  if (Number.isNaN(args.claimedPaidOn.getTime())) blocked("Enter the date the customer says they paid.");
  const dated = notFutureDated("The payment date", args.claimedPaidOn);
  if (!dated.ok) blocked(dated.reason);
  const referenceKey = normaliseReference(reference);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_VERIFICATION_REQUEST",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, reference: referenceKey, mode: args.mode },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      await lockKey(tx, `external-reference:${referenceKey}`);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: args.bookingId }, select: { status: true } });
      if (booking.status !== "BOOKED") {
        blocked(
          booking.status === "PAYMENT_COMPLETED"
            ? "This Booking is 100% paid. There is nothing left to verify."
            : `A payment can be sent for verification only on a Booked Booking. This one is ${booking.status.replaceAll("_", " ").toLowerCase()}.`
        );
      }
      if (await tx.externalReference.findFirst({ where: { normalisedKey: referenceKey, status: "ACTIVE" }, select: { id: true } })) {
        blocked(`Reference "${reference}" is already saved as a payment. Ask MD if this is a new payment.`);
      }
      if (await tx.paymentVerificationRequest.findFirst({ where: { referenceKey, status: "PENDING" }, select: { id: true } })) {
        blocked(`Reference "${reference}" is already waiting for MD to check.`);
      }

      const request = await tx.paymentVerificationRequest.create({
        data: {
          bookingId: args.bookingId,
          claimedPaidOn: args.claimedPaidOn,
          mode: args.mode as PaymentModeValue,
          reference,
          referenceKey,
          note,
          requestedByRef: args.actorRef,
        },
      });
      const name = await bookingName(tx, args.bookingId);
      await ensureTask(tx, {
        recordKind: "Booking",
        recordId: args.bookingId,
        recordName: name.recordName,
        plotId: name.plotId,
        purpose: VERIFICATION_PURPOSE,
        title: "Verify — Payment Claim",
        assigneeRole: "MD",
        dueAt: new Date(),
        decision: true,
        latestResult: `${args.mode} · ${reference}`,
      });
      await tx.bookingEvent.create({
        data: { bookingId: args.bookingId, actorRef: args.actorRef, action: "PAYMENT_CLAIM_RAISED", detail: { requestId: request.id, mode: args.mode, reference } },
      });
      return {
        result: { requestId: request.id },
        audit: { entity: "PaymentVerificationRequest", entityId: request.id, action: "PAYMENT_CLAIM_RAISED", after: { bookingId: args.bookingId, mode: args.mode, reference } },
      };
    }
  );
}

/** MD rejects a claim. The reason is compulsory and carries no amount; no progress moves. */
export async function rejectPaymentVerification(args: Ctx & { requestId: string; reason: string }) {
  if (args.actorRole !== "MD") blocked("Only MD decides a payment claim.");
  const reason = args.reason.trim();
  if (!reason) blocked("A compulsory reason is required to reject.");
  refuseMoney("Reason", reason);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_VERIFICATION_REJECT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { requestId: args.requestId },
    },
    async (tx) => {
      const { bookingId } = await tx.paymentVerificationRequest.findUniqueOrThrow({ where: { id: args.requestId }, select: { bookingId: true } });
      await lockBooking(tx, bookingId);
      const request = await tx.paymentVerificationRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      if (request.status !== "PENDING") blocked(`This claim was already ${request.status.toLowerCase()}.`);
      await tx.paymentVerificationRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: reason },
      });
      await tx.bookingEvent.create({
        data: { bookingId, actorRef: args.actorRef, action: "PAYMENT_CLAIM_REJECTED", detail: { requestId: request.id }, reason },
      });
      await closeIfNoneWaiting(tx, bookingId, args.actorRef, `Rejected — ${reason}`);
      return {
        result: { requestId: request.id },
        audit: { entity: "PaymentVerificationRequest", entityId: request.id, action: "PAYMENT_CLAIM_REJECTED", reason },
      };
    }
  );
}

/** The booking lock and transaction also protect the claim decision. */
export async function approveVerifiedPayment(
  args: Ctx & {
    bookingId: string;
    percent: string;
    paidOn: Date;
    reference: string;
    expectedReceived: string;
    plotId: string;
    requestId?: string | null;
  }
) {
  if (args.actorRole !== "MD") blocked("Only MD approves a verified payment percentage.");
  const requestId = args.requestId ?? null;
  const reference = args.reference.trim();
  if (!receiptTrackingId(reference)) blocked("Enter a receipt tracking ID from the private accounts workbook.");
  return confirmPaymentReceived({
    idempotencyKey: requestId ? `PCTAPPR-${requestId}` : args.idempotencyKey,
    actorRef: args.actorRef,
    actorRole: args.actorRole,
    bookingId: args.bookingId,
    percent: args.percent,
    paidOn: args.paidOn,
    reference,
    expectedProgress: args.expectedReceived,
    verification: {
      plotId: args.plotId,
      requestId,
      completeClaim: requestId ? async (tx, entryId) => {
        const request = await tx.paymentVerificationRequest.findUnique({ where: { id: requestId } });
        if (!request || request.bookingId !== args.bookingId) blocked("That payment claim is not on this Booking.");
        if (request.status !== "PENDING") blocked(`This claim was already ${request.status.toLowerCase()}.`);
        if (normaliseReference(reference) !== normaliseReference(shownReceiptTrackingId(request.reference, request.id))) {
          blocked("Use the tracking ID shown on this claim.");
        }
        await tx.paymentVerificationRequest.update({
          where: { id: requestId },
          data: { status: "APPROVED", decidedByRef: args.actorRef, decidedAt: new Date(), paymentEntryId: entryId },
        });
        await tx.bookingEvent.create({
          data: { bookingId: args.bookingId, actorRef: args.actorRef, action: "PAYMENT_CLAIM_APPROVED", detail: { requestId, entryId, percent: args.percent } },
        });
        await tx.auditEvent.create({
          data: {
            actorRef: args.actorRef, actorRole: args.actorRole, entity: "PaymentVerificationRequest",
            entityId: requestId, action: "PAYMENT_CLAIM_APPROVED", afterMasked: { percent: args.percent, entryId },
          },
        });
        await closeIfNoneWaiting(tx, args.bookingId, args.actorRef, `Approved — ${args.percent}% verified.`);
      } : undefined,
    },
  });
}
