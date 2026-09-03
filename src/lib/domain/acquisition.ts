// Cancellation, Change Plot and Acquisition rules.
// PRD.md §5, §11, §15; main-PRD.md §15, §16, §17.
// Exact decimal arithmetic only (ARCHITECTURE §3.4). Percentages only — no
// rupee value is calculated anywhere in this module.

import { Prisma } from "@prisma/client";
import type { Check, Numeric } from "./booking.ts";
import { plotReturnState, type PlotStatus, type PlotRestriction } from "./inventory.ts";

const D = Prisma.Decimal;

const OK: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/* ------------------------------------------------------------- thresholds */

/** PRD §11.3 — Accounts may approve only after at least 20% Payment Given. */
export const MIN_PAYMENT_GIVEN_FOR_APPROVAL = new D(20);
export const FULL_PAYMENT_GIVEN = new D(100);

/**
 * AC-04 — Buying Commission is capped at 5%. The cap is enforced here, in the
 * domain, so that every path into an acquisition meets it: a dashboard that
 * only displayed the cap would leave the stored figure wrong.
 */
export const BUYING_CAP_PERCENT = new D(5);

/** PRD §11.1 — the approved visible message while Payment Given is below 100%. */
export const PAYMENT_PENDING_MESSAGE = "Payment Pending";
/** PRD §11.4 — a cancelled deal is not sellable. */
export const DEAL_CANCELLED_MESSAGE = "Not Available — Deal Cancelled";

export function canApproveAcquisition(paymentGivenPercent: Numeric): Check {
  const given = new D(paymentGivenPercent);
  if (given.lt(MIN_PAYMENT_GIVEN_FOR_APPROVAL)) {
    return fail(
      `Accounts may approve a Buyback or Purchase for Resale only after at least 20% Payment Given ` +
        `is confirmed. Currently ${given.toFixed(2)}%.`
    );
  }
  return OK;
}

/* ------------------------------------------------- duplicate detection */

export type PropertyIdentity = {
  propertyName: string;
  location: string;
  propertyNumber: string;
};

/**
 * PRD §11.5 — exact active duplicates are hard-blocked. The key normalises
 * spaces, punctuation and case so "Green Valley, Plot 12" and
 * "green  valley / plot-12" are recognised as the same property.
 */
export function acquisitionDuplicateKey(identity: PropertyIdentity): string {
  const part = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .trim();

  const key = [part(identity.propertyName), part(identity.location), part(identity.propertyNumber)];
  if (key.some((k) => k.length === 0)) {
    throw new Error("Property Name, Location and Plot/Property Number are all required.");
  }
  return key.join("|");
}

export type DuplicateCandidate = PropertyIdentity & {
  sellerPersonId: string;
  areaSqFt: Numeric | null;
};

/**
 * PRD §11.5 — a likely duplicate is warned about rather than blocked, using the
 * normalised name, location, number, seller and area. The caller decides
 * whether to proceed; the exact-duplicate index is what actually blocks.
 */
export function likelyDuplicateReasons(
  candidate: DuplicateCandidate,
  existing: DuplicateCandidate
): string[] {
  const reasons: string[] = [];
  const same = (a: string, b: string) =>
    a.toUpperCase().replace(/[^A-Z0-9]+/g, "") === b.toUpperCase().replace(/[^A-Z0-9]+/g, "");

  if (same(candidate.propertyName, existing.propertyName)) reasons.push("same Property/Project Name");
  if (same(candidate.location, existing.location)) reasons.push("same Location");
  if (same(candidate.propertyNumber, existing.propertyNumber)) reasons.push("same Plot/Property Number");
  if (candidate.sellerPersonId === existing.sellerPersonId) reasons.push("same Seller");
  if (
    candidate.areaSqFt !== null &&
    existing.areaSqFt !== null &&
    new D(candidate.areaSqFt).eq(new D(existing.areaSqFt))
  ) {
    reasons.push("same Area");
  }
  return reasons;
}

/* --------------------------------------------- approval and cancellation */

export type PlotOutcome = { status: PlotStatus; message: string | null; isResale: boolean };

/**
 * main-PRD §17.6 — on approval the property enters normal inventory as
 * Available + RESALE, and below 100% it shows Payment Pending. PRD §15 — an
 * active restriction still keeps the Plot Not Available; the RESALE tag is
 * independent of availability.
 */
