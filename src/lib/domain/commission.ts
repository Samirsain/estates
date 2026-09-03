// Commission engine — PRD.md §6, §13, §14; main-PRD.md §14, §25 (compatibility
// matrix), RD-02 (annual counters), RD-03 (4% cap).
// Exact decimal arithmetic only (ARCHITECTURE §3.4): the 4% cap and the bands
// are never judged on binary floating point.
//
// Where the documents are silent this module refuses rather than guesses
// (PRD §1.1) — an undocumented combination comes back as a Commission Conflict
// for CRM/Admin to correct, which is exactly the mechanism RD-03 defines.

import { Prisma } from "@prisma/client";
import { istDay } from "../tasks.ts";
import type { Check, Numeric } from "./booking.ts";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const ok: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/* ------------------------------------------------------------------ rates */

/** main-PRD §14.2 — Direct Commission is 3% to the final selling Member. */
export const DIRECT_PERCENT = "3";
/** PRD §6.5 — Loyalty Bonus is 1%. */
export const LOYALTY_PERCENT = "1";
/** RD-03 — combined sale commission for one Booking never exceeds 4%. */
export const SALE_CAP_PERCENT = new D(4);
/** PRD §6.5 — combined lifetime maximum of three Loyalty Bonuses. */
export const MAX_LOYALTY_SLOTS = 3;

/** main-PRD §14.2 — the ordinary Direct milestone is 25% verified payment. */
export const DIRECT_MILESTONE = "25";
/** Invite, Royalty, Loyalty and a Member self-purchase all settle at 100%. */
export const FULL_MILESTONE = "100";

/**
 * PRD §6.2, §6.3 — the same band table serves the annual Invited Member Counter
 * and the separate annual Introduced Customer Counter.
 */
export const NETWORK_BANDS = [
  { from: 1, to: 3, percent: "1" },
  { from: 4, to: 6, percent: "0.5" },
  { from: 7, to: 9, percent: "0.25" },
] as const;

export function bandRate(position: number): string {
  if (!Number.isInteger(position) || position < 1) {
    throw new Error("A network position is a whole number starting at 1.");
  }
  for (const band of NETWORK_BANDS) {
    if (position >= band.from && position <= band.to) return band.percent;
  }
  return "0"; // after 9
}

/**
 * RD-02 — positions are assigned in order within the counter year and are then
 * permanently fixed. Existing positions never reset, renumber or move, so the
 * next one continues past the highest already taken.
 */
export function nextNetworkPosition(positionsTakenThisYear: readonly number[]): number {
  return positionsTakenThisYear.length === 0 ? 1 : Math.max(...positionsTakenThisYear) + 1;
}

/* --------------------------------------------------- annual counter year */

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
 * It shares `anniversaryDay` with the annual counters on purpose. A Member
 * activated on 29 February must gain a year on the same day their counter
 * rolls — 28 February in a non-leap year — rather than a day later.
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

/**
 * The IST calendar day the Member's current counter year began on. Only newly
 * introduced Members or Customers enter the new annual counter (RD-02).
 */
export function counterYearStart(activationDate: Date, at: Date = new Date()): string {
  const activationDay = istDay(activationDate);
  const today = istDay(at);
  const thisYear = anniversaryDay(activationDay, Number(today.slice(0, 4)));
  return today >= thisYear
    ? thisYear
    : anniversaryDay(activationDay, Number(today.slice(0, 4)) - 1);
}

