// Change Plot on an approved Booking — PRD.md §5.3; main-PRD §16.4.
//
// Same Project only, same Booking Number, same Primary Customer and Sold By.
// The replacement Plot is blocked while under review and its PLC snapshot is
// frozen at submission; on rejection that snapshot is discarded and both Plots
// go back exactly as they were.

import { Prisma } from "@prisma/client";
import type { PlotLifecycle } from "@prisma/client";
import {
  plotStateAfterChangePlot,
  validateChangePlot,
} from "@/lib/domain/acquisition";
import { assertProcessFree, isPaymentComplete, validateSchedule } from "@/lib/domain/booking";
import { buildPlcSnapshot } from "@/lib/domain/inventory";
import { blocked, lockBooking, lockPlot, runCommand, type Tx } from "./command";
import { generateForBooking, reassessCommission } from "./commission-service";
import { createScheduleVersion, syncPaymentFollowUp, type ScheduleInput } from "./payment-service";
import { closeTasksFor, ensureTask } from "./task-service";

const D = Prisma.Decimal;

type RestoreSnapshot = {
  bookingStatus: string;
  fromPlotLifecycle: PlotLifecycle;
  toPlotLifecycle: PlotLifecycle;
};

/** Freezes the replacement Plot's current PLC, or reuses this buyer's Hold snapshot. */
async function freezeReplacementPlc(tx: Tx, plotId: string, personId: string) {
  // PRD §5.3 — if the same Customer already held that Plot, the Hold PLC
  // snapshot is the one that carries.
  const hold = await tx.hold.findFirst({
    where: { plotId, personId, status: { in: ["ACTIVE", "FROZEN"] }, plcSnapshotId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (hold?.plcSnapshotId) {
    return tx.plcSnapshot.findUniqueOrThrow({ where: { id: hold.plcSnapshotId } });
  }

  const plot = await tx.plot.findUniqueOrThrow({
    where: { id: plotId },
    include: {
      project: {
        include: { plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 } },
      },
    },
  });
  const version = plot.project.plcRuleVersions[0];
  if (!version) blocked("The Project has no current PLC rule version.");

  const snapshot = buildPlcSnapshot(
    plot.plcComponentCodes,
    version.components.map((c) => ({ code: c.code, label: c.label, percent: c.percent.toString() }))
  );
  return tx.plcSnapshot.create({
    data: {
      ruleVersionId: version.id,
      plotId,
      components: snapshot.components as never,
      totalPercent: snapshot.totalPercent.toFixed(3),
    },
  });
}

export async function submitChangePlot(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  toPlotId: string;
  remark: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "CHANGE_PLOT_SUBMIT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, toPlotId: args.toPlotId },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      await lockPlot(tx, args.toPlotId);

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: { include: { project: true } } },
      });
      if (!["BOOKED", "PAYMENT_COMPLETED"].includes(booking.status)) {
        blocked("Change Plot applies to an approved Booking that is not yet Delivered (PRD §5.1).");
      }
      const free = assertProcessFree(booking.activeProcess, "Change Plot");
      if (!free.ok) blocked(free.reason);

      const toPlot = await tx.plot.findUniqueOrThrow({ where: { id: args.toPlotId } });
      const heldBySameCustomer =
        (await tx.hold.count({
          where: {
            plotId: args.toPlotId,
            personId: booking.primaryPersonId,
            status: { in: ["ACTIVE", "FROZEN"] },
          },
        })) > 0;

      const check = validateChangePlot({
        fromProjectId: booking.projectId,
        toProjectId: toPlot.projectId,
        fromPlotId: booking.plotId,
        toPlotId: args.toPlotId,
        toPlotLifecycle: toPlot.lifecycle,
        toPlotRestriction: toPlot.restriction,
        heldBySameCustomer,
        remark: args.remark,
      });
      if (!check.ok) blocked(check.reason);

      const snapshot = await freezeReplacementPlc(tx, args.toPlotId, booking.primaryPersonId);

      const request = await tx.changePlotRequest.create({
        data: {
          bookingId: args.bookingId,
          fromPlotId: booking.plotId,
          toPlotId: args.toPlotId,
          remark: args.remark,
          requestedByRef: args.actorRef,
          replacementPlcSnapshotId: snapshot.id,
          restoreSnapshot: {
            bookingStatus: booking.status,
            fromPlotLifecycle: booking.plot.lifecycle,
            toPlotLifecycle: toPlot.lifecycle,
          },
        },
      });

      // The old Plot stays allocated and shows the process message; the
      // replacement is transactionally blocked while under review (PRD §5.3).
      await tx.booking.update({
        where: { id: args.bookingId },
        data: { activeProcess: "CHANGE_PLOT_PENDING" },
      });
      await tx.plot.update({
        where: { id: args.toPlotId },
        data: { lifecycle: "WAITING_FOR_BOOKING_APPROVAL" },
      });
      await tx.plotEvent.create({
        data: {
          plotId: args.toPlotId,
          actorRef: args.actorRef,
          action: "CHANGE_PLOT_RESERVED",
          fromLifecycle: toPlot.lifecycle,
          toLifecycle: "WAITING_FOR_BOOKING_APPROVAL",
          reason: args.remark,
        },
      });
      await tx.plotEvent.create({
        data: {
          plotId: booking.plotId,
          actorRef: args.actorRef,
          action: "CHANGE_PLOT_UNDER_PROCESS",
          reason: args.remark,
        },
      });

      // Commission is held while a major process is active (PRD §14.8).
      await reassessCommission(tx, args.bookingId, args.actorRef);

      await ensureTask(tx, {
        recordKind: "Booking",
        recordId: args.bookingId,
        recordName: `${booking.bookingNumber} · ${booking.plot.project.name} ${booking.plot.plotNumber}`,
        purpose: "CHANGE_PLOT_REVIEW",
        title: "Accounts Verification — Change Plot",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult: `Move to ${toPlot.plotType.replaceAll("_", " ")} ${toPlot.plotNumber} — ${args.remark}`,
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "CHANGE_PLOT_SUBMITTED",
          detail: { fromPlotId: booking.plotId, toPlotId: args.toPlotId },
          reason: args.remark,
        },
      });

      return {
        result: { requestId: request.id, plcSnapshotId: snapshot.id },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "CHANGE_PLOT_SUBMITTED",
          before: { plotId: booking.plotId },
          after: { plotId: args.toPlotId },
          reason: args.remark,
        },
      };
    }
  );
}

