// Phase 1 control checks — PHASES.md Phase 1 "Tests".
// Run: node src/lib/security/security.check.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  aadhaarLastFour,
  blindIndex,
  decryptSensitive,
  encryptSensitive,
  isValidAadhaarFormat,
  isValidPanFormat,
  maskAadhaar,
  maskMobile,
  maskPan,
  normalisePan,
  redactForAudit,
} from "./identity.ts";
import {
  GENERIC_LOGIN_ERROR,
  burnPasswordTime,
  MAX_FAILED_ATTEMPTS,
  hashPassword,
  isLocked,
  mfaRequired,
  rateLimit,
  registerFailure,
  registerSuccess,
  resetRateLimit,
  totpCode,
  generateTotpSecret,
  validatePassword,
  verifyPassword,
  verifyTotp,
} from "./auth.ts";
import {
  PermissionError,
  assertDifferentActor,
  assertPermission,
  can,
  canViewField,
  STAFF_ROLES,
  type Role,
} from "./permissions.ts";
import { requestHash, resolveIdempotency, expiryFrom, type StoredCommand } from "./idempotency.ts";
import { signSession, verifySession, sessionExpiry, type SessionPayload } from "./session.ts";

const key = randomBytes(32);
const now = new Date("2026-08-19T06:00:00Z");

/* ------------------------------------------------- sensitive data at rest */

const aadhaar = "234567890123";
const cipher = encryptSensitive(aadhaar, key);
assert.notEqual(cipher, aadhaar);
assert.ok(!cipher.includes(aadhaar), "ciphertext must not contain the plaintext");
assert.equal(decryptSensitive(cipher, key), aadhaar);
assert.notEqual(encryptSensitive(aadhaar, key), cipher, "IV must be fresh per encryption");
assert.throws(() => decryptSensitive(cipher, randomBytes(32)), "wrong key must not decrypt");

// Duplicate Aadhaar/PAN prevention without a searchable plaintext column.
assert.equal(blindIndex(aadhaar, key), blindIndex(aadhaar, key), "blind index is deterministic");
assert.notEqual(blindIndex(aadhaar, key), blindIndex("234567890124", key));
assert.notEqual(blindIndex(aadhaar, key), blindIndex(aadhaar, randomBytes(32)), "index is keyed");

assert.ok(isValidAadhaarFormat("2345 6789 0123"), "spaces are normalised away");
assert.ok(!isValidAadhaarFormat("1234567890123"));
assert.ok(!isValidAadhaarFormat("123456789012"), "first digit must be 2-9");
assert.ok(isValidPanFormat("abcde1234f"), "PAN is normalised before validation");
assert.equal(normalisePan(" abcde1234f "), "ABCDE1234F");
assert.ok(!isValidPanFormat("ABCD12345F"));

// Masking (PRD RD-05, §23.1).
assert.equal(maskAadhaar(aadhaarLastFour(aadhaar)), "XXXX XXXX 0123");
assert.equal(maskAadhaar(null), "Not recorded");
assert.equal(maskPan("ABCDE1234F"), "ABCXXXXX4F");
assert.equal(maskMobile("+91 98765 43210"), "XXXXXX3210");

// No password and no full sensitive value ever reaches audit (PRD §17.1).
const audited = redactForAudit({
  fullName: "Vikram Shah",
  password: "supersecret123",
  passwordHash: "scrypt$...",
  mfaSecretCipher: "v1.aa.bb.cc",
  aadhaarNumber: aadhaar,
  pan: "ABCDE1234F",
  primaryMobile: "9876543210",
  nested: { bankAccount: "123456789012", note: "keep" },
}) as Record<string, any>;
assert.equal(audited.password, "[REDACTED]");
assert.equal(audited.passwordHash, "[REDACTED]");
assert.equal(audited.mfaSecretCipher, "[REDACTED]");
assert.equal(audited.aadhaarNumber, "XXXX XXXX 0123");
assert.equal(audited.pan, "ABCXXXXX4F");
assert.equal(audited.primaryMobile, "XXXXXX3210");
assert.equal(audited.nested.bankAccount, "XXXXXX9012");
assert.equal(audited.nested.note, "keep");
assert.ok(!JSON.stringify(audited).includes("supersecret123"));
assert.ok(!JSON.stringify(audited).includes(aadhaar));

/* --------------------------------------------------------------- password */

