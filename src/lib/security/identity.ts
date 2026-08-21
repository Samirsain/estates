// Protected identity values — PRD.md §14, RD-05; ARCHITECTURE.md §9.3.
// Aadhaar and PAN are protected fields, never uploaded documents. Plaintext is
// encrypted at rest; duplicate detection uses a keyed blind index so no
// searchable plaintext column exists.

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/* ------------------------------------------------------------------ keys */

function keyFromEnv(name: string): Buffer {
  const hex = process.env[name];
  if (!hex) throw new Error(`${name} is not set. See .env.example.`);
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes of hex (64 chars).`);
  return key;
}

/* ------------------------------------------------------- encryption at rest */

/** AES-256-GCM. Payload: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encryptSensitive(plain: string, key = keyFromEnv("SENSITIVE_KEY")): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export function decryptSensitive(payload: string, key = keyFromEnv("SENSITIVE_KEY")): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unreadable protected value.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Deterministic keyed hash used only for duplicate detection (PRD §14, §17).
 * Keyed, so the column cannot be brute-forced from a database dump alone the
 * way a plain SHA-256 of a 12-digit Aadhaar could be.
 */
export function blindIndex(value: string, key = keyFromEnv("BLIND_INDEX_KEY")): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ------------------------------------------------------------- Aadhaar */

export function normaliseAadhaar(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Format check only — 12 digits, first digit 2-9 per UIDAI numbering.
 * ponytail: no Verhoeff checksum. Add it if data entry errors show up; the
 * status field (Available vs Verified) already carries the human check.
 */
export function isValidAadhaarFormat(value: string): boolean {
  return /^[2-9][0-9]{11}$/.test(normaliseAadhaar(value));
}

export function aadhaarLastFour(value: string): string {
  return normaliseAadhaar(value).slice(-4);
}

/** Normal users see only the last four digits (PRD RD-05). */
export function maskAadhaar(lastFour: string | null | undefined): string {
  return lastFour ? `XXXX XXXX ${lastFour}` : "Not recorded";
}

/* ----------------------------------------------------------------- PAN */

export function normalisePan(value: string): string {
  return value.trim().toUpperCase().replace(/\s/g, "");
}

export function isValidPanFormat(value: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalisePan(value));
}

export function maskPan(value: string): string {
  const pan = normalisePan(value);
  return pan.length === 10 ? `${pan.slice(0, 3)}XXXXX${pan.slice(-2)}` : "XXXXXXXXXX";
}

/* -------------------------------------------------------------- mobile */

export function maskMobile(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `XXXXXX${digits.slice(-4)}` : "XXXXXX";
}

export function maskBankAccount(value: string): string {
  const digits = value.replace(/\s/g, "");
  return digits.length >= 4 ? `XXXXXX${digits.slice(-4)}` : "XXXXXX";
}

/* ------------------------------------------------------------- redaction */

const SECRET_KEYS =
  /password|passwordhash|secret|token|mfa|otp|sessionversion|cipher|blindindex/i;
const MASKED_KEYS: Record<string, (v: string) => string> = {
  aadhaar: (v) => maskAadhaar(aadhaarLastFour(v)),
  aadhaarnumber: (v) => maskAadhaar(aadhaarLastFour(v)),
  pan: maskPan,
  pannumber: maskPan,
  mobile: maskMobile,
  primarymobile: maskMobile,
  altmobile: maskMobile,
  accountnumber: maskBankAccount,
  bankaccount: maskBankAccount,
};

/**
 * Audit stores masked before/after payloads only. No password ever appears in
 * audit (PRD §17.1) and no full Aadhaar/PAN/bank value is written to a log.
 */
export function redactForAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const flat = key.toLowerCase().replace(/[^a-z]/g, "");
    if (SECRET_KEYS.test(flat)) {
      out[key] = "[REDACTED]";
    } else if (typeof raw === "string" && MASKED_KEYS[flat]) {
      out[key] = MASKED_KEYS[flat](raw);
    } else {
      out[key] = redactForAudit(raw);
    }
  }
  return out;
}
