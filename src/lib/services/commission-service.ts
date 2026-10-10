// Commission engine service — Business Model v2.1 §11–§25; prd-complete §14.
//
// A Booking Request freezes its Project's Active commission version when it is
// submitted, and again when a corrected request is sent; the version on the
// request Accounts approves is the one that counts (v2.1 §16). Records are
// generated at Accounts approval from those frozen terms. There is no combined
// cap (v2.1 §11). Customer-closing Loyalty is limited to three successful events
// for life (v2.1 §21, §25), counted when each record reaches its milestone.

import { Prisma } from "@prisma/client";
import type { SoldByType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  afterAffectingChange,
  BUYBACK_MIN_SOURCE_PAYMENT,
  buybackMilestoneMet,
  canMarkPaid,
  closingLoyaltyQualifies,
  CUSTOMER_CLOSING_LOYALTY_LIMIT,
  generateCommission,
  needsPaymentTask,
  resolveEligibility,
  type CommissionInput,
  type CommissionOutcome,
  type Component,
  type FrozenTerms,
  type PaymentState,
} from "@/lib/domain/commission";
import { normaliseReference, notFutureDated } from "@/lib/domain/booking";
import { hasVerifiedBank } from "./bank-service";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { activateDueVersions } from "./commission-settings-service";
import { closeTasksFor, ensureTask } from "./task-service";

const D = Prisma.Decimal;

export const COMMISSION_CONFLICT_PURPOSE = "COMMISSION_CONFLICT";
export const COMMISSION_PAYMENT_PURPOSE = "COMMISSION_PAYMENT";

/* ------------------------------------------------------- frozen terms */

/** A Project version in the engine's terms. Disabled is null, never 0. */
export function termsOf(v: {
  version: number;
  directEnabled: boolean;
  directPercent: Prisma.Decimal | null;
  loyaltyEnabled: boolean;
  loyaltyPercent: Prisma.Decimal | null;
}): FrozenTerms {
  return {
    version: v.version,
    directPercent: v.directEnabled && v.directPercent ? v.directPercent.toString() : null,
    loyaltyPercent: v.loyaltyEnabled && v.loyaltyPercent ? v.loyaltyPercent.toString() : null,
  };
}

/** v2.1 §24 — the would-be Loyalty earner: the closer on a Customer close, else the buyer. */
export async function loyaltySubjectDeactivated(
  tx: Tx,
  args: { soldByType: SoldByType; soldByPersonId: string | null; buyerPersonId: string }
): Promise<boolean> {
  const subject =
    args.soldByType === "CUSTOMER" ? (args.soldByPersonId ?? args.buyerPersonId) : args.buyerPersonId;
  const member = await tx.memberProfile.findUnique({ where: { personId: subject }, select: { status: true } });
  return member?.status === "DEACTIVATED";
}

/**
 * v2.1 §16, §20, §24 — what a Booking Request freezes when it is submitted, and
 * again when a corrected request is sent. Accounts approval makes it permanent;
 * a rejected request earns nothing from it.
 */
export async function freezeAtSubmission(
  tx: Tx,
  args: { projectId: string; soldByType: SoldByType; soldByPersonId: string | null; buyerPersonId: string }
) {
  // CP §8 — an Approved version whose time has come is Active before anything
  // freezes, whether or not the scheduled job has run yet.
  await activateDueVersions(tx, args.projectId);
  const version = await tx.projectCommissionVersion.findFirst({
    where: { projectId: args.projectId, status: "ACTIVE" },
  });
  if (!version) blocked("This Project has no approved commission settings.");
  const buyer = await tx.memberProfile.findUnique({
    where: { personId: args.buyerPersonId },
    select: { status: true },
  });
  return {
    commissionVersionId: version.id,
    originalClassification: (buyer?.status === "ACTIVE" ? "MEMBER" : "CUSTOMER") as "MEMBER" | "CUSTOMER",
    loyaltySubjectDeactivated: await loyaltySubjectDeactivated(tx, args),
    terms: { versionId: version.id, ...termsOf(version) },
  };
}

/**
 * CP §17, §18.3 — the Customer-closing Loyalty events a Person has consumed:
 * current, uncancelled, qualified CLOSING_CUSTOMER records on Bookings that
 * still stand. Derived from the events, never an editable counter, and read
 * across identities merged into this one (SSOT §100).
 */
export async function consumedClosingEvents(tx: Tx, personId: string, excludeRecordId?: string): Promise<number> {
  const mergedIds = (
    await tx.person.findMany({ where: { survivingPersonId: personId }, select: { id: true } })
  ).map((p) => p.id);
  return tx.commissionRecord.count({
    where: {
      ...(excludeRecordId ? { id: { not: excludeRecordId } } : {}),
      beneficiaryPersonId: { in: [personId, ...mergedIds] },
      type: "LOYALTY",
      beneficiaryRole: "CLOSING_CUSTOMER",
      isCurrent: true,
      payment: { not: "CANCELLED" },
      qualifiedAt: { not: null },
      booking: { status: { not: "CANCELLED" } },
    },
  });
}

/** CP §64 T43 — renamed from "Membership Invitation — Loyalty Exhausted". */
export const CLOSING_LIMIT_PURPOSE = "CUSTOMER_CLOSING_LIMIT";

/**
 * CP §18.4, §64 T43; Removal Audit OL-20, OL-42 — the third Customer-closing
 * event is consumed, so Membership is required for future third-party selling.
 * Only the closing route is limited; the text says so (UAT TSK-05). Closed when
 * the Person is activated as a Member.
 */
