// Commission engine — Business Model v2.1 §11–§25
// (system/3_Percent_Club_Business_Model_v2.1_Final_Implementation_Baseline.md).
//
// Each Project sets its own Direct and Loyalty in an MD-approved version, and a
// Booking carries the version frozen on the Booking Request Accounts approved
// (v2.1 §16). Direct and Loyalty never apply to the same sale, and there is no
// combined cap (SSOT §11). Exact decimal arithmetic only (ARCHITECTURE §3.4).
//
// Where the documents are silent this module refuses rather than guesses
// (PRD §1.1) — an undocumented combination comes back as a Commission Conflict
// for CRM/Admin to correct.

import { Prisma } from "@prisma/client";
import { istDay } from "../tasks.ts";
import type { Check, Numeric } from "./booking.ts";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const ok: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/* ------------------------------------------------------------- v2.1 terms */

/** v2.1 §13 — hard ceilings. */
export const DIRECT_MAX_PERCENT = "5";
export const LOYALTY_MAX_PERCENT = "3";
/** v2.1 §19 — full third-party Direct at 25% verified Payment Received. */
export const DIRECT_MILESTONE = "25";
/** v2.1 §20, §22, §23 — self-purchase Direct and every Loyalty settle at 100%. */
export const FULL_MILESTONE = "100";
/** v2.1 §21, §25 — Customer-closing Loyalty: three successful events for life. */
export const CUSTOMER_CLOSING_LOYALTY_LIMIT = 3;
/** v2.1 §41 — a Buyback stands in for a milestone only after 25% received. */
export const BUYBACK_MIN_SOURCE_PAYMENT = "25";

/** A Project version as frozen on a Booking (v2.1 §16). A null percent is Disabled. */
export type FrozenTerms = { version: number; directPercent: string | null; loyaltyPercent: string | null };

export type CommissionTermsInput = {
  directEnabled: boolean;
  directPercent: string | null;
  loyaltyEnabled: boolean;
  loyaltyPercent: string | null;
  loyaltyExceptionReason: string | null;
};

/** Up to four decimals, which is what Decimal(7,4) stores without rounding. */
const RATE = /^\d{1,2}(\.\d{1,4})?$/;

/** "3.0000" → "3", "2.5000" → "2.5". The form every label and ruleVersion uses. */
export function rateLabel(percent: Numeric): string {
  return new D(percent).toString();
}

/**
 * v2.1 §13 — Direct Disabled with Loyalty Enabled, or Loyalty equal to or
 * higher than Direct, may proceed only with an MD exception and a written
 * commercial reason.
 */
export function needsLoyaltyException(t: CommissionTermsInput): boolean {
  if (!t.loyaltyEnabled || t.loyaltyPercent === null || !RATE.test(t.loyaltyPercent.trim())) return false;
  if (!t.directEnabled || t.directPercent === null || !RATE.test(t.directPercent.trim())) return true;
  return new D(t.loyaltyPercent.trim()).gte(new D(t.directPercent.trim()));
}

export function validateCommissionTerms(t: CommissionTermsInput): Check {
  const rate = (label: string, enabled: boolean, value: string | null, max: string): Check => {
    if (!enabled) {
      return value === null ? ok : fail(`${label} is Disabled, so it cannot carry a rate.`);
    }
    if (value === null || !RATE.test(value.trim())) {
      return fail(`${label} needs a rate such as 3 or 2.5, with at most four decimals.`);
    }
    const n = new D(value.trim());
    if (n.lte(0)) {
      return fail(`${label} cannot be 0%. A benefit that is not offered is set to Disabled.`);
    }
    if (n.gt(new D(max))) return fail(`${label} cannot exceed ${max}%.`);
    return ok;
  };
  const direct = rate("Direct Commission", t.directEnabled, t.directPercent, DIRECT_MAX_PERCENT);
  if (!direct.ok) return direct;
  const loyalty = rate("Customer Loyalty", t.loyaltyEnabled, t.loyaltyPercent, LOYALTY_MAX_PERCENT);
  if (!loyalty.ok) return loyalty;
  if (needsLoyaltyException(t) && !t.loyaltyExceptionReason?.trim()) {
    return fail(
      t.directEnabled
        ? "Customer Loyalty is not lower than Direct Commission. Write the reason for the MD exception."
        : "Customer Loyalty is offered without Direct Commission. Write the reason for the MD exception."
    );
  }
  return ok;
}

