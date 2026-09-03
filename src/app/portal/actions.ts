"use server";

// Member portal commands — PRD.md §8, §23; DESIGN.md §13.
// Every command is scoped to the signed-in Member. The portal never returns
// another Person's details, buyer identity or internal remarks.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/security/current-actor";
import { blocked, CommandError, nextReference, runCommand } from "@/lib/services/command";
import { submitHoldRequest, withdrawHoldRequest } from "@/lib/services/hold-service";
import {
  ENQUIRY_FOLLOW_UP_PURPOSE,
  defaultCrmAssignee,
  linkOrCreatePerson,
} from "@/lib/services/enquiry-service";
import { ensureTask } from "@/lib/services/task-service";
import { formatIst } from "@/lib/tasks";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

/** PRD §23.2 — Source is automatically By Member and the Enquiry goes to CRM. */
export async function addMemberEnquiryAction(
  input: { fullName: string; mobile: string; city: string; projectId: string; plotId: string; remark: string },
  key: string
): Promise<ActionResult> {
  const member = await requireMember();
  try {
    const result = await runCommand(
      {
        idempotencyKey: key,
        operation: "MEMBER_ENQUIRY_CREATE",
        actorRef: `MEMBER:${member.memberId}`,
        actorRole: "MEMBER",
        payload: input,
      },
      async (tx) => {
        const person = await linkOrCreatePerson(tx, {
          fullName: input.fullName,
          mobile: input.mobile,
          city: input.city,
        });

        const duplicate = await tx.enquiry.findFirst({
          where: {
            personId: person.id,
            projectId: input.projectId,
            plotId: input.plotId || null,
            status: "ACTIVE",
          },
        });
        if (duplicate) {
          // Do not reveal whose Enquiry it is or who is handling it.
          blocked(
            "An Active Enquiry already exists for this buyer and Project. CRM is following it up — " +
              "no new Enquiry was created."
          );
        }

        const crm = await defaultCrmAssignee(tx);
        const enquiryNo = await nextReference(tx, "ENQ", "Enquiry");
        const project = await tx.project.findUniqueOrThrow({ where: { id: input.projectId } });

        const enquiry = await tx.enquiry.create({
          data: {
            enquiryNo,
            personId: person.id,
            projectId: input.projectId,
            plotId: input.plotId || null,
            source: "BY_MEMBER",
            sourceMemberId: member.memberProfileId,
            assignedStaffId: crm.id,
            remark: input.remark,
          },
        });

        // CR-001 — a Member-sourced Enquiry has no earning effect. The Member
        // keeps the follow-up relationship and nothing else.

        await ensureTask(tx, {
          recordKind: "Enquiry",
          recordId: enquiry.id,
          recordName: `${person.fullName} — ${project.name}`,
          purpose: ENQUIRY_FOLLOW_UP_PURPOSE,
          title: "Enquiry Follow-up",
          assigneeRole: "CRM",
          assigneeStaffId: crm.id,
          dueAt: new Date(Date.now() + 86_400_000),
          latestResult: `Submitted by Member ${member.memberId}`,
        });

        return {
          result: { enquiryNo },
          audit: {
            entity: "Enquiry",
            entityId: enquiry.id,
            action: "ENQUIRY_CREATED_BY_MEMBER",
            after: { enquiryNo, memberId: member.memberId },
          },
        };
      }
    );

    revalidatePath("/portal");
    revalidatePath("/enquiries");
    revalidatePath("/dashboard");
    return { ok: true, message: `Enquiry ${result.enquiryNo} submitted and assigned to CRM.` };
  } catch (error) {
    return toResult(error);
  }
}

/** PRD §8.1 — a Member Hold Request must name the actual Customer/Person. */
export async function submitHoldRequestAction(
  plotId: string,
  personId: string,
  key: string
): Promise<ActionResult> {
  const member = await requireMember();
  try {
    // Scope check: the Member may only request for themselves or for a Person
    // they introduced through their own Enquiry.
    const allowed =
      personId === member.personId ||
      (await db.enquiry.count({
        where: { personId, sourceMemberId: member.memberProfileId },
      })) > 0;
    if (!allowed) {
      return {
        ok: false,
        error: "Select yourself or a buyer you introduced through your own Enquiry.",
      };
    }

    const result = await submitHoldRequest({
      idempotencyKey: key,
      actorRef: `MEMBER:${member.memberId}`,
      memberProfileId: member.memberProfileId,
      personId,
      plotId,
    });

    revalidatePath("/portal");
    revalidatePath("/plots");
    return {
      ok: true,
      message: result.duplicate
        ? `A Pending request for this buyer and Plot already exists. It expires ${formatIst(result.expiresAt)}.`
        : `Hold Request submitted. It expires ${formatIst(result.expiresAt)} unless CRM decides sooner.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function withdrawHoldRequestAction(requestId: string, key: string): Promise<ActionResult> {
  const member = await requireMember();
  try {
    await withdrawHoldRequest({
      idempotencyKey: key,
      actorRef: `MEMBER:${member.memberId}`,
      memberProfileId: member.memberProfileId,
      requestId,
    });
    revalidatePath("/portal");
    revalidatePath("/plots");
    return { ok: true, message: "Hold Request withdrawn." };
  } catch (error) {
    return toResult(error);
  }
}
