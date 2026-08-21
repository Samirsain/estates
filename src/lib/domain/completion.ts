// Allotment/Registry completion, Delivered, export masking and Person Merge.
// PRD.md §4, §21, §22; main-PRD.md §18; DESIGN.md §16.
//
// One route completes a Booking. There is no Allotment-then-Registry sequence
// and no separate Confirm Delivery action — Delivered is what the completed
// route means (PRD §4.4).

import { Prisma } from "@prisma/client";
import type { Check, Numeric } from "./booking.ts";
import { MAX_LOYALTY_SLOTS } from "./commission.ts";

const D = Prisma.Decimal;
const OK: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/* ------------------------------------------------------------ completion */

export type CompletionRoute = "ALLOTMENT" | "REGISTRY";

export type AllotmentInput = {
  route: "ALLOTMENT";
  /** main-PRD §18.4 — the route completes only once Allotment is given. */
  allotmentGiven: boolean;
  allotmentDate: Date | null;
  allotmentNumber: string | null;
  allotmentGivenTo: string | null;
  pattaStatus: "YES" | "DONT_KNOW" | null;
  pattaDate: Date | null;
};

export type RegistryInput = {
  route: "REGISTRY";
  advocateName: string | null;
  registryDate: Date | null;
};

export type CompletionInput = AllotmentInput | RegistryInput;

const present = (value: string | null | undefined) => !!value && value.trim().length > 0;

/** main-PRD §18.4, §18.5 — each route carries its own complete field set. */
export function validateCompletion(input: CompletionInput): Check {
  if (input.route === "ALLOTMENT") {
    if (!input.allotmentGiven) {
      return fail("Allotment Given must be Yes to complete the Allotment route.");
    }
    if (!input.allotmentDate) return fail("Allotment Date is required.");
    if (!present(input.allotmentNumber)) return fail("Allotment Number is required.");
    if (!present(input.allotmentGivenTo)) return fail("Allotment Given To is required.");
    if (!input.pattaStatus) return fail("Patta Issued must be Yes or Don't Know.");
    if (input.pattaStatus === "YES" && !input.pattaDate) {
      return fail("Patta Date is required when the Patta is issued.");
    }
    if (input.pattaStatus === "DONT_KNOW" && input.pattaDate) {
      return fail("A Patta Date cannot be recorded while Patta Issued is Don't Know.");
    }
    return OK;
  }

  if (!present(input.advocateName)) return fail("Advocate Name is required.");
  if (!input.registryDate) return fail("Registry Date is required.");
  return OK;
}

/**
 * main-PRD §18.2 — the final registration buyer(s), their identity fields and
 * the PAN decision. No document upload exists anywhere in this model.
 */
export type FinalBuyer = {
  personId: string;
  sharePercent?: Numeric | null;
  /** Aadhaar Status is past Pending, i.e. a valid number is on record. */
  aadhaarRecorded: boolean;
  dateOfBirth: Date | null;
  address: string | null;
};

// The PAN decision needs no flag here: PanStatus is Not Available, Available or
// Verified, and the database already refuses Available without a number, so
// "PAN Available / PAN Not Available selected" is structural, not a check.

export function validateFinalBuyers(buyers: readonly FinalBuyer[]): Check {
  if (buyers.length === 0) return fail("Final buyer details are not complete.");

  for (const buyer of buyers) {
    if (!buyer.aadhaarRecorded) return fail("Every final buyer needs a recorded Aadhaar Number.");
    if (!buyer.dateOfBirth) return fail("Every final buyer needs a Date of Birth.");
    if (!present(buyer.address)) return fail("Every final buyer needs an Address.");
  }

  // A single final buyer may omit the share and is treated as 100% (PRD §12.1).
  if (buyers.length === 1 && buyers[0].sharePercent == null) return OK;

  const total = buyers.reduce((sum, b) => sum.add(new D(b.sharePercent ?? 0)), new D(0));
  if (!total.equals(100)) {
    return fail(`Ownership shares total ${total.toFixed(2)}%, not 100%.`);
  }
  return OK;
}