async function raiseClosingLimitTask(tx: Tx, personId: string) {
  const customer = await tx.customerProfile.findUnique({
    where: { personId },
    include: { person: { select: { fullName: true } } },
  });
  if (!customer) return;
  await ensureTask(tx, {
    recordKind: "Customer",
    recordId: customer.id,
    recordName: `${customer.customerId} · ${customer.person.fullName}`,
    purpose: CLOSING_LIMIT_PURPOSE,
    title: "Customer-Closing Limit Reached — Membership Required for Future Selling",
    assigneeRole: "CRM",
    dueAt: new Date(),
    latestResult:
      "Third Customer-closing Loyalty event earned. Membership is required for future third-party selling. " +
      "Repeat-purchase Loyalty remains separately eligible.",
  });
}

/* ------------------------------------------------------------ engine input */

/** Gathers everything the pure engine needs, straight from the Booking's frozen fields. */
export async function commissionInputFor(tx: Tx, bookingId: string): Promise<CommissionInput> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { commissionVersion: true },
  });

  /**
   * v2.1 §23 — "any second qualifying personal Booking may count immediately",
   * so a repeat is any earlier-submitted Booking of this buyer that Accounts
   * approved and that was not cancelled. Rejected and cancelled requests never count.
   */
  const priorPurchases = await tx.booking.count({
    where: {
      primaryPersonId: booking.primaryPersonId,
      id: { not: bookingId },
      bookingNumber: { not: null },
      status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
      submittedAt: { lt: booking.submittedAt },
    },
  });

  return {
    soldByType: booking.soldByType,
    soldByPersonId: booking.soldByPersonId,
    buyerPersonId: booking.primaryPersonId,
    buyerIsActiveMember: booking.originalClassification === "MEMBER",
    buyerHasPriorPurchase: priorPurchases > 0,
    terms: booking.commissionVersion ? termsOf(booking.commissionVersion) : null,
    loyaltySubjectDeactivated: booking.loyaltySubjectDeactivated,
  };
}

/**
 * Accounts cannot approve while the engine reports a conflict. Used by the
 * Booking decision before it commits to anything.
 */
export async function previewCommission(tx: Tx, bookingId: string): Promise<CommissionOutcome> {
  return generateCommission(await commissionInputFor(tx, bookingId));
}

/**
 * The conflict is shown and a Dashboard task is created for CRM/Admin to
 * correct Sold By, the beneficiary or another invalid source detail.
 */
export async function raiseCommissionConflict(
  tx: Tx,
  bookingId: string,
  conflict: string,
  actorRef: string
) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { project: true, plot: true },
  });
  await ensureTask(tx, {
    recordKind: "Booking",
    recordId: bookingId,
    recordName: `${booking.bookingNumber ?? booking.requestNo} · ${booking.project.name} ${booking.plot.plotNumber}`,
    purpose: COMMISSION_CONFLICT_PURPOSE,
    title: "Commission Conflict — correct the source details",
    assigneeRole: "CRM",
    dueAt: new Date(),
    urgent: true,
    latestResult: conflict,
  });
  await tx.bookingEvent.create({
    data: {
      bookingId,
      actorRef,
      action: "COMMISSION_CONFLICT_RAISED",
      reason: conflict,
    },
  });
}

/* ------------------------------------------------ historical classification */

/**
 * AC-01 — everything `classifyApprovedBooking()` needs about one Booking.
 *
 * Shared with the backfill on purpose. Two copies of "which record decides the
 * classification" would be two rules the day one of them is edited, and this one
 * decides who a commission belongs to.
 */
export async function classificationEvidence(tx: Tx, bookingId: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      approvedAt: true,
      primaryPerson: { select: { memberProfile: { select: { activationDate: true } } } },
    },
  });

  // The earliest DIRECT ever created, superseded ones included: that is the one
  // written at approval, and a later Sold By Correction must not stand in for it.
  const direct = await tx.commissionRecord.findFirst({
    where: { bookingId, type: "DIRECT" },
    orderBy: { createdAt: "asc" },
    select: { ruleVersion: true },
  });
  const anyCommission = direct
    ? 1
    : await tx.commissionRecord.count({ where: { bookingId } });

  return {
    earliestDirectRuleVersion: direct?.ruleVersion ?? null,
    hasAnyCommission: anyCommission > 0,
    approvedAt: booking.approvedAt,
    memberActivationDate: booking.primaryPerson.memberProfile?.activationDate ?? null,
  };
}

/* ------------------------------------------------------- legal completion */

/**
 * AC-02 — legal completion, as the approved corpus defines it:
 * "the sale reached final delivery" (COMMISSION-TEST-PLAN §1), which in this
 * system is a Booking at DELIVERED carrying a completion record that has not
 * been reopened.
 *
 * Both halves are checked. A reopened completion leaves the Booking on its way
 * back to PAYMENT_COMPLETED, and a delivery that was recorded in error and
 * reopened must not count as completed.
 */
export async function isLegallyCompleted(tx: Tx, bookingId: string): Promise<boolean> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (booking?.status !== "DELIVERED") return false;
  const live = await tx.bookingCompletion.findFirst({
    where: { bookingId, reopenedAt: null },
    select: { id: true },
  });
  return !!live;
}

/* ------------------------------------------------------------- generation */

/**
 * Creates or refreshes the current commission records for a Booking. Existing
 * records that no longer match are superseded, never edited or deleted
 * (PRD §6.9). The terms come from the version frozen on the Booking.
 */
