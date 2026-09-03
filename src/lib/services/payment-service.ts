// Payment Received, corrections, schedule revision and the rolling follow-up
// task. PRD.md §10, §12, §20, §24; DESIGN.md §11.
// Percentages only — no rupee value is stored or calculated anywhere here.

import { Prisma } from "@prisma/client";
import {
  allocatePayment,
  assertProcessFree,
  instalmentStatus,
  isPaymentComplete,
  normaliseReference,
  notFutureDated,
  progressAfter,
  validateSchedule,
  validateScheduleRevision,
  type ScheduleLine,
} from "@/lib/domain/booking";
import { blocked, lockBooking, runCommand, type Tx } from "./command";
import { reassessCommission } from "./commission-service";
import { syncRoyaltyLink } from "./network-service";
import { closeCompletionTasks, ensureCompletionTasks } from "./completion-service";
import { closeTasksFor, ensureTask, reviseTask } from "./task-service";

const D = Prisma.Decimal;

export type ScheduleInput = { seq: number; percent: string; dueDate: Date };

/* ------------------------------------------------------------- schedules */

export async function activeSchedule(tx: Tx, bookingId: string) {
  return tx.paymentScheduleVersion.findFirst({
    where: { bookingId, status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
}

type Instalment = { seq: number; scheduledPercent: Prisma.Decimal; dueDate: Date; receivedPercent: Prisma.Decimal };

export function toLines(instalments: readonly Instalment[]): ScheduleLine[] {
  return instalments.map((i) => ({
    seq: i.seq,
    scheduledPercent: i.scheduledPercent.toString(),
    dueDate: i.dueDate,
    receivedPercent: i.receivedPercent.toString(),
  }));
}

/**
 * Creates a schedule version and its instalments after the domain check passes.
 *
 * PRD §11.2 — "Payment Given mirrors the protected mechanics of Payment
 * Received", so one schedule builder serves both sides. Exactly one of
 * `bookingId` and `acquisitionId` is set; the database enforces that too.
 */
export async function createScheduleVersion(
  tx: Tx,
  args: {
    bookingId?: string;
    acquisitionId?: string;
    lines: readonly ScheduleInput[];
    /** Booking Date, or Purchase Date on the acquisition side. */
    bookingDate: Date;
    status: "PENDING" | "ACTIVE";
    createdByRef: string;
    reason?: string | null;
    /** Received portions carried forward from the version being replaced. */
    carryForward?: ReadonlyMap<number, string>;
  }
) {
  if (!args.bookingId === !args.acquisitionId) {
    throw new Error("A schedule version belongs to exactly one Booking or one Acquisition.");
  }
  const proposed: ScheduleLine[] = args.lines.map((line) => ({
    seq: line.seq,
    scheduledPercent: line.percent,
    dueDate: line.dueDate,
    receivedPercent: args.carryForward?.get(line.seq) ?? "0",
  }));

  const check = validateSchedule(proposed, args.bookingDate);
  if (!check.ok) blocked(check.reason);

  const version = await tx.paymentScheduleVersion.count({
    where: args.bookingId ? { bookingId: args.bookingId } : { acquisitionId: args.acquisitionId },
  });
  return tx.paymentScheduleVersion.create({
    data: {
      bookingId: args.bookingId ?? null,
      acquisitionId: args.acquisitionId ?? null,
      version: version + 1,
      status: args.status,
      reason: args.reason ?? null,
      createdByRef: args.createdByRef,
      instalments: {
        create: proposed.map((line) => ({
          seq: line.seq,
          scheduledPercent: String(line.scheduledPercent),
          dueDate: line.dueDate,
          receivedPercent: String(line.receivedPercent ?? "0"),
        })),
      },
    },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
}

/* --------------------------------------------------- rolling follow-up task */

/**
 * PRD §20 — one rolling Payment Follow-up task per Booking, due on the next
 * unpaid instalment. Its due date moves as instalments are completed or validly
 * rescheduled, and it closes only when the required percentage is fully
 * received or the process is formally closed.
 */
export async function syncPaymentFollowUp(tx: Tx, bookingId: string, actorRef: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { plot: true, project: true },
  });
  const schedule = await activeSchedule(tx, bookingId);
  const unpaid = (schedule?.instalments ?? []).filter((i) => i.receivedPercent.lt(i.scheduledPercent));

  if (unpaid.length === 0) {
    await closeTasksFor(
      tx,
      "Booking",
      bookingId,
      actorRef,
      "Payment Received reached 100%.",
      "PAYMENT_FOLLOW_UP"
    );
    return null;
  }

  const next = unpaid[0];
  // PRD §12.4 — the follow-up shows previous unpaid + current instalment as one
  // total due by the next due date.
  const totalDue = unpaid
    .filter((i) => i.dueDate.getTime() <= next.dueDate.getTime())
    .reduce((sum, i) => sum.add(i.scheduledPercent.sub(i.receivedPercent)), new D(0));

  const recordName = `${booking.bookingNumber ?? booking.requestNo} · ${booking.project.name} ${booking.plot.plotNumber}`;
  const result = `Total due by this date: ${totalDue.toFixed(2)}% (instalment ${next.seq})`;

  const existing = await tx.task.findFirst({
    where: { recordKind: "Booking", recordId: bookingId, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" },
  });
  if (existing) {
    // Reuse the same task; the business purpose has not changed (PRD §4.5).
    if (existing.dueAt.getTime() !== next.dueDate.getTime() || existing.latestResult !== result) {
      await reviseTask(tx, existing.id, actorRef, next.dueDate, result);
    }
    return existing;
  }

  return ensureTask(tx, {
    recordKind: "Booking",
    recordId: bookingId,
    recordName,
    purpose: "PAYMENT_FOLLOW_UP",
    title: "Payment Follow-up",
    assigneeRole: "CRM",
    dueAt: next.dueDate,
    latestResult: result,
  });
}

/* --------------------------------------------------------- external reference */

/**
 * PRD §10.3, §24 — one active reference value globally, normalised for spaces
 * and case. A correction supersedes and links the original; nothing is deleted.
 */
export async function createReference(
  tx: Tx,
  args: {
    rawValue: string;
    purpose: "PAYMENT_RECEIVED" | "PAYMENT_GIVEN" | "REFUND" | "COMMISSION" | "BUYBACK" | "OTHER";
    actionDate: Date;
    actorRef: string;
    replacesId?: string | null;
    reason?: string | null;
  }
) {
  const normalisedKey = normaliseReference(args.rawValue);
  const clash = await tx.externalReference.findFirst({
    where: { normalisedKey, status: "ACTIVE" },
  });
  if (clash) {
    blocked(
      `Payment Reference No. "${args.rawValue.trim()}" is already recorded against another entry. ` +
        `References are unique across Payment Received and Payment Given — correct the existing ` +
        `entry instead of adding a second one.`
    );
  }

  return tx.externalReference.create({
    data: {
      rawValue: args.rawValue.trim(),
      normalisedKey,
      purpose: args.purpose,
      actionDate: args.actionDate,
      actorRef: args.actorRef,
      replacesId: args.replacesId ?? null,
      reason: args.reason ?? null,
    },
  });
}

/* ------------------------------------------------------- payment received */

/** Applies an allocation to the live schedule and returns the new progress. */
export async function applyAllocation(
  tx: Tx,
  scheduleVersionId: string,
  allocations: readonly { seq: number; percent: string }[],
  direction: 1 | -1
) {
  for (const allocation of allocations) {
    const instalment = await tx.paymentInstalment.findFirstOrThrow({
      where: { scheduleVersionId, seq: allocation.seq },
    });
    const next =
      direction === 1
        ? instalment.receivedPercent.add(new D(allocation.percent))
        : instalment.receivedPercent.sub(new D(allocation.percent));
    await tx.paymentInstalment.update({
      where: { id: instalment.id },
      data: { receivedPercent: next.toFixed(4) },
    });
  }
}

/**
 * PRD §12.2 — Confirm Payment Received. The percentage is incremental, lands on
 * the oldest unpaid instalment first, and can never take progress above 100%.
 */
export async function confirmPaymentReceived(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  percent: string;
  paidOn: Date;
  reference: string;
  remark?: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_RECEIVED_CONFIRM",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, percent: args.percent, reference: args.reference },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: args.bookingId } });

      if (!["BOOKED", "PAYMENT_COMPLETED"].includes(booking.status)) {
        blocked(
          `Payment can only be confirmed on an approved Booking. This one is ` +
            `${booking.status.replaceAll("_", " ").toLowerCase()}.`
        );
      }
      if (booking.activeProcess !== "NONE") {
        blocked(
          `Payment confirmation is blocked while this Booking is under ` +
            `${booking.activeProcess.replaceAll("_", " ").toLowerCase()}.`
        );
      }

      const dated = notFutureDated("Payment Received Date", args.paidOn);
      if (!dated.ok) blocked(dated.reason);

      const schedule = await activeSchedule(tx, args.bookingId);
      if (!schedule) blocked("This Booking has no live payment schedule.");

      let allocations;
      let progress;
      try {
        allocations = allocatePayment(toLines(schedule.instalments), args.percent).allocations;
        progress = progressAfter(booking.paymentReceivedPercent.toString(), args.percent);
      } catch (error) {
        blocked(error instanceof Error ? error.message : "Payment could not be allocated.");
      }

      const reference = await createReference(tx, {
        rawValue: args.reference,
        purpose: "PAYMENT_RECEIVED",
        actionDate: args.paidOn,
        actorRef: args.actorRef,
      });

      const entry = await tx.paymentReceivedEntry.create({
        data: {
          bookingId: args.bookingId,
          percent: new D(args.percent).toFixed(4),
          paidOn: args.paidOn,
          externalReferenceId: reference.id,
          allocations: allocations as never,
          confirmedByRef: args.actorRef,
          remark: args.remark ?? null,
        },
      });

      await applyAllocation(tx, schedule.id, allocations, 1);
      const completed = isPaymentComplete(progress);
      await tx.booking.update({
        where: { id: args.bookingId },
        data: {
          paymentReceivedPercent: progress.toFixed(4),
          status: completed ? "PAYMENT_COMPLETED" : "BOOKED",
        },
      });
      if (completed) {
        await tx.plot.update({ where: { id: booking.plotId }, data: { status: "PAYMENT_COMPLETED" } });
        await tx.plotEvent.create({
          data: {
            plotId: booking.plotId,
            actorRef: args.actorRef,
            action: "PAYMENT_COMPLETED",
            fromStatus: "BOOKED",
            toStatus: "PAYMENT_COMPLETED",
          },
        });
        // main-PRD §18.1 — 100% creates the final-buyer and Allotment/Registry
        // work, once per Booking.
        await ensureCompletionTasks(tx, args.bookingId);
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "PAYMENT_RECEIVED",
          fromStatus: booking.status,
          toStatus: completed ? "PAYMENT_COMPLETED" : "BOOKED",
          detail: { percent: args.percent, progress: progress.toFixed(4), reference: reference.rawValue },
        },
      });
      await syncPaymentFollowUp(tx, args.bookingId, args.actorRef);
      await reassessCommission(tx, args.bookingId, args.actorRef);
      // CR-002 — 100% verified Payment Received on a first qualifying purchase
      // is what makes its Royalty Linked Member final.
      await syncRoyaltyLink(tx, booking.primaryPersonId, args.actorRef);

      return {
        result: {
          entryId: entry.id,
          progressPercent: progress.toFixed(4),
          paymentCompleted: completed,
        },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "PAYMENT_RECEIVED_CONFIRMED",
          before: { progress: booking.paymentReceivedPercent.toFixed(4) },
          after: { progress: progress.toFixed(4), reference: reference.rawValue },
          reason: args.remark,
        },
      };
    }
  );
}