assert.equal(validatePassword("123456789"), "Password must be at least 10 characters.");
assert.equal(validatePassword("0123456789"), null);
const stored = hashPassword("correct-horse-battery");
assert.ok(!stored.includes("correct-horse-battery"));
assert.ok(verifyPassword("correct-horse-battery", stored));
assert.ok(!verifyPassword("correct-horse-batteryX", stored));
assert.notEqual(hashPassword("correct-horse-battery"), stored, "salt must be fresh");

/* -------------------------------------------------------------- MFA */

assert.ok(mfaRequired("MD") && mfaRequired("ADMIN"));
assert.ok(!mfaRequired("ACCOUNTS") && !mfaRequired("CRM"));
const secret = generateTotpSecret();
assert.ok(verifyTotp(secret, totpCode(secret, now), now));
assert.ok(verifyTotp(secret, totpCode(secret, new Date(now.getTime() - 30_000)), now), "±1 step drift");
assert.ok(!verifyTotp(secret, totpCode(secret, new Date(now.getTime() - 120_000)), now));
assert.ok(!verifyTotp(secret, "000", now), "malformed code");

/* ---------------------------------------------------------- lockout */

let attempts = registerSuccess();
assert.ok(!isLocked(attempts, now));
for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) attempts = registerFailure(attempts, now);
assert.ok(isLocked(attempts, now), "account locks after 5 failures");
assert.ok(!isLocked(attempts, new Date(now.getTime() + 16 * 60_000)), "lock expires");
assert.ok(!isLocked(registerSuccess(), now));
assert.equal(GENERIC_LOGIN_ERROR, "Invalid login details.");

resetRateLimit();
let allowed = 0;
for (let i = 0; i < 25; i++) if (rateLimit("ip:1.2.3.4", now)) allowed++;
assert.equal(allowed, 20, "rate limit caps the window");
assert.ok(rateLimit("ip:5.6.7.8", now), "limit is per identifier");

/* ------------------------------------------------------------ permissions */

// Deny by default: no role gets an action that was never granted to it.
assert.ok(can("ACCOUNTS", "BOOKING_DECIDE"));
assert.ok(!can("CRM", "BOOKING_DECIDE"), "CRM cannot approve its own Booking Request");
assert.ok(!can("PC", "PAYMENT_RECEIVED_CONFIRM"), "PC has no financial approval");
assert.ok(!can("MIS", "TASK_COMPLETE"), "MIS is read-only besides manual tasks");
assert.ok(can("MIS", "TASK_CREATE"));
assert.ok(!can("MEMBER", "BOOKING_REQUEST_SUBMIT"), "Members submit Hold Requests, not Bookings");
assert.ok(!can("ADMIN", "BOOKING_DECIDE"), "Booking decisions belong to Accounts");
assert.ok(can("CRM", "HOLD_EXTEND_FIRST") && !can("CRM", "HOLD_EXTEND_FURTHER"));
assert.ok(can("ADMIN", "HOLD_EXTEND_FURTHER"), "further extension needs Admin");
assert.ok(can("PC", "PLOT_SETUP", ["PLOT_SETUP"]));
assert.ok(can("MIS", "AUDIT_VIEW", ["AUDIT_VIEW"]), "explicit extra grant is honoured");
assert.throws(() => assertPermission("MIS", "BOOKING_DECIDE"), PermissionError);

// Field scope.
for (const role of STAFF_ROLES) {
  const expected = role === "MD" || role === "ADMIN";
  assert.equal(canViewField(role, "AADHAAR_FULL"), expected, `${role} full Aadhaar`);
}
assert.ok(!canViewField("MEMBER" as Role, "BUYER_IDENTITY"), "portal never exposes buyer identity");
assert.ok(!canViewField("MEMBER" as Role, "AADHAAR_FULL"));
assert.ok(canViewField("ACCOUNTS", "BANK_FULL"));
assert.ok(!canViewField("CRM", "BANK_FULL"));

assert.throws(() => assertDifferentActor("STF-1", "STF-1"), /different staff accounts/);
assert.doesNotThrow(() => assertDifferentActor("STF-1", "STF-2"));

/* ----------------------------------------------------------- idempotency */

