// Server-side actor resolution. Every request re-checks role, account status
// and session version — a valid-looking cookie is never trusted on its own
// (ARCHITECTURE.md §9.2, PHASES.md Phase 1 "direct URL cannot bypass").

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordSecurityEvent } from "./audit";
import {
  PermissionError,
  can,
  type Action,
  type StaffRole,
} from "./permissions";
import { SESSION_COOKIE_MEMBER, SESSION_COOKIE_STAFF, verifySession } from "./session";

export type StaffActor = {
  context: "STAFF";
  accountId: string;
  staffAccountId: string;
  role: StaffRole;
  extraPermissions: string[];
  name: string;
};

export type MemberActor = {
  context: "MEMBER";
  accountId: string;
  /** MemberProfile.id — the key every portal command is scoped to. */
  memberProfileId: string;
  personId: string;
  memberId: string;
  name: string;
};

export async function currentStaff(): Promise<StaffActor | null> {
  const token = (await cookies()).get(SESSION_COOKIE_STAFF)?.value;
  const payload = verifySession(token, "STAFF");
  if (!payload) return null;

  const account = await db.staffAccount.findUnique({
    where: { id: payload.accountId },
    include: { person: true },
  });
  // Disabled accounts and password resets invalidate the session immediately.
  if (!account || account.status !== "ACTIVE") return null;
  if (account.sessionVersion !== payload.sessionVersion) return null;

  return {
    context: "STAFF",
    accountId: account.id,
    staffAccountId: account.staffAccountId,
    role: account.role,
    extraPermissions: account.extraPermissions,
    name: account.person.fullName,
  };
}

export async function currentMember(): Promise<MemberActor | null> {
  const token = (await cookies()).get(SESSION_COOKIE_MEMBER)?.value;
  const payload = verifySession(token, "MEMBER");
  if (!payload) return null;

  const account = await db.portalAccount.findUnique({
    where: { id: payload.accountId },
    include: { memberProfile: { include: { person: true } } },
  });
  if (!account || account.status !== "ACTIVE") return null;
  if (account.sessionVersion !== payload.sessionVersion) return null;
  // Deactivation disables portal access immediately (PRD §13).
  if (account.memberProfile.status !== "ACTIVE") return null;

  return {
    context: "MEMBER",
    accountId: account.id,
    memberProfileId: account.memberProfile.id,
    personId: account.memberProfile.personId,
    memberId: account.memberProfile.memberId,
    name: account.memberProfile.person.fullName,
  };
}

/** Guards the Member portal. The staff context is never accepted here. */
export async function requireMember(): Promise<MemberActor> {
  const actor = await currentMember();
  if (!actor) redirect("/login?tab=member");
  return actor;
}

/** Guards a page or server action. Redirects when signed out, throws when denied. */
export async function requireStaff(action?: Action): Promise<StaffActor> {
  const actor = await currentStaff();
  if (!actor) redirect("/login");

  if (action && !can(actor.role, action, actor.extraPermissions)) {
    await recordSecurityEvent({
      type: "PERMISSION_DENIED",
      identifier: actor.staffAccountId,
      detail: `${actor.role} attempted ${action}`,
    });
    throw new PermissionError(actor.role, action);
  }
  return actor;
}