/**
 * PRD §12.6, §24 — the original entry is never deleted. The correction marks it
 * Superseded, supersedes its reference, links the replacement, and recalculates
 * progress. Maker and checker must be different staff accounts.
 */
export async function correctPaymentReceived(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  entryId: string;
  percent: string;
  paidOn: Date;
  reference: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to correct a payment entry.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_RECEIVED_CORRECT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { entryId: args.entryId, percent: args.percent, reference: args.reference },
    },
    async (tx) => {
      const original = await tx.paymentReceivedEntry.findUniqueOrThrow({
        where: { id: args.entryId },
        include: { externalReference: true },
      });
      if (original.status !== "CONFIRMED") blocked("This entry has already been corrected.");
      if (original.confirmedByRef === args.actorRef) {
        blocked("A payment correction must be verified by a different staff account.");
      }

      await lockBooking(tx, original.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: original.bookingId } });
      const dated = notFutureDated("Payment Received Date", args.paidOn);
      if (!dated.ok) blocked(dated.reason);

      const schedule = await activeSchedule(tx, original.bookingId);
      if (!schedule) blocked("This Booking has no live payment schedule.");

      // Reverse the original allocation first, then allocate the corrected
      // percentage against the restored schedule.
      const originalAllocations = original.allocations as unknown as { seq: number; percent: string }[];
      await applyAllocation(tx, schedule.id, originalAllocations, -1);
      const reversed = await activeSchedule(tx, original.bookingId);

      let allocations;
      let progress;
      try {
        allocations = allocatePayment(toLines(reversed!.instalments), args.percent).allocations;
        progress = progressAfter(
          booking.paymentReceivedPercent.sub(original.percent).toString(),
          args.percent
        );
      } catch (error) {
        blocked(error instanceof Error ? error.message : "The corrected payment could not be allocated.");
      }

      await tx.externalReference.update({
        where: { id: original.externalReferenceId },
        data: { status: "SUPERSEDED", reason: args.reason },
      });
      const reference = await createReference(tx, {
        rawValue: args.reference,
        purpose: "PAYMENT_RECEIVED",
        actionDate: args.paidOn,
        actorRef: args.actorRef,
        replacesId: original.externalReferenceId,
        reason: args.reason,
      });

      const replacement = await tx.paymentReceivedEntry.create({
        data: {
          bookingId: original.bookingId,
          percent: new D(args.percent).toFixed(4),
          paidOn: args.paidOn,
          externalReferenceId: reference.id,
          allocations: allocations as never,
          confirmedByRef: args.actorRef,
          reason: args.reason,
          correctsEntryId: original.id,
        },
      });
      await tx.paymentReceivedEntry.update({
        where: { id: original.id },
        data: { status: "SUPERSEDED" },
      });

      await applyAllocation(tx, schedule.id, allocations, 1);

      // PRD §12.7 — a reversal below 100% returns Payment Completed to Booked
      // and pauses the final workflow.
      const completed = isPaymentComplete(progress);
      const nextStatus = completed ? "PAYMENT_COMPLETED" : "BOOKED";
      await tx.booking.update({
        where: { id: original.bookingId },
        data: { paymentReceivedPercent: progress.toFixed(4), status: nextStatus },
      });
      if (booking.status !== nextStatus) {
        if (completed) {
          await ensureCompletionTasks(tx, original.bookingId);
        } else {
          await closeCompletionTasks(
            tx,
            original.bookingId,
            args.actorRef,
            `Payment Received fell to ${progress.toFixed(2)}% — completion work paused.`
          );
        }
        await tx.plot.update({ where: { id: booking.plotId }, data: { status: nextStatus } });
        await tx.plotEvent.create({
          data: {
            plotId: booking.plotId,
            actorRef: args.actorRef,
            action: "PAYMENT_PROGRESS_CORRECTED",
            fromStatus: booking.status === "PAYMENT_COMPLETED" ? "PAYMENT_COMPLETED" : "BOOKED",
            toStatus: nextStatus,
            reason: args.reason,
          },
        });
      }

      await tx.bookingEvent.create({
        data: {
          bookingId: original.bookingId,
          actorRef: args.actorRef,
          action: "PAYMENT_CORRECTED",
          fromStatus: booking.status,
          toStatus: nextStatus,
          detail: {
            supersededEntryId: original.id,
            supersededReference: original.externalReference.rawValue,
            replacementReference: reference.rawValue,
            progress: progress.toFixed(4),
          },
          reason: args.reason,
        },
      });
      await syncPaymentFollowUp(tx, original.bookingId, args.actorRef);
      await reassessCommission(tx, original.bookingId, args.actorRef);
      await syncRoyaltyLink(tx, booking.primaryPersonId, args.actorRef);

      return {
        result: {
          replacementEntryId: replacement.id,
          supersededEntryId: original.id,
          progressPercent: progress.toFixed(4),
        },
        audit: {
          entity: "Booking",
          entityId: original.bookingId,
          action: "PAYMENT_RECEIVED_CORRECTED",
          before: { percent: original.percent.toFixed(4), reference: original.externalReference.rawValue },
          after: { percent: new D(args.percent).toFixed(4), reference: reference.rawValue },
          reason: args.reason,
        },
      };
    }
  );
}