export async function generateForBooking(tx: Tx, bookingId: string, actorRef: string) {
  const outcome = await previewCommission(tx, bookingId);
  if (!outcome.ok) {
    await raiseCommissionConflict(tx, bookingId, outcome.conflict, actorRef);
    return { generated: 0, conflict: outcome.conflict };
  }

  const existing = await tx.commissionRecord.findMany({
    where: { bookingId, isCurrent: true },
  });

  const key = (c: { type: string; beneficiaryRole: string }) => `${c.type}|${c.beneficiaryRole}`;
  const wanted = new Map(outcome.components.map((c) => [key(c), c]));

  // Supersede anything that is no longer generated, or whose figures changed.
  for (const record of existing) {
    const match = wanted.get(key(record));
    const unchanged =
      match &&
      match.beneficiaryPersonId === record.beneficiaryPersonId &&
      new D(match.percent).eq(record.percent) &&
      new D(match.milestonePercent).eq(record.milestonePercent);

    if (unchanged) {
      wanted.delete(key(record));
      continue;
    }
    await supersedeRecord(
      tx,
      record.id,
      actorRef,
      match ? "Recalculated after a change to the Booking." : "No longer generated for this Booking."
    );
  }

  for (const component of wanted.values()) {
    await createRecord(tx, bookingId, component, actorRef);
  }

  await closeTasksFor(
    tx,
    "Booking",
    bookingId,
    actorRef,
    "Commission recalculated without conflict.",
    COMMISSION_CONFLICT_PURPOSE
  );
  return { generated: outcome.components.length, conflict: null };
}

async function createRecord(tx: Tx, bookingId: string, component: Component, actorRef: string) {
  const record = await tx.commissionRecord.create({
    data: {
      bookingId,
      type: component.type,
      beneficiaryRole: component.beneficiaryRole,
      beneficiaryPersonId: component.beneficiaryPersonId,
      percent: component.percent,
      ruleVersion: component.ruleVersion,
      milestonePercent: component.milestonePercent,
    },
  });
  await tx.commissionEvent.create({
    data: {
      recordId: record.id,
      actorRef,
      action: "GENERATED",
      toState: `${component.type} ${component.percent}% @ ${component.milestonePercent}%`,
    },
  });
  return record;
}

/** PRD §6.9 — old records are superseded, never deleted. */
async function supersedeRecord(tx: Tx, recordId: string, actorRef: string, reason: string) {
  const record = await tx.commissionRecord.findUniqueOrThrow({ where: { id: recordId } });

  // An externally processed record needs an Accounts adjustment, not a silent close.
  const payment = afterAffectingChange(record.payment, "BENEFICIARY_CORRECTED");

  await tx.commissionRecord.update({
    where: { id: recordId },
    data: {
      isCurrent: false,
      effectiveTo: new Date(),
      closedReason: reason,
      payment,
    },
  });
  await tx.commissionEvent.create({
    data: {
      recordId,
      actorRef,
      action: "SUPERSEDED",
      fromState: record.payment,
      toState: payment,
      reason,
    },
  });
}

/* ------------------------------------------------------------- reassessment */

/**
 * CR-015 — whether an Approved Buyback stands against this Booking. Read once
 * per reassessment rather than once per record, because every record on a
 * Booking shares the answer.
 */
async function hasApprovedBuyback(tx: Tx, bookingId: string): Promise<boolean> {
  const count = await tx.acquisition.count({
    where: { sourceBookingId: bookingId, type: "BUYBACK", status: "APPROVED" },
  });
  return count > 0;
}

/**
 * Recomputes eligibility for every current record on a Booking. Safe to call
 * after any payment, cancellation or hold change.
 *
 * v2.1 §21, §41 — a Loyalty record *qualifies* when it reaches its milestone:
 * 100% Payment Received, or an Approved Buyback once the Booking has 25%. A
 * Customer-closing record qualifies only while the closer has fewer than three
 * qualified ones; the fourth is Cancelled, because Membership is required to
 * earn from further third-party sales (§25). The milestone is read fresh every
 * time, so a Buyback that unwinds takes its qualification back with it.
 */
