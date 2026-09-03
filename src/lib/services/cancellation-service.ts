// The Accounts decision on a formal cancellation.
// main-PRD §15.4; PRD §7.2, §15.
//
// Approval cancels the Booking and returns the Plot through the one shared
// restriction-aware rule, adding no RESALE tag. Rejection restores the exact
// previous Booking, Plot, payment, commission and task state.

import type { BookingStatus, PlotStatus } from "@prisma/client";
import { canTransition } from "@/lib/domain/booking";
import { plotReturnState } from "@/lib/domain/inventory";
import { enquiryStatusAfterBookingCancelled } from "@/lib/domain/enquiry";
import { normaliseReference, notFutureDated } from "@/lib/domain/booking";
import { blocked, lockBooking, runCommand } from "./command";
import { cancelCommissionForBooking, reassessCommission } from "./commission-service";
import { syncRoyaltyLink } from "./network-service";
import { syncPaymentFollowUp } from "./payment-service";
import { closeTasksFor } from "./task-service";

type RestoreSnapshot = { bookingStatus: BookingStatus; plotStatus: PlotStatus };

export type CancellationDecisionResult = {
  bookingId: string;
  status: "CANCELLED" | "RESTORED";
};

/**
 * main-PRD §15.4 — at 0% Accounts may approve with No Payment Received. Where
 * payment exists the decision carries a Payment Reference No. and an action
 * date, and never a rupee amount.
 */
