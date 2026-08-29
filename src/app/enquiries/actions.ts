"use server";

import type { EnquirySource, FollowUpOutcome } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import { closeEnquiry, createEnquiry, recordFollowUp } from "@/lib/services/enquiry-service";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

export async function createEnquiryAction(
  input: {
    /** Blank when the caller is new: fullName and mobile carry them instead. */
    personId: string;
    fullName: string;
    mobile: string;
    city: string;
    projectId: string;
    plotId: string;
    /** Used when no Plot is named: the size or facing they asked for. */
    plotRequirement: string;
    source: EnquirySource;
    sourceMemberId: string;
    sourceCustomerId: string;
    /** DESIGN §8.2 Assigned CRM. Blank keeps the Enquiry with whoever took it. */
    assignedStaffId: string;
    nextFollowUpIso: string;
    remark: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ENQUIRY_MANAGE");
  try {
    // The follow-up task goes to the named staff account. Reading its role here
    // keeps the task's assigneeRole and assigneeStaffId describing one person.
    const assignedStaffId = input.assignedStaffId || actor.accountId;
    const assignee =
      assignedStaffId === actor.accountId
        ? { role: actor.role, status: "ACTIVE" as const }
        : await db.staffAccount.findUnique({
            where: { id: assignedStaffId },
            select: { role: true, status: true },
          });
    if (!assignee || assignee.status !== "ACTIVE") {
      return { ok: false, error: "That staff account is not active. Pick someone else." };
    }

    const result = await createEnquiry({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      personId: input.personId || null,
      newPerson: input.personId
        ? null
        : { fullName: input.fullName, mobile: input.mobile, city: input.city },
      projectId: input.projectId,
      plotId: input.plotId || null,
      plotRequirement: input.plotRequirement,
      source: input.source,
      sourceMemberId: input.sourceMemberId || null,
      sourceCustomerId: input.sourceCustomerId || null,
      assignedStaffId,
      assigneeRole: assignee.role === "MD" || assignee.role === "ADMIN" ? assignee.role : "CRM",
      nextFollowUpAt: new Date(input.nextFollowUpIso),
      remark: input.remark,
    });
    revalidatePath("/enquiries");
    revalidatePath("/dashboard");
    return { ok: true, message: `Enquiry ${result.enquiryNo} created with a Pending follow-up task.` };
  } catch (error) {
    return toResult(error);
  }
}

export async function followUpAction(
  enquiryId: string,
  outcome: FollowUpOutcome,
  remark: string,
  nextIso: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ENQUIRY_MANAGE");
  try {
    await recordFollowUp({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      enquiryId,
      outcome,
      remark,
      nextAt: new Date(nextIso),
    });
    revalidatePath("/enquiries");
    revalidatePath("/dashboard");
    return { ok: true, message: "Follow-up recorded. The same Pending task now carries the new date." };
  } catch (error) {
    return toResult(error);
  }
}

export async function closeEnquiryAction(
  enquiryId: string,
  closeReason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ENQUIRY_MANAGE");
  try {
    await closeEnquiry({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      enquiryId,
      closeReason,
    });
    revalidatePath("/enquiries");
    revalidatePath("/dashboard");
    return { ok: true, message: "Enquiry closed and its follow-up task completed." };
  } catch (error) {
    return toResult(error);
  }
}

/** Follow-up history for one Enquiry (DESIGN §8.3). */
export async function loadFollowUps(enquiryId: string) {
  await requireStaff();
  const rows = await db.enquiryFollowUp.findMany({
    where: { enquiryId },
    orderBy: { at: "desc" },
    take: 20,
  });
  return rows.map((r) => ({
    at: r.at.toISOString(),
    outcome: r.outcome,
    remark: r.remark,
    nextAt: r.nextAt?.toISOString() ?? null,
    actorRef: r.actorRef,
  }));
}