export function plotStateAfterAcquisitionApproval(
  restriction: PlotRestriction,
  restrictionReason: string | null,
  paymentGivenPercent: Numeric
): PlotOutcome {
  const returned = plotReturnState(restriction, restrictionReason);
  const pending = new D(paymentGivenPercent).lt(FULL_PAYMENT_GIVEN);

  return {
    status: returned.status,
    message: returned.message ?? (pending ? PAYMENT_PENDING_MESSAGE : null),
    isResale: true,
  };
}

/**
 * PRD §11.4 — an acquisition cancelled before any new buyer process leaves the
 * Plot Not Available — Deal Cancelled and not sellable. With a Hold, Booking
 * Request or Booking in place it cannot simply be cancelled at all.
 */
export function cancelAcquisition(hasBuyerProcess: boolean): Check {
  if (hasBuyerProcess) {
    return fail(
      "This deal cannot be cancelled while a new buyer process is active. Complete the acquisition " +
        "or unwind the buyer process first."
    );
  }
  return OK;
}

export function plotStateAfterAcquisitionCancelled(): PlotOutcome {
  return { status: "NOT_AVAILABLE", message: DEAL_CANCELLED_MESSAGE, isResale: true };
}

/* ------------------------------------- Payment Given correction outcomes */

export type GivenCorrectionOutcome = {
  /** Null means the Plot status is deliberately left exactly as it is. */
  plotStatus: PlotStatus | null;
  processMessage: string | null;
  /** ARCHITECTURE §6.3 — the irreconcilable case gets a management decision. */
  managementActionRequired: boolean;
  /** PRD §11.3 — Buying Commission steps back to Milestone Pending. */
  buyingCommissionMilestoneLost: boolean;
  /** PRD §11.3 — new-sale commission stays On Hold — Payment Pending. */
  newSaleCommissionOnHold: boolean;
  note: string;
};

/**
 * PRD §11.3 — the two correction paths, which are about what may be released
 * rather than about arithmetic:
 *
 *  - below 20% with no buyer process: the Plot becomes Not Available until
 *    Payment Given returns to 20% or the deal is cancelled;
 *  - below 20% with a buyer process active: nothing is cancelled or released
 *    automatically. Management Action Required is raised and progression stops.
 *
 * Falling from 100% to below simply shows Payment Pending again and steps the
 * Buying Commission back.
 */
export function resolvePaymentGivenCorrection(args: {
  previousPercent: Numeric;
  newPercent: Numeric;
  hasBuyerProcess: boolean;
}): GivenCorrectionOutcome {
  const previous = new D(args.previousPercent);
  const next = new D(args.newPercent);

  const fellBelowFull = previous.gte(FULL_PAYMENT_GIVEN) && next.lt(FULL_PAYMENT_GIVEN);
  const belowThreshold = next.lt(MIN_PAYMENT_GIVEN_FOR_APPROVAL);

  if (belowThreshold && args.hasBuyerProcess) {
    return {
      plotStatus: null,
      processMessage: "Management Action Required",
      managementActionRequired: true,
      buyingCommissionMilestoneLost: fellBelowFull,
      newSaleCommissionOnHold: true,
      note:
        `Payment Given fell to ${next.toFixed(2)}%, below the 20% approval threshold, while a buyer ` +
        `process is active. Nothing is cancelled or released automatically: complete the acquisition ` +
        `or unwind the buyer process through the approved workflow.`,
    };
  }

  if (belowThreshold) {
    return {
      plotStatus: "NOT_AVAILABLE",
      processMessage: `${PAYMENT_PENDING_MESSAGE} — below the 20% approval threshold`,
      managementActionRequired: false,
      buyingCommissionMilestoneLost: fellBelowFull,
      newSaleCommissionOnHold: true,
      note:
        `Payment Given fell to ${next.toFixed(2)}%. The Plot stays Not Available until Payment Given ` +
        `returns to 20% or the deal is cancelled.`,
    };
  }

  if (fellBelowFull) {
    return {
      plotStatus: null,
      processMessage: PAYMENT_PENDING_MESSAGE,
      managementActionRequired: false,
      buyingCommissionMilestoneLost: true,
      newSaleCommissionOnHold: true,
      note:
        `Payment Given fell from 100% to ${next.toFixed(2)}%. Payment Pending is shown again and the ` +
        `Buying Commission returns to Milestone Pending.`,
    };
  }

  const stillPending = next.lt(FULL_PAYMENT_GIVEN);
  return {
    plotStatus: null,
    processMessage: stillPending ? PAYMENT_PENDING_MESSAGE : null,
    managementActionRequired: false,
    buyingCommissionMilestoneLost: false,
    newSaleCommissionOnHold: stillPending,
    note: `Payment Given is now ${next.toFixed(2)}%.`,
  };
}

