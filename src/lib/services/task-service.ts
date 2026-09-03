// Task service — PRD.md §20; DESIGN.md §6.
// The duplicate-prevention key is Record + Purpose, backed by a partial unique
// index, so a retry or a concurrent job cannot create a second Pending task.

import type { StaffRole, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { TaskSubject } from "@/lib/tasks";
import { nextReference, type Tx } from "./command";

export type TaskInput = {
  recordKind: string;
  recordId: string;
  recordName: string;
  purpose: string;
  title: string;
  assigneeRole: StaffRole;
  assigneeStaffId?: string | null;
  dueAt: Date;
  urgent?: boolean;
  decision?: boolean;
  latestResult?: string | null;
  recurrence?: string;
  origin?: "SYSTEM" | "MANUAL";
};

/**
 * Creates the Pending task unless one already exists for the same Record +
 * Purpose, in which case the existing task is returned untouched. Safe to call
 * repeatedly from a retried job.
 */
export async function ensureTask(tx: Tx, input: TaskInput) {
  const existing = await tx.task.findFirst({
    where: {
      recordKind: input.recordKind,
      recordId: input.recordId,
      purpose: input.purpose,
      status: "PENDING",
    },
  });
  if (existing) return existing;

  const taskNo = await nextReference(tx, "TSK", "Task");
  // The CREATED event is written with the task, not after it: one round trip
  // instead of two, on a path every command that raises a task goes through.
  return tx.task.create({
    data: {
      taskNo,
      recordKind: input.recordKind,
      recordId: input.recordId,
      recordName: input.recordName,
      purpose: input.purpose,
      title: input.title,
      assigneeRole: input.assigneeRole,
      assigneeStaffId: input.assigneeStaffId ?? null,
      dueAt: input.dueAt,
      urgent: input.urgent ?? false,
      decision: input.decision ?? false,
      latestResult: input.latestResult ?? null,
      recurrence: input.recurrence ?? "NONE",
      origin: input.origin ?? "SYSTEM",
      events: { create: { actorRef: "SYSTEM", action: "CREATED", toDue: input.dueAt } },
    },
  });
}

/** Completing a task is an event, never a delete. */
export async function completeTask(tx: Tx, taskId: string, actorRef: string, result?: string) {
  const task = await tx.task.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED" as TaskStatus,
      completedAt: new Date(),
      latestResult: result ?? "Marked Done",
    },
  });
  await tx.taskEvent.create({
    data: { taskId, actorRef, action: "COMPLETED", detail: result },
  });
  return task;
}

/** Revise keeps the task Pending and records the new date, result and remark. */
export async function reviseTask(
  tx: Tx,
  taskId: string,
  actorRef: string,
  dueAt: Date,
  result: string,
  remark?: string
) {
  const before = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
  const task = await tx.task.update({
    where: { id: taskId },
    data: {
      dueAt,
      status: "PENDING",
      revisions: before.revisions + 1,
      latestResult: remark ? `${result} — ${remark}` : result,
    },
  });
  await tx.taskEvent.create({
    data: {
      taskId,
      actorRef,
      action: "REVISED",
      detail: remark ? `${result} — ${remark}` : result,
      fromDue: before.dueAt,
      toDue: dueAt,
    },
  });
  return task;
}

/**
 * Closes a Pending task when the underlying process closes — used by Hold
 * expiry, Enquiry close and the schedulers. Idempotent.
 */
export async function closeTasksFor(
  tx: Tx,
  recordKind: string,
  recordId: string,
  actorRef: string,
  reason: string,
  purpose?: string
) {
  const tasks = await tx.task.findMany({
    where: { recordKind, recordId, status: "PENDING", ...(purpose ? { purpose } : {}) },
  });
  for (const task of tasks) await completeTask(tx, task.id, actorRef, reason);
  return tasks.length;
}

export function listTasks() {
  return db.task.findMany({ orderBy: { dueAt: "asc" } });
}

/* ------------------------------------------------------------ subjects */

/**
 * Resolves what each task is actually about — DESIGN §6.2.
 *
 * The Dashboard prints a Project, a Plot, a Member or Customer ID and a name in
 * columns of their own, and a task stores none of that: it stores a record kind,
 * an internal id and one line of display text somebody composed when they raised
 * it. So the records are read back here, one query per kind present, and the
 * parts are handed over separately.
 *
 * A task whose record cannot be resolved — a manual task typed against free
 * text, an unlinked one — simply gets no subject, and the row falls back to the
 * stored line. Nothing is invented to fill a column.
 */
