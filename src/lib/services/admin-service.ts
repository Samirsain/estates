// Staff status, emergency disable and the Unassigned Review queue.
// PRD §17.2; main-PRD §21.
//
// Disabling an account never rewrites history: past actions keep the actor who
// performed them. Only the open work moves.

import { blocked, runCommand, type Tx } from "./command";

/** Everything a disabled account still owns, for the pre-disable review. */
export async function openWorkFor(tx: Tx, staffAccountId: string) {
  const [tasks, enquiries] = await Promise.all([
    tx.task.findMany({
      where: { assigneeStaffId: staffAccountId, status: "PENDING" },
      select: { id: true, taskNo: true, title: true, recordName: true, dueAt: true },
      orderBy: { dueAt: "asc" },
    }),
    tx.enquiry.findMany({
      where: { assignedStaffId: staffAccountId, status: "ACTIVE" },
      select: { id: true, enquiryNo: true, projectId: true },
    }),
  ]);
  return { tasks, enquiries };
}

/**
 * PRD §17.2 — MD/Admin disables the login immediately with a reason. Every
 * session dies with the version bump, and the open work enters the Unassigned
 * Review queue instead of vanishing with the account.
 *
 * The planned path is the same command with `emergency: false`, which refuses
 * to run while open work is still assigned: reassign first, then disable.
 */
export async function disableStaffAccount(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  staffAccountId: string;
  reason: string;
  emergency: boolean;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to disable a staff account.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "STAFF_DISABLE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { staffAccountId: args.staffAccountId, emergency: args.emergency },
    },
    async (tx) => {
      const account = await tx.staffAccount.findUniqueOrThrow({
        where: { id: args.staffAccountId },
      });
      if (account.status === "DISABLED") blocked("This staff account is already disabled.");

      const work = await openWorkFor(tx, args.staffAccountId);
      const openCount = work.tasks.length + work.enquiries.length;

      if (!args.emergency && openCount > 0) {
        blocked(
          `This account still holds ${work.tasks.length} open task(s) and ${work.enquiries.length} ` +
            `Enquiry(ies). Reassign them first, or use Emergency Disable to queue them for review.`
        );
      }

      await tx.staffAccount.update({
        where: { id: args.staffAccountId },
        data: {
          status: "DISABLED",
          disabledAt: new Date(),
          disabledByRef: args.actorRef,
          disabledReason: args.reason,
          emergencyDisabled: args.emergency,
          // Invalidates every existing session immediately (PRD §17.1).
          sessionVersion: account.sessionVersion + 1,
        },
      });

      if (openCount > 0) {
        await tx.task.updateMany({
          where: { assigneeStaffId: args.staffAccountId, status: "PENDING" },
          data: { assigneeStaffId: null, needsReassignment: true },
        });
        await tx.enquiry.updateMany({
          where: { assignedStaffId: args.staffAccountId, status: "ACTIVE" },
          data: { assignedStaffId: null, needsReassignment: true },
        });
      }

      return {
        result: {
          staffAccountId: args.staffAccountId,
          queuedForReassignment: openCount,
        },
        audit: {
          entity: "StaffAccount",
          entityId: args.staffAccountId,
          action: args.emergency ? "STAFF_EMERGENCY_DISABLED" : "STAFF_DISABLED",
          before: { status: account.status },
          after: { status: "DISABLED", queuedForReassignment: openCount },
          reason: args.reason,
        },
      };
    }
  );
}

/** The Unassigned Review queue (PRD §17.2). */
export async function unassignedReviewQueue(tx: Tx) {
  const [tasks, enquiries] = await Promise.all([
    tx.task.findMany({
      where: { needsReassignment: true, status: "PENDING" },
      orderBy: { dueAt: "asc" },
    }),
    tx.enquiry.findMany({
      where: { needsReassignment: true, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { tasks, enquiries };
}

/**
 * PRD §17.2 — reassignment completes afterwards. Enquiries, tasks and the
 * follow-up work move to a live account; the historical actor never changes.
 */
export async function reassignWork(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  toStaffAccountId: string;
  taskIds?: string[];
  enquiryIds?: string[];
}) {
  const taskIds = args.taskIds ?? [];
  const enquiryIds = args.enquiryIds ?? [];
  if (taskIds.length + enquiryIds.length === 0) blocked("Select the work to reassign.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "WORK_REASSIGN",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { toStaffAccountId: args.toStaffAccountId, taskIds, enquiryIds },
    },
    async (tx) => {
      const target = await tx.staffAccount.findUniqueOrThrow({
        where: { id: args.toStaffAccountId },
      });
      if (target.status !== "ACTIVE") blocked("Work can only be reassigned to an active staff account.");

      const tasks = await tx.task.updateMany({
        where: { id: { in: taskIds }, status: "PENDING" },
        data: { assigneeStaffId: args.toStaffAccountId, assigneeRole: target.role, needsReassignment: false },
      });
      const enquiries = await tx.enquiry.updateMany({
        where: { id: { in: enquiryIds }, status: "ACTIVE" },
        data: { assignedStaffId: args.toStaffAccountId, needsReassignment: false },
      });

      for (const taskId of taskIds) {
        await tx.taskEvent.create({
          data: {
            taskId,
            actorRef: args.actorRef,
            action: "REASSIGNED",
            detail: `Reassigned to ${target.staffAccountId}.`,
          },
        });
      }

      return {
        result: { tasks: tasks.count, enquiries: enquiries.count },
        audit: {
          entity: "StaffAccount",
          entityId: args.toStaffAccountId,
          action: "WORK_REASSIGNED",
          after: { tasks: tasks.count, enquiries: enquiries.count },
        },
      };
    }
  );
}