/**
 * v2.1 §21, §25 — whether one more Customer-closing Loyalty may qualify, given
 * how many of the closer's events have already qualified. After the third,
 * Membership activation is required to earn from further third-party sales.
 */
export function closingLoyaltyQualifies(alreadyQualified: number): boolean {
  return alreadyQualified < CUSTOMER_CLOSING_LOYALTY_LIMIT;
}

/* ------------------------------------------------------ anniversaries */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * RD-02 — the anniversary is the Member Activation Date anniversary, and a
 * 29 February activation falls back to 28 February in a non-leap year.
 */
export function anniversaryDay(activationDay: string, year: number): string {
  const [, month, day] = activationDay.split("-");
  if (month === "02" && day === "29" && !isLeapYear(year)) return `${year}-02-28`;
  return `${year}-${month}-${day}`;
}

/**
 * How long a relationship has run — a Member from their Activation Date, a
 * Customer from their first approved Booking.
 *
 * Derived on every read and never stored: a stored "3 years" is wrong the day
 * the fourth anniversary passes, and nothing would be there to correct it.
 *
 * A Member activated on 29 February gains a year on 28 February in a non-leap
 * year. (The old annual Invite/Royalty counters that also used this are gone —
 * Removal Audit OL-04, OL-11; only the relationship length still does.)
 *
 * Null means there is nothing to show yet: an unactivated Member, or an
 * activation dated in the future.
 */
export type ExperienceSince = { years: number; months: number; label: string };

