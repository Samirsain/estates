// Sales & Reference Trip Reward — the pure rules. SSOT §40, §56, §57;
// Change Pack §7.2, §33–§35; Trip Terms 6.1 §4, §16, §18, §20.

import type { Check } from "./booking.ts";

const ok: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/** SSOT §56; CP §35 — unused Qualified Trip Credits expire 12 months after qualification. */
export const TRIP_CREDIT_LIFE_MONTHS = 12;

export function creditExpiry(qualifiedAt: Date): Date {
  const at = new Date(qualifiedAt);
  at.setMonth(at.getMonth() + TRIP_CREDIT_LIFE_MONTHS);
  return at;
}

export type TripSettingsInput = {
  tripEnabled: boolean;
  tripTotalTarget: number | null;
  tripMinOwnCredits: number | null;
  tripMaxReferenceCredits: number | null;
  /** The programme's identity across versions (CP §25.3), e.g. TRIP-A. */
  tripProgrammeCode: string | null;
  tripProgrammeVersionRef: string | null;
  tripTermsVersionRef: string | null;
  tripCutOffAt: Date | null;
  tripWindDownAt: Date | null;
};

const count = (n: number | null) => n !== null && Number.isInteger(n);

/**
 * CP §7.2 — target > 0; 0 ≤ Minimum Own ≤ target; 0 ≤ Maximum Reference ≤
 * target. A Disabled programme carries nothing (Disabled is not "0").
 */
export function validateTripSettings(t: TripSettingsInput): Check {
  if (!t.tripEnabled) {
    const any =
      t.tripTotalTarget !== null ||
      t.tripMinOwnCredits !== null ||
      t.tripMaxReferenceCredits !== null ||
      !!t.tripProgrammeCode ||
      t.tripCutOffAt !== null;
    return any ? fail("The Trip Programme is Disabled, so it cannot carry a target or composition.") : ok;
  }
  if (!count(t.tripTotalTarget) || t.tripTotalTarget! <= 0) return fail("The Trip Total Target must be a whole number above 0.");
  const target = t.tripTotalTarget!;
  if (!count(t.tripMinOwnCredits) || t.tripMinOwnCredits! < 0 || t.tripMinOwnCredits! > target) {
    return fail("Minimum Own-Sale Credits must be a whole number from 0 to the Total Target.");
  }
  if (!count(t.tripMaxReferenceCredits) || t.tripMaxReferenceCredits! < 0 || t.tripMaxReferenceCredits! > target) {
    return fail("Maximum Reference Credits must be a whole number from 0 to the Total Target.");
  }
  if (!t.tripProgrammeCode?.trim()) return fail("Enter the Trip Programme code, e.g. TRIP-A.");
  if (!t.tripProgrammeVersionRef?.trim()) return fail("Enter the Trip Programme Version reference.");
  if (!t.tripTermsVersionRef?.trim()) return fail("Enter the Trip Terms version.");
  if (t.tripWindDownAt && !t.tripCutOffAt) return fail("A final wind-down deadline needs a programme cut-off.");
  if (t.tripWindDownAt && t.tripCutOffAt && t.tripWindDownAt < t.tripCutOffAt) {
    return fail("The final wind-down deadline cannot be before the programme cut-off.");
  }
  return ok;
}

export type Composition = { target: number; minOwn: number; maxRef: number };
export type AllocatableCredit = { id: string; type: "OWN_SALE" | "REFERENCE"; qualifiedAt: Date };

const fifo = (a: AllocatableCredit, b: AllocatableCredit) =>
  a.qualifiedAt.getTime() - b.qualifiedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * SSOT §57; CP §33, §34 — deterministic FIFO allocation. `kept` are credits
 * already allocated and still valid (an Earned reward being backfilled, CP §39);
 * `pool` are unallocated Qualified credits. The Minimum Own is met first from
 * the earliest Own-Sale Credits; the rest of the target is filled earliest
 * first, never past the Maximum Reference. Returns the ids to add, or null when
 * the target cannot be met. Reference Credits are optional (SSOT §40).
 */
export function allocate(pool: readonly AllocatableCredit[], rule: Composition, kept: readonly AllocatableCredit[] = []): string[] | null {
  let own = kept.filter((c) => c.type === "OWN_SALE").length;
  let ref = kept.length - own;
  let total = kept.length;
  if (ref > rule.maxRef) return null;
  const sorted = [...pool].sort(fifo);
  const added: string[] = [];

  for (const c of sorted.filter((c) => c.type === "OWN_SALE")) {
    if (own >= rule.minOwn) break;
    added.push(c.id);
    own++;
    total++;
  }
  if (own < rule.minOwn) return null;

  for (const c of sorted) {
    if (total >= rule.target) break;
    if (added.includes(c.id)) continue;
    if (c.type === "REFERENCE") {
      if (ref >= rule.maxRef) continue;
      ref++;
    } else {
      own++;
    }
    added.push(c.id);
    total++;
  }
  return total >= rule.target ? added : null;
}