/* -------------------------------------------------------- schedule revision */

/**
 * PRD §10.2 — CRM may revise the unpaid schedule. Received portions are locked,
 * the revised total is still exactly 100%, and Accounts approves the change.
 */
export async function reviseSchedule(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  lines: ScheduleInput[];
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to revise a payment schedule.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_SCHEDULE_REVISE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, lines: args.lines },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: true, project: true },
      });
      // ARCHITECTURE §6.3 — rescheduling future instalments while the Booking is
      // being cancelled or moved is meaningless work on a frozen record.
      const free = assertProcessFree(booking.activeProcess, "Revise payment schedule");
      if (!free.ok) blocked(free.reason);

      const current = await activeSchedule(tx, args.bookingId);
      if (!current) blocked("This Booking has no live payment schedule to revise.");

      const pending = await tx.paymentScheduleVersion.findFirst({
        where: { bookingId: args.bookingId, status: "PENDING" },
      });
      if (pending) blocked("A schedule revision is already waiting for the Accounts decision.");

      const carryForward = new Map(
        current.instalments.map((i) => [i.seq, i.receivedPercent.toString()] as const)
      );
      const proposed: ScheduleLine[] = args.lines.map((line) => ({
        seq: line.seq,
        scheduledPercent: line.percent,
        dueDate: line.dueDate,
        receivedPercent: carryForward.get(line.seq) ?? "0",
      }));

      const check = validateScheduleRevision(toLines(current.instalments), proposed, booking.bookingDate);
      if (!check.ok) blocked(check.reason);

      const version = await createScheduleVersion(tx, {
        bookingId: args.bookingId,
        lines: args.lines,
        bookingDate: booking.bookingDate,
        status: "PENDING",
        createdByRef: args.actorRef,
        reason: args.reason,
        carryForward,
      });

      await ensureTask(tx, {
        recordKind: "Booking",
        recordId: args.bookingId,
        recordName: `${booking.bookingNumber ?? booking.requestNo} · ${booking.project.name} ${booking.plot.plotNumber}`,
        purpose: "PAYMENT_SCHEDULE_REVIEW",
        title: "Accounts Verification — Payment",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult: args.reason,
      });

      return {
        result: { scheduleVersionId: version.id, version: version.version },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "PAYMENT_SCHEDULE_REVISION_SUBMITTED",
          before: { version: current.version },
          after: { version: version.version },
          reason: args.reason,
        },
      };
    }
  );
}

