"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { blocked, CommandError, runCommand } from "@/lib/services/command";
import { completeTask, ensureTask, reviseTask } from "@/lib/services/task-service";
import { FOLLOW_UP_PURPOSES } from "@/lib/tasks";
import type { StaffRole } from "@/lib/security/permissions";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

export async function completeTaskAction(taskId: string, key: string): Promise<ActionResult> {
  const actor = await requireStaff("TASK_COMPLETE");
  try {
    await runCommand(
      {
        idempotencyKey: key,
        operation: "TASK_COMPLETE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { taskId },
      },
      async (tx) => {
        const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
        if (task.status === "COMPLETED") {
          return { result: { taskId }, audit: { entity: "Task", entityId: taskId, action: "TASK_ALREADY_COMPLETE" } };
        }
        if (FOLLOW_UP_PURPOSES.includes(task.purpose)) {
          blocked("A follow-up closes when the follow-up or payment is recorded on its record, not with Done.");
        }
        await completeTask(tx, taskId, actor.staffAccountId);
        return { result: { taskId }, audit: { entity: "Task", entityId: taskId, action: "TASK_COMPLETED" } };
      }
    );
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function reviseTaskAction(
  taskId: string,
  dueAtIso: string,
  result: string,
  remark: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("TASK_COMPLETE");
  try {
    await runCommand(
      {
        idempotencyKey: key,
        operation: "TASK_REVISE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { taskId, dueAtIso, result, remark },
      },
      async (tx) => {
        await reviseTask(tx, taskId, actor.staffAccountId, new Date(dueAtIso), result, remark);
        return {
          result: { taskId },
          audit: { entity: "Task", entityId: taskId, action: "TASK_REVISED", reason: remark },
        };
      }
    );
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

/** The people a manual task can be given to: active staff, by name and role. */
export async function assignableStaffAction(): Promise<{ id: string; name: string; role: StaffRole }[]> {
  await requireStaff("TASK_CREATE");
  const staff = await db.staffAccount.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true, person: { select: { fullName: true } } },
    orderBy: [{ role: "asc" }, { person: { fullName: "asc" } }],
  });
  return staff.map((s) => ({ id: s.id, name: s.person.fullName, role: s.role as StaffRole }));
}

export async function addTaskAction(
  input: {
    title: string;
    /** "ROLE:CRM" — anyone in that role — or "STAFF:<account id>" — that person. */
    assignee: string;
    dueAtIso: string;
    urgent: boolean;
    recurrence: string;
    recordKind: string;
    recordId: string;
    recordName: string;
    remark: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("TASK_CREATE");
  const purpose = `MANUAL:${input.title.trim().toUpperCase()}`;
  // The chosen person is saved, and the task carries their role too.
  const [kind, value] = input.assignee.split(":");
  const person =
    kind === "STAFF"
      ? await db.staffAccount.findFirst({ where: { id: value, status: "ACTIVE" }, select: { id: true, role: true } })
      : null;
  if (kind === "STAFF" && !person) return { ok: false, error: "That staff member is not active. Choose someone else." };
  const assigneeRole = (person?.role ?? value) as StaffRole;
  if (!person && !["MD", "ACCOUNTS", "CRM", "MIS", "PC"].includes(assigneeRole)) return { ok: false, error: "Choose who the task is for." };
  const recordId = input.recordId.trim() || `UNLINKED:${actor.staffAccountId}`;

  try {
    // Record + Purpose duplicate check, reported before the write attempt so
    // the user sees which task already holds the slot (DESIGN §5.4).
    const existing = await db.task.findFirst({
      where: { recordKind: input.recordKind, recordId, purpose, status: "PENDING" },
    });
    if (existing) {
      return {
        ok: false,
        error:
          `A Pending task for ${input.recordKind} ${recordId} with purpose "${purpose}" already exists ` +
          `("${existing.title}"). One record may hold only one Pending task per purpose — revise that task instead.`,
      };
    }

    await runCommand(
      {
        idempotencyKey: key,
        operation: "TASK_CREATE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: input,
      },
      async (tx) => {
        const task = await ensureTask(tx, {
          recordKind: input.recordKind,
          recordId,
          recordName: input.recordName.trim() || "Not linked",
          purpose,
          title: input.title,
          assigneeRole,
          assigneeStaffId: person?.id ?? null,
          dueAt: new Date(input.dueAtIso),
          urgent: input.urgent,
          latestResult: input.remark || null,
          recurrence: input.recurrence,
          origin: "MANUAL",
        });
        return {
          result: { taskId: task.id },
          audit: { entity: "Task", entityId: task.id, action: "TASK_CREATED_MANUAL", after: input },
        };
      }
    );
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