export function experienceSince(
  activationDate: Date | string | null | undefined,
  at: Date = new Date()
): ExperienceSince | null {
  if (!activationDate) return null;

  const activationDay = istDay(activationDate);
  const today = istDay(at);
  if (today < activationDay) return null;

  const currentYear = Number(today.slice(0, 4));
  const reachedThisYear = today >= anniversaryDay(activationDay, currentYear);
  const years = currentYear - Number(activationDay.slice(0, 4)) - (reachedThisYear ? 0 : 1);

  // Whole months since the anniversary just passed.
  const lastAnniversary = anniversaryDay(activationDay, Number(activationDay.slice(0, 4)) + years);
  const [annYear, annMonth, annDayOfMonth] = lastAnniversary.split("-").map(Number);
  const [nowYear, nowMonth, nowDayOfMonth] = today.split("-").map(Number);

  let months = (nowYear - annYear) * 12 + (nowMonth - annMonth);
  if (nowDayOfMonth < annDayOfMonth) months--;

  const label =
    years === 0 && months === 0
      ? "Less than a month"
      : [
          years > 0 ? `${years} year${years === 1 ? "" : "s"}` : null,
          months > 0 ? `${months} month${months === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(" ");

  return { years, months, label };
}

/* --------------------------------------- historical classification (AC-01) */

/**
 * AC-01 — what an already-approved Booking's classification was, recovered from
 * what the Booking itself already holds.
 *
 * A Booking approved before `originalClassification` existed still has to be
 * classified, and the one source that must never be used is the buyer's Member
 * status *today*: for the converted Customer the pack is actually about, that
 * reads MEMBER and rewrites settled Customer business, which is the exact thing
 * Approved Changes §1 forbids.
 *
 * Two independent signals survive from the time of approval.
 *
 * **The commission, which is authoritative.** `generateCommission()` is the code
 * that read `buyerIsActiveMember` at approval, and its output is frozen on the
 * record. An Active Member buyer takes the self-purchase branch, which emits
 * exactly one DIRECT component carrying `DIRECT/SELF_PURCHASE/...` and returns
 * immediately; every other branch emits something else or nothing. Accounts
 * cannot approve while the engine reports a conflict (PRD RD-03), so an approved
 * Booking's earliest DIRECT record is the engine's own verdict on the question.
 *
 * **The dates, as a fallback.** A Booking that generated no commission at all —
 * a first 3% Club direct purchase earns nothing — has no verdict to read. There
 * the Member Activation Date against the approval date answers it.
 *
 * The commission wins where both exist. It used the buyer's *actual* status,
 * including a capability that has since been deactivated, which the dates alone
 * cannot see. A disagreement is reported rather than resolved silently.
 */
export type ClassificationEvidence = {
  /** `ruleVersion` of the earliest DIRECT record ever created for the Booking. */
  earliestDirectRuleVersion: string | null;
  /** Whether the Booking carries any commission record at all, current or not. */
  hasAnyCommission: boolean;
  /** When Accounts approved it. Null on a legacy row that never recorded one. */
  approvedAt: Date | null;
  /** The buyer's Member Activation Date, if they have ever been activated. */
  memberActivationDate: Date | null;
};

export type BookingClassification = "CUSTOMER" | "MEMBER";

export type ClassificationDecision =
  | {
      resolved: true;
      classification: BookingClassification;
      /** Which signal decided it, for the audit row and the migration report. */
      source: string;
      /** Set where the other signal disagreed — reported, never auto-resolved. */
      note: string | null;
    }
  | { resolved: false; reason: string };

/** The marker `generateCommission()` freezes onto a Member's own purchase. */
const SELF_PURCHASE_RULE = "SELF_PURCHASE";

export function classifyApprovedBooking(
  evidence: ClassificationEvidence
): ClassificationDecision {
  // What the engine decided at approval.
  const fromCommission: BookingClassification | null = evidence.earliestDirectRuleVersion
    ? evidence.earliestDirectRuleVersion.includes(SELF_PURCHASE_RULE)
      ? "MEMBER"
      : "CUSTOMER"
    : evidence.hasAnyCommission
      ? // Commission was generated and none of it is a Direct component. An
        // Active Member buyer always produces one, so this buyer was not one.
        "CUSTOMER"
      : null;

  // What the dates say, where they can say anything.
  const fromDates: BookingClassification | null = !evidence.memberActivationDate
    ? "CUSTOMER" // never activated, so never a Member at any approval date
    : evidence.approvedAt
      ? evidence.memberActivationDate <= evidence.approvedAt
        ? "MEMBER"
        : "CUSTOMER"
      : null;

  if (fromCommission) {
    const note =
      fromDates && fromDates !== fromCommission
        ? `The Member Activation Date suggests ${fromDates}, but the commission frozen at ` +
          `approval says ${fromCommission}. The commission is authoritative — it read the ` +
          `buyer's status at the time, including a Member capability that has since been ` +
          `deactivated. Worth an eye all the same.`
        : null;
    return {
      resolved: true,
      classification: fromCommission,
      source: evidence.earliestDirectRuleVersion
        ? `the Direct commission frozen at approval (${evidence.earliestDirectRuleVersion})`
        : "the commission generated at approval, which carries no Direct component",
      note,
    };
  }

  if (fromDates) {
    return {
      resolved: true,
      classification: fromDates,
      source: evidence.memberActivationDate
        ? "the Member Activation Date against the approval date"
        : "the buyer has never been activated as a Member",
      note: null,
    };
  }

  return {
    resolved: false,
    reason:
      "This Booking generated no commission and has no approval date, and its buyer has been " +
      "activated as a Member at some point. Nothing on the record says whether they held that " +
      "capability when it was approved.",
  };
}

/* ---------------------------------------------------------- the components */

export type CommissionType = "DIRECT" | "LOYALTY";

export type BeneficiaryRole = "SELLING_MEMBER" | "CLOSING_CUSTOMER" | "REPEAT_PURCHASE_CUSTOMER";

export type Component = {
  type: CommissionType;
  beneficiaryRole: BeneficiaryRole;
  beneficiaryPersonId: string;
  percent: string;
  milestonePercent: string;
  /** The rule and Project version the percentage came from, frozen for traceability. */
  ruleVersion: string;
};

