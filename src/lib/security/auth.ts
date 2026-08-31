// Passwords and lockout — PRD.md §17.1; ARCHITECTURE.md §9.1.
// node:crypto only: scrypt for password hashing.
//
// CR-003 removed multi-factor authentication from the approved model, so the
// password, the lockout and the session version are the whole control here.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------- passwords */

export const PASSWORD_MIN_LENGTH = 10;

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Stored form: scrypt$N$r$p$<salt hex>$<hash hex>. Never logged, never audited. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, N, r, p, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(expected, actual);
}

/**
 * PRD §17.1 — an unknown identifier and a wrong password must be
 * indistinguishable. The unknown case never reaches `verifyPassword`, so it
 * would answer in a fraction of the time that scrypt takes and quietly
 * enumerate valid accounts. Burning the same work closes that channel.
 */
const DUMMY_DECOY_HASH =
  "scrypt$16384$8$1$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export function burnPasswordTime(password: string): void {
  verifyPassword(password, DUMMY_DECOY_HASH);
}

/* -------------------------------------------------------------- recovery */

/**
 * Break-glass phrase for the Forgot password page. Case-insensitive by request,
 * so it is compared lower-cased — and in constant time, so it cannot be guessed
 * one character at a time. Set RECOVERY_KEY in the environment to change it
 * without a code change.
 *
 * ponytail: ONE phrase resets ANY staff account. Its strength is exactly the
 * number of people who know it. Move to per-account tokens sent to a verified
 * mobile the day this system is reachable from outside the office.
 */
const RECOVERY_KEY = process.env.RECOVERY_KEY || "3preclub@2026fgpass";

export function verifyRecoveryKey(given: string): boolean {
  const a = Buffer.from(given.trim().toLowerCase(), "utf8");
  const b = Buffer.from(RECOVERY_KEY.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* --------------------------------------------------------------- lockout */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

/**
 * Invalid Member ID and invalid password must be indistinguishable, so every
 * failed login path returns exactly this string (PRD §17.1).
 */
export const GENERIC_LOGIN_ERROR = "Invalid login details.";

export type AttemptState = { failedAttempts: number; lockedUntil: Date | null };

export function isLocked(state: AttemptState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

export function registerFailure(state: AttemptState, now: Date = new Date()): AttemptState {
  // A lockout that has run out starts the count over. Without this the counter
  // stays at MAX_FAILED_ATTEMPTS after the window closes, so the first failure
  // afterwards re-locks immediately and the user gets one attempt, not five.
  const from = state.lockedUntil !== null && !isLocked(state, now) ? registerSuccess() : state;
  const failedAttempts = from.failedAttempts + 1;
  return {
    failedAttempts,
    lockedUntil:
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
        : from.lockedUntil,
  };
}

export function registerSuccess(): AttemptState {
  return { failedAttempts: 0, lockedUntil: null };
}

/**
 * Rate limiting applies to IP and account identifier (PRD §17.1). In-process
 * fixed window.
 * ponytail: single-instance counter. Move to a shared store the day the app
 * runs on more than one node, or the limit is per-node.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, now: Date = new Date()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now.getTime()) {
    buckets.set(key, { count: 1, resetAt: now.getTime() + WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= MAX_PER_WINDOW;
}

export function resetRateLimit(): void {
  buckets.clear();
}

