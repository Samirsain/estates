// Commission engine service — PRD.md §6, §13, §14; main-PRD §14.
// Records are generated when Accounts approves the Booking, so the 4% cap can
// be judged before approval and the Booking shows what it will earn. The
// one-shot entitlements are consumed only at the milestone, because the
// qualifying sale is the first Booking to reach it (PRD §6.1, §6.3, §6.8).

import { Prisma } from "@prisma/client";
import type { CommissionType, OpportunityKind } from "@prisma/client";
import { db } from "@/lib/db";
import {
  afterAffectingChange,
  canMarkPaid,
  generateCommission,
  needsPaymentTask,
  opportunityReopens,
  resolveEligibility,
  totalOf,
  type CommissionInput,
  type CommissionOutcome,
  type Component,
  type NetworkLink,
} from "@/lib/domain/commission";
import { normaliseReference, notFutureDated } from "@/lib/domain/booking";
import { hasVerifiedBank } from "./bank-service";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";

const D = Prisma.Decimal;

export const COMMISSION_CONFLICT_PURPOSE = "COMMISSION_CONFLICT";
export const COMMISSION_PAYMENT_PURPOSE = "COMMISSION_PAYMENT";

/** Which commission types consume a one-shot entitlement (PRD §6.8). */
const OPPORTUNITY_FOR: Partial<Record<CommissionType, OpportunityKind>> = {
  INVITE: "INVITE",
  ROYALTY: "ROYALTY",
  LOYALTY: "LOYALTY",
};

/* ------------------------------------------------------------ opportunities */

/**
 * Consumed slots for one subject, counted from the ledger rather than a field.
 * `exceptBookingId` lets a Booking ignore its own consumption: without it a
 * regeneration after this Booking reached its milestone would read the slot as
 * taken and silently drop the component it had already earned.
 */
async function consumedSlots(
  tx: Tx,
  kind: OpportunityKind,
  subjectPersonId: string,
  exceptBookingId?: string
) {
  return tx.commissionOpportunity.count({
    where: {
      kind,
      subjectPersonId,
      status: "CONSUMED",
      ...(exceptBookingId ? { consumedByBookingId: { not: exceptBookingId } } : {}),
    },
  });
}

/**
 * PRD §6.8 — allocation is atomic. The consumed row is written against a unique
 * index on (kind, subject, slot), so two Bookings reaching the milestone at the
 * same instant cannot both take it: the loser's insert is rejected and its
 * record is closed rather than silently paid twice.
 */
async function consumeOpportunity(
  tx: Tx,
  args: {
    kind: OpportunityKind;
    subjectPersonId: string;
    beneficiaryPersonId: string;
    bookingId: string;
    maxSlots: number;
  }
): Promise<{ ok: true; opportunityId: string } | { ok: false; reason: string }> {
  // The unique index is the backstop, but catching its violation here could
  // never work: a failed statement aborts the whole Postgres transaction, so
  // the "loser" path would die rather than close its record. Serialising the
  // contenders on the entitlement key makes count-then-insert atomic, and any
  // real error still surfaces as an error instead of being read as "someone
  // else took the slot".
  await lockKey(tx, `commission-opportunity:${args.kind}:${args.subjectPersonId}`);

  const taken = await consumedSlots(tx, args.kind, args.subjectPersonId);
  if (taken >= args.maxSlots) {
    return {
      ok: false,
      reason:
        args.kind === "LOYALTY"
          ? "The Customer has already consumed all three lifetime Loyalty Bonuses."
          : `The ${args.kind.toLowerCase()} opportunity has already been consumed by another Booking.`,
    };
  }

  const opportunity = await tx.commissionOpportunity.create({
    data: {
      kind: args.kind,
      subjectPersonId: args.subjectPersonId,
      beneficiaryPersonId: args.beneficiaryPersonId,
      slotIndex: taken + 1,
      status: "CONSUMED",
      consumedByBookingId: args.bookingId,
      consumedAt: new Date(),
    },
  });
  return { ok: true, opportunityId: opportunity.id };
}

/**
 * PRD §6.1, §6.5 — a cancellation before legal completion reopens the slot; a
 * legally completed sale later bought back keeps it consumed. The row is never
 * deleted, only reopened with its reason.
 */
async function reopenOpportunity(tx: Tx, opportunityId: string, reason: string) {
  await tx.commissionOpportunity.update({
    where: { id: opportunityId },
    data: {
      status: "OPEN",
      consumedByBookingId: null,
      consumedAt: null,
      reopenedReason: reason,
      reopenedAt: new Date(),
    },
  });
}

/* ------------------------------------------------------------ engine input */