export async function reassessCommission(tx: Tx, bookingId: string, actorRef: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { project: true, plot: true },
  });
  const records = await tx.commissionRecord.findMany({
    where: { bookingId, isCurrent: true },
    include: {
      beneficiaryPerson: {
        include: {
          memberProfile: true,
          customerProfile: { include: { termsAcceptances: { select: { id: true }, take: 1 } } },
        },
      },
    },
  });
  if (records.length === 0) return { reassessed: 0 };

  const buybackApproved = await hasApprovedBuyback(tx, bookingId);
  const received = booking.paymentReceivedPercent;

  for (const record of records) {
    // A cancelled record is closed for good — `afterAffectingChange` never
    // moves anything back out of CANCELLED.
    if (record.payment === "CANCELLED") continue;

    const member = record.beneficiaryPerson.memberProfile;
    const viaBuyback = buybackMilestoneMet({
      type: record.type,
      buybackApproved,
      progressPercent: received.toString(),
    });
    const milestoneReached = viaBuyback || received.gte(record.milestonePercent);
    const isClosing = record.type === "LOYALTY" && record.beneficiaryRole === "CLOSING_CUSTOMER";

    // Widened back to the full set: the guard above narrowed `record.payment`.
    let payment: PaymentState = record.payment;

    if (record.type === "LOYALTY" && milestoneReached && !record.qualifiedAt) {
      if (isClosing) {
        // Serialise the closer's events, so two Bookings reaching 100% at the
        // same instant cannot both be the third.
        await lockKey(tx, `customer-closing-loyalty:${record.beneficiaryPersonId}`);
        const alreadyQualified = await consumedClosingEvents(tx, record.beneficiaryPersonId, record.id);
        if (!closingLoyaltyQualifies(alreadyQualified)) {
          const reason =
            "Three Customer-closing Loyalty events have already been earned. Membership activation " +
            "is required to earn from further third-party sales (v2.1 §25).";
          payment = afterAffectingChange(record.payment, "CANCELLED_BEFORE_COMPLETION");
          await tx.commissionRecord.update({
            where: { id: record.id },
            data: { payment, closedReason: reason },
          });
          await tx.commissionEvent.create({
            data: {
              recordId: record.id,
              actorRef,
              action: "LIMIT_REACHED",
              fromState: record.payment,
              toState: payment,
              reason,
            },
          });
          await closeTasksFor(tx, "Commission", record.id, actorRef, reason, COMMISSION_PAYMENT_PURPOSE);
          continue;
        }
        // CP §18.4, §64 T43 — this is the third: CRM follows up on Membership.
        if (alreadyQualified + 1 === CUSTOMER_CLOSING_LOYALTY_LIMIT) {
          await raiseClosingLimitTask(tx, record.beneficiaryPersonId);
        }
      }
      await tx.commissionRecord.update({ where: { id: record.id }, data: { qualifiedAt: new Date() } });
      await tx.commissionEvent.create({
        data: { recordId: record.id, actorRef, action: viaBuyback ? "QUALIFIED_BY_BUYBACK" : "QUALIFIED" },
      });
    }

    // A milestone lost after a payment correction or a Buyback unwind steps the
    // record back and un-qualifies it (PRD §6.12; v2.1 §44, §76).
    if (record.type === "LOYALTY" && !milestoneReached && record.qualifiedAt) {
      payment = afterAffectingChange(record.payment, "MILESTONE_LOST");
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: { qualifiedAt: null, payment },
      });
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef,
          action: "MILESTONE_LOST",
          fromState: record.payment,
          toState: payment,
        },
      });
    }

    const next = resolveEligibility({
      type: record.type as "DIRECT" | "LOYALTY",
      progressPercent: received.toString(),
      milestonePercent: record.milestonePercent.toString(),
      buybackMilestoneMet: viaBuyback,
      beneficiaryAadhaarAvailable: record.beneficiaryPerson.aadhaarStatus !== "PENDING",
      beneficiaryBankVerified: await hasVerifiedBank(tx, record.beneficiaryPersonId),
      memberStatus: member?.status ?? null,
      memberCommissionHold: member?.commissionHold ?? false,
      reraStatus: member?.reraStatus ?? null,
      bookingProcess: booking.activeProcess,
      acquisitionPaymentPending: false, // Phase 5 sets this from the acquisition.
      // v2.1 §22, §77 — the closer's own KYC and Customer Terms.
      closer: isClosing
        ? {
            kycVerified: record.beneficiaryPerson.aadhaarStatus === "VERIFIED",
            termsAccepted: (record.beneficiaryPerson.customerProfile?.termsAcceptances.length ?? 0) > 0,
          }
        : null,
    });

    if (next.state !== record.eligibility || next.holdReason !== record.holdReason) {
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: { eligibility: next.state, holdReason: next.holdReason },
      });
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef,
          action: "ELIGIBILITY_CHANGED",
          fromState: record.eligibility,
          toState: next.holdReason ? `${next.state}:${next.holdReason}` : next.state,
        },
      });
    }

    // PRD §6.11 — one payment task when Ready, and never a second one after an
    // externally processed record reaches the normal milestone.
    if (needsPaymentTask(payment, next.state)) {
      await ensureTask(tx, {
        recordKind: "Commission",
        recordId: record.id,
        recordName: `${booking.bookingNumber ?? booking.requestNo} · ${record.type} ${record.percent.toFixed(2)}%`,
        purpose: COMMISSION_PAYMENT_PURPOSE,
        title: "Accounts Verification — Commission",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
      });
    }
  }

  return { reassessed: records.length };
}

/**
 * v2.1 §22 — reassess every unpaid Customer Loyalty a Person would earn, after
 * one of the closer's own conditions changed (KYC verified, Terms accepted).
 */
export async function reassessLoyaltyOf(tx: Tx, personId: string, actorRef: string) {
  const affected = await tx.commissionRecord.findMany({
    where: {
      beneficiaryPersonId: personId,
      type: "LOYALTY",
      isCurrent: true,
      payment: { in: ["NOT_PAID", "ACCOUNTS_ADJUSTMENT_REQUIRED"] },
    },
    select: { bookingId: true },
    distinct: ["bookingId"],
  });
  for (const { bookingId } of affected) {
    if (bookingId) await reassessCommission(tx, bookingId, actorRef);
  }
  return affected.length;
}

/* -------------------------------------------------------- payment processing */

/** CP §64 T20 — Paid Early Approval, assigned to MD. */
export const PAID_EARLY_PURPOSE = "PAID_EARLY_APPROVAL";

/** A one-line name for a commission record on a task row. */
async function commissionRecordName(tx: Tx, recordId: string) {
  const record = await tx.commissionRecord.findUniqueOrThrow({
    where: { id: recordId },
    include: { booking: true, acquisition: true, beneficiaryPerson: { select: { fullName: true } } },
  });
  const source = record.booking
    ? (record.booking.bookingNumber ?? record.booking.requestNo)
    : (record.acquisition?.acquisitionNo ?? "—");
  return `${source} · ${record.type} ${record.percent.toFixed(2)}% · ${record.beneficiaryPerson.fullName}`;
}