/** True when `at` has crossed into a new counter year since `lastYearStart`. */
export function counterYearRolled(
  activationDate: Date,
  lastYearStart: string,
  at: Date = new Date()
): boolean {
  return counterYearStart(activationDate, at) > lastYearStart;
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

/* ------------------------------------------------- performance cycles */

/**
 * CR-014, CR-027 — a Member holds two performance cycles, one per counter, and
 * they upgrade independently.
 *
 * The previous model was an annual window: a cycle covered one counter year and
 * a new one opened every anniversary whether anything had been achieved or not.
 * The pack removes that outright — "Remove automatic annual reset", "If a
 * counter is incomplete on anniversary, nothing resets" — so a cycle here is a
 * set of positions rather than a span of time. It opens on an anniversary and it
 * ends when positions 1 to 9 have each completed, however many anniversaries
 * that takes.
 *
 * What a position must do to count is the same shape on both sides:
 *
 *  - Invite position — that invited Member's first qualifying third-party
 *    transaction reaches 100% Payment Received (or an Approved Buyback, which is
 *    CR-015 and lands with the Buyback work).
 *  - Royalty position — that Customer's one qualifying Royalty transaction
 *    reaches the same milestone.
 *
 * Both of those are already recorded, atomically and in one place: the
 * `CommissionOpportunity` row. It is consumed exactly at that milestone and
 * reopened if the sale is cancelled before completion, which is precisely
 * CR-014's "Cancelled/reversed qualifying events do not count as successfully
 * completed". So a position is successful when its one-time opportunity is
 * consumed, and there is no second source of truth to keep in step.
 */

/** CR-014 — positions 1 to 9 must each complete before a cycle upgrades. */
export const CYCLE_POSITIONS = 9;

/**
 * CR-013 — a position past the ninth is real, visible and consuming, but it is
 * not part of the cycle: the cycle is completed by its first nine.
 */
export function countsTowardsCycle(position: number): boolean {
  return position >= 1 && position <= CYCLE_POSITIONS;
}

/**
 * CR-014 — "When positions 1–9 are all successful, status becomes Upgrade
 * Eligible." Never on a subset, and never on a cycle that has not filled all
 * nine positions yet.
 */
export function cycleComplete(successfulPositions: readonly number[]): boolean {
  const filled = new Set(successfulPositions.filter(countsTowardsCycle));
  return filled.size === CYCLE_POSITIONS;
}

/**
 * CR-027 — whether the anniversary run may open the next cycle today.
 *
 * Three things have to hold at once, and the third is the pack's own
 * implementation convention: "run upgrade check at start of anniversary day in
 * Asia/Kolkata; completion recorded after that run waits until the next
 * anniversary". A cycle that completes *on* the anniversary is therefore not
 * rolled by that anniversary — it waits a year, which is what makes the job
 * safe to re-run and independent of the hour it happens to run at.
 */
export function mayOpenNextCycle(args: {
  activationDate: Date | string;
  status: "IN_PROGRESS" | "UPGRADE_ELIGIBLE";
  completedAt: Date | null;
  at: Date;
}): boolean {
  if (args.status !== "UPGRADE_ELIGIBLE" || !args.completedAt) return false;
  const today = istDay(args.at);
  if (counterYearStart(new Date(args.activationDate), args.at) !== today) return false;
  return istDay(args.completedAt) < today;
}

/**
 * CR-014 — what a completed cycle earned, in its own terms. Derived from the
 * positions themselves rather than a fixed label, so the cycle says what it
 * actually achieved rather than that it achieved something.
 */
export function cycleEntitlement(kind: "INVITE" | "ROYALTY", cycleNumber: number): string {
  const counter = kind === "INVITE" ? "Invite" : "Royalty";
  return `${counter} cycle ${cycleNumber} complete — positions 1 to ${CYCLE_POSITIONS} all successful. Upgrade Eligible.`;
}

/* ---------------------------------------------------------- the components */

export type CommissionType = "DIRECT" | "INVITE" | "ROYALTY" | "LOYALTY";

export type BeneficiaryRole =
  | "SELLING_MEMBER"
  | "INVITING_MEMBER"
  | "INTRODUCING_MEMBER"
  | "CLOSING_CUSTOMER"
  | "REPEAT_PURCHASE_CUSTOMER";

export type Component = {
  type: CommissionType;
  beneficiaryRole: BeneficiaryRole;
  beneficiaryPersonId: string;
  percent: string;
  milestonePercent: string;
  /** The rule and band the percentage came from, frozen for traceability. */
  ruleVersion: string;
};

export type NetworkLink = {
  /** The Person who receives the band benefit. */
  beneficiaryPersonId: string;
  /** Frozen at activation / first valid introduction and never renumbered. */
  position: number;
  /** The band snapshot taken with the position (RD-02). */
  ratePercent: string;
};

export type CommissionInput = {
  soldByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId: string | null;
  /** The Primary Customer — the commercial buyer of this Booking. */
  buyerPersonId: string;
  /**
   * PRD §6.7, §14.2 — the buyer holds an Active Member capability.
   *
   * AC-01 — for an approved Booking this is the *frozen* classification taken at
   * Accounts approval, not the buyer's standing today. A Customer who later
   * activates as a Member leaves their earlier approved Bookings classified as
   * Customer business, so a regeneration after activation must not silently
   * rewrite them into Member self-purchases.
   */
  buyerIsActiveMember: boolean;
  /**
   * PRD §14.5 — the buyer already has a legally completed purchase, so this one
   * is a repeat purchase. The first personal purchase earns no repeat Loyalty.
   */
  buyerHasPriorPurchase: boolean;

  /** The selling Member's immediate inviting Member, where one exists. */
  invite: NetworkLink | null;
  /** PRD §6.1 — only one current Invite opportunity per invited Member. */
  inviteOpportunityOpen: boolean;

  /** The buyer's frozen Original Introduced By Member (PRD §6.4). */
  royalty: NetworkLink | null;
  /** PRD §6.3 — Royalty may be generated only once per introduced Customer. */
  royaltyOpportunityOpen: boolean;

  /** Lifetime Loyalty slots the relevant Customer has already consumed. */
  loyaltySlotsConsumed: number;
};

export type CommissionOutcome =
  | { ok: true; components: Component[]; totalPercent: Decimal }
  /** RD-03 — shown as Commission Conflict, corrected by CRM/Admin. */
  | { ok: false; conflict: string };

/**
 * The facts a screen holds about one Person, and the engine input two of them
 * make between them.
 *
 * commissionInputFor() in services/commission-service builds the same input
 * from a real Booking. This builds it from two people and no Booking at all,
 * which is what the Calculator asks: who would earn what, before there is a
 * sale to ask it of.
 *
 * It lives here, beside the engine and away from React, because the wiring is
 * the part worth checking: the Invite band belongs to the *seller's* inviting
 * Member and the Royalty band to the *buyer's* introducing Member, and Loyalty
 * follows the closing Customer where one closed the sale. Crossing any of
 * those over pays the wrong person at the right rate, which is the hardest
 * kind of wrong to see on a screen.
 */
export type PersonFacts = {
  id: string;
  /** PRD §6.7, §14.2 — an Active Member capability changes the whole row. */
  memberActive: boolean;
  /** PRD §14.5 — a first personal purchase earns no repeat-purchase Loyalty. */
  hasPriorPurchase: boolean;
  /** This Member's own position under their inviting Member (RD-02). */
  invite: NetworkLink | null;
  /** PRD §6.1 — one Invite opportunity per invited Member. */
  inviteUsed: boolean;
  /** This Customer's position under their Original Introduced By Member (§6.4). */
  royalty: NetworkLink | null;
  /** PRD §6.3 — one Royalty opportunity per introduced Customer. */
  royaltyUsed: boolean;
  /** PRD §6.5 — lifetime Loyalty slots already consumed, of three. */
  loyaltyUsed: number;
};

export function previewInput(
  soldByType: CommissionInput["soldByType"],
  seller: PersonFacts | null,
  buyer: PersonFacts
): CommissionInput {
  // Only a Member close carries an Invite band; a Customer or 3% Club close
  // has no invited Member behind it.
  const selling = soldByType === "MEMBER" ? seller : null;
  // Loyalty belongs to the closing Customer where one closed the sale, and to
  // the buyer otherwise (PRD §6.5, §14.5).
  const loyaltySubject = soldByType === "CUSTOMER" ? seller : buyer;

  return {
    soldByType,
    soldByPersonId: soldByType === "THREE_PERCENT_CLUB" ? null : (seller?.id ?? null),
    buyerPersonId: buyer.id,
    buyerIsActiveMember: buyer.memberActive,
    buyerHasPriorPurchase: buyer.hasPriorPurchase,
    invite: selling?.invite ?? null,
    inviteOpportunityOpen: selling ? !selling.inviteUsed : false,
    royalty: buyer.royalty,
    royaltyOpportunityOpen: !buyer.royaltyUsed,
    loyaltySlotsConsumed: loyaltySubject?.loyaltyUsed ?? 0,
  };
}

function band(link: NetworkLink, label: string): Component["percent"] {
  // The frozen rate wins over a recomputed one: a position's band never moves
  // after it is assigned (RD-02). The recomputed value is only a sanity check.
  const expected = bandRate(link.position);
  if (!new D(link.ratePercent).eq(new D(expected))) {
    throw new Error(
      `${label} position ${link.position} carries a frozen rate of ${link.ratePercent}% ` +
        `but the band table says ${expected}%. Resolve the network record before generating commission.`
    );
  }
  return link.ratePercent;
}

/**
 * main-PRD §25 — the approved compatibility matrix, implemented row by row.
 * The final Sold By selection controls commission; Enquiry Source is historical
 * and never decides anything here (PRD §6.5, main-PRD §14.6).
 */
export function generateCommission(input: CommissionInput): CommissionOutcome {
  const components: Component[] = [];
  const loyaltyAvailable = input.loyaltySlotsConsumed < MAX_LOYALTY_SLOTS;

  /* Row: Active Member buys personally — 3% Direct at 100%, nothing else, and
     the inviting Member's opportunity is left untouched (main-PRD §14.2). */
  if (input.buyerIsActiveMember) {
    if (input.soldByType !== "MEMBER" || input.soldByPersonId !== input.buyerPersonId) {
      return {
        ok: false,
        conflict:
          "The buyer holds an Active Member capability, so this is a Member personal purchase and " +
          "Sold By must name that same Member. Correct Sold By before Accounts approval.",
      };
    }
    components.push({
      type: "DIRECT",
      beneficiaryRole: "SELLING_MEMBER",
      beneficiaryPersonId: input.buyerPersonId,
      percent: DIRECT_PERCENT,
      milestonePercent: FULL_MILESTONE,
      ruleVersion: "DIRECT/SELF_PURCHASE/3%@100",
    });
    return settle(components);
  }

  if (input.soldByType === "MEMBER") {
    if (!input.soldByPersonId) {
      return { ok: false, conflict: "Sold By Member names no selling Member." };
    }
    /* Row: Member closes a third-party sale — 3% Direct at 25%, plus the
       inviting Member's band at 100% while that opportunity is still open. */
    components.push({
      type: "DIRECT",
      beneficiaryRole: "SELLING_MEMBER",
      beneficiaryPersonId: input.soldByPersonId,
      percent: DIRECT_PERCENT,
      milestonePercent: DIRECT_MILESTONE,
      ruleVersion: "DIRECT/THIRD_PARTY/3%@25",
    });

    // CR-013 — a position past the ninth earns 0%, and the record is still
    // created. It used to be skipped, which meant the position simply vanished:
    // nothing on the Booking said who was in it, and the invited Member's
    // one-time opportunity stayed open for a later sale to take at 1%. The pack
    // is explicit that a 0% line is visible and consumes that opportunity.
    if (input.invite && input.inviteOpportunityOpen) {
      const percent = band(input.invite, "Invite");
      components.push({
        type: "INVITE",
        beneficiaryRole: "INVITING_MEMBER",
        beneficiaryPersonId: input.invite.beneficiaryPersonId,
        percent,
        milestonePercent: FULL_MILESTONE,
        ruleVersion: `INVITE/POSITION_${input.invite.position}/${percent}%@100`,
      });
    }
    return settle(components);
  }

  if (input.soldByType === "CUSTOMER") {
    if (!input.soldByPersonId) {
      return { ok: false, conflict: "Sold By Customer names no closing Customer." };
    }
    /* PRD §6.5 — Loyalty is for closing a sale for a *different* buyer. */
    if (input.soldByPersonId === input.buyerPersonId) {
      return {
        ok: false,
        conflict:
          "A Customer cannot close their own purchase as Sold By Customer. A repeat personal " +
          "purchase is recorded as a 3% Club direct sale.",
      };
    }
    if (loyaltyAvailable) {
      components.push({
        type: "LOYALTY",
        beneficiaryRole: "CLOSING_CUSTOMER",
        beneficiaryPersonId: input.soldByPersonId,
        percent: LOYALTY_PERCENT,
        milestonePercent: FULL_MILESTONE,
        ruleVersion: "LOYALTY/INTRODUCED_BUYER/1%@100",
      });
    }
    return settle(components);
  }

  /* Sold By 3% Club. A first direct purchase earns nothing at all; a repeat
     direct purchase may earn Loyalty for the buyer and Royalty for the Member
     who originally introduced them (main-PRD §14.5, §25). */
  if (input.buyerHasPriorPurchase) {
    if (loyaltyAvailable) {
      components.push({
        type: "LOYALTY",
        beneficiaryRole: "REPEAT_PURCHASE_CUSTOMER",
        beneficiaryPersonId: input.buyerPersonId,
        percent: LOYALTY_PERCENT,
        milestonePercent: FULL_MILESTONE,
        ruleVersion: "LOYALTY/REPEAT_PURCHASE/1%@100",
      });
    }
    // CR-013 again, on the Royalty side.
    if (input.royalty && input.royaltyOpportunityOpen) {
      const percent = band(input.royalty, "Royalty");
      components.push({
        type: "ROYALTY",
        beneficiaryRole: "INTRODUCING_MEMBER",
        beneficiaryPersonId: input.royalty.beneficiaryPersonId,
        percent,
        milestonePercent: FULL_MILESTONE,
        ruleVersion: `ROYALTY/POSITION_${input.royalty.position}/${percent}%@100`,
      });
    }
  }
  return settle(components);
}

/**
 * RD-03 — the system never trims, reduces or overrides a component to fit. An
 * over-cap combination is reported so CRM/Admin can correct Sold By, the
 * beneficiary or another invalid source detail.
 */
function settle(components: Component[]): CommissionOutcome {
  const totalPercent = totalOf(components);
  if (totalPercent.gt(SALE_CAP_PERCENT)) {
    return {
      ok: false,
      conflict:
        `Commission Conflict — Above 4%. The generated combination totals ` +
        `${totalPercent.toFixed(2)}%: ` +
        components.map((c) => `${c.type} ${c.percent}%`).join(", ") +
        `. Correct Sold By, the beneficiary or the source details — no component is trimmed.`,
    };
  }
  return { ok: true, components, totalPercent };
}

export function totalOf(components: readonly { percent: Numeric }[]): Decimal {
  return components.reduce((sum, c) => sum.add(new D(c.percent)), new D(0));
}

/** RD-03 — Buying Commission stays outside the sale cap. */
export function checkSaleCap(saleComponents: readonly { percent: Numeric }[]): Check {
  const total = saleComponents.reduce((sum, c) => sum.add(new D(c.percent)), new D(0));
  return total.gt(SALE_CAP_PERCENT)
    ? fail(`Commission Conflict — Above 4%. The combination totals ${total.toFixed(2)}%.`)
    : ok;
}

/* ------------------------------------------------------------ eligibility */

export type EligibilityState = "MILESTONE_PENDING" | "READY" | "ON_HOLD" | "NO_BENEFIT";

/**
 * CR-013 — "Position 10+ = 0%, remains visible, and consumes that person's
 * one-time opportunity", with the status the pack itself recommends.
 *
 * This is a state rather than a hold reason on purpose. A hold is something
 * that can lift; a band of 0% never becomes payable, and calling it On Hold
 * would leave every screen implying that one day it might be.
 */
export function noBenefitLabel(type: CommissionType): string {
  const what = type === "INVITE" ? "Invite" : type === "ROYALTY" ? "Royalty" : "";
  return what ? `No ${what} Benefit — Position Above 9` : "No Benefit";
}

/**
 * What every screen calls an eligibility state. It lives here rather than in
 * each screen because it was in four screens, and adding a state to a vocabulary
 * that exists four times leaves three of them printing a raw enum.
 */
export function eligibilityLabel(state: string, type?: CommissionType): string {
  switch (state) {
    case "MILESTONE_PENDING":
      return "Milestone Pending";
    case "READY":
      return "Ready";
    case "ON_HOLD":
      return "On Hold";
    case "NO_BENEFIT":
      return type ? noBenefitLabel(type) : "No Benefit";
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
  | "COMMISSION_CONFLICT_ABOVE_4";

export type EligibilityInput = {
  type: CommissionType;
  /**
   * CR-013 — the record's own rate. A 0% band is never payable. Null where the
   * rate is not decided yet, as in a Calculator line whose beneficiary has been
   * picked but whose band has not: an unknown rate is not a zero one.
   */
  percent: Numeric | null;
  /** Verified Payment Received on the Booking. */
  progressPercent: Numeric;
  milestonePercent: Numeric;
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
  /** RD-03 — the Booking's combination is above 4%. */
  commissionConflictAbove4: boolean;
};

export type Eligibility = { state: EligibilityState; holdReason: HoldReason | null };

const MEMBER_ROLES: CommissionType[] = ["DIRECT", "INVITE", "ROYALTY"];

/**
 * main-PRD §14.7, §14.8 — eligibility is an axis of its own, separate from the
 * payment state. Deal-level and Member-level holds are decided first, because
 * they apply whether or not the milestone has been reached (PRD §15.3); only
 * then does the milestone decide; and the beneficiary conditions come last.
 */
export function resolveEligibility(input: EligibilityInput): Eligibility {
  const hold = (holdReason: HoldReason): Eligibility => ({ state: "ON_HOLD", holdReason });

  // CR-013 — decided before everything else, because none of what follows can
  // change it. A 0% record has no amount to hold, to pay, or to pay early; RERA,
  // bank and Aadhaar decide nothing about it, and neither does the 4% cap.
  if (input.percent !== null && new D(input.percent).eq(0)) {
    return { state: "NO_BENEFIT", holdReason: null };
  }

  // RD-03 — no sale-commission record is Ready or Paid while the conflict exists.
  if (input.commissionConflictAbove4) return hold("COMMISSION_CONFLICT_ABOVE_4");

  if (input.bookingProcess === "REFUND_PENDING") return hold("REFUND_PENDING");
  if (input.bookingProcess === "CHANGE_PLOT_PENDING") return hold("CHANGE_PLOT_PENDING");
  if (input.bookingProcess === "BUYBACK_PENDING") return hold("BUYBACK_PENDING");
  if (input.acquisitionPaymentPending) return hold("PAYMENT_PENDING");

  const isMemberComponent = MEMBER_ROLES.includes(input.type);
  if (isMemberComponent) {
    if (input.memberStatus === "DEACTIVATED") return hold("MEMBER_DEACTIVATED");
    if (input.memberCommissionHold) return hold("MEMBER_COMMISSION_HOLD");
  }

  if (new D(input.progressPercent).lt(new D(input.milestonePercent))) {
    return { state: "MILESTONE_PENDING", holdReason: null };
  }

  // CR-004 supersedes AC-02 here. Royalty's milestone is 100% Payment Received
  // — the pack states it directly — and the performance cycle decides an
  // upgrade, not whether one commission may be paid. Royalty used to hold until
  // its cycle completed, which under the new model would hold it until eight
  // other Customers had bought.

  // Conditions on the beneficiary. PAN never creates an automatic hold.
  if (!input.beneficiaryAadhaarAvailable) return hold("AADHAAR_PENDING");
  if (!input.beneficiaryBankVerified) return hold("BANK_VERIFICATION_PENDING");

  if (isMemberComponent) {
    // Registered or Not Applicable satisfies the condition (main-PRD §14.7).
    if (input.reraStatus === "PENDING") return hold("RERA_PENDING");
    if (input.reraStatus === "EXPIRED") return hold("RERA_EXPIRED");
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
  // CR-013 — "no payable amount is created". Paid Early is the route around an
  // unready record, so it has to be closed here too: MD approval can waive a
  // condition, not conjure an amount that was never earned.
  if (eligibility === "NO_BENEFIT") {
    return fail(
      "This position is above 9, so the band is 0% and there is no amount to pay. The record " +
        "stays visible and its one-time opportunity is consumed."
    );
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

/**
 * PRD §6.1, §6.5 — a cancellation before legal completion restores the
 * opportunity; a legally completed sale that is later bought back keeps it
 * consumed.
 */
export function opportunityReopens(legallyCompleted: boolean): boolean {
  return !legallyCompleted;
}