/** Gathers everything the pure engine needs, straight from the Booking. */
export async function commissionInputFor(tx: Tx, bookingId: string): Promise<CommissionInput> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      primaryPerson: { include: { memberProfile: true, customerProfile: true } },
      soldByPerson: {
        include: {
          memberProfile: { include: { invitedByMember: { include: { person: true } } } },
        },
      },
    },
  });

  const buyer = booking.primaryPerson;
  const buyerIsActiveMember = buyer.memberProfile?.status === "ACTIVE";

  /**
   * PRD §14.5 — "first personal purchase receives no repeat-purchase Loyalty",
   * so a repeat is any earlier Booking of this buyer that Accounts approved and
   * that was not cancelled. Rejected and cancelled requests never count.
   */
  const priorPurchases = await tx.booking.count({
    where: {
      primaryPersonId: buyer.id,
      id: { not: bookingId },
      bookingNumber: { not: null },
      status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
      submittedAt: { lt: booking.submittedAt },
    },
  });

  // The Invite band belongs to the selling Member's own position under their
  // inviting Member — frozen at activation and never renumbered (RD-02).
  const selling = booking.soldByPerson?.memberProfile ?? null;
  const invite: NetworkLink | null =
    selling?.invitedByMember && selling.invitePosition && selling.inviteRatePercent
      ? {
          beneficiaryPersonId: selling.invitedByMember.personId,
          position: selling.invitePosition,
          ratePercent: selling.inviteRatePercent.toString(),
        }
      : null;

  // The Royalty band belongs to the buyer's position under the Member who
  // originally introduced them (PRD §6.4).
  const customer = buyer.customerProfile;
  const introducer = customer?.originalIntroducedByMemberId
    ? await tx.memberProfile.findUnique({ where: { id: customer.originalIntroducedByMemberId } })
    : null;
  const royalty: NetworkLink | null =
    introducer && customer?.introducedPosition && customer.introducedRatePercent
      ? {
          beneficiaryPersonId: introducer.personId,
          position: customer.introducedPosition,
          ratePercent: customer.introducedRatePercent.toString(),
        }
      : null;

  const loyaltySubject =
    booking.soldByType === "CUSTOMER" ? booking.soldByPersonId ?? buyer.id : buyer.id;

  return {
    soldByType: booking.soldByType,
    soldByPersonId: booking.soldByPersonId,
    buyerPersonId: buyer.id,
    buyerIsActiveMember,
    buyerHasPriorPurchase: priorPurchases > 0,
    invite,
    inviteOpportunityOpen: selling
      ? (await consumedSlots(tx, "INVITE", selling.personId, bookingId)) === 0
      : false,
    royalty,
    royaltyOpportunityOpen: (await consumedSlots(tx, "ROYALTY", buyer.id, bookingId)) === 0,
    loyaltySlotsConsumed: await consumedSlots(tx, "LOYALTY", loyaltySubject, bookingId),
  };
}

/**
 * RD-03 — Accounts cannot approve while the generated combination exceeds 4%.
 * Used by the Booking decision before it commits to anything.
 */
export async function previewCommission(tx: Tx, bookingId: string): Promise<CommissionOutcome> {
  return generateCommission(await commissionInputFor(tx, bookingId));
}

/**
 * RD-03 — the conflict is shown and a Dashboard task is created for CRM/Admin to
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

/* ------------------------------------------------------------- generation */

/**
 * Creates or refreshes the current commission records for a Booking. Existing
 * records that no longer match are superseded, never edited or deleted
 * (PRD §6.9). Opportunities are untouched here — they are consumed at the
 * milestone, in `reassessCommission`.
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

  // A superseded record releases the slot it consumed, so the replacement can
  // take it (PRD §6.9 with §6.8).
  if (record.opportunityId) {
    await reopenOpportunity(tx, record.opportunityId, `Superseded — ${reason}`);
    await tx.commissionRecord.update({ where: { id: recordId }, data: { opportunityId: null } });
  }
}

/* ------------------------------------------------------------- reassessment */

/**
 * Recomputes eligibility for every current record on a Booking, and consumes
 * the one-shot entitlement the moment a record first reaches its milestone.
 * Safe to call after any payment, cancellation or hold change.
 */