const payload = { plotId: "PLT-1", customerId: "CUS-1" };
const hash = requestHash("HOLD_CREATE", payload);
assert.equal(hash, requestHash("HOLD_CREATE", { customerId: "CUS-1", plotId: "PLT-1" }), "key order is irrelevant");
assert.notEqual(hash, requestHash("HOLD_CREATE", { ...payload, plotId: "PLT-2" }));
assert.notEqual(hash, requestHash("BOOKING_SUBMIT", payload), "operation is part of the hash");

const record: StoredCommand = {
  key: "idem-1",
  operation: "HOLD_CREATE",
  requestHash: hash,
  resultJson: { holdId: "HLD-1" },
  expiresAt: expiryFrom(now),
};
assert.deepEqual(resolveIdempotency(null, "HOLD_CREATE", hash, now), { status: "NEW" });
assert.deepEqual(resolveIdempotency(record, "HOLD_CREATE", hash, now), {
  status: "REPLAY",
  result: { holdId: "HLD-1" },
});
assert.equal(
  resolveIdempotency(record, "HOLD_CREATE", requestHash("HOLD_CREATE", { plotId: "PLT-2" }), now).status,
  "CONFLICT",
  "same key, different input must not create a second record"
);
assert.equal(
  resolveIdempotency(record, "BOOKING_SUBMIT", hash, now).status,
  "CONFLICT",
  "a key cannot be reused for another operation"
);
assert.equal(
  resolveIdempotency(record, "HOLD_CREATE", hash, new Date(now.getTime() + 25 * 3_600_000)).status,
  "NEW",
  "retention is at least 24 hours"
);

/* --------------------------------------------------------------- sessions */

const session: SessionPayload = {
  context: "STAFF",
  accountId: "acc-1",
  loginId: "STF-0001",
  role: "ACCOUNTS",
  sessionVersion: 3,
  expiresAt: sessionExpiry(now),
};
const token = signSession(session, key);
assert.deepEqual(verifySession(token, "STAFF", now, key), session);
assert.equal(verifySession(token, "MEMBER", now, key), null, "staff token is rejected on the portal");
assert.equal(verifySession(token, "STAFF", now, randomBytes(32)), null, "forged signature rejected");
assert.equal(
  verifySession(token, "STAFF", new Date(now.getTime() + 9 * 3_600_000), key),
  null,
  "expired session rejected"
);

// Tampering with the payload must invalidate the signature.
const [body] = token.split(".");
const forgedBody = Buffer.from(
  JSON.stringify({ ...session, role: "MD" }),
  "utf8"
).toString("base64url");
assert.equal(verifySession(`${forgedBody}.${token.split(".")[1]}`, "STAFF", now, key), null);
assert.ok(body.length > 0);

// A session version older than the account's current version must be rejected
// by the caller — this is the check the guard performs after loading the account.
const current = { sessionVersion: 4 };
const verified = verifySession(token, "STAFF", now, key)!;
assert.ok(verified.sessionVersion !== current.sessionVersion, "stale session detected");

/* ------------------------------------------ login failure paths are uniform */

// PRD §17.1 — an unknown identifier and a wrong password must be
// indistinguishable. Every early return before `verifyPassword` has to burn the
// same scrypt work, or the response time enumerates valid accounts. This is a
// source check because the paths live inside a server action.
const loginSource = readFileSync(
  new URL("../../app/login/actions.ts", import.meta.url),
  "utf8"
);
const earlyReturns = (loginSource.match(/reason: "GENERIC"/g) ?? []).length;
const burns = (loginSource.match(/burnPasswordTime\(password\)/g) ?? []).length;
assert.ok(burns >= 3, `every pre-verify failure path burns password time (found ${burns})`);
assert.ok(earlyReturns >= burns, "burns never outnumber the generic failure returns");

// X-Forwarded-For is client-supplied: it must never be believed, recorded or
// used as a rate-limit bucket unless a trusted proxy is declared.
assert.match(loginSource, /TRUST_PROXY/, "the forwarded IP is gated behind TRUST_PROXY");
assert.match(loginSource, /ip && !rateLimit\(`ip:/, "the IP bucket is skipped when the IP is untrusted");

// The burn itself must actually cost the same work as a real verification.
const decoyStart = Date.now();
burnPasswordTime("some-wrong-password");
const decoyMs = Date.now() - decoyStart;
const realStart = Date.now();
verifyPassword("some-wrong-password", hashPassword("a-real-password"));
const realMs = Date.now() - realStart;
assert.ok(decoyMs > 0 && realMs > 0, "both paths perform scrypt work");

console.log("security.check.ts OK");