export type CommissionInput = {
  soldByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId: string | null;
  /** The Primary Customer — the commercial buyer of this Booking. */
  buyerPersonId: string;
  /**
   * v2.1 §20 — the Primary Customer is an Active Member, frozen with the
   * Booking Request. A Customer who later activates keeps their earlier
   * Bookings classified as Customer business (AC-01).
   */
  buyerIsActiveMember: boolean;
  /** v2.1 §23 — an earlier approved, uncancelled purchase makes this a repeat. */
  buyerHasPriorPurchase: boolean;
  /** v2.1 §16 — the Project version frozen with the Booking Request; null if none was. */
  terms: FrozenTerms | null;
  /** v2.1 §24 — the Person who would earn Loyalty held a Deactivated Member capability. */
  loyaltySubjectDeactivated: boolean;
};

export type CommissionOutcome =
  | { ok: true; components: Component[]; totalPercent: Decimal }
  /** Shown as Commission Conflict, corrected by CRM/Admin. */
  | { ok: false; conflict: string };

/**
 * The facts a screen holds about one Person — the Calculator's input, built
 * without a Booking. Loyalty follows the closing Customer on a Customer close,
 * and the buyer otherwise (v2.1 §21–§24).
 */
export type PersonFacts = {
  id: string;
  memberActive: boolean;
  memberDeactivated: boolean;
  hasPriorPurchase: boolean;
};

export function previewInput(
  soldByType: CommissionInput["soldByType"],
  seller: PersonFacts | null,
  buyer: PersonFacts,
  terms: FrozenTerms | null
): CommissionInput {
  const loyaltySubject = soldByType === "CUSTOMER" ? seller : buyer;
  return {
    soldByType,
    soldByPersonId: soldByType === "THREE_PERCENT_CLUB" ? null : (seller?.id ?? null),
    buyerPersonId: buyer.id,
    buyerIsActiveMember: buyer.memberActive,
    buyerHasPriorPurchase: buyer.hasPriorPurchase,
    terms,
    loyaltySubjectDeactivated: loyaltySubject?.memberDeactivated ?? false,
  };
}

const settled = (components: Component[]): CommissionOutcome => ({
  ok: true,
  components,
  totalPercent: totalOf(components),
});

/**
 * v2.1 §11, §19–§24, row by row. The final Sold By controls commission; Enquiry
 * Source is historical and never decides anything here.
 */
export function generateCommission(input: CommissionInput): CommissionOutcome {
  const terms = input.terms;
  if (!terms) {
    return {
      ok: false,
      conflict:
        "This Booking has no frozen commission settings. Send the Booking Request again so it " +
        "freezes the Project's approved settings.",
    };
  }
  const v = `V${terms.version}`;

  const direct = (personId: string, rule: "THIRD_PARTY" | "SELF_PURCHASE"): Component[] => {
    if (terms.directPercent === null) return [];
    const milestone = rule === "SELF_PURCHASE" ? FULL_MILESTONE : DIRECT_MILESTONE;
    const rate = rateLabel(terms.directPercent);
    return [
      {
        type: "DIRECT",
        beneficiaryRole: "SELLING_MEMBER",
        beneficiaryPersonId: personId,
        percent: rate,
        milestonePercent: milestone,
        ruleVersion: `DIRECT/${rule}/${v}/${rate}%@${milestone}`,
      },
    ];
  };

  const loyalty = (personId: string, role: "CLOSING_CUSTOMER" | "REPEAT_PURCHASE_CUSTOMER"): Component[] => {
    if (terms.loyaltyPercent === null || input.loyaltySubjectDeactivated) return [];
    const rate = rateLabel(terms.loyaltyPercent);
    const rule = role === "CLOSING_CUSTOMER" ? "INTRODUCED_BUYER" : "REPEAT_PURCHASE";
    return [
      {
        type: "LOYALTY",
        beneficiaryRole: role,
        beneficiaryPersonId: personId,
        percent: rate,
        milestonePercent: FULL_MILESTONE,
        ruleVersion: `LOYALTY/${rule}/${v}/${rate}%@${FULL_MILESTONE}`,
      },
    ];
  };

  /* v2.1 §20 — the Primary Customer is an Active Member: Direct at 100%, nothing else. */
  if (input.buyerIsActiveMember) {
    if (input.soldByType !== "MEMBER" || input.soldByPersonId !== input.buyerPersonId) {
      return {
        ok: false,
        conflict:
          "The buyer holds an Active Member capability, so this is a Member personal purchase and " +
          "Sold By must name that same Member. Correct Sold By before Accounts approval.",
      };
    }
    return settled(direct(input.buyerPersonId, "SELF_PURCHASE"));
  }

  /* v2.1 §19 — a Member closes a third-party sale: Direct at 25%. */
  if (input.soldByType === "MEMBER") {
    if (!input.soldByPersonId) return { ok: false, conflict: "Sold By Member names no selling Member." };
    return settled(direct(input.soldByPersonId, "THIRD_PARTY"));
  }

  /* v2.1 §22 — a Customer closes for another buyer: Loyalty to the closer. */
  if (input.soldByType === "CUSTOMER") {
    if (!input.soldByPersonId) {
      return { ok: false, conflict: "Sold By Customer names no closing Customer." };
    }
    if (input.soldByPersonId === input.buyerPersonId) {
      return {
        ok: false,
        conflict:
          "A Customer cannot close their own purchase as Sold By Customer. A repeat personal " +
          "purchase is recorded as a 3% Club direct sale.",
      };
    }
    return settled(loyalty(input.soldByPersonId, "CLOSING_CUSTOMER"));
  }

  /* v2.1 §23 — 3% Club: a repeat purchase earns Loyalty for the buyer; a first earns nothing. */
  return settled(input.buyerHasPriorPurchase ? loyalty(input.buyerPersonId, "REPEAT_PURCHASE_CUSTOMER") : []);
}