/** Accounts approves or rejects the revision. Old and new both stay in History. */
export async function decideScheduleRevision(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  approve: boolean;
  note: string;
}) {
  if (!args.note.trim()) blocked("A compulsory remark is required to decide a schedule revision.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_SCHEDULE_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, approve: args.approve },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const pending = await tx.paymentScheduleVersion.findFirst({
        where: { bookingId: args.bookingId, status: "PENDING" },
        include: { instalments: { orderBy: { seq: "asc" } } },
      });
      if (!pending) blocked("There is no schedule revision waiting for a decision.");
      if (pending.createdByRef === args.actorRef) {
        blocked("A schedule revision must be approved by a different staff account.");
      }

      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };

      if (!args.approve) {
        await tx.paymentScheduleVersion.update({
          where: { id: pending.id },
          data: { status: "REJECTED", ...decision },
        });
      } else {
        const current = await activeSchedule(tx, args.bookingId);
        if (current) {
          await tx.paymentScheduleVersion.update({
            where: { id: current.id },
            data: { status: "SUPERSEDED" },
          });
        }
        await tx.paymentScheduleVersion.update({
          where: { id: pending.id },
          data: { status: "ACTIVE", ...decision },
        });
        await syncPaymentFollowUp(tx, args.bookingId, args.actorRef);
      }

      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        args.approve ? `Approved — ${args.note}` : `Rejected — ${args.note}`,
        "PAYMENT_SCHEDULE_REVIEW"
      );
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: args.approve ? "PAYMENT_SCHEDULE_APPROVED" : "PAYMENT_SCHEDULE_REJECTED",
          detail: { version: pending.version },
          reason: args.note,
        },
      });

      return {
        result: { scheduleVersionId: pending.id, status: args.approve ? "ACTIVE" : "REJECTED" },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: args.approve ? "PAYMENT_SCHEDULE_APPROVED" : "PAYMENT_SCHEDULE_REJECTED",
          after: { version: pending.version },
          reason: args.note,
        },
      };
    }
  );
}

/* -------------------------------------------------------------- read model */

/** DESIGN §11.1 — Scheduled / Received / Remaining / Due date, plus the status. */
export function scheduleView(
  instalments: readonly Instalment[],
  now: Date = new Date()
): Array<{ seq: number; scheduled: string; received: string; remaining: string; dueDate: Date; status: string }> {
  return toLines(instalments).map((line) => ({
    seq: line.seq,
    scheduled: new D(line.scheduledPercent).toFixed(2),
    received: new D(line.receivedPercent ?? 0).toFixed(2),
    remaining: new D(line.scheduledPercent).sub(new D(line.receivedPercent ?? 0)).toFixed(2),
    dueDate: line.dueDate,
    status: instalmentStatus(line, now),
  }));
}
