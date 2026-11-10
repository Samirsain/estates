"use server";

// Login — prd-corrections.md §17.1. Invalid identifier and invalid password are
// indistinguishable; every failure path returns the same generic error.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/security/audit";
import { currentStaff } from "@/lib/security/current-actor";
import {
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_WINDOW_MS,
  burnPasswordTime,
  hashPassword,
  isLocked,
  rateLimit,
  registerFailure,
  registerSuccess,
  validatePassword,
  verifyPassword,
  verifyRecoveryKey,
} from "@/lib/security/auth";
import { decryptSensitive } from "@/lib/security/identity";
import {
  SESSION_COOKIE_STAFF,
  SESSION_HOURS,
  sessionExpiry,
  signSession,
} from "@/lib/security/session";

type Outcome = { ok: true; to: string } | { ok: false; reason: "GENERIC" | "RATE" };

/**
 * X-Forwarded-For is set by the client unless a trusted proxy overwrites it, so
 * it is believed only when the deployment says one is in front. Otherwise the
 * IP is recorded as unknown and the IP bucket is skipped: an attacker-supplied
 * value must never become an audit fact, and must never become one shared
 * bucket that a single attacker can fill to lock every user out. The account
 * bucket and the database lockout are unaffected either way.
 */
async function clientIp(): Promise<string | null> {
  if (process.env.TRUST_PROXY !== "true") return null;
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || null;
}

async function setSessionCookie(name: string, token: string) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

/* ------------------------------------------------------------------ staff */

async function attemptStaffLogin(form: FormData): Promise<Outcome> {
  const loginId = String(form.get("loginId") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const ip = await clientIp();
  const now = new Date();

  // Rate limiting applies to IP and account identifier (PRD §17.1).
  if ((ip && !rateLimit(`ip:${ip}`, now)) || !rateLimit(`staff:${loginId}`, now)) {
    return { ok: false, reason: "RATE" };
  }

  const account = await db.staffAccount.findUnique({ where: { staffAccountId: loginId } });

  // Unknown account, disabled account, lockout and wrong password all look the same.
  if (!account || account.status !== "ACTIVE") {
    burnPasswordTime(password);
    return { ok: false, reason: "GENERIC" };
  }
  if (isLocked({ failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil }, now)) {
    burnPasswordTime(password);
    return { ok: false, reason: "GENERIC" };
  }

  if (!verifyPassword(password, account.passwordHash)) {
    // Counted in the database, not read-then-written: parallel guesses all read
    // 0 and all wrote 1, so the five-attempt lockout never came. A lockedUntil
    // still set here has run out (a live one returned above): the count restarts.
    const lapsed = account.lockedUntil !== null;
    const { failedAttempts } = await db.staffAccount.update({
      where: { id: account.id },
      data: lapsed ? { failedAttempts: 1, lockedUntil: null } : { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    const { lockedUntil } = registerFailure({ failedAttempts: failedAttempts - 1, lockedUntil: null }, now);
    if (lockedUntil) await db.staffAccount.update({ where: { id: account.id }, data: { lockedUntil } });
    return { ok: false, reason: "GENERIC" };
  }

  // CR-003 — multi-factor authentication was removed from the approved model.
  // The password, the lockout and the session version are now the whole control.

  await db.staffAccount.update({
    where: { id: account.id },
    data: { ...registerSuccess(), lastLoginAt: now },
  });
  await setSessionCookie(
    SESSION_COOKIE_STAFF,
    signSession({
      context: "STAFF",
      accountId: account.id,
      loginId: account.staffAccountId,
      role: account.role,
      sessionVersion: account.sessionVersion,
      expiresAt: sessionExpiry(now),
    })
  );
  return { ok: true, to: "/dashboard" };
}

export async function staffLogin(form: FormData): Promise<void> {
  const result = await attemptStaffLogin(form);
  redirect(result.ok ? result.to : `/login?tab=staff&error=${result.reason}`);
}

/* ------------------------------------------------------- forgot password */

/**
 * PRD §17.1 — self-service recovery for a forgotten staff password, so a
 * lockout no longer needs another Admin at the keyboard.
 *
 * The shared recovery phrase stands in for the identity check. A wrong phrase
 * and an unknown Staff Account ID answer identically, or the page becomes an
 * account-name oracle. Same rate-limit buckets as login.
 */
export async function forgotStaffPassword(form: FormData): Promise<void> {
  const loginId = String(form.get("loginId") ?? "").trim();
  const recoveryKey = String(form.get("recoveryKey") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  const ip = await clientIp();
  const now = new Date();

  const back: (reason: string) => never = (reason) =>
    redirect(`/login/forgot?error=${reason}&loginId=${encodeURIComponent(loginId)}`);

  if (
    (ip && !rateLimit(`ip:${ip}`, now)) ||
    !rateLimit(`forgot:${loginId}`, now) ||
    !rateLimit("forgot:any", now, RECOVERY_MAX_ATTEMPTS, RECOVERY_WINDOW_MS)
  ) {
    back("RATE");
  }
  if (newPassword !== confirmPassword) back("MATCH");
  const weak = validatePassword(newPassword);
  if (weak) back("WEAK");

  const account = await db.staffAccount.findUnique({ where: { staffAccountId: loginId } });

  // The phrase is always checked, even for an account that does not exist, so
  // the two failures cannot be told apart by how long the answer takes.
  const keyOk = verifyRecoveryKey(recoveryKey);
  if (!keyOk || !account || account.status !== "ACTIVE") {
    back("GENERIC");
  }

  await db.staffAccount.update({
    where: { id: account.id },
    data: {
      passwordHash: hashPassword(newPassword),
      // Every existing session dies, exactly as with an admin reset (PRD §17.1).
      sessionVersion: account.sessionVersion + 1,
      ...registerSuccess(),
    },
  });
  // The phrase resets any account, so every use leaves a record.
  await recordAudit({
    actorRef: account.staffAccountId,
    actorRole: account.role,
    entity: "StaffAccount",
    entityId: account.id,
    action: "PASSWORD_RESET_BY_RECOVERY_KEY",
    ip: ip ?? undefined,
  });

  redirect(`/login?notice=RESET&loginId=${encodeURIComponent(loginId)}`);
}

/* ---------------------------------------------------------------- sign out */

/**
 * Deleting the cookie alone left a copied token valid for its 8 hours. Moving
 * the session version ends it — and every other session of this account.
 */
export async function signOut(): Promise<void> {
  const actor = await currentStaff();
  if (actor) {
    await db.staffAccount.update({
      where: { id: actor.accountId },
      data: { sessionVersion: { increment: 1 } },
    });
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_STAFF);
  redirect("/login");
}
