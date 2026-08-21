"use server";

// Administration — PRD.md §17.2, §22; DESIGN.md §17.
// Every action re-checks permission on the server; the hidden button is never
// the control (DESIGN §1).

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { canViewField, type StaffRole } from "@/lib/security/permissions";
import { hashPassword } from "@/lib/security/auth";
import { decryptSensitive, maskAadhaar, maskMobile } from "@/lib/security/identity";
import { recordSecurityEvent } from "@/lib/security/audit";
import { CommandError, blocked, runCommand } from "@/lib/services/command";
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

/* ------------------------------------------- staff accounts (PRD §17.1) */

/** A one-time password is shown once and never stored in clear anywhere. */
function oneTimePassword(): string {
  // 18 base32 characters — comfortably above the 10-character minimum and easy
  // to read out over a phone without ambiguous characters.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(18);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * PRD §3, §17.1 — Admin or MD creates a staff account against a Person. The
 * password is issued once, shown once, and the holder changes it at first sign
 * in. MD and Admin must additionally enrol MFA before their access is complete.
 */
export async function createStaffAccountAction(
  input: { personId: string; role: StaffRole; staffAccountId: string },
  key: string
): Promise<{ ok: true; message: string; oneTimePassword: string } | { ok: false; error: string }> {
  const actor = await requireStaff("STAFF_MANAGE");
  const password = oneTimePassword();

  try {
    const result = await runCommand<{ staffAccountId: string; id: string }>(
      {
        idempotencyKey: key,
        operation: "STAFF_CREATE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { personId: input.personId, role: input.role, staffAccountId: input.staffAccountId },
      },
      async (tx) => {
        const id = input.staffAccountId.trim().toUpperCase();
        if (!id) blocked("A Staff Account ID is required.");

        const clash = await tx.staffAccount.findUnique({ where: { staffAccountId: id } });
        if (clash) blocked(`Staff Account ID ${id} already exists.`);

        // ARCHITECTURE §3.1 — one Person, many capabilities, but one staff login.
        const existing = await tx.staffAccount.findUnique({
          where: { personId: input.personId },
        });
        if (existing) {
          blocked(`This Person already holds staff account ${existing.staffAccountId}.`);
        }

        // PRD §3.1 — exactly one active MD in normal operation. The database
        // enforces it too; this is the readable refusal.
        if (input.role === "MD") {
          const activeMd = await tx.staffAccount.findFirst({
            where: { role: "MD", status: "ACTIVE" },
          });
          if (activeMd) {
            blocked(
              `${activeMd.staffAccountId} is already the active MD. Disable that account first ` +
                `(PRD §3.1).`
            );
          }
        }

        const account = await tx.staffAccount.create({
          data: {
            staffAccountId: id,
            personId: input.personId,
            role: input.role,
            passwordHash: hashPassword(password),
          },
        });

        return {
          result: { staffAccountId: account.staffAccountId, id: account.id },
          audit: {
            entity: "StaffAccount",
            entityId: account.id,
            action: "STAFF_CREATED",
            // The password never reaches audit, in any form (PRD §17.1).
            after: { staffAccountId: account.staffAccountId, role: account.role },
          },
        };
      }
    );

    refresh();
    return {
      ok: true,
      message: `${result.staffAccountId} created. Give them this one-time password — it is shown only now.`,
      oneTimePassword: password,
    };
  } catch (error) {
    const failure = toResult(error);
    return failure as { ok: false; error: string };
  }
}

/**
 * PRD §17.1 — the recovery path for a forgotten password. Admin or MD issues a
 * new one-time password, every existing session dies, and the holder changes it
 * at next sign in. MFA enrolment is untouched.
 */
export async function resetStaffPasswordAction(
  staffAccountId: string,
  reason: string,
  key: string
): Promise<{ ok: true; message: string; oneTimePassword: string } | { ok: false; error: string }> {
  const actor = await requireStaff("STAFF_MANAGE");
  if (!reason.trim()) return { ok: false, error: "A compulsory reason is required to reset a password." };

  const password = oneTimePassword();

  try {
    const result = await runCommand<{ staffAccountId: string }>(
      {
        idempotencyKey: key,
        operation: "STAFF_PASSWORD_RESET",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { staffAccountId, reason },
      },
      async (tx) => {
        const account = await tx.staffAccount.findUniqueOrThrow({ where: { id: staffAccountId } });
        if (account.status !== "ACTIVE") {
          blocked("This account is disabled. Re-enable it before resetting the password.");
        }

        await tx.staffAccount.update({
          where: { id: account.id },
          data: {
            passwordHash: hashPassword(password),
            // Every existing session dies with the version bump (PRD §17.1).
            sessionVersion: account.sessionVersion + 1,
            failedAttempts: 0,
            lockedUntil: null,
          },
        });

        await tx.securityEvent.create({
          data: {
            type: "SESSION_INVALIDATED",
            identifier: account.staffAccountId,
            detail: `Password reset by ${actor.staffAccountId} — ${reason}`,
          },
        });

        return {
          result: { staffAccountId: account.staffAccountId },
          audit: {
            entity: "StaffAccount",
            entityId: account.id,
            action: "STAFF_PASSWORD_RESET",
            reason,
          },
        };
      }
    );

    refresh();
    return {
      ok: true,
      message: `${result.staffAccountId} reset. Every session is signed out. Give them this one-time password — it is shown only now.`,
      oneTimePassword: password,
    };
  } catch (error) {
    const failure = toResult(error);
    return failure as { ok: false; error: string };
  }
}

/** People who could still be given a staff account. */
export async function staffCandidatesAction(): Promise<PersonOption[]> {
  await requireStaff("STAFF_MANAGE");
  const persons = await db.person.findMany({
    where: { staffAccount: null, mergeStatus: { not: "MERGED_AWAY" } },
    select: { id: true, fullName: true, primaryMobile: true },
    orderBy: { fullName: "asc" },
    take: 300,
  });
  return persons.map((person) => ({
    id: person.id,
    label: `${person.fullName} · ${maskMobile(person.primaryMobile)}`,
  }));
}

/* ------------------------------------- protected identity (PRD RD-05) */

export type IdentityReveal = {
  personId: string;
  fullName: string;
  aadhaar: string | null;
  aadhaarStatus: string;
  pan: string | null;
  panStatus: string;
};

/**
 * PRD RD-05, §14 — Aadhaar and PAN are stored as fields, never as uploads, and
 * are masked everywhere by default. The full value is available to MD and Admin
 * only, and **every** access is written to the security log with the Person it
 * was read for. Nothing here is cached: each look-up is its own logged event.
 */
export async function revealIdentityAction(
  personId: string
): Promise<{ ok: true; reveal: IdentityReveal } | { ok: false; error: string }> {
  const actor = await requireStaff();

  if (!canViewField(actor.role, "AADHAAR_FULL")) {
    await recordSecurityEvent({
      type: "PERMISSION_DENIED",
      identifier: actor.staffAccountId,
      detail: `${actor.role} attempted AADHAAR_FULL on Person ${personId}`,
    });
    return {
      ok: false,
      error: `${actor.role} is not permitted to view a full Aadhaar Number. Only MD and Admin are.`,
    };
  }

  const person = await db.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      fullName: true,
      aadhaarCipher: true,
      aadhaarStatus: true,
      panCipher: true,
      panStatus: true,
    },
  });
  if (!person) return { ok: false, error: "Person not found." };

  await recordSecurityEvent({
    type: "SENSITIVE_ACCESS",
    identifier: actor.staffAccountId,
    detail: `AADHAAR_FULL + PAN_FULL on Person ${person.id} (${person.fullName})`,
  });

  return {
    ok: true,
    reveal: {
      personId: person.id,
      fullName: person.fullName,
      aadhaar: person.aadhaarCipher ? decryptSensitive(person.aadhaarCipher) : null,
      aadhaarStatus: person.aadhaarStatus,
      pan: person.panCipher ? decryptSensitive(person.panCipher) : null,
      panStatus: person.panStatus,
    },
  };
}

/** Everyone with a protected identity on file, for the Administration list. */
export async function identityDirectoryAction(query: string) {
  await requireStaff("STAFF_MANAGE");
  const term = query.trim();

  const persons = await db.person.findMany({
    where: {
      mergeStatus: { not: "MERGED_AWAY" },
      ...(term.length >= 2
        ? {
            OR: [
              { fullName: { contains: term, mode: "insensitive" as const } },
              { primaryMobile: { contains: term } },
              { customerProfile: { customerId: { contains: term, mode: "insensitive" as const } } },
              { memberProfile: { memberId: { contains: term, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: { customerProfile: true, memberProfile: true },
    orderBy: { fullName: "asc" },
    take: 50,
  });

  // The list itself stays masked. Revealing is a separate, logged action.
  return persons.map((person) => ({
    id: person.id,
    fullName: person.fullName,
    reference: person.customerProfile?.customerId ?? person.memberProfile?.memberId ?? "—",
    mobileMasked: maskMobile(person.primaryMobile),
    aadhaarMasked: maskAadhaar(person.aadhaarLastFour),
    aadhaarStatus: person.aadhaarStatus,
    panMasked: person.panMasked ?? "—",
    panStatus: person.panStatus,
  }));
}
