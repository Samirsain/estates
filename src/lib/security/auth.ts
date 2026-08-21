// Passwords, MFA and lockout — PRD.md §17.1; ARCHITECTURE.md §9.1.
// node:crypto only: scrypt for password hashing, HMAC-SHA1 TOTP for MFA.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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
let decoyHash: string | null = null;

export function burnPasswordTime(password: string): void {
  decoyHash ??= hashPassword(randomBytes(32).toString("hex"));
  verifyPassword(password, decoyHash);
}

/* -------------------------------------------------------------- TOTP MFA */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid MFA secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238, SHA-1, 6 digits, 30-second step. */
export function totpCode(secret: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

/** Accepts the neighbouring steps so a slow clock does not lock out an MD. */
export function verifyTotp(secret: string, code: string, at: Date = new Date(), window = 1): boolean {
  const candidate = code.trim();
  if (!/^\d{6}$/.test(candidate)) return false;
  for (let drift = -window; drift <= window; drift++) {
    const when = new Date(at.getTime() + drift * TOTP_STEP_SECONDS * 1000);
    const expected = totpCode(secret, when);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true;
  }
  return false;
}

/** MFA is mandatory for MD and Admin (PRD §3.1, §17.1). */
export function mfaRequired(role: string): boolean {
  return role === "MD" || role === "ADMIN";
}

/* ------------------------------------------------- lockout and rate limit */

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
  const failedAttempts = state.failedAttempts + 1;
  return {
    failedAttempts,
    lockedUntil:
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
        : state.lockedUntil,
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