/**
 * CP §53; SSOT §90 — Accounts initiates Paid Early, with a compulsory reason,
 * for an unpaid record that is not Ready yet. It raises T20 for MD; nothing is
 * paid until MD approves (UAT BUY-07).
 */
export async function requestCommissionPaidEarly(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  recordId: string;
  reason: string;
}) {
  if (args.actorRole !== "ACCOUNTS") blocked("Only Accounts may request a Paid Early payment.");
  if (!args.reason.trim()) blocked("A compulsory reason is required to request Paid Early.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_PAID_EARLY_REQUEST",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recordId: args.recordId },
    },
    async (tx) => {
      const record = await tx.commissionRecord.findUniqueOrThrow({ where: { id: args.recordId } });
      if (!record.isCurrent) blocked("This commission record has been superseded.");
      if (record.payment !== "NOT_PAID") blocked("Only an unpaid commission can be requested for Paid Early.");
      if (record.eligibility === "READY") blocked("This commission is Ready, so it is paid normally, not early.");
      if (record.earlyApprovedAt) blocked("Paid Early is already approved for this commission.");
      if (record.earlyRequestedAt) blocked("Paid Early is already requested and waiting for MD.");

      const reason = args.reason.trim();
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: { earlyRequestedByRef: args.actorRef, earlyRequestedAt: new Date(), earlyRequestReason: reason },
      });
      await tx.commissionEvent.create({
        data: { recordId: record.id, actorRef: args.actorRef, action: "PAID_EARLY_REQUESTED", reason },
      });
      await ensureTask(tx, {
        recordKind: "Commission",
        recordId: record.id,
        recordName: await commissionRecordName(tx, record.id),
        purpose: PAID_EARLY_PURPOSE,
        title: "Paid Early Approval — MD",
        assigneeRole: "MD",
        dueAt: new Date(),
        decision: true,
        latestResult: reason,
      });

      return {
        result: { recordId: record.id },
        audit: {
          entity: "CommissionRecord",
          entityId: record.id,
          action: "PAID_EARLY_REQUESTED",
          after: { beneficiaryPersonId: record.beneficiaryPersonId, type: record.type, percent: record.percent.toFixed(4) },
          reason,
        },
      };
    }
  );
}

/**
 * CP §53 — MD rejects a Paid Early request with a note. The request is cleared,
 * so Accounts may ask again later; the commission event and the audit row keep
 * what was asked and refused.
 */
export async function rejectCommissionPaidEarly(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  recordId: string;
  note: string;
}) {
  if (args.actorRole !== "MD") blocked("Only MD may reject a Paid Early request.");
  if (!args.note.trim()) blocked("A compulsory note is required to reject Paid Early.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_PAID_EARLY_REJECT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recordId: args.recordId },
    },
    async (tx) => {
      const record = await tx.commissionRecord.findUniqueOrThrow({ where: { id: args.recordId } });
      if (!record.earlyRequestedAt || record.earlyApprovedAt) blocked("No Paid Early request is waiting for MD.");
      const note = args.note.trim();
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: { earlyRequestedByRef: null, earlyRequestedAt: null, earlyRequestReason: null },
      });
      await tx.commissionEvent.create({
        data: { recordId: record.id, actorRef: args.actorRef, action: "PAID_EARLY_REJECTED", reason: note },
      });
      await closeTasksFor(tx, "Commission", record.id, args.actorRef, `Rejected — ${note}`, PAID_EARLY_PURPOSE);
      return {
        result: { recordId: record.id },
        audit: {
          entity: "CommissionRecord",
          entityId: record.id,
          action: "PAID_EARLY_REJECTED",
          before: { requestedBy: record.earlyRequestedByRef, reason: record.earlyRequestReason },
          reason: note,
        },
      };
    }
  );
}

/**
 * AC-03 — MD approval for processing one commission before eligibility is Ready.
 * CP §53 — only on a record Accounts has requested.
 *
 * The approval lives on the commission record itself rather than in a separate
 * approvals table, because the pack requires the approver, the date/time and the
 * related transaction/member to be stored together: on the record they cannot
 * drift apart, and the record already carries the beneficiary and the Booking.
 *
 * Only MD may approve. Admin cannot, and Accounts — who processes the payment —
 * certainly cannot approve their own early payment.
 */
export async function approveCommissionPaidEarly(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  recordId: string;
  note: string;
}) {
  if (args.actorRole !== "MD") blocked("Only MD may approve a Paid Early commission payment.");
  if (!args.note.trim()) blocked("A compulsory approval note is required for Paid Early.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_PAID_EARLY_APPROVE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recordId: args.recordId },
    },
    async (tx) => {
      const record = await tx.commissionRecord.findUniqueOrThrow({ where: { id: args.recordId } });
      if (!record.isCurrent) blocked("This commission record has been superseded.");
      if (record.payment === "PAID" || record.payment === "PAID_EARLY") {
        blocked("This commission has already been processed.");
      }
      if (record.payment === "CANCELLED") blocked("A cancelled commission cannot be approved.");
      if (record.earlyApprovedAt) blocked("Paid Early is already approved for this commission.");
      if (!record.earlyRequestedAt) blocked("Accounts has not requested Paid Early for this commission.");

      const approvedAt = new Date();
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: {
          earlyApprovedByRef: args.actorRef,
          earlyApprovedAt: approvedAt,
          earlyApprovalNote: args.note.trim(),
        },
      });
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef: args.actorRef,
          action: "PAID_EARLY_APPROVED",
          toState: "MD_APPROVED",
          reason: args.note.trim(),
        },
      });
      await closeTasksFor(tx, "Commission", record.id, args.actorRef, `Approved — ${args.note.trim()}`, PAID_EARLY_PURPOSE);

      return {
        result: { recordId: record.id, approvedAt },
        audit: {
          entity: "CommissionRecord",
          entityId: record.id,
          action: "PAID_EARLY_APPROVED",
          after: {
            approver: args.actorRef,
            approvedAt: approvedAt.toISOString(),
            beneficiaryPersonId: record.beneficiaryPersonId,
            bookingId: record.bookingId,
            acquisitionId: record.acquisitionId,
          },
          reason: args.note.trim(),
        },
      };
    }
  );
}

