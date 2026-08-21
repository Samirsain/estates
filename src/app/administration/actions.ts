"use server";

// Administration — PRD.md §17.2, §22; DESIGN.md §17.
// Every action re-checks permission on the server; the hidden button is never
// the control (DESIGN §1).

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import { disableStaffAccount, reassignWork } from "@/lib/services/admin-service";
import { decidePersonMerge, requestPersonMerge } from "@/lib/services/merge-service";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

function refresh() {
  revalidatePath("/administration");
  revalidatePath("/dashboard");
}

/**
 * PRD §17.2 — planned deactivation refuses while open work is still assigned.
 * Emergency Disable blocks the login immediately and queues that work instead.
 */
export async function disableStaffAction(
  staffAccountId: string,
  reason: string,
  emergency: boolean,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff(emergency ? "STAFF_EMERGENCY_DISABLE" : "STAFF_MANAGE");
  try {
    const result = await disableStaffAccount({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      staffAccountId,
      reason,
      emergency,
    });
    refresh();
    return {
      ok: true,
      message:
        result.queuedForReassignment > 0
          ? `Account disabled. ${result.queuedForReassignment} item(s) are in the Unassigned Review queue.`
          : "Account disabled. Every session has been signed out.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function reassignWorkAction(
  toStaffAccountId: string,
  taskIds: string[],
  enquiryIds: string[],
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("WORK_REASSIGN");
  try {
    const result = await reassignWork({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      toStaffAccountId,
      taskIds,
      enquiryIds,
    });
    refresh();
    return {
      ok: true,
      message: `Reassigned ${result.tasks} task(s) and ${result.enquiries} Enquiry(ies).`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/** PRD §22 — Admin or MD raises the merge; only the MD decides it. */
export async function requestPersonMergeAction(
  survivingPersonId: string,
  mergedPersonId: string,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PERSON_MERGE");
  try {
    await requestPersonMerge({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      survivingPersonId,
      mergedPersonId,
      reason,
    });
    refresh();
    return { ok: true, message: "Merge raised. It waits for the MD decision." };
  } catch (error) {
    return toResult(error);
  }
}

export async function decidePersonMergeAction(
  requestId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("PERSON_MERGE");
  try {
    const result = await decidePersonMerge({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      requestId,
      approve,
      note,
    });
    refresh();
    return {
      ok: true,
      message: approve
        ? `Merged. Loyalty rebuilt from unique qualifying events to ${result.loyaltyRebuiltTo}.`
        : "Merge rejected. Both identities stay exactly as they were.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export type PersonOption = { id: string; label: string };

/** Candidate identities for a merge, newest first, excluding merged-away rows. */
export async function searchPersonsAction(query: string): Promise<PersonOption[]> {
  await requireStaff("PERSON_MERGE");
  const term = query.trim();
  if (term.length < 2) return [];

  const persons = await db.person.findMany({
    where: {
      mergeStatus: { not: "MERGED_AWAY" },
      OR: [
        { fullName: { contains: term, mode: "insensitive" } },
        { primaryMobile: { contains: term } },
        { customerProfile: { customerId: { contains: term, mode: "insensitive" } } },
        { memberProfile: { memberId: { contains: term, mode: "insensitive" } } },
      ],
    },
    include: { customerProfile: true, memberProfile: true },
    orderBy: { fullName: "asc" },
    take: 20,
  });

  return persons.map((person) => ({
    id: person.id,
    label: [
      person.fullName,
      person.customerProfile?.customerId,
      person.memberProfile?.memberId,
      person.memberProfile ? `Member ${person.memberProfile.status}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}