export function totalOf(components: readonly { percent: Numeric }[]): Decimal {
  return components.reduce((sum, c) => sum.add(new D(c.percent)), new D(0));
}

/* ------------------------------------------------------------ eligibility */

export type EligibilityState = "MILESTONE_PENDING" | "READY" | "ON_HOLD";

/**
 * What every screen calls an eligibility state. It lives here rather than in
 * each screen so a new state cannot leave three of them printing a raw enum.
 */
export function eligibilityLabel(state: string): string {
  switch (state) {
    case "MILESTONE_PENDING":
      return "Milestone Pending";
    case "READY":
      return "Ready";
    case "ON_HOLD":
      return "On Hold";
    default:
      return state;
  }
}

export type HoldReason =
  | "AADHAAR_PENDING"
  | "BANK_VERIFICATION_PENDING"
  | "RERA_PENDING"
  | "RERA_EXPIRED"
  | "MEMBER_COMMISSION_HOLD"
  | "MEMBER_DEACTIVATED"
  | "REFUND_PENDING"
  | "CHANGE_PLOT_PENDING"
  | "BUYBACK_PENDING"
  | "PAYMENT_PENDING"
  | "CLOSER_KYC_PENDING"
  | "CUSTOMER_TERMS_PENDING"
  | "RECOVERY_OUTSTANDING"
  | "OLD_RECOVERY_PENDING"
  | "STAFF_CONFLICT_REVIEW"
  | "RECOVERY_CIRCUMVENTION_REVIEW";

/**
 * v2.1 §20, §21, §41 — an Approved Buyback is the alternative milestone for
 * Loyalty only. It never accelerates Direct; Buying Commission hangs off the
 * acquisition rather than the sale, so it is not on this axis either.
 */
export function buybackAccelerates(type: CommissionType | "BUYING"): boolean {
  return type === "LOYALTY";
}

/**
 * v2.1 §41 — the Buyback stands in for the milestone only when the source
 * Booking has already reached 25% verified Payment Received.
 */
export function buybackMilestoneMet(args: {
  type: CommissionType | "BUYING";
  buybackApproved: boolean;
  progressPercent: Numeric;
}): boolean {
  return (
    args.buybackApproved &&
    buybackAccelerates(args.type) &&
    new D(args.progressPercent).gte(new D(BUYBACK_MIN_SOURCE_PAYMENT))
  );
}

