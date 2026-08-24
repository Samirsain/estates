// Session token — ARCHITECTURE.md §9.1. Staff and Member portal are separate
// security contexts. The token carries the account's session version, so a
// password reset or emergency disable invalidates every existing session by
// bumping that number in the database (PRD §17.1, §17.2).

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./permissions.ts";

export const SESSION_COOKIE_STAFF = "crm_staff_session";
export const SESSION_COOKIE_MEMBER = "crm_member_session";
export const SESSION_HOURS = 8;

export type SessionPayload = {
  /** Separate contexts — a staff token is never accepted on the portal. */
  context: "STAFF" | "MEMBER";
  /** StaffAccount.id or MemberProfile.id. */
  accountId: string;
  /** Display identity: Staff Account ID or Member ID. */
  loginId: string;
  role: Role;
  sessionVersion: number;
  expiresAt: number;
};

function secret(): Buffer {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters. See .env.example.");
  }
  return Buffer.from(value, "utf8");
}

export function signSession(payload: SessionPayload, key: Buffer = secret()): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(
  token: string | undefined | null,
  context: SessionPayload["context"],
  now: Date = new Date(),
  key: Buffer = secret()
): SessionPayload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.context !== context) return null;
  if (payload.expiresAt <= now.getTime()) return null;
  return payload;
}

export function sessionExpiry(now: Date = new Date()): number {
  return now.getTime() + SESSION_HOURS * 3_600_000;
}

export type AutoLoginPayload = {
  purpose: "MEMBER_AUTO_LOGIN";
  memberId: string;
  portalAccountId: string;
  expiresAt: number;
};

export function signAutoLoginToken(
  payload: { memberId: string; portalAccountId: string },
  expiresInDays: number = 7,
  key: Buffer = secret()
): string {
  const expiresAt = Date.now() + expiresInDays * 24 * 3_600_000;
  const fullPayload: AutoLoginPayload = {
    purpose: "MEMBER_AUTO_LOGIN",
    memberId: payload.memberId,
    portalAccountId: payload.portalAccountId,
    expiresAt,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyAutoLoginToken(
  token: string | undefined | null,
  now: Date = new Date(),
  key: Buffer = secret()
): AutoLoginPayload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: AutoLoginPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.purpose !== "MEMBER_AUTO_LOGIN") return null;
  if (payload.expiresAt <= now.getTime()) return null;
  return payload;
}