/** main-PRD §18.6 — every precondition, checked server-side before Delivered. */
export function readyForCompletion(args: {
  status: string;
  activeProcess: string;
  paymentReceivedPercent: Numeric;
  finalBuyers: readonly FinalBuyer[];
  alreadyCompleted: boolean;
}): Check {
  if (args.alreadyCompleted) return fail("This Booking is already Delivered.");
  if (args.status !== "PAYMENT_COMPLETED") {
    return fail("Allotment or Registry is recorded only on a Payment Completed Booking.");
  }
  if (!new D(args.paymentReceivedPercent).equals(100)) {
    return fail("Payment Received must be 100% before the completion route is recorded.");
  }
  if (args.activeProcess !== "NONE") {
    return fail("A major process is active on this Booking. Complete or withdraw it first.");
  }
  return validateFinalBuyers(args.finalBuyers);
}

/**
 * PRD §4.4 — an incorrect Delivered may be reopened only by MD/Admin with a
 * compulsory reason. After genuine legal completion — the Registry route, or an
 * Allotment whose papers transferred — only a legally approved exceptional
 * correction applies, which is this same MD/Admin route with the reason on file.
 */
export function canReopenDelivered(role: string, reason: string): Check {
  if (role !== "MD" && role !== "ADMIN") {
    return fail("Only MD or Admin may reopen a Delivered Booking.");
  }
  if (!reason.trim()) return fail("A compulsory reason is required to reopen a Delivered Booking.");
  return OK;
}

/* ---------------------------------------------------------- export masking */

/**
 * PRD §21 — exports stay masked. A column whose name marks it sensitive is
 * replaced by a masked placeholder. Deny by default: an unrecognised
 * sensitive-looking column is masked rather than passed through, and only the
 * already-masked forms (last four, masked, status) survive.
 */
const SENSITIVE = /aadhaar|pan|account|ifsc|password|secret|cipher|mobile|blindindex/i;
const ALREADY_MASKED = /lastfour|masked|status/i;

export function maskExportRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const sensitive = SENSITIVE.test(key) && !ALREADY_MASKED.test(key);
    out[key] = sensitive ? (value == null ? null : "••••") : value;
  }
  return out;
}

/* ------------------------------------------------------------ person merge */

export type MergeSide = {
  personId: string;
  memberStatus?: "ACTIVE" | "DEACTIVATED" | null;
};

/**
 * PRD §22 — two Active Member profiles cannot be merged through ordinary
 * merge; one must be deactivated first. MD approval is a separate control on
 * the decision, not on the request.
 */
export function validateMergeRequest(survivor: MergeSide, merged: MergeSide): Check {
  if (survivor.personId === merged.personId) {
    return fail("A Person cannot be merged into itself.");
  }
  if (survivor.memberStatus === "ACTIVE" && merged.memberStatus === "ACTIVE") {
    return fail(
      "Two Active Member profiles cannot be merged. Deactivate one Member first (PRD §22)."
    );
  }
  return OK;
}

/**
 * PRD §22 — the Loyalty count is rebuilt from unique qualifying events: not the
 * sum of both counts, not the higher of the two. The same qualifying Booking
 * recorded against both identities collapses to one, and the result is capped
 * at three.
 */
export function rebuildLoyaltyCount(events: readonly { qualifyingKey: string }[]): number {
  const unique = new Set(events.map((e) => e.qualifyingKey));
  return Math.min(unique.size, MAX_LOYALTY_SLOTS);
}

/**
 * PRD §22 — open positions may temporarily exceed three after a merge. Nothing
 * is cancelled; the existing three-position rule in `holds.ts` already refuses
 * the next Hold or Request until the Person is back within the limit, so no
 * second limit lives here.
 */
