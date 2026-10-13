// Royalty Tokens — the pure rules (docss/11 §1, §2). Whole tokens only; the
// service decides who may act and holds the per-Member lock.

import type { Check } from "./booking.ts";

const ok: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/** docss/11 §2 — every token quantity is bounded to what the Int columns and CHECKs accept. */
export const MAX_TOKENS = 1_000_000;

export function validateTokenQuantity(label: string, value: unknown): Check {
  if (typeof value !== "number" || !Number.isInteger(value)) return fail(`${label} must be a whole number of points.`);
  if (value <= 0) return fail(`${label} must be more than 0.`);
  if (value > MAX_TOKENS) return fail(`${label} cannot be more than ${MAX_TOKENS.toLocaleString("en-IN")}.`);
  return ok;
}

/** A business day as YYYY-MM-DD: a real calendar day, not after `today` (IST), not before 2000. */
export function validateBusinessDay(label: string, day: string, today: string): Check {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(`${label} must be a date.`);
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return fail(`${label} is not a real date.`);
  if (day > today) return fail(`${label} cannot be a future date.`);
  if (day < "2000-01-01") return fail(`${label} is too far in the past.`);
  return ok;
}

export type LedgerKind = "AWARD_POSTED" | "AWARD_REVERSED" | "REDEMPTION" | "REDEMPTION_CORRECTED";

/** The sign every entry of a kind carries, so a stored amount can never point the wrong way. */
export const LEDGER_SIGN: Record<LedgerKind, 1 | -1> = {
  AWARD_POSTED: 1,
  AWARD_REVERSED: -1,
  REDEMPTION: -1,
  REDEMPTION_CORRECTED: 1,
};

/**
 * docss/11 §1 — net valid released earnings and net completed spending after
 * traceable reversals. Balance is their difference and may be negative.
 */
export function tokenFigures(entries: readonly { kind: LedgerKind; tokens: number }[]) {
  let earned = 0;
  let spent = 0;
  for (const e of entries) {
    if (e.kind === "AWARD_POSTED" || e.kind === "AWARD_REVERSED") earned += e.tokens;
    else spent -= e.tokens;
  }
  return { earned, spent, balance: earned - spent };
}

/**
 * docss/11 §1 — oldest released tokens first, with the caller's stable order as
 * the tie-break; the same attribution clears a deficit. `funding` and `needs`
 * arrive already ordered oldest first.
 */
export function allocate(
  funding: readonly { awardId: string; free: number }[],
  needs: readonly { redemptionId: string; unfunded: number }[]
): { awardId: string; redemptionId: string; tokens: number }[] {
  const left = funding.map((f) => ({ ...f }));
  const out: { awardId: string; redemptionId: string; tokens: number }[] = [];
  for (const need of needs) {
    let rest = need.unfunded;
    for (const f of left) {
      if (rest === 0) break;
      const take = Math.min(rest, f.free);
      if (take <= 0) continue;
      out.push({ awardId: f.awardId, redemptionId: need.redemptionId, tokens: take });
      f.free -= take;
      rest -= take;
    }
  }
  return out;
}
