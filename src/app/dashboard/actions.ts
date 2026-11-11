"use server";

import { actionErrorText } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { blocked, CommandError, runCommand } from "@/lib/services/command";
import { completeTask, ensureTask, reviseTask } from "@/lib/services/task-service";
import { FOLLOW_UP_PURPOSES, isRecurrence, reviseGroup, reviseProblem } from "@/lib/tasks";
import type { StaffRole } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { personLabel, type PickerOption } from "@/lib/domain/person-search";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: actionErrorText(error, "Action failed.") };
}

/** The Task List's own scope (page.tsx): MD any task; others theirs by name or their role's unnamed ones. */
function refuseOthersTask(
  task: { assigneeStaffId: string | null; assigneeRole: string },
  actor: { role: StaffRole; accountId: string }
) {
  if (actor.role === "MD") return;
  if (task.assigneeStaffId ? task.assigneeStaffId === actor.accountId : task.assigneeRole === actor.role) return;
  blocked("This task is not on your Task List.");
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
        refuseOthersTask(task, actor);
        if (task.status === "COMPLETED") {
          return { result: { taskId }, audit: { entity: "Task", entityId: taskId, action: "TASK_ALREADY_COMPLETE" } };
        }
        if (task.decision) blocked("Approve or Reject this on the record's review, not with Done.");
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
        // Owner, 2 Nov 2026 — the Result must be one of this task's group, and a
        // remark is compulsory where the group or "Other" asks for one.
        const task = await tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: { purpose: true, decision: true, assigneeStaffId: true, assigneeRole: true },
        });
        refuseOthersTask(task, actor);
        const problem = reviseProblem(reviseGroup(task), result, remark);
        if (problem) blocked(problem);
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

/** The record kinds a manual task can be linked to from the Add Task form. */
export type TaskLinkKind = "Plot" | "Enquiry" | "Member" | "Customer";

/**
 * Owner, 11 Nov 2026 — Link to is a searchable list, not a typed ID. Each
 * option carries the record's own database id, the one the Task List resolves
 * into its Project / Plot / ID / Name columns and opens on click; the label
 * is what is searched and what the task stores as its record name.
 */
export async function taskLinkOptionsAction(kind: TaskLinkKind): Promise<PickerOption[]> {
  await requireStaff("TASK_CREATE");
  if (kind === "Plot") {
    const plots = await db.plot.findMany({
      select: { id: true, plotNumber: true, plotType: true, project: { select: { name: true } } },
      orderBy: [{ project: { name: "asc" } }, { plotNumber: "asc" }],
      take: 2000,
    });
    return plots.map((p) => ({
      id: p.id,
      // RESIDENTIAL → Residential, INFORMAL_SECTOR → Informal Sector, as the lists read.
      label: `${p.project.name} · ${p.plotType
        .toLowerCase()
        .replace(/(^|_)([a-z])/g, (_, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase())} ${p.plotNumber}`,
    }));
  }
  if (kind === "Enquiry") {
    const enquiries = await db.enquiry.findMany({
      select: {
        id: true,
        enquiryNo: true,
        person: { select: { fullName: true } },
        project: { select: { name: true } },
        plot: { select: { plotNumber: true } },
      },
      // Open ones first, newest first: a task is nearly always for a live lead.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 1000,
    });
    return enquiries.map((e) => ({
      id: e.id,
      label: [e.enquiryNo, e.person.fullName, [e.project.name, e.plot?.plotNumber].filter(Boolean).join(" ")].join(" · "),
    }));
  }
  const person = { select: { fullName: true, primaryMobile: true } } as const;
  if (kind === "Member") {
    const members = await db.memberProfile.findMany({
      select: { id: true, memberId: true, person },
      orderBy: { memberId: "asc" },
    });
    return members.map((m) => ({
      id: m.id,
      label: personLabel({ ...m.person, mobileMasked: maskMobile(m.person.primaryMobile), memberId: m.memberId }, "MEMBER"),
    }));
  }
  const customers = await db.customerProfile.findMany({
    select: { id: true, customerId: true, person },
    orderBy: { customerId: "asc" },
  });
  return customers.map((c) => ({
    id: c.id,
    label: personLabel({ ...c.person, mobileMasked: maskMobile(c.person.primaryMobile), customerId: c.customerId }),
  }));
}

export async function addTaskAction(
  input: {
    title: string;
    /** "STAFF:<account id>" — the one person the task is for. */
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
  if (!isRecurrence(input.recurrence)) return { ok: false, error: "Choose how the task repeats." };
  const purpose = `MANUAL:${input.title.trim().toUpperCase()}`;
  // Owner, 11 Nov 2026 — a manual task goes to one named person; "Anyone in a
  // role" is gone. The person is saved, and the task carries their role too.
  const [kind, value] = input.assignee.split(":");
  if (kind !== "STAFF" || !value) return { ok: false, error: "Choose who the task is for." };
  const person = await db.staffAccount.findFirst({
    where: { id: value, status: "ACTIVE" },
    select: { id: true, role: true },
  });
  if (!person) return { ok: false, error: "That staff member is not active. Choose someone else." };
  const assigneeRole = person.role as StaffRole;
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