/**
 * PRD §6.11 with AC-03 — Accounts records Paid, or Paid Early with compulsory
 * remarks and a recorded MD approval. A Paid Early record is never marked Paid
 * again.
 */
export async function markCommissionPaid(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  recordId: string;
  early: boolean;
  paidOn: Date;
  reference: string;
  remarks: string;
}) {
  if (args.early && !args.remarks.trim()) {
    blocked("Paid Early requires compulsory remarks.");
  }

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_MARK_PAID",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { recordId: args.recordId, early: args.early, reference: args.reference },
    },
    async (tx) => {
      const record = await tx.commissionRecord.findUniqueOrThrow({ where: { id: args.recordId } });
      if (!record.isCurrent) blocked("This commission record has been superseded.");

      // AC-03 — the stored approval is the only thing that unlocks Paid Early.
      const allowed = canMarkPaid(
        record.payment,
        record.eligibility,
        args.early,
        record.earlyApprovedAt !== null
      );
      if (!allowed.ok) blocked(allowed.reason);

      const dated = notFutureDated("Commission Paid Date", args.paidOn);
      if (!dated.ok) blocked(dated.reason);

      const normalisedKey = normaliseReference(args.reference);
      const clash = await tx.externalReference.findFirst({
        where: { normalisedKey, status: "ACTIVE" },
      });
      if (clash) {
        blocked(
          `Payment Reference No. "${args.reference.trim()}" is already recorded against another ` +
            `entry. References are unique across every approved external reference.`
        );
      }
      const reference = await tx.externalReference.create({
        data: {
          rawValue: args.reference.trim(),
          normalisedKey,
          purpose: "COMMISSION",
          actionDate: args.paidOn,
          actorRef: args.actorRef,
        },
      });

      const payment = args.early ? "PAID_EARLY" : "PAID";
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: {
          payment,
          paidOn: args.paidOn,
          paidByRef: args.actorRef,
          paymentRemarks: args.remarks.trim() || null,
          externalReferenceId: reference.id,
          externalProcessingCompleted: true,
        },
      });
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef: args.actorRef,
          action: payment,
          fromState: record.payment,
          toState: payment,
          reason: args.remarks.trim() || null,
        },
      });
      await closeTasksFor(
        tx,
        "Commission",
        record.id,
        args.actorRef,
        args.early ? `Paid Early — ${args.remarks.trim()}` : "Paid",
        COMMISSION_PAYMENT_PURPOSE
      );

      return {
        result: { recordId: record.id, payment },
        audit: {
          entity: "CommissionRecord",
          entityId: record.id,
          action: payment,
          after: {
            percent: record.percent.toFixed(4),
            reference: reference.rawValue,
            earlyApprovedByRef: record.earlyApprovedByRef,
            earlyApprovedAt: record.earlyApprovedAt?.toISOString() ?? null,
          },
          reason: args.remarks.trim() || null,
        },
      };
    }
  );
}

/* ------------------------------------------------- cancellation and holds */

/** CP §64 T24 — Reward Review — Approved Buyback (prd-complete §14.12). */
export const BUYBACK_COMMISSION_PURPOSE = "BUYBACK_COMMISSION_REVIEW";
/** CP §64 T25 — Reward Review — Buyback Unwind. */
export const BUYBACK_UNWIND_PURPOSE = "BUYBACK_UNWIND_REVIEW";

async function bookingRecordName(tx: Tx, bookingId: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { project: true, plot: true },
  });
  return `${booking.bookingNumber ?? booking.requestNo} · ${booking.project.name} ${booking.plot.plotNumber}`;
}

/**
 * CP §64 T25, §84 — after an approved Buyback unwinds, Accounts reviews what the
 * Buyback alone had qualified. The reassessment has already stepped such
 * records back; the review is the human check, with monetary adjustment where
 * a stepped-back record was paid.
 */
export async function raiseBuybackUnwindReview(tx: Tx, bookingId: string, reason: string) {
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const adjustments = await tx.commissionRecord.count({
    where: { bookingId, isCurrent: true, payment: "ACCOUNTS_ADJUSTMENT_REQUIRED" },
  });
  await ensureTask(tx, {
    recordKind: "Booking",
    recordId: bookingId,
    recordName: await bookingRecordName(tx, bookingId),
    purpose: BUYBACK_UNWIND_PURPOSE,
    title: "Reward Review — Buyback Unwind",
    assigneeRole: "ACCOUNTS",
    dueAt: new Date(),
    decision: true,
    latestResult:
      `Buyback unwound — ${reason}. Source Payment Received ` +
      `${booking.paymentReceivedPercent.toFixed(2)}%; anything the Buyback alone qualified is stepped back. ` +
      (adjustments > 0
        ? `${adjustments} paid record${adjustments === 1 ? "" : "s"} need${adjustments === 1 ? "s" : ""} an Accounts adjustment.`
        : "No paid record needs adjustment."),
  });
}

