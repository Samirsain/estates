"use server";

// Login — PRD.md §17.1. Invalid identifier and invalid password are
// indistinguishable; every failure path returns the same generic error.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/audit";
import {
  burnPasswordTime,
  hashPassword,
  isLocked,
  rateLimit,
  registerFailure,
  registerSuccess,
  verifyPassword,
} from "@/lib/security/auth";
import { decryptSensitive } from "@/lib/security/identity";
import { MEMBER_TERMS_VERSION } from "@/lib/terms";
import {
  SESSION_COOKIE_MEMBER,
  SESSION_COOKIE_STAFF,
  SESSION_HOURS,
  sessionExpiry,
  signSession,
} from "@/lib/security/session";

type Outcome = { ok: true; to: string } | { ok: false; reason: "GENERIC" | "RATE" | "TERMS" };

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
    await recordSecurityEvent({ type: "LOGIN_FAILURE", identifier: loginId, ip, detail: "Rate limited" });
    return { ok: false, reason: "RATE" };
  }

  const account = await db.staffAccount.findUnique({ where: { staffAccountId: loginId } });

  // Unknown account, disabled account, lockout and wrong password all look the same.
  if (!account || account.status !== "ACTIVE") {
    burnPasswordTime(password);
    await recordSecurityEvent({ type: "LOGIN_FAILURE", identifier: loginId, ip, detail: "Unknown or disabled account" });
    return { ok: false, reason: "GENERIC" };
  }
  if (isLocked({ failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil }, now)) {
    burnPasswordTime(password);
    await recordSecurityEvent({ type: "ACCOUNT_LOCKED", identifier: loginId, ip });
    return { ok: false, reason: "GENERIC" };
  }

  if (!verifyPassword(password, account.passwordHash)) {
    const next = registerFailure(
      { failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil },
      now
    );
    await db.staffAccount.update({ where: { id: account.id }, data: next });
    await recordSecurityEvent({
      type: next.lockedUntil && next.lockedUntil > now ? "ACCOUNT_LOCKED" : "LOGIN_FAILURE",
      identifier: loginId,
      ip,
    });
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
  await recordSecurityEvent({ type: "LOGIN_SUCCESS", identifier: loginId, ip });
  return { ok: true, to: "/dashboard" };
}

export async function staffLogin(form: FormData): Promise<void> {
  const result = await attemptStaffLogin(form);
  redirect(result.ok ? result.to : `/login?tab=staff&error=${result.reason}`);
}

/* ----------------------------------------------------------------- member */

async function attemptMemberLogin(form: FormData): Promise<Outcome> {
  // Member login uses Member ID; a mobile alone is never sufficient (PRD §17.1).
  const loginId = String(form.get("loginId") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const acceptsTerms = form.get("acceptTerms") === "on";
  const ip = await clientIp();
  const now = new Date();

  if ((ip && !rateLimit(`ip:${ip}`, now)) || !rateLimit(`member:${loginId}`, now)) {
    return { ok: false, reason: "RATE" };
  }

  let account = await db.portalAccount.findUnique({
    where: { loginId },
    include: { memberProfile: true },
  });

  // Self-healing: If MemberProfile is ACTIVE but PortalAccount record doesn't exist yet, auto-create it.
  if (!account) {
    const memberProfile = await db.memberProfile.findUnique({
      where: { memberId: loginId },
    });
    if (memberProfile && memberProfile.status === "ACTIVE") {
      const defaultPasswordHash = hashPassword("ChangeMe#2026");
      account = await db.portalAccount.create({
        data: {
          memberProfileId: memberProfile.id,
          loginId: memberProfile.memberId,
          passwordHash: defaultPasswordHash,
          status: "ACTIVE",
        },
        include: { memberProfile: true },
      });
    }
  }

  if (
    !account ||
    account.status !== "ACTIVE" ||
    account.memberProfile.status !== "ACTIVE" ||
    isLocked({ failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil }, now)
  ) {
    burnPasswordTime(password);
    await recordSecurityEvent({ type: "LOGIN_FAILURE", identifier: loginId, ip, detail: "Portal login refused" });
    return { ok: false, reason: "GENERIC" };
  }

  if (!verifyPassword(password, account.passwordHash)) {
    const next = registerFailure(
      { failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil },
      now
    );
    await db.portalAccount.update({ where: { id: account.id }, data: next });
    await recordSecurityEvent({ type: "LOGIN_FAILURE", identifier: loginId, ip });
    return { ok: false, reason: "GENERIC" };
  }

  // Terms §2.1 — the Member accepts the applicable Terms and Privacy Notice.
  // Asked once per published version and recorded, rather than re-ticked at
  // every sign-in: a box that records nothing proves nothing later.
  const accepted = await db.memberTermsAcceptance.findUnique({
    where: {
      memberProfileId_version: {
        memberProfileId: account.memberProfileId,
        version: MEMBER_TERMS_VERSION,
      },
    },
  });

  if (!accepted) {
    if (!acceptsTerms) {
      // The credentials were right; only the acceptance is missing. The form
      // comes back with the box, carrying the Member ID so only the password
      // is retyped.
      return { ok: false, reason: "TERMS" };
    }
    await db.memberTermsAcceptance.create({
      data: {
        memberProfileId: account.memberProfileId,
        version: MEMBER_TERMS_VERSION,
        ip,
      },
    });
    await recordSecurityEvent({
      type: "LOGIN_SUCCESS",
      identifier: loginId,
      ip,
      detail: `Accepted Terms ${MEMBER_TERMS_VERSION}`,
    });
  }

  await db.portalAccount.update({
    where: { id: account.id },
    data: { ...registerSuccess(), lastLoginAt: now },
  });
  await setSessionCookie(
    SESSION_COOKIE_MEMBER,
    signSession({
      context: "MEMBER",
      accountId: account.id,
      loginId: account.loginId,
      role: "MEMBER",
      sessionVersion: account.sessionVersion,
      expiresAt: sessionExpiry(now),
    })
  );
  await recordSecurityEvent({ type: "LOGIN_SUCCESS", identifier: loginId, ip });
  return { ok: true, to: "/portal" };
}

export async function memberLogin(form: FormData): Promise<void> {
  const result = await attemptMemberLogin(form);
  if (result.ok) redirect(result.to);
  // Only the Terms step carries the Member ID back: it is not a secret, and
  // retyping it to tick a box the server just asked for is pure friction.
  const loginId =
    result.reason === "TERMS"
      ? `&loginId=${encodeURIComponent(String(form.get("loginId") ?? "").trim())}`
      : "";
  redirect(`/portal/login?error=${result.reason}${loginId}`);
}

/* ---------------------------------------------------------------- sign out */

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_STAFF);
  jar.delete(SESSION_COOKIE_MEMBER);
  redirect("/login");
}