/* --------------------------------------------------- Buying Commission */

/**
 * PRD §11.7 — one beneficiary per acquisition, and neither the seller nor a
 * Customer of that Buyback may earn Buying Commission for arranging the return
 * of their own property. It sits outside the 4% sale cap, carries its own 5% cap
 * (AC-04) and settles at 100% Payment Given.
 */
export function validateBuyingCommission(args: {
  beneficiaryPersonId: string;
  sellerPersonId: string;
  /** Primary and Additional Customers of the Buyback being arranged. */
  buybackPartyPersonIds: readonly string[];
  percent: Numeric;
}): Check {
  const percent = new D(args.percent);
  if (percent.lte(0)) return fail("Buying Commission must be greater than 0%.");
  // AC-04 — never trimmed to fit, exactly as RD-03 treats the sale cap: an
  // over-cap figure is refused so the entered value is corrected at source.
  if (percent.gt(BUYING_CAP_PERCENT)) {
    return fail(
      `Buying Commission is capped at ${BUYING_CAP_PERCENT.toFixed(0)}%. ` +
        `${percent.toFixed(2)}% exceeds the cap — correct the percentage before approval.`
    );
  }

  if (args.beneficiaryPersonId === args.sellerPersonId) {
    return fail(
      "The seller or previous owner cannot receive Buying Commission for arranging their own acquisition."
    );
  }
  if (args.buybackPartyPersonIds.includes(args.beneficiaryPersonId)) {
    return fail(
      "A Primary or Additional Customer of this Buyback cannot be the Buying Commission beneficiary " +
        "for arranging their own return."
    );
  }
  return OK;
}

/** PRD §11.7 — the milestone is 100% Payment Given, never the sale side. */
export function buyingCommissionMilestoneReached(paymentGivenPercent: Numeric): boolean {
  return new D(paymentGivenPercent).gte(FULL_PAYMENT_GIVEN);
}

/* ------------------------------------------------------------ Change Plot */

/**
 * PRD §5.3 — Change Plot on an approved Booking is allowed within the same
 * Project only. Cross-Project movement requires Cancel Booking and a new
 * Booking Request.
 */
export function validateChangePlot(args: {
  fromProjectId: string;
  toProjectId: string;
  fromPlotId: string;
  toPlotId: string;
  toPlotStatus: PlotStatus;
  toPlotRestriction: PlotRestriction;
  /** True when this same Customer already holds the replacement Plot. */
  heldBySameCustomer: boolean;
  remark: string;
}): Check {
  if (!args.remark.trim()) return fail("A compulsory remark is required for Change Plot.");
  if (args.fromPlotId === args.toPlotId) return fail("Select a different Plot.");
  if (args.fromProjectId !== args.toProjectId) {
    return fail(
      "Change Plot is allowed within the same Project only. Moving across Projects requires Cancel " +
        "Booking and a new Booking Request."
    );
  }

  // The replacement must be free, unless this same Customer is already holding
  // it — in which case its Hold PLC snapshot is the one that carries (PRD §5.3).
  if (args.heldBySameCustomer && args.toPlotStatus === "HOLD") return OK;

  if (args.toPlotRestriction === "NOT_FOR_SALE" || args.toPlotRestriction === "PLEDGE") {
    return fail("The replacement Plot carries an active restriction and cannot be allocated.");
  }
  if (args.toPlotStatus !== "AVAILABLE") {
    return fail(
      `The replacement Plot is ${args.toPlotStatus.replaceAll("_", " ").toLowerCase()}, not Available.`
    );
  }
  return OK;
}

/**
 * PRD §5.3 — the old Plot returns according to its restriction and receives no
 * RESALE tag. Change Plot never marks anything as resale inventory.
 */
export function plotStateAfterChangePlot(
  restriction: PlotRestriction,
  restrictionReason: string | null
): PlotOutcome {
  const returned = plotReturnState(restriction, restrictionReason);
  return { status: returned.status, message: returned.message, isResale: false };
}
