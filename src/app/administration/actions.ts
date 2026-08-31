"use server";

// Administration — PRD.md §17.2, §22; DESIGN.md §17.
// Every action re-checks permission on the server; the hidden button is never
// the control (DESIGN §1).

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import {
  can,
  canViewField,
  isAction,
  refuseStaffAccountFor,
  type Action,
  type StaffRole,
} from "@/lib/security/permissions";
import { hashPassword, validatePassword } from "@/lib/security/auth";
import { decryptSensitive, maskAadhaar, maskMobile } from "@/lib/security/identity";
import { recordAudit } from "@/lib/security/audit";
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
 * Disable and password reset both bump the target's session version, so aiming
 * either at your own row signs you out inside the action. `refresh()` then
 * re-renders /administration, `requireStaff` sees the stale version and
 * redirects to /login — the modal unmounts before it can paint the one-time
 * password, and that password exists nowhere else. Own password changes belong
 * on /account, which re-issues the cookie; recovery from here needs another
 * admin, or `npm run reset:password`.
 */
function refuseSelf(actorAccountId: string, staffAccountId: string) {
  if (actorAccountId === staffAccountId) {
    blocked("You cannot do this to your own account. Change your own password under My Account, or ask another Admin or the MD.");
  }
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
    refuseSelf(actor.accountId, staffAccountId);
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
 * PRD §3, §17.1 — Admin or MD creates a staff account. The password is issued
 * once, shown once, and the holder changes it at first sign in.
 *
 * Staff are the company's own employees, so their details are entered here
 * rather than picked out of the Person table. Nothing else in the application
 * creates an employee: a Person otherwise only appears by activating a Member
 * or through a Member-submitted Enquiry, and both of those are the people the
 * company sells to.
 *
 * DEVIATIONS.md D-01 — a Member or Customer is refused a staff account.
 * ARCHITECTURE §3.1 lists Staff beside Customer and Member as capabilities one
 * Person may hold; the business rule is that the two sides stay separate.
 */
export async function createStaffAccountAction(
  input: {
    fullName: string;
    mobile: string;
    city?: string;
    role: StaffRole;
    staffAccountId: string;
  },
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
        // The employee's name and mobile are business data, not secrets, but the
        // payload stays minimal for the same reason the password never enters it.
        payload: { role: input.role, staffAccountId: input.staffAccountId },
      },
      async (tx) => {
        const id = input.staffAccountId.trim().toUpperCase();
        if (!id) blocked("A Staff Account ID is required.");

        const fullName = input.fullName.trim();
        const primaryMobile = input.mobile.replace(/\s/g, "");
        if (!fullName || !primaryMobile) blocked("Enter the employee's full name and mobile number.");

        const clash = await tx.staffAccount.findUnique({ where: { staffAccountId: id } });
        if (clash) blocked(`Staff Account ID ${id} already exists.`);

        // Same match the Member and Enquiry paths use, so one human entered
        // twice does not become two Persons.
        // ponytail: mobile + name. A shared mobile under a different spelling
        // still slips through — Person Merge (PRD §22) is what catches that.
        const person = await tx.person.findFirst({
          where: {
            primaryMobile,
            fullName: { equals: fullName, mode: "insensitive" },
            mergeStatus: { not: "MERGED_AWAY" },
          },
          include: { memberProfile: true, customerProfile: true, staffAccount: true },
        });

        const refusal = refuseStaffAccountFor(person, primaryMobile);
        if (refusal) blocked(refusal);

        const personId =
          person?.id ??
          (
            await tx.person.create({
              data: { fullName, primaryMobile, city: input.city?.trim() || null },
            })
          ).id;

        // PRD §3.1 — exactly one active MD in normal operation. The database
        // enforces it too; this is the readable refusal.
        if (input.role === "MD") {
          const activeMd = await tx.staffAccount.findFirst({
            where: { role: "MD", status: "ACTIVE" },
          });
          if (activeMd) {
            blocked(
              `${activeMd.staffAccountId} is already the active MD. Disable that account first.`
            );
          }
        }

        const account = await tx.staffAccount.create({
          data: {
            staffAccountId: id,
            personId,
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
 * DESIGN §17.4 "Roles & Permissions" — a role is set when the account is
 * created and corrected here afterwards; until now there was no way to move
 * anyone at all.
 *
 * The change takes effect on the holder's very next request without signing
 * them out: `currentStaff` reads the role from the account on every request
 * rather than trusting the copy in the session token, so a demotion cannot be
 * outrun by staying logged in.
 */
export async function changeStaffRoleAction(
  staffAccountId: string,
  role: StaffRole,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ROLE_PERMISSION_MANAGE");
  if (!reason.trim()) return { ok: false, error: "A compulsory reason is required to change a role." };

  try {
    refuseSelf(actor.accountId, staffAccountId);

    const result = await runCommand<{ staffAccountId: string; from: StaffRole; to: StaffRole }>(
      {
        idempotencyKey: key,
        operation: "STAFF_ROLE_CHANGE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { staffAccountId, role, reason },
      },
      async (tx) => {
        const account = await tx.staffAccount.findUniqueOrThrow({ where: { id: staffAccountId } });
        if (account.status !== "ACTIVE") {
          blocked("This account is disabled. Re-enable it before changing the role.");
        }
        if (account.role === role) blocked(`${account.staffAccountId} is already ${role}.`);

        // PRD §3.1 — exactly one active MD, the same rule account creation applies.
        if (role === "MD") {
          const activeMd = await tx.staffAccount.findFirst({
            where: { role: "MD", status: "ACTIVE", id: { not: account.id } },
          });
          if (activeMd) {
            blocked(`${activeMd.staffAccountId} is already the active MD. Move that account first.`);
          }
        }

        // The old role's extra grants describe a job this person no longer has.
        const updated = await tx.staffAccount.update({
          where: { id: account.id },
          data: { role, extraPermissions: [] },
        });

        return {
          result: { staffAccountId: account.staffAccountId, from: account.role, to: updated.role },
          audit: {
            entity: "StaffAccount",
            entityId: account.id,
            action: "STAFF_ROLE_CHANGED",
            reason,
            before: { role: account.role, extraPermissions: account.extraPermissions },
            after: { role: updated.role, extraPermissions: [] },
          },
        };
      }
    );

    refresh();
    return {
      ok: true,
      message:
        `${result.staffAccountId} moved from ${result.from} to ${result.to}. Any extra permissions ` +
        `were cleared, and the change applies on their next action.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * DESIGN §17.4 — extra grants on top of the role baseline. Deny by default:
 * `can()` is the role's list OR this one, so an entry here only ever adds.
 *
 * PRD RD-05 — protected values are deliberately out of reach from here.
 * `canViewField` consults the role and nothing else, so Aadhaar, PAN and bank
 * cannot be opened by a grant; the screen shows them locked, and only a role
 * change moves them.
 */
export async function setStaffPermissionsAction(
  staffAccountId: string,
  permissions: string[],
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("ROLE_PERMISSION_MANAGE");
  if (!reason.trim()) return { ok: false, error: "A compulsory reason is required to change permissions." };

  // An unrecognised string in this column would sit there forever matching
  // nothing, so it is refused rather than stored.
  const unknown = permissions.filter((entry) => !isAction(entry));
  if (unknown.length > 0) {
    return { ok: false, error: `Not a known permission: ${unknown.join(", ")}.` };
  }

  try {
    refuseSelf(actor.accountId, staffAccountId);

    const result = await runCommand<{ staffAccountId: string; count: number }>(
      {
        idempotencyKey: key,
        operation: "STAFF_PERMISSIONS_SET",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { staffAccountId, permissions, reason },
      },
      async (tx) => {
        const account = await tx.staffAccount.findUniqueOrThrow({ where: { id: staffAccountId } });
        if (account.status !== "ACTIVE") {
          blocked("This account is disabled. Re-enable it before changing permissions.");
        }

        // Anything the role already grants is noise in this column: it would
        // survive a later role change as a grant nobody chose to give.
        const extra = (permissions as Action[]).filter(
          (action) => !can(account.role, action)
        );

        const updated = await tx.staffAccount.update({
          where: { id: account.id },
          data: { extraPermissions: extra },
        });

        return {
          result: { staffAccountId: account.staffAccountId, count: extra.length },
          audit: {
            entity: "StaffAccount",
            entityId: account.id,
            action: "STAFF_PERMISSIONS_SET",
            reason,
            before: { extraPermissions: account.extraPermissions },
            after: { extraPermissions: updated.extraPermissions },
          },
        };
      }
    );

    refresh();
    return {
      ok: true,
      message:
        result.count === 0
          ? `${result.staffAccountId} now holds the role baseline only.`
          : `${result.staffAccountId} now holds ${result.count} extra permission(s), effective immediately.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §17.1 — the recovery path for a forgotten password. Admin or MD sets a
 * new password, every existing session dies, and the holder changes it at next
 * sign in. MFA enrolment is untouched.
 *
 * `chosenPassword` is optional: leave it empty and an 18-character one-time
 * password is generated instead. Either way it is shown once and never stored
 * in readable form.
 */
export async function resetStaffPasswordAction(
  staffAccountId: string,
  reason: string,
  key: string,
  chosenPassword?: string
): Promise<{ ok: true; message: string; oneTimePassword: string } | { ok: false; error: string }> {
  const actor = await requireStaff("STAFF_MANAGE");
  if (actor.accountId === staffAccountId) {
    return { ok: false, error: "You cannot reset your own password here — it would sign you out before the new password is shown. Use My Account, or ask another Admin or the MD." };
  }
  if (!reason.trim()) return { ok: false, error: "A compulsory reason is required to reset a password." };

  const chosen = (chosenPassword ?? "").trim();
  if (chosen) {
    const weak = validatePassword(chosen);
    if (weak) return { ok: false, error: weak };
  }
  const password = chosen || oneTimePassword();

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
      message: `${result.staffAccountId} reset. Every session is signed out. Give them this password — it is shown only now.`,
      oneTimePassword: password,
    };
  } catch (error) {
    const failure = toResult(error);
    return failure as { ok: false; error: string };
  }
}

/* ---------------------------------------------------------- staff detail */

export type StaffDetail = {
  id: string;
  staffAccountId: string;
  /** Needed so the detail view can call the existing reveal action. */
  personId: string;
  fullName: string;
  primaryMobile: string;
  altMobile: string | null;
  email: string | null;
  city: string | null;
  aadhaarStatus: string;
  aadhaarLastFour: string | null;
  panStatus: string;
  panMasked: string | null;
  role: StaffRole;
  extraPermissions: string[];
  status: string;
  emergencyDisabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  openTasks: number;
  openEnquiries: number;
};

/**
 * Everything held about one employee, loaded when their name is opened rather
 * than carried on every row of the list.
 *
 * Aadhaar and PAN come back as status and last four only. The full value has
 * one route in or out of this application — `revealIdentityAction`, which logs
 * every single read against the Person (PRD RD-05) — and this is not a second
 * one.
 */
export async function staffDetailAction(
  staffAccountId: string
): Promise<{ ok: true; detail: StaffDetail } | { ok: false; error: string }> {
  await requireStaff("STAFF_MANAGE");

  const account = await db.staffAccount.findUnique({
    where: { id: staffAccountId },
    include: {
      person: true,
      _count: { select: { assignedTasks: true, assignedEnquiries: true } },
    },
  });
  if (!account) return { ok: false, error: "That staff account no longer exists." };

  return {
    ok: true,
    detail: {
      id: account.id,
      staffAccountId: account.staffAccountId,
      personId: account.personId,
      fullName: account.person.fullName,
      // Whoever administers staff may phone them; see the note in page.tsx.
      primaryMobile: account.person.primaryMobile,
      altMobile: account.person.altMobile,
      email: account.person.email,
      city: account.person.city,
      aadhaarStatus: account.person.aadhaarStatus,
      aadhaarLastFour: account.person.aadhaarLastFour,
      panStatus: account.person.panStatus,
      panMasked: account.person.panMasked,
      role: account.role,
      extraPermissions: account.extraPermissions,
      status: account.status,
      emergencyDisabled: account.emergencyDisabled,
      createdAt: account.createdAt.toISOString(),
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      disabledAt: account.disabledAt?.toISOString() ?? null,
      disabledReason: account.disabledReason,
      openTasks: account._count.assignedTasks,
      openEnquiries: account._count.assignedEnquiries,
    },
  };
}

/**
 * Correcting what was taken down when the account was created — a mistyped
 * mobile, a move to another city, an email nobody had at the time.
 *
 * Date of birth and address are deliberately absent: main-PRD.md lists both as
 * Aadhaar fields, so they belong with the protected values and their logged
 * reveal, not in a plain contact form.
 */
export async function updateStaffDetailsAction(
  staffAccountId: string,
  input: { fullName: string; mobile: string; altMobile: string; email: string; city: string },
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("STAFF_MANAGE");
  if (!reason.trim()) return { ok: false, error: "A compulsory reason is required to change details." };

  const fullName = input.fullName.trim();
  const primaryMobile = input.mobile.replace(/\s/g, "");
  if (!fullName || !primaryMobile) return { ok: false, error: "Full name and mobile are both required." };

  try {
    const result = await runCommand<{ staffAccountId: string }>(
      {
        idempotencyKey: key,
        operation: "STAFF_DETAILS_UPDATE",
        actorRef: actor.staffAccountId,
        actorRole: actor.role,
        payload: { staffAccountId, reason },
      },
      async (tx) => {
        const account = await tx.staffAccount.findUniqueOrThrow({
          where: { id: staffAccountId },
          include: { person: true },
        });

        // D-06 again, from the other side: editing a staff member onto a
        // Member's or Customer's identity would smuggle in what creation
        // refuses. The Person being edited is itself excluded from the match.
        const clash = await tx.person.findFirst({
          where: {
            id: { not: account.personId },
            primaryMobile,
            fullName: { equals: fullName, mode: "insensitive" },
            mergeStatus: { not: "MERGED_AWAY" },
          },
          include: { memberProfile: true, customerProfile: true, staffAccount: true },
        });
        const refusal = refuseStaffAccountFor(clash, primaryMobile);
        if (refusal) blocked(refusal);

        const before = account.person;
        const person = await tx.person.update({
          where: { id: account.personId },
          data: {
            fullName,
            primaryMobile,
            altMobile: input.altMobile.replace(/\s/g, "") || null,
            email: input.email.trim() || null,
            city: input.city.trim() || null,
          },
        });

        return {
          result: { staffAccountId: account.staffAccountId },
          audit: {
            entity: "Person",
            entityId: person.id,
            action: "STAFF_DETAILS_UPDATED",
            reason,
            // Contact details are business data, not protected values — the
            // Aadhaar and PAN columns are untouched and never enter the audit.
            before: {
              fullName: before.fullName,
              primaryMobile: before.primaryMobile,
              altMobile: before.altMobile,
              email: before.email,
              city: before.city,
            },
            after: {
              fullName: person.fullName,
              primaryMobile: person.primaryMobile,
              altMobile: person.altMobile,
              email: person.email,
              city: person.city,
            },
          },
        };
      }
    );

    refresh();
    return { ok: true, message: `${result.staffAccountId} details updated.` };
  } catch (error) {
    return toResult(error);
  }
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
 * only, and **every** access is written to the Activity History with the Person it
 * was read for. Nothing here is cached: each look-up is its own logged event.
 */
export async function revealIdentityAction(
  personId: string
): Promise<{ ok: true; reveal: IdentityReveal } | { ok: false; error: string }> {
  const actor = await requireStaff();

  if (!canViewField(actor.role, "AADHAAR_FULL")) {
    await recordAudit({
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      entity: "Person",
      entityId: personId,
      action: "IDENTITY_REVEAL_DENIED",
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

  await recordAudit({
    actorRef: actor.staffAccountId,
    actorRole: actor.role,
    entity: "Person",
    entityId: person.id,
    action: "IDENTITY_REVEALED",
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