export async function taskSubjects(
  rows: readonly { id: string; recordKind: string; recordId: string }[]
): Promise<Map<string, TaskSubject>> {
  const idsFor = (...kinds: string[]) => [
    ...new Set(rows.filter((r) => kinds.includes(r.recordKind)).map((r) => r.recordId)),
  ];

  const bookingIds = idsFor("Booking", "Booking Request");
  const enquiryIds = idsFor("Enquiry");
  const memberIds = idsFor("Member", "MemberProfile");
  const customerIds = idsFor("Customer");
  const plotIds = idsFor("Plot");
  const acquisitionIds = idsFor("Acquisition");
  const commissionIds = idsFor("Commission");

  /** A Person carries at most one of each id; the task is about the Person. */
  const party = (person: {
    fullName: string;
    memberProfile: { memberId: string } | null;
    customerProfile: { customerId: string } | null;
  }) => ({
    partyRef: person.memberProfile?.memberId ?? person.customerProfile?.customerId ?? null,
    partyName: person.fullName,
  });
  const personSelect = {
    fullName: true,
    memberProfile: { select: { memberId: true } },
    customerProfile: { select: { customerId: true } },
  } as const;

  const [bookings, enquiries, members, customers, plots, acquisitions, commissions] =
    await Promise.all([
      bookingIds.length
        ? db.booking.findMany({
            where: { id: { in: bookingIds } },
            select: {
              id: true,
              bookingNumber: true,
              requestNo: true,
              project: { select: { name: true } },
              plot: { select: { plotNumber: true } },
              primaryPerson: { select: personSelect },
            },
          })
        : [],
      enquiryIds.length
        ? db.enquiry.findMany({
            where: { id: { in: enquiryIds } },
            select: {
              id: true,
              enquiryNo: true,
              project: { select: { name: true } },
              plot: { select: { plotNumber: true } },
              person: { select: personSelect },
            },
          })
        : [],
      memberIds.length
        ? db.memberProfile.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, memberId: true, person: { select: { fullName: true } } },
          })
        : [],
      customerIds.length
        ? db.customerProfile.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, customerId: true, person: { select: { fullName: true } } },
          })
        : [],
      plotIds.length
        ? db.plot.findMany({
            where: { id: { in: plotIds } },
            select: { id: true, plotNumber: true, project: { select: { name: true } } },
          })
        : [],
      acquisitionIds.length
        ? db.acquisition.findMany({
            where: { id: { in: acquisitionIds } },
            select: {
              id: true,
              acquisitionNo: true,
              propertyName: true,
              propertyNumber: true,
              plot: { select: { plotNumber: true, project: { select: { name: true } } } },
              sellerPerson: { select: personSelect },
            },
          })
        : [],
      commissionIds.length
        ? db.commissionRecord.findMany({
            where: { id: { in: commissionIds } },
            select: {
              id: true,
              booking: {
                select: {
                  bookingNumber: true,
                  requestNo: true,
                  project: { select: { name: true } },
                  plot: { select: { plotNumber: true } },
                },
              },
              beneficiaryPerson: { select: personSelect },
            },
          })
        : [],
    ]);

  const subjects = new Map<string, TaskSubject>();
  const add = (recordId: string, subject: TaskSubject) => subjects.set(recordId, subject);

  for (const b of bookings) {
    add(b.id, {
      project: b.project.name,
      plot: b.plot.plotNumber,
      reference: b.bookingNumber ?? b.requestNo,
      ...party(b.primaryPerson),
    });
  }
  for (const e of enquiries) {
    add(e.id, {
      project: e.project.name,
      plot: e.plot?.plotNumber ?? null,
      reference: e.enquiryNo,
      ...party(e.person),
    });
  }
  for (const m of members) {
    add(m.id, {
      project: null,
      plot: null,
      reference: m.memberId,
      partyRef: m.memberId,
      partyName: m.person.fullName,
    });
  }
  for (const c of customers) {
    add(c.id, {
      project: null,
      plot: null,
      reference: c.customerId,
      partyRef: c.customerId,
      partyName: c.person.fullName,
    });
  }
  for (const p of plots) {
    add(p.id, {
      project: p.project.name,
      plot: p.plotNumber,
      reference: null,
      partyRef: null,
      partyName: null,
    });
  }
  for (const a of acquisitions) {
    // A Purchase for Resale has no Plot until approval, and carries the
    // external property's own name and number instead (main-PRD §17.4).
    add(a.id, {
      project: a.plot?.project.name ?? a.propertyName,
      plot: a.plot?.plotNumber ?? a.propertyNumber,
      reference: a.acquisitionNo,
      ...party(a.sellerPerson),
    });
  }
  for (const r of commissions) {
    add(r.id, {
      project: r.booking?.project.name ?? null,
      plot: r.booking?.plot.plotNumber ?? null,
      reference: r.booking?.bookingNumber ?? r.booking?.requestNo ?? null,
      ...party(r.beneficiaryPerson),
    });
  }

  return subjects;
}