export async function reassessCommission(tx: Tx, bookingId: string, actorRef: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { project: true, plot: true },
  });
  const records = await tx.commissionRecord.findMany({
    where: { bookingId, isCurrent: true },
    include: { beneficiaryPerson: { include: { memberProfile: true } } },
  });
  if (records.length === 0) return { reassessed: 0 };

  const saleTotal = totalOf(
    records.filter((r) => r.type !== "BUYING" && r.payment !== "CANCELLED")
  );
  const conflictAbove4 = saleTotal.gt(4);

  for (const record of records) {
    const member = record.beneficiaryPerson.memberProfile;
    const next = resolveEligibility({
      type: record.type as "DIRECT" | "INVITE" | "ROYALTY" | "LOYALTY",
      progressPercent: booking.paymentReceivedPercent.toString(),
      milestonePercent: record.milestonePercent.toString(),
      beneficiaryAadhaarAvailable: record.beneficiaryPerson.aadhaarStatus !== "PENDING",
      beneficiaryBankVerified: await hasVerifiedBank(tx, record.beneficiaryPersonId),
      memberStatus: member?.status ?? null,
      memberCommissionHold: member?.commissionHold ?? false,
      reraStatus: member?.reraStatus ?? null,
      bookingProcess: booking.activeProcess,
      acquisitionPaymentPending: false, // Phase 5 sets this from the acquisition.
      commissionConflictAbove4: conflictAbove4,
    });

    // The milestone is reached: take the one-shot entitlement, atomically.
    const kind = OPPORTUNITY_FOR[record.type];
    const milestoneReached = new D(booking.paymentReceivedPercent).gte(record.milestonePercent);

    if (kind && milestoneReached && !record.opportunityId && record.payment !== "CANCELLED") {
      const claim = await consumeOpportunity(tx, {
        kind,
        subjectPersonId: subjectFor(record.type, booking, record.beneficiaryPersonId),
        beneficiaryPersonId: record.beneficiaryPersonId,
        bookingId,
        maxSlots: kind === "LOYALTY" ? 3 : 1,
      });

      if (!claim.ok) {
        await tx.commissionRecord.update({
          where: { id: record.id },
          data: { payment: "CANCELLED", closedReason: claim.reason },
        });
        await tx.commissionEvent.create({
          data: { recordId: record.id, actorRef, action: "OPPORTUNITY_LOST", reason: claim.reason },
        });
        continue;
      }
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: { opportunityId: claim.opportunityId },
      });
      await tx.commissionEvent.create({
        data: { recordId: record.id, actorRef, action: "OPPORTUNITY_CONSUMED" },
      });
    }

    // A milestone lost after payment correction steps the record back (PRD §6.12).
    let payment = record.payment;
    if (!milestoneReached && record.opportunityId) {
      payment = afterAffectingChange(record.payment, "MILESTONE_LOST");
      await reopenOpportunity(tx, record.opportunityId, "Payment fell below the milestone.");
      await tx.commissionRecord.update({
        where: { id: record.id },
        data: { opportunityId: null, payment },
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
 * The subject whose one-shot entitlement a record consumes. Invite belongs to
 * the invited — that is, the selling — Member, not to the inviting Member who
 * receives the money; Royalty to the introduced Customer; Loyalty to the
 * Customer who earns it. This must match how openness is read in
 * `commissionInputFor`, or a consumed slot would never be seen again.
 */
function subjectFor(
  type: CommissionType,
  booking: { primaryPersonId: string; soldByPersonId: string | null },
  beneficiaryPersonId: string
) {
  if (type === "INVITE") {
    if (!booking.soldByPersonId) {
      throw new Error("An Invite commission exists without a selling Member on the Booking.");
    }
    return booking.soldByPersonId;
  }
  if (type === "ROYALTY") return booking.primaryPersonId;
  return beneficiaryPersonId;
}

/* -------------------------------------------------------- payment processing */

/**
 * PRD §6.11 — Accounts records Paid, or Paid Early with compulsory remarks. No
 * additional MD/Admin approval is required and a Paid Early record is never
 * marked Paid again.
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
    blocked("Paid Early requires compulsory remarks (PRD §6.11).");
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

      const allowed = canMarkPaid(record.payment, record.eligibility, args.early);
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
          after: { percent: record.percent.toFixed(4), reference: reference.rawValue },
          reason: args.remarks.trim() || null,
        },
      };
    }
  );
}

/* ------------------------------------------------- cancellation and holds */

/**
 * PRD §6.5, §14.12 — a cancellation before legal completion cancels the unpaid
 * records and reopens their slots, while a paid one becomes Accounts Adjustment
 * Required. A legally completed sale keeps its slots consumed.
 */
export async function cancelCommissionForBooking(
  tx: Tx,
  bookingId: string,
  actorRef: string,
  args: { legallyCompleted: boolean; reason: string }
) {
  const records = await tx.commissionRecord.findMany({ where: { bookingId, isCurrent: true } });

  for (const record of records) {
    const payment = afterAffectingChange(record.payment, "CANCELLED_BEFORE_COMPLETION");
    await tx.commissionRecord.update({
      where: { id: record.id },
      data: { payment, closedReason: args.reason },
    });
    await tx.commissionEvent.create({
      data: {
        recordId: record.id,
        actorRef,
        action: "BOOKING_CANCELLED",
        fromState: record.payment,
        toState: payment,
        reason: args.reason,
      },
    });

    if (record.opportunityId && opportunityReopens(args.legallyCompleted)) {
      await reopenOpportunity(tx, record.opportunityId, args.reason);
      await tx.commissionRecord.update({ where: { id: record.id }, data: { opportunityId: null } });
    }
    await closeTasksFor(tx, "Commission", record.id, actorRef, args.reason, COMMISSION_PAYMENT_PURPOSE);
  }
  return { affected: records.length };
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