export type ChangePlotDecisionResult = {
  requestId: string;
  status: "APPROVED" | "REJECTED";
};

/**
 * PRD §5.3 — on approval the same Booking Number continues, the old Plot
 * returns under its restriction with no RESALE tag, Accounts manually records
 * the percentage applicable to the replacement and enters a revised schedule
 * totalling 100%. On rejection everything goes back and the temporary
 * replacement PLC snapshot is kept against the rejected request as History.
 */
export async function decideChangePlot(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  approve: boolean;
  note: string;
  /** Only on approval: the verified percentage that carries to the new Plot. */
  appliedPercent?: string;
  schedule?: ScheduleInput[];
}): Promise<ChangePlotDecisionResult> {
  if (!args.note.trim()) blocked("A compulsory remark is required on the Accounts decision.");

  return runCommand<ChangePlotDecisionResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "CHANGE_PLOT_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, approve: args.approve },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);

      const request = await tx.changePlotRequest.findFirst({
        where: { bookingId: args.bookingId, status: "PENDING" },
      });
      if (!request) blocked("There is no Change Plot waiting for the Accounts decision.");
      if (request.requestedByRef === args.actorRef) {
        blocked("A Change Plot must be decided by a different staff account (PRD §3.3).");
      }

      await lockPlot(tx, request.fromPlotId);
      await lockPlot(tx, request.toPlotId);

      const booking = await tx.booking.findUniqueOrThrow({ where: { id: args.bookingId } });
      const fromPlot = await tx.plot.findUniqueOrThrow({ where: { id: request.fromPlotId } });
      const toPlot = await tx.plot.findUniqueOrThrow({ where: { id: request.toPlotId } });
      const snapshot = request.restoreSnapshot as unknown as RestoreSnapshot;
      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };

      /* ----------------------------------------------------- rejection */
      if (!args.approve) {
        await tx.changePlotRequest.update({
          where: { id: request.id },
          data: { status: "REJECTED", ...decision },
        });
        if (request.replacementPlcSnapshotId) {
          // PLC spec §10.3, §21 — the temporary replacement snapshot leaves
          // current use but is never hard-deleted. It stays linked to the
          // rejected request as History.
          await tx.plcSnapshot.update({
            where: { id: request.replacementPlcSnapshotId },
            data: { isCurrent: false },
          });
        }

        await tx.plot.update({
          where: { id: request.toPlotId },
          data: { lifecycle: snapshot.toPlotLifecycle },
        });
        await tx.plotEvent.create({
          data: {
            plotId: request.toPlotId,
            actorRef: args.actorRef,
            action: "CHANGE_PLOT_RELEASED",
            fromLifecycle: toPlot.lifecycle,
            toLifecycle: snapshot.toPlotLifecycle,
            reason: args.note,
          },
        });
        await tx.plot.update({
          where: { id: request.fromPlotId },
          data: { lifecycle: snapshot.fromPlotLifecycle },
        });
        await tx.booking.update({
          where: { id: args.bookingId },
          data: { activeProcess: "NONE" },
        });

        await reassessCommission(tx, args.bookingId, args.actorRef);
        await closeTasksFor(
          tx,
          "Booking",
          args.bookingId,
          args.actorRef,
          `Rejected — ${args.note}`,
          "CHANGE_PLOT_REVIEW"
        );
        await tx.bookingEvent.create({
          data: {
            bookingId: args.bookingId,
            actorRef: args.actorRef,
            action: "CHANGE_PLOT_REJECTED",
            reason: args.note,
          },
        });

        return {
          result: { requestId: request.id, status: "REJECTED" },
          audit: {
            entity: "Booking",
            entityId: args.bookingId,
            action: "CHANGE_PLOT_REJECTED",
            reason: args.note,
          },
        };
      }

      /* ------------------------------------------------------ approval */
      if (!args.appliedPercent) {
        blocked(
          "Accounts must record the Payment Received percentage applicable to the replacement Plot " +
            "(PRD §5.3). No rupee conversion is performed."
        );
      }
      if (!args.schedule || args.schedule.length === 0) {
        blocked("Accounts must enter a revised payment schedule totalling exactly 100%.");
      }

      const applied = new D(args.appliedPercent);
      if (applied.lt(0) || applied.gt(100)) {
        blocked("The applicable percentage must be between 0% and 100%.");
      }

      const proposed = args.schedule.map((line) => ({
        seq: line.seq,
        scheduledPercent: line.percent,
        dueDate: line.dueDate,
        receivedPercent: "0",
      }));
      const scheduleCheck = validateSchedule(proposed, booking.bookingDate);
      if (!scheduleCheck.ok) blocked(scheduleCheck.reason);

      // The old schedule becomes History; the revised one carries the verified
      // percentage, allocated oldest instalment first.
      await tx.paymentScheduleVersion.updateMany({
        where: { bookingId: args.bookingId, status: { in: ["ACTIVE", "PENDING"] } },
        data: { status: "SUPERSEDED" },
      });
      const version = await createScheduleVersion(tx, {
        bookingId: args.bookingId,
        lines: args.schedule,
        bookingDate: booking.bookingDate,
        status: "ACTIVE",
        createdByRef: args.actorRef,
        reason: `Change Plot — ${args.note}`,
      });

      let remaining = applied;
      for (const instalment of version.instalments) {
        if (remaining.lte(0)) break;
        const take = instalment.scheduledPercent.lt(remaining) ? instalment.scheduledPercent : remaining;
        await tx.paymentInstalment.update({
          where: { id: instalment.id },
          data: { receivedPercent: take.toFixed(4) },
        });
        remaining = remaining.sub(take);
      }

      const completed = isPaymentComplete(applied);
      const nextStatus = completed ? "PAYMENT_COMPLETED" : "BOOKED";

      // Same Booking Number, same Primary Customer, same Sold By (PRD §5.3).
      await tx.booking.update({
        where: { id: args.bookingId },
        data: {
          plotId: request.toPlotId,
          plcSnapshotId: request.replacementPlcSnapshotId,
          paymentReceivedPercent: applied.toFixed(4),
          status: nextStatus,
          activeProcess: "NONE",
        },
      });
      await tx.changePlotRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", appliedPercent: applied.toFixed(4), ...decision },
      });

      // The old Plot returns under its restriction and receives no RESALE tag.
      const returned = plotStateAfterChangePlot(fromPlot.restriction, fromPlot.restrictionReason);
      await tx.plot.update({
        where: { id: request.fromPlotId },
        data: { lifecycle: returned.lifecycle },
      });
      await tx.plotEvent.create({
        data: {
          plotId: request.fromPlotId,
          actorRef: args.actorRef,
          action: "CHANGE_PLOT_RELEASED_ORIGINAL",
          fromLifecycle: fromPlot.lifecycle,
          toLifecycle: returned.lifecycle,
          reason: returned.message ? `${args.note} — ${returned.message}` : args.note,
        },
      });

      await tx.plot.update({
        where: { id: request.toPlotId },
        data: { lifecycle: nextStatus },
      });
      await tx.plotEvent.create({
        data: {
          plotId: request.toPlotId,
          actorRef: args.actorRef,
          action: "CHANGE_PLOT_APPLIED",
          fromLifecycle: "WAITING_FOR_BOOKING_APPROVAL",
          toLifecycle: nextStatus,
          reason: args.note,
        },
      });

      // Any Hold this buyer had on the replacement is now consumed by the move.
      await tx.hold.updateMany({
        where: {
          plotId: request.toPlotId,
          personId: booking.primaryPersonId,
          status: { in: ["ACTIVE", "FROZEN"] },
        },
        data: {
          status: "CONVERTED_TO_BOOKING",
          closedAt: new Date(),
          closeReason: `Change Plot into ${booking.bookingNumber}`,
        },
      });

      // Commission is rechecked against the new Plot and the verified progress.
      await generateForBooking(tx, args.bookingId, args.actorRef);
      await reassessCommission(tx, args.bookingId, args.actorRef);
      await syncPaymentFollowUp(tx, args.bookingId, args.actorRef);
      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        `Approved — ${args.note}`,
        "CHANGE_PLOT_REVIEW"
      );
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "CHANGE_PLOT_APPROVED",
          fromStatus: booking.status,
          toStatus: nextStatus,
          detail: {
            fromPlotId: request.fromPlotId,
            toPlotId: request.toPlotId,
            appliedPercent: applied.toFixed(4),
          },
          reason: args.note,
        },
      });

      return {
        result: { requestId: request.id, status: "APPROVED" },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "CHANGE_PLOT_APPROVED",
          before: { plotId: request.fromPlotId, progress: booking.paymentReceivedPercent.toFixed(4) },
          after: { plotId: request.toPlotId, progress: applied.toFixed(4) },
          reason: args.note,
        },
      };
    }
  );
}
