"use server";

import { actionErrorText } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { projectLabel } from "@/lib/utils";
import { requireStaff } from "@/lib/security/current-actor";
import { blocked, CommandError, runCommand } from "@/lib/services/command";
import { completeTask, ensureTask, reviseTask } from "@/lib/services/task-service";
import { FOLLOW_UP_PURPOSES, istDay, isRecurrence, reviseGroup, reviseProblem } from "@/lib/tasks";
import { MONETARY_TEXT_REFUSAL, monetaryText, paymentTrialEnabled } from "@/lib/domain/payment-percent";
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
  key: string,
  /** Payment trial — "Promised to Pay" on a payment follow-up: the promised day, YYYY-MM-DD. */
  promisedOn?: string
): Promise<ActionResult> {
  const actor = await requireStaff("TASK_COMPLETE");
  try {
    await runCommand(
      {
        idempotencyKey: key,
        operation: "TASK_REVISE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { taskId, dueAtIso, result, remark, promisedOn },
      },
      async (tx) => {
        // Owner, 2 Nov 2026 — the Result must be one of this task's group, and a
        // remark is compulsory where the group or "Other" asks for one.
        const task = await tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: { purpose: true, decision: true, assigneeStaffId: true, assigneeRole: true },
        });
        refuseOthersTask(task, actor);
        const group = reviseGroup(task);
        const problem = reviseProblem(group, result, remark);
        if (problem) blocked(problem);
        // Payment trial (revised brief §4.4, §8): a payment follow-up carries no rupee
        // amount, and "Promised to Pay" records the day apart from the due date.
        const trial = paymentTrialEnabled() && group === "PAYMENT";
        const promising = trial && result === "Promised to Pay";
        if (trial && monetaryText(remark)) blocked(MONETARY_TEXT_REFUSAL);
        if (promising && !/^\d{4}-\d{2}-\d{2}$/.test(promisedOn ?? "")) blocked("Enter the date the customer promised to pay.");
        if (promising && promisedOn! < istDay(new Date())) blocked("The promised date cannot be in the past.");
        await reviseTask(tx, taskId, actor.staffAccountId, new Date(dueAtIso), result, remark);
        if (promising) {
          await tx.task.update({ where: { id: taskId }, data: { promisedOn: new Date(`${promisedOn}T00:00:00Z`) } });
          await tx.taskEvent.create({
            data: { taskId, actorRef: actor.staffAccountId, action: "PAYMENT_PROMISED", detail: `Customer promised to pay by ${promisedOn}` },
          });
        }
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

/** Payment trial (revised brief §4.4) — a task's history, within the task's own Task List scope. */
export async function taskHistoryAction(
  taskId: string
): Promise<{ at: string; actorRef: string; action: string; detail: string | null }[]> {
  const actor = await requireStaff();
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { assigneeStaffId: true, assigneeRole: true, events: { orderBy: { at: "desc" }, take: 50 } },
  });
  refuseOthersTask(task, actor);
  return task.events.map((e) => ({ at: e.at.toISOString(), actorRef: e.actorRef, action: e.action, detail: e.detail }));
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
export type TaskLinkKind = "Project" | "Enquiry" | "Member" | "Customer";

/**
 * Owner, 11 Nov 2026 — Link to is a searchable list, not a typed ID. Each
 * option carries the record's own database id, the one the Task List resolves
 * into its Project / Plot / ID / Name columns and opens on click; the label
 * is what is searched and what the task stores as its record name.
 */
export async function taskLinkOptionsAction(kind: TaskLinkKind): Promise<PickerOption[]> {
  await requireStaff("TASK_CREATE");
  // Owner, 11 Nov 2026 — Link to names a Project; the Plot is its own optional
  // field under it (taskPlotOptionsAction).
  if (kind === "Project") {
    const projects = await db.project.findMany({ select: { id: true, name: true, projectCode: true }, orderBy: { name: "asc" } });
    return projects.map((p) => ({ id: p.id, label: projectLabel(p) }));
  }
  if (kind === "Enquiry") {
    const enquiries = await db.enquiry.findMany({
      select: {
        id: true,
        enquiryNo: true,
        person: { select: { fullName: true } },
        project: { select: { name: true, projectCode: true } },
        plot: { select: { plotNumber: true } },
      },
      // Open ones first, newest first: a task is nearly always for a live lead.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 1000,
    });
    return enquiries.map((e) => ({
      id: e.id,
      label: [e.enquiryNo, e.person.fullName, [projectLabel(e.project), e.plot?.plotNumber].filter(Boolean).join(" ")].join(" · "),
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

/** Every Plot, for Add Task's optional Plot field; projectId narrows it to a chosen Project. */
export async function taskPlotOptionsAction(): Promise<(PickerOption & { projectId: string })[]> {
  await requireStaff("TASK_CREATE");
  const plots = await db.plot.findMany({
    select: { id: true, projectId: true, plotNumber: true, plotType: true, project: { select: { name: true, projectCode: true } } },
    orderBy: [{ project: { name: "asc" } }, { plotNumber: "asc" }],
    take: 2000,
  });
  return plots.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    // RESIDENTIAL → Residential, INFORMAL_SECTOR → Informal Sector, as the lists read.
    label: `${projectLabel(p.project)} · ${p.plotType
      .toLowerCase()
      .replace(/(^|_)([a-z])/g, (_, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase())} ${p.plotNumber}`,
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
    /** Optional: the Plot the task is about, beside the linked record. */
    plotId?: string;
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
  const plotId = input.plotId?.trim() || null;
  if (plotId) {
    const plot = await db.plot.findUnique({ where: { id: plotId }, select: { projectId: true } });
    if (!plot) return { ok: false, error: "That Plot is no longer on file. Choose another." };
    if (input.recordKind === "Project" && input.recordId && plot.projectId !== input.recordId)
      return { ok: false, error: "That Plot is not in the chosen Project." };
  }

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
          plotId,
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