/**
 * AC-05 — the commission side of an unwind, following prd-complete §14.12, which
 * treats three cases differently rather than one:
 *
 *  - **Cancellation before legal completion** — unpaid records are Cancelled; a Paid or Paid Early record becomes Accounts Adjustment
 *    Required. Nothing is deleted.
 *  - **Buyback before legal completion** — "Unpaid old-sale commission:
 *    CRM/management decision, then Accounts approval". The records step back the
 *    same way, and the decision §14.12 requires is raised as an Accounts task
 *    rather than being skipped.
 *  - **Buyback after legal completion** — "Original sale commission normally
 *    remains earned unless the written arrangement states otherwise". The sale
 *    really did complete, so the records keep their payment state. Accounts still
 *    get the review, because "normally" is not "always" and the written
 *    arrangement is a human judgement, not a rule the system can hold.
 *
 * The third case is the one the ordinary cancellation path gets wrong if it is
 * reused: it would cancel a commission that the approved rule says stays earned.
 */
export async function cancelCommissionForBooking(
  tx: Tx,
  bookingId: string,
  actorRef: string,
  args: {
    legallyCompleted: boolean;
    reason: string;
    /** Defaults to a cancellation; a Buyback says so, because §14.12 differs. */
    unwind?: "CANCELLATION" | "BUYBACK";
  }
) {
  const records = await tx.commissionRecord.findMany({ where: { bookingId, isCurrent: true } });
  const isBuyback = args.unwind === "BUYBACK";

  // prd-complete §14.12 — the only case where the commission is left standing.
  const remainsEarned = isBuyback && args.legallyCompleted;

  // CR-015 — the Direct rule below, and the reward gate, need what was actually received.
  const sourceBooking = isBuyback
    ? await tx.booking.findUniqueOrThrow({ where: { id: bookingId } })
    : null;

  for (const record of records) {
    if (remainsEarned) {
      // Nothing about the record changes, not even its payment state. Only the history gains
      // the fact that a Buyback happened after the sale legally completed.
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef,
          action: "BUYBACK_AFTER_COMPLETION",
          fromState: record.payment,
          toState: record.payment,
          reason:
            `${args.reason}. The sale was legally completed before the Buyback, so this ` +
            `commission remains earned (prd-complete §14.12).`,
        },
      });
      continue;
    }

    // v2.1 §41 — before legal completion an Approved Buyback is the alternative
    // milestone for Loyalty, once the Booking has 25% Payment Received. Such a
    // record is left standing and the reassessment earns it; §14.12's step-back
    // applies to everything the Buyback does not accelerate.
    if (
      isBuyback &&
      sourceBooking &&
      buybackMilestoneMet({
        type: record.type,
        buybackApproved: true,
        progressPercent: sourceBooking.paymentReceivedPercent.toString(),
      })
    ) {
      continue;
    }

    // v2.1 §20 — Direct is never accelerated, and a Direct that had already
    // reached its own milestone was genuinely earned on a sale that did happen,
    // so it stands. Only one that never reached it closes under §14.12. (After
    // the guard above this is Direct: Buying Commission hangs off the
    // acquisition, so it is not among a Booking's records at all.)
    if (
      isBuyback &&
      sourceBooking &&
      new D(sourceBooking.paymentReceivedPercent).gte(record.milestonePercent)
    ) {
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef,
          action: "BUYBACK_BEFORE_COMPLETION",
          fromState: record.payment,
          toState: record.payment,
          reason:
            `${args.reason}. This record had already reached its ` +
            `${record.milestonePercent.toFixed(0)}% Payment Received milestone before the ` +
            `Buyback, so it stays earned. A Buyback never accelerates Direct and never ` +
            `un-earns it either (v2.1 §20).`,
        },
      });
      continue;
    }

    const payment = afterAffectingChange(record.payment, "CANCELLED_BEFORE_COMPLETION");
    await tx.commissionRecord.update({
      where: { id: record.id },
      data: { payment, closedReason: args.reason },
    });
    await tx.commissionEvent.create({
      data: {
        recordId: record.id,
        actorRef,
        action: isBuyback ? "BUYBACK_BEFORE_COMPLETION" : "BOOKING_CANCELLED",
        fromState: record.payment,
        toState: payment,
        reason: args.reason,
      },
    });

    await closeTasksFor(tx, "Commission", record.id, actorRef, args.reason, COMMISSION_PAYMENT_PURPOSE);
  }

  // CP §64 T24, §83 step 11 — every approved Buyback of a sale gets the
  // reward review, whether or not the sale carried commission (UAT BB-01).
  if (isBuyback && sourceBooking) {
    const received = new D(sourceBooking.paymentReceivedPercent);
    const gateMet = received.gte(new D(BUYBACK_MIN_SOURCE_PAYMENT));
    const n = `${records.length} commission record${records.length === 1 ? "" : "s"}`;
    await ensureTask(tx, {
      recordKind: "Booking",
      recordId: bookingId,
      recordName: await bookingRecordName(tx, bookingId),
      purpose: BUYBACK_COMMISSION_PURPOSE,
      title: "Reward Review — Approved Buyback",
      assigneeRole: "ACCOUNTS",
      dueAt: new Date(),
      decision: true,
      latestResult:
        `Source Payment Received ${received.toFixed(2)}% — 25% reward gate ` +
        (gateMet ? "met: Loyalty may qualify by the Buyback." : "not met: no reward qualifies by the Buyback.") +
        ` Direct stays on its normal milestone. ` +
        (remainsEarned ? `${n} still earned; check the written arrangement.` : `${n} reviewed.`),
    });
  }

  return { affected: records.length, remainsEarned };
}

