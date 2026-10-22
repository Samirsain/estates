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
    return any ? fail("Rewards are Disabled, so it cannot carry a target or composition.") : ok;
  }
  if (!count(t.tripTotalTarget) || t.tripTotalTarget! <= 0) return fail("The Target must be a whole number above 0.");
  const target = t.tripTotalTarget!;
  if (!count(t.tripMinOwnCredits) || t.tripMinOwnCredits! < 0 || t.tripMinOwnCredits! > target) {
    return fail("Minimum Own-Sale Credits must be a whole number from 0 to the Total Target.");
  }
  if (!count(t.tripMaxReferenceCredits) || t.tripMaxReferenceCredits! < 0 || t.tripMaxReferenceCredits! > target) {
    return fail("Maximum Reference Credits must be a whole number from 0 to the Total Target.");
  }
  if (!t.tripProgrammeCode?.trim()) return fail("Enter the Rewards code, e.g. TRIP-A.");
  if (!t.tripProgrammeVersionRef?.trim()) return fail("Enter the Rewards Version reference.");
  if (!t.tripTermsVersionRef?.trim()) return fail("Enter the Reward Terms version.");
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

/** The cancel reasons the screens tell apart; every other one reads Not Eligible. */
export const CREDIT_REASON = {
  BOOKING_NOT_LIVE: "The Booking is not a live approved sale.",
  SOLD_BY_CORRECTED: "Sold By corrected to another Member (CP §59).",
  PERSON_MERGE: "Person merge — one real person keeps one entitlement history (SSOT §100).",
} as const;

/**
 * Owner-approved 21 Oct 2026 — the seven credit states read on screen as three
 * statuses, each with one short reason. The states and their rules are
 * unchanged; only the words staff read are.
 */
export function creditStatus(c: { state: string; route: string | null; reversalReason: string | null }): {
  status: "Pending" | "Counted" | "Not Counted";
  reason: string;
} {
  switch (c.state) {
    case "PENDING":
      return { status: "Pending", reason: "Payment Pending" };
    case "HELD":
      return { status: "Pending", reason: "Member Deactivated" };
    case "QUALIFIED":
    case "ALLOCATED":
      return { status: "Counted", reason: c.route === "APPROVED_BUYBACK" ? "Buyback Approved" : "Payment Paid" };
    case "USED":
      return { status: "Counted", reason: "Reward Completed" };
    case "EXPIRED":
      return { status: "Not Counted", reason: "Time Expired" };
  }
  // REVERSED — four reasons stand for the nine the services write.
  if (c.reversalReason === CREDIT_REASON.BOOKING_NOT_LIVE) return { status: "Not Counted", reason: "Booking Cancelled" };
  if (c.reversalReason === CREDIT_REASON.SOLD_BY_CORRECTED || c.reversalReason === CREDIT_REASON.PERSON_MERGE) {
    return { status: "Not Counted", reason: "Record Corrected" };
  }
  return { status: "Not Counted", reason: "Not Eligible" };
}