export type EligibilityInput = {
  type: CommissionType;
  /** Verified Payment Received on the Booking. */
  progressPercent: Numeric;
  milestonePercent: Numeric;
  /** v2.1 §41 — set from `buybackMilestoneMet`; Direct never sets it. */
  buybackMilestoneMet?: boolean;
  beneficiaryAadhaarAvailable: boolean;
  beneficiaryBankVerified: boolean;
  /** Member components only; null for a Customer's Loyalty. */
  memberStatus: "ACTIVE" | "DEACTIVATED" | null;
  memberCommissionHold: boolean;
  reraStatus: "REGISTERED" | "PENDING" | "EXPIRED" | "NOT_APPLICABLE" | null;
  /** The Booking's active major process, if any (ARCHITECTURE §6.3). */
  bookingProcess:
    | "NONE"
    | "REFUND_PENDING"
    | "CHANGE_PLOT_PENDING"
    | "BUYBACK_PENDING"
    | "PRIMARY_CUSTOMER_CHANGE_UNDER_REVIEW"
    | "SOLD_BY_CORRECTION_UNDER_REVIEW"
    | "MANAGEMENT_ACTION_REQUIRED";
  /** Payment Given on the acquisition is below 100% (PRD §11.3). */
  acquisitionPaymentPending: boolean;
  /**
   * v2.1 §22, §77 — a Customer-closing Loyalty's closer must have verified KYC
   * and accepted Customer Terms. Null on every other record.
   */
  closer: { kycVerified: boolean; termsAccepted: boolean } | null;
  /**
   * CP §54, §85 — the beneficiary has a Recovery Outstanding, so no new cash
   * payout is released; the entitlement stays recorded.
   */
  recoveryOutstanding?: boolean;
  /**
   * CP §64 T23 — this record's beneficiary replaced one whose paid record on
   * the same Booking is still to be recovered, and MD has not approved paying
   * the corrected beneficiary first.
   */
  oldRecoveryPending?: boolean;
  /** CP §58 NT09 — staff or a declared close relative, not yet approved by MD. */
  staffConflictPending?: boolean;
  /** CP §55 NT08 — shares an indicator with an unresolved Recovery, not yet cleared. */
  circumventionPending?: boolean;
};

export type Eligibility = { state: EligibilityState; holdReason: HoldReason | null };

const MEMBER_ROLES: CommissionType[] = ["DIRECT"];

/**
 * prd-complete §14.7, §14.8 — eligibility is an axis of its own, separate from the
 * payment state. Deal-level and Member-level holds are decided first, because
 * they apply whether or not the milestone has been reached (PRD §15.3); only
 * then does the milestone decide; and the beneficiary conditions come last.
 */
export function resolveEligibility(input: EligibilityInput): Eligibility {
  const hold = (holdReason: HoldReason): Eligibility => ({ state: "ON_HOLD", holdReason });

  if (input.bookingProcess === "REFUND_PENDING") return hold("REFUND_PENDING");
  if (input.bookingProcess === "CHANGE_PLOT_PENDING") return hold("CHANGE_PLOT_PENDING");
  if (input.bookingProcess === "BUYBACK_PENDING") return hold("BUYBACK_PENDING");
  if (input.acquisitionPaymentPending) return hold("PAYMENT_PENDING");

  const isMemberComponent = MEMBER_ROLES.includes(input.type);
  if (isMemberComponent) {
    if (input.memberStatus === "DEACTIVATED") return hold("MEMBER_DEACTIVATED");
    if (input.memberCommissionHold) return hold("MEMBER_COMMISSION_HOLD");
  }

  // The Buyback is an *alternative* milestone, so it is checked alongside
  // Payment Received rather than instead of it: whichever arrives first counts.
  if (!input.buybackMilestoneMet && new D(input.progressPercent).lt(new D(input.milestonePercent))) {
    return { state: "MILESTONE_PENDING", holdReason: null };
  }

  // CP §54 — reached, but held while the beneficiary owes a Recovery (UAT CTL-01).
  if (input.recoveryOutstanding) return hold("RECOVERY_OUTSTANDING");
  if (input.oldRecoveryPending) return hold("OLD_RECOVERY_PENDING");
  // CP §55, §58 — release controls: held for review, never denied automatically.
  if (input.staffConflictPending) return hold("STAFF_CONFLICT_REVIEW");
  if (input.circumventionPending) return hold("RECOVERY_CIRCUMVENTION_REVIEW");

  // Conditions on the beneficiary. PAN never creates an automatic hold.
  if (!input.beneficiaryAadhaarAvailable) return hold("AADHAAR_PENDING");
  if (!input.beneficiaryBankVerified) return hold("BANK_VERIFICATION_PENDING");

  if (isMemberComponent) {
    // Registered or Not Applicable satisfies the condition (prd-complete §14.7).
    if (input.reraStatus === "PENDING") return hold("RERA_PENDING");
    if (input.reraStatus === "EXPIRED") return hold("RERA_EXPIRED");
  }

  if (input.closer) {
    if (!input.closer.kycVerified) return hold("CLOSER_KYC_PENDING");
    if (!input.closer.termsAccepted) return hold("CUSTOMER_TERMS_PENDING");
  }

  return { state: "READY", holdReason: null };
}

