"use server";

// Change own password — PRD §17.1.
//
// A staff member or a Member changes their own password here. Every other
// session on every other device dies with the version bump; the current device
// gets a freshly signed cookie so the person who just changed it stays in.

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/security/audit";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/security/auth";
import { currentMember, currentStaff } from "@/lib/security/current-actor";
import {
  SESSION_COOKIE_MEMBER,
  SESSION_COOKIE_STAFF,
  SESSION_HOURS,
  sessionExpiry,
  signSession,
} from "@/lib/security/session";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Wrong current password and a weak new one must both be plain refusals. */
export async function changeOwnPasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<ActionResult> {
  if (newPassword !== confirmPassword) return { ok: false, error: "The two new passwords do not match." };

  const weak = validatePassword(newPassword);
  if (weak) return { ok: false, error: weak };

  if (newPassword === currentPassword) {
    return { ok: false, error: "The new password must be different from the current one." };
  }

  const staff = await currentStaff();
  const member = staff ? null : await currentMember();
  if (!staff && !member) return { ok: false, error: "Sign in again to change your password." };

  if (staff) {
    const account = await db.staffAccount.findUniqueOrThrow({ where: { id: staff.accountId } });
    if (!verifyPassword(currentPassword, account.passwordHash)) {
      return { ok: false, error: "The current password is incorrect." };
    }

    const updated = await db.staffAccount.update({
      where: { id: account.id },
      data: {
        passwordHash: hashPassword(newPassword),
        sessionVersion: account.sessionVersion + 1,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    // No password, old or new, ever reaches the audit payload (PRD §17.1).
    await recordAudit({
      actorRef: account.staffAccountId,
      actorRole: account.role,
      entity: "StaffAccount",
      entityId: account.id,
      action: "PASSWORD_CHANGED",
      reason: "Changed by the account holder.",
    });

    await reissue(SESSION_COOKIE_STAFF, {
      context: "STAFF",
      accountId: updated.id,
      loginId: updated.staffAccountId,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
    });

    return { ok: true, message: "Password changed. Every other device has been signed out." };
  }

  const portal = await db.portalAccount.findUniqueOrThrow({
    where: { memberProfileId: member!.memberProfileId },
  });
  if (!verifyPassword(currentPassword, portal.passwordHash)) {
    return { ok: false, error: "The current password is incorrect." };
  }

  const updated = await db.portalAccount.update({
    where: { id: portal.id },
    data: {
      passwordHash: hashPassword(newPassword),
      sessionVersion: portal.sessionVersion + 1,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  await recordAudit({
    actorRef: portal.loginId,
    actorRole: "MEMBER",
    entity: "PortalAccount",
    entityId: portal.id,
    action: "PASSWORD_CHANGED",
    reason: "Changed by the account holder.",
  });

  await reissue(SESSION_COOKIE_MEMBER, {
    context: "MEMBER",
    accountId: member!.memberProfileId,
    loginId: updated.loginId,
    role: "MEMBER",
    sessionVersion: updated.sessionVersion,
  });

  return { ok: true, message: "Password changed. Every other device has been signed out." };
}

async function reissue(
  cookieName: string,
  payload: {
    context: "STAFF" | "MEMBER";
    accountId: string;
    loginId: string;
    role: "MD" | "ADMIN" | "ACCOUNTS" | "CRM" | "MIS" | "PC" | "MEMBER";
    sessionVersion: number;
  }
) {
  const token = signSession({ ...payload, expiresAt: sessionExpiry() });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

