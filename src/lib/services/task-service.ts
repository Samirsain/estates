// Task service — PRD.md §20; DESIGN.md §6.
// The duplicate-prevention key is Record + Purpose, backed by a partial unique
// index, so a retry or a concurrent job cannot create a second Pending task.

import type { StaffRole, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
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
  const task = await tx.task.create({
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
    },
  });
  await tx.taskEvent.create({
    data: { taskId: task.id, actorRef: "SYSTEM", action: "CREATED", toDue: task.dueAt },
  });
  return task;
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