/* --------------------------------------------------------- payment states */

export type PaymentState =
  | "NOT_PAID"
  | "PAID"
  | "PAID_EARLY"
  | "ACCOUNTS_ADJUSTMENT_REQUIRED"
  | "CANCELLED";

/**
 * PRD §6.11 with AC-03 — Accounts may process a commission before eligibility is
 * Ready. It needs compulsory remarks, a reference and a date.
 *
 * AC-03 changes one thing about PRD §6.11: Paid Early now requires a recorded MD
 * approval. The approved pack is explicit that "without approval, the system
 * must not mark the benefit as approved", so the absence of an approval is a
 * refusal here in the domain rather than a convention Accounts is trusted to
 * follow. `mdApproved` is the presence of a stored approver and timestamp, never
 * an in-memory claim by the caller.
 *
 * A Paid Early record can never be marked Paid again.
 */
export function canMarkPaid(
  current: PaymentState,
  eligibility: EligibilityState,
  early: boolean,
  mdApproved = false
): Check {
  if (current === "PAID") return fail("This commission is already Paid.");
  if (current === "PAID_EARLY") {
    return fail("This commission was processed as Paid Early and cannot be marked Paid again.");
  }
  if (current === "CANCELLED") return fail("A cancelled commission cannot be paid.");
  if (current === "ACCOUNTS_ADJUSTMENT_REQUIRED") {
    return fail("This record needs an Accounts adjustment before any further payment action.");
  }
  if (early && !mdApproved) {
    return fail(
      "Paid Early requires a recorded MD approval. Raise the Paid Early approval for this " +
        "commission and have MD approve it before processing the payment."
    );
  }
  if (!early && eligibility !== "READY") {
    return fail(
      "Eligibility is not Ready. Use Paid Early with compulsory remarks if the payment must be " +
        "processed before the normal conditions are met."
    );
  }
  return ok;
}

/**
 * PRD §6.11 — no second commission-payment task is created when the normal
 * milestone is later reached, and Paid Early is excluded from Not Paid totals.
 */
export function needsPaymentTask(payment: PaymentState, eligibility: EligibilityState): boolean {
  return eligibility === "READY" && payment === "NOT_PAID";
}

export function countsAsUnpaid(payment: PaymentState): boolean {
  return payment === "NOT_PAID";
}

/**
 * PRD §6.12, §12.3, §6.10 — when a later cancellation, payment correction or
 * beneficiary correction affects a record, an unpaid one simply steps back and
 * an externally processed one becomes Accounts Adjustment Required. Nothing is
 * ever deleted.
 */
export function afterAffectingChange(
  payment: PaymentState,
  change: "MILESTONE_LOST" | "CANCELLED_BEFORE_COMPLETION" | "BENEFICIARY_CORRECTED"
): PaymentState {
  if (payment === "PAID" || payment === "PAID_EARLY") return "ACCOUNTS_ADJUSTMENT_REQUIRED";
  if (payment === "ACCOUNTS_ADJUSTMENT_REQUIRED" || payment === "CANCELLED") return payment;
  return change === "MILESTONE_LOST" ? "NOT_PAID" : "CANCELLED";
}