/**
 * The commission side of reaching, or losing, legal completion.
 *
 * Delivery decides nothing about a commission milestone, so this is a plain
 * reassessment — kept as its own function because the completion service calls
 * it by name and what it means is still "the legal completion of this Booking
 * moved".
 */
export async function onLegalCompletionChanged(
  tx: Tx,
  bookingId: string,
  actorRef: string,
  args: { completed: boolean; reason: string }
) {
  void args;
  await reassessCommission(tx, bookingId, actorRef);
}

/**
 * PRD §13, §14.11 — deactivation holds every unpaid record while preserving the
 * paid history. Reactivation rechecks eligibility rather than assuming it.
 */
export async function applyMemberCommissionHold(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  memberProfileId: string;
  hold: boolean;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to change a Member hold.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "MEMBER_COMMISSION_HOLD",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { memberProfileId: args.memberProfileId, hold: args.hold },
    },
    async (tx) => {
      const member = await tx.memberProfile.findUniqueOrThrow({
        where: { id: args.memberProfileId },
      });
      await tx.memberProfile.update({
        where: { id: member.id },
        data: {
          commissionHold: args.hold,
          commissionHoldReason: args.hold ? args.reason : null,
        },
      });

      // Reassess every Booking this Member has an unpaid record on, so removing
      // a hold resumes the same task rather than creating duplicates (§14.11).
      const affected = await tx.commissionRecord.findMany({
        where: {
          beneficiaryPersonId: member.personId,
          isCurrent: true,
          payment: { in: ["NOT_PAID", "ACCOUNTS_ADJUSTMENT_REQUIRED"] },
        },
        select: { bookingId: true },
        distinct: ["bookingId"],
      });
      for (const { bookingId } of affected) {
        // Buying Commission hangs off an Acquisition rather than a Booking and
        // is reassessed on the acquisition's own path (PRD §11.7).
        if (bookingId) await reassessCommission(tx, bookingId, args.actorRef);
      }

      return {
        result: { memberProfileId: member.id, hold: args.hold, bookings: affected.length },
        audit: {
          entity: "MemberProfile",
          entityId: member.id,
          action: args.hold ? "MEMBER_COMMISSION_HOLD_APPLIED" : "MEMBER_COMMISSION_HOLD_REMOVED",
          reason: args.reason,
        },
      };
    }
  );
}

/* -------------------------------------------------------------- read model */

/**
 * v2.1 §21, §25 — how many Customer-closing Loyalty events have qualified for
 * each Person, of the lifetime three. Screens read this rather than counting.
 */
export async function closingLoyaltyUsed(personIds: readonly string[]): Promise<Map<string, number>> {
  if (personIds.length === 0) return new Map();
  const rows = await db.commissionRecord.groupBy({
    by: ["beneficiaryPersonId"],
    where: {
      beneficiaryPersonId: { in: [...personIds] },
      type: "LOYALTY",
      beneficiaryRole: "CLOSING_CUSTOMER",
      isCurrent: true,
      payment: { not: "CANCELLED" },
      qualifiedAt: { not: null },
      booking: { status: { not: "CANCELLED" } },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.beneficiaryPersonId, r._count._all]));
}

export function listCommissionForBooking(bookingId: string) {
  return db.commissionRecord.findMany({
    where: { bookingId },
    include: { beneficiaryPerson: true, externalReference: true },
    orderBy: [{ isCurrent: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * PRD §23.1 — the Member portal shows Project, Plot, type, percentage,
 * milestone, status and a Member-safe hold reason. Never the buyer's identity.
 */
export async function memberCommissionView(personId: string) {
  const records = await db.commissionRecord.findMany({
    where: { beneficiaryPersonId: personId, isCurrent: true },
    include: {
      booking: { include: { project: true, plot: true } },
      // Buying Commission names the acquired property instead of a Booking.
      acquisition: { include: { plot: { include: { project: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return records.map((r) => ({
    project: r.booking?.project.name ?? r.acquisition?.plot?.project.name ?? r.acquisition?.propertyName ?? "—",
    plot: describePlot(r),
    type: r.type,
    percent: r.percent.toFixed(2),
    milestonePercent: r.milestonePercent.toFixed(0),
    eligibility: r.eligibility,
    holdReason: r.holdReason,
    payment: r.payment,
    paidOn: r.paidOn?.toISOString() ?? null,
  }));
}

/**
 * The Plot a commission record refers to. Sale commission names the Booking's
 * Plot; Buying Commission names the acquired property, which for an external
 * purchase may not be a Plot in inventory until the acquisition is approved.
 */
function describePlot(record: {
  booking: { plot: { plotType: string; plotNumber: string } } | null;
  acquisition: { plot: { plotType: string; plotNumber: string } | null; propertyNumber: string | null } | null;
}): string {
  const plot = record.booking?.plot ?? record.acquisition?.plot ?? null;
  if (plot) return `${plot.plotType.replaceAll("_", " ")} ${plot.plotNumber}`;
  return record.acquisition?.propertyNumber ?? "—";
}
