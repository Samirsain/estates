// Idempotency — prd-corrections.md §19; architecture.md §8.
// A repeated key returns the original result. The same key with materially
// different input is a conflict, not a second write.

import { createHash } from "node:crypto";
import { blindIndex } from "./identity.ts";

export const IDEMPOTENCY_TTL_HOURS = 24;

/** Stable JSON: object key order must not change the hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Keyed, like the Aadhaar blind index. Payloads carry Aadhaar and PAN numbers,
 * and a plain SHA-256 of one sits beside names and mobiles in the database —
 * a 12-digit Aadhaar could be brute-forced back out of it offline.
 */
export function requestHash(operation: string, payload: unknown, key?: Buffer): string {
  return blindIndex(`${operation}|${stableStringify(payload)}`, key);
}

/**
 * The unkeyed hash records carried before the keyed one. Compared, never
 * stored: a retry of a command that succeeded just before the deploy replays
 * rather than being refused as "different details".
 */
// ponytail: dead once IDEMPOTENCY_TTL_HOURS has passed since the keyed hash deployed — delete it then.
export function legacyRequestHash(operation: string, payload: unknown): string {
  return createHash("sha256").update(`${operation}|${stableStringify(payload)}`).digest("hex");
}

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + IDEMPOTENCY_TTL_HOURS * 3_600_000);
}

export type StoredCommand = {
  key: string;
  operation: string;
  requestHash: string;
  resultJson: unknown;
  expiresAt: Date;
};

export type Resolution =
  | { status: "NEW" }
  /** Return the original result; do not run the command again. */
  | { status: "REPLAY"; result: unknown }
  /** Same key, different input — reject rather than overwrite. */
  | { status: "CONFLICT" };

export function resolveIdempotency(
  existing: StoredCommand | null,
  operation: string,
  hash: string,
  now: Date = new Date(),
  legacyHash?: string
): Resolution {
  if (!existing || existing.expiresAt.getTime() <= now.getTime()) return { status: "NEW" };
  const sameInput = existing.requestHash === hash || existing.requestHash === legacyHash;
  if (existing.operation !== operation || !sameInput) {
    return { status: "CONFLICT" };
  }
  return { status: "REPLAY", result: existing.resultJson };
}