export async function decideCancellation(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  approve: boolean;
  note: string;
  /** Only meaningful on approval. */
  noPaymentReceived?: boolean;
  reference?: string | null;
  actionDate?: Date | null;
}): Promise<CancellationDecisionResult> {
  if (!args.note.trim()) blocked("A compulsory remark is required on the Accounts decision.");

  return runCommand<CancellationDecisionResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "CANCELLATION_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, approve: args.approve },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);

      const request = await tx.cancellationRequest.findFirst({
        where: { bookingId: args.bookingId, status: "PENDING" },
      });
      if (!request) blocked("There is no cancellation waiting for the Accounts decision.");
      // PRD §3.3 — the account that raised it may not decide it.
      if (request.requestedByRef === args.actorRef) {
        blocked("A cancellation must be decided by a different staff account.");
      }

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: true },
      });
      if (booking.status !== "REFUND_PENDING") {
        blocked(`This Booking is ${booking.status.replaceAll("_", " ").toLowerCase()}, not Refund Pending.`);
      }

      // Requests raised before Lifecycle was renamed Status carry the old key.
      const raw = request.restoreSnapshot as unknown as RestoreSnapshot & { plotLifecycle?: PlotStatus };
      const snapshot: RestoreSnapshot = { ...raw, plotStatus: raw.plotStatus ?? raw.plotLifecycle };
      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };

      /* ------------------------------ rejection restores the exact prior state */
      if (!args.approve) {
        await tx.cancellationRequest.update({
          where: { id: request.id },
          data: { status: "REJECTED", ...decision },
        });
        await tx.booking.update({
          where: { id: args.bookingId },
          data: {
            status: snapshot.bookingStatus,
            activeProcess: "NONE",
            closeReason: null,
          },
        });
        await tx.plot.update({
          where: { id: booking.plotId },
          data: { status: snapshot.plotStatus },
        });
        await tx.plotEvent.create({
          data: {
            plotId: booking.plotId,
            actorRef: args.actorRef,
            action: "REFUND_REJECTED_STATE_RESTORED",
            fromStatus: "REFUND_PENDING",
            toStatus: snapshot.plotStatus,
            reason: args.note,
          },
        });

        // The Refund Pending hold lifts and the rolling follow-up resumes.
        await reassessCommission(tx, args.bookingId, args.actorRef);
        await syncPaymentFollowUp(tx, args.bookingId, args.actorRef);
        await closeTasksFor(
          tx,
          "Booking",
          args.bookingId,
          args.actorRef,
          `Rejected — ${args.note}`,
          "REFUND_REVIEW"
        );
        await tx.bookingEvent.create({
          data: {
            bookingId: args.bookingId,
            actorRef: args.actorRef,
            action: "CANCELLATION_REJECTED",
            fromStatus: "REFUND_PENDING",
            toStatus: snapshot.bookingStatus,
            reason: args.note,
          },
        });

        return {
          result: { bookingId: args.bookingId, status: "RESTORED" },
          audit: {
            entity: "Booking",
            entityId: args.bookingId,
            action: "CANCELLATION_REJECTED",
            after: { status: snapshot.bookingStatus },
            reason: args.note,
          },
        };
      }

      /* ---------------------------------------------------------- approval */
      const move = canTransition("REFUND_PENDING", "CANCELLED");
      if (!move.ok) blocked(move.reason);

      const hadPayment = booking.paymentReceivedPercent.gt(0);
      const noPayment = args.noPaymentReceived ?? !hadPayment;

      if (hadPayment && noPayment) {
        blocked(
          `Payment Received is ${booking.paymentReceivedPercent.toFixed(2)}%, so No Payment Received ` +
            `cannot be used. Record the refund Payment Reference No. and its action date.`
        );
      }

      let referenceId: string | null = null;
      if (!noPayment) {
        if (!args.reference?.trim()) blocked("A refund Payment Reference No. is required.");
        if (!args.actionDate) blocked("The refund action date is required.");

        const dated = notFutureDated("Refund action date", args.actionDate);
        if (!dated.ok) blocked(dated.reason);

        const normalisedKey = normaliseReference(args.reference);
        const clash = await tx.externalReference.findFirst({
          where: { normalisedKey, status: "ACTIVE" },
        });
        if (clash) {
          blocked(
            `Payment Reference No. "${args.reference.trim()}" is already recorded against another ` +
              `entry. References are unique across every approved external reference.`
          );
        }
        const reference = await tx.externalReference.create({
          data: {
            rawValue: args.reference.trim(),
            normalisedKey,
            purpose: "REFUND",
            actionDate: args.actionDate,
            actorRef: args.actorRef,
          },
        });
        referenceId = reference.id;
      }

      await tx.cancellationRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          noPaymentReceived: noPayment,
          externalReferenceId: referenceId,
          ...decision,
        },
      });

      await tx.booking.update({
        where: { id: args.bookingId },
        data: { status: "CANCELLED", activeProcess: "NONE", closedAt: new Date() },
      });

      // PRD §15 — the one restriction-aware return. Booking cancellation adds
      // no RESALE tag; only an acquisition does that.
      const next = plotReturnState(booking.plot.restriction, booking.plot.restrictionReason);
      await tx.plot.update({ where: { id: booking.plotId }, data: { status: next.status } });
      await tx.plotEvent.create({
        data: {
          plotId: booking.plotId,
          actorRef: args.actorRef,
          action: "BOOKING_CANCELLED",
          fromStatus: "REFUND_PENDING",
          toStatus: next.status,
          reason: next.message ? `${args.note} — ${next.message}` : args.note,
        },
      });

      // PRD §7.2 — the Enquiry must never stay Booked once its only approved
      // Booking is cancelled; it returns to Active unless CRM closed it.
      if (booking.enquiryId) {
        const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: booking.enquiryId } });
        await tx.enquiry.update({
          where: { id: enquiry.id },
          data: { status: enquiryStatusAfterBookingCancelled(enquiry.status) },
        });
      }

      // PRD §6.1, §6.5 — cancellation before legal completion reopens the
      // one-shot slots. Only a Delivered Booking is legally completed, and the
      // state machine never allows cancelling from Delivered.
      await cancelCommissionForBooking(tx, args.bookingId, args.actorRef, {
        legallyCompleted: false,
        reason: `Booking cancelled — ${args.note}`,
      });

      // CR-002 — a first Booking cancelled before 100% Payment Received or an
      // Approved Buyback consumes no Royalty position. The provisional link
      // goes with it, and the buyer's next approved Booking may establish a new
      // one.
      await syncRoyaltyLink(tx, booking.primaryPersonId, args.actorRef);

      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        `Approved — ${args.note}`,
        "REFUND_REVIEW"
      );
      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        "Booking cancelled.",
        "PAYMENT_FOLLOW_UP"
      );
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "BOOKING_CANCELLED",
          fromStatus: "REFUND_PENDING",
          toStatus: "CANCELLED",
          detail: { noPaymentReceived: noPayment },
          reason: args.note,
        },
      });

      return {
        result: { bookingId: args.bookingId, status: "CANCELLED" },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "BOOKING_CANCELLED",
          before: { status: "REFUND_PENDING" },
          after: { status: "CANCELLED", plotStatus: next.status, noPaymentReceived: noPayment },
          reason: args.note,
        },
      };
    }
  );
}
