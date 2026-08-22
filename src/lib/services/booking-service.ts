// Booking Request, Accounts decision, cancellation, ownership shares and
// Primary Customer change.
// PRD.md §9, §11, §12, §13; DESIGN.md §10; ARCHITECTURE.md §6.2, §7.

import type { SoldByType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  assertProcessFree,
  canTransition,
  canonicalSnapshot,
  freezeHold,
  restoreHold,
  validateBookingDate,
  validateRejectReason,
  validateShares,
  type BookingRejectReason,
} from "@/lib/domain/booking";
import { checkOpenPositions } from "@/lib/domain/holds";
import {
  buildPlcSnapshot,
  canAllocate,
  plotReturnState,
  type PlotRestriction,
} from "@/lib/domain/inventory";
import { blocked, lockBooking, lockPlot, nextReference, runCommand, type Tx } from "./command";
import { countOpenPositions } from "./hold-service";
import {
  generateForBooking,
  previewCommission,
  raiseCommissionConflict,
  reassessCommission,
} from "./commission-service";
import { createScheduleVersion, syncPaymentFollowUp, type ScheduleInput } from "./payment-service";
import { closeTasksFor, ensureTask } from "./task-service";

/** PRD §11.6 — the decision/follow-up period is seven calendar days. */
export const BOOKING_DECISION_DAYS = 7;

export type BookingPartyInput = {
  personId: string;
  role: "PRIMARY" | "ADDITIONAL";
  /** Omitted only where this is the sole buyer, who is treated as 100%. */
  sharePercent?: string | null;
};

export type BookingDecisionResult = {
  bookingId: string;
  status: "BOOKED" | "REQUEST_REJECTED";
  bookingNumber: string | null;
};

/** PRD §9.2, §9.3 — one visible action, two outcomes. */
/** PRD §6.10 — one shape for both outcomes, so the union does not collapse. */
export type SoldByDecisionResult = {
  correctionId: string;
  status: "APPROVED" | "REJECTED";
};

export type BookingCancelResult = {
  bookingId: string;
  status: "REQUEST_CANCELLED" | "REFUND_PENDING";
  refundPending: boolean;
};

export type SubmitBookingInput = {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  plotId: string;
  parties: BookingPartyInput[];
  soldByType: SoldByType;
  soldByPersonId?: string | null;
  bookingDate: Date;
  bookingDateReason?: string | null;
  customerType?: string | null;
  remark?: string | null;
  enquiryId?: string | null;
  holdId?: string | null;
  schedule: ScheduleInput[];
};

/* ------------------------------------------------------------- helpers */

function primaryOf(parties: readonly BookingPartyInput[]): BookingPartyInput {
  const primaries = parties.filter((p) => p.role === "PRIMARY");
  if (primaries.length !== 1) blocked("Exactly one Primary Customer is required on a Booking.");
  return primaries[0];
}

/**
 * PRD §5.2 — the Customer ID is created when the first Booking Request is
 * submitted, and is retained even if the request is later rejected.
 */
async function ensureCustomerProfile(tx: Tx, personId: string) {
  const existing = await tx.customerProfile.findUnique({ where: { personId } });
  if (existing) return existing;

  // A Customer ID is permanent and never reused (PRD §5.2).
  return tx.customerProfile.create({
    data: { personId, customerId: await nextReference(tx, "CUS", "Customer") },
  });
}

/**
 * PRD §6.7 — when a Person holds an Active Member capability the closing action
 * must use Sold By Member; the same action can never generate Customer Loyalty.
 */
async function validateSoldBy(tx: Tx, soldByType: SoldByType, soldByPersonId: string | null) {
  if (soldByType === "THREE_PERCENT_CLUB") {
    if (soldByPersonId) blocked("A 3% Club direct close names no Sold By Person.");
    return;
  }
  if (!soldByPersonId) blocked(`Select the ${soldByType === "MEMBER" ? "Member" : "Customer"} who closed the deal.`);

  const person = await tx.person.findUniqueOrThrow({
    where: { id: soldByPersonId },
    include: { memberProfile: true },
  });

  if (soldByType === "MEMBER") {
    if (!person.memberProfile) blocked("The selected Person has no Member profile.");
    if (person.memberProfile.status !== "ACTIVE") {
      blocked("A Member must be Active at Booking Request to be selected as the closer (PRD §7.1).");
    }
    if (!person.memberProfile.activationDate) blocked("This Member has not been activated yet.");
    return;
  }

  if (person.memberProfile?.status === "ACTIVE") {
    blocked(
      "This Person holds an Active Member capability, so the close must be recorded as Sold By " +
        "Member. An Active Member cannot close as a Customer (PRD §6.7)."
    );
  }
}

type PlotWithPlc = {
  id: string;
  plcComponentCodes: string[];
  project: {
    plcRuleVersions: Array<{
      id: string;
      components: Array<{ code: string; label: string; percent: { toString(): string } }>;
    }>;
  };
};

/** Reuses the Hold's frozen snapshot, or freezes the current PLC version. */
async function plcSnapshotFor(tx: Tx, plot: PlotWithPlc, holdSnapshotId: string | null) {
  if (holdSnapshotId) return tx.plcSnapshot.findUniqueOrThrow({ where: { id: holdSnapshotId } });

  const version = plot.project.plcRuleVersions[0];
  if (!version) blocked("The Project has no current PLC rule version. Complete Project setup first.");

  const snapshot = buildPlcSnapshot(
    plot.plcComponentCodes,
    version.components.map((c) => ({ code: c.code, label: c.label, percent: c.percent.toString() }))
  );
  return tx.plcSnapshot.create({
    data: {
      ruleVersionId: version.id,
      plotId: plot.id,
      components: snapshot.components as never,
      totalPercent: snapshot.totalPercent.toFixed(3),
    },
  });
}

async function currentParties(tx: Tx, bookingId: string) {
  return tx.bookingParty.findMany({
    where: { bookingId, kind: "COMMERCIAL", effectiveTo: null },
    orderBy: { role: "asc" },
  });
}

/**
 * PRD §9.1 — the immutable review snapshot, built through the canonical form so
 * two identical submissions produce byte identical JSON. Everything here is
 * already in hand; nothing is re-read from the rows just written.
 */
function reviewSnapshot(input: {
  projectId: string;
  plotId: string;
  parties: readonly BookingPartyInput[];
  plc: { totalPercent: string | null; components: unknown };
  soldByType: SoldByType;
  soldByPersonId: string | null;
  bookingDate: Date;
  customerType: string | null;
  schedule: readonly { seq: number; scheduledPercent: { toFixed(dp: number): string }; dueDate: Date }[];
  remark: string | null;
}) {
  return canonicalSnapshot({
    projectId: input.projectId,
    plotId: input.plotId,
    parties: [...input.parties]
      .sort((a, b) => (a.personId < b.personId ? -1 : 1))
      .map((p) => ({
        personId: p.personId,
        role: p.role,
        sharePercent: p.sharePercent ?? null,
      })),
    plcSnapshot: input.plc,
    soldByType: input.soldByType,
    soldByPersonId: input.soldByPersonId,
    bookingDate: input.bookingDate,
    customerType: input.customerType,
    schedule: input.schedule.map((i) => ({
      seq: i.seq,
      scheduledPercent: i.scheduledPercent.toFixed(4),
      dueDate: i.dueDate,
    })),
    remark: input.remark,
  });
}

async function accountsBookingTask(
  tx: Tx,
  booking: { id: string; requestNo: string; bookingNumber: string | null },
  recordName: string,
  version: number
) {
  return ensureTask(tx, {
    recordKind: "Booking",
    recordId: booking.id,
    recordName,
    purpose: "BOOKING_REVIEW",
    title: "Accounts Verification — Booking",
    assigneeRole: "ACCOUNTS",
    dueAt: new Date(Date.now() + BOOKING_DECISION_DAYS * 86_400_000),
    decision: true,
    latestResult: `Review version ${version}`,
  });
}

/* --------------------------------------------------- submit and revise */

export async function submitBookingRequest(input: SubmitBookingInput) {
  const primary = primaryOf(input.parties);
  const shares = validateShares(input.parties.map((p) => ({ personId: p.personId, sharePercent: p.sharePercent })));
  if (!shares.ok) blocked(shares.reason);

  const dated = validateBookingDate(input.bookingDate, input.bookingDateReason);
  if (!dated.ok) blocked(dated.reason);

  return runCommand(
    {
      idempotencyKey: input.idempotencyKey,
      operation: "BOOKING_REQUEST_SUBMIT",
      actorRef: input.actorRef,
      actorRole: input.actorRole,
      payload: {
        plotId: input.plotId,
        parties: input.parties,
        soldByType: input.soldByType,
        schedule: input.schedule,
      },
    },
    async (tx) => {
      await lockPlot(tx, input.plotId);
      const plot = await tx.plot.findUniqueOrThrow({
        where: { id: input.plotId },
        include: {
          project: {
            include: { plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 } },
          },
        },
      });

      // A Booking Request starts from an Available Plot or from this buyer's own
      // live Hold. Anything else means the Plot is already committed.
      let hold = null;
      if (input.holdId) {
        hold = await tx.hold.findUniqueOrThrow({ where: { id: input.holdId } });
        if (hold.status !== "ACTIVE") blocked("This Hold is no longer active. Create a new Hold first.");
        if (hold.plotId !== input.plotId) blocked("The Hold is on a different Plot.");
        if (hold.personId !== primary.personId) {
          blocked("The Hold is held for a different Customer. Cancel it or book for the Customer on the Hold.");
        }
        if (hold.expiresAt.getTime() <= Date.now()) {
          blocked("This Hold has expired and cannot be submitted for Booking (PRD §10.5).");
        }
      } else {
        const allocatable = canAllocate(plot.lifecycle, plot.restriction, plot.project.lifecycle);
        if (!allocatable.ok) blocked(allocatable.reason);
      }

      await validateSoldBy(tx, input.soldByType, input.soldByPersonId ?? null);

      // PRD §8.2 — the three-position limit is checked before the Plot moves.
      // The Hold being converted is already counted, so it is not counted twice.
      const positions = await countOpenPositions(tx, primary.personId);
      const room = checkOpenPositions(
        hold ? { ...positions, activeHolds: Math.max(0, positions.activeHolds - 1) } : positions
      );
      if (!room.ok) blocked(room.reason);

      for (const party of input.parties) await ensureCustomerProfile(tx, party.personId);

      const snapshot = await plcSnapshotFor(tx, plot, hold?.plcSnapshotId ?? null);
      const requestNo = await nextReference(tx, "REQ", "BookingRequest");

      const booking = await tx.booking.create({
        data: {
          requestNo,
          projectId: plot.projectId,
          plotId: input.plotId,
          primaryPersonId: primary.personId,
          soldByType: input.soldByType,
          soldByPersonId: input.soldByPersonId ?? null,
          bookingDate: input.bookingDate,
          customerType: input.customerType ?? null,
          remark: input.remark ?? null,
          enquiryId: input.enquiryId ?? null,
          holdId: hold?.id ?? null,
          plcSnapshotId: snapshot.id,
          submittedByRef: input.actorRef,
          parties: {
            create: input.parties.map((p) => ({
              personId: p.personId,
              role: p.role,
              sharePercent: p.sharePercent ?? null,
              actorRef: input.actorRef,
            })),
          },
        },
      });

      const schedule = await createScheduleVersion(tx, {
        bookingId: booking.id,
        lines: input.schedule,
        bookingDate: input.bookingDate,
        status: "PENDING",
        createdByRef: input.actorRef,
        reason: "Submitted with the Booking Request.",
      });

      await tx.bookingReviewVersion.create({
        data: {
          bookingId: booking.id,
          version: 1,
          snapshot: reviewSnapshot({
            projectId: plot.projectId,
            plotId: input.plotId,
            parties: input.parties,
            plc: { totalPercent: snapshot.totalPercent.toFixed(3), components: snapshot.components },
            soldByType: input.soldByType,
            soldByPersonId: input.soldByPersonId ?? null,
            bookingDate: input.bookingDate,
            customerType: input.customerType ?? null,
            schedule: schedule.instalments,
            remark: input.remark ?? null,
          }) as never,
          submittedByRef: input.actorRef,
        },
      });

      // PRD §10.5 — the remaining Hold time freezes; it does not keep running.
      if (hold) {
        await tx.hold.update({
          where: { id: hold.id },
          data: {
            status: "FROZEN",
            frozenRemainingMs: freezeHold(hold.expiresAt),
            frozenAt: new Date(),
          },
        });
      }

      await tx.plot.update({
        where: { id: input.plotId },
        data: { lifecycle: "WAITING_FOR_BOOKING_APPROVAL" },
      });
      await tx.plotEvent.create({
        data: {
          plotId: input.plotId,
          actorRef: input.actorRef,
          action: "BOOKING_REQUEST_SUBMITTED",
          fromLifecycle: plot.lifecycle,
          toLifecycle: "WAITING_FOR_BOOKING_APPROVAL",
          reason: input.remark,
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorRef: input.actorRef,
          action: "BOOKING_REQUEST_SUBMITTED",
          toStatus: "REQUEST_PENDING",
          detail: { requestNo, version: 1 },
        },
      });

      await accountsBookingTask(
        tx,
        booking,
        `${requestNo} · ${plot.project.name} ${plot.plotNumber}`,
        1
      );

      return {
        result: { bookingId: booking.id, requestNo, reviewVersion: 1 },
        audit: {
          entity: "Booking",
          entityId: booking.id,
          action: "BOOKING_REQUEST_SUBMITTED",
          after: { requestNo, plotId: input.plotId, primaryPersonId: primary.personId },
          reason: input.remark,
        },
      };
    }
  );
}

/**
 * PRD §9.1 — a frozen field cannot be edited while Waiting for Booking Approval.
 * The pending version is cancelled and preserved, and a new version with a new
 * Accounts task takes its place.
 */
export async function reviseBookingRequest(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  parties: BookingPartyInput[];
  soldByType: SoldByType;
  soldByPersonId?: string | null;
  bookingDate: Date;
  bookingDateReason?: string | null;
  customerType?: string | null;
  remark?: string | null;
  schedule: ScheduleInput[];
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to replace a Booking Request version.");
  const primary = primaryOf(args.parties);
  const shares = validateShares(args.parties.map((p) => ({ personId: p.personId, sharePercent: p.sharePercent })));
  if (!shares.ok) blocked(shares.reason);
  const dated = validateBookingDate(args.bookingDate, args.bookingDateReason);
  if (!dated.ok) blocked(dated.reason);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BOOKING_REQUEST_REVISE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, parties: args.parties, schedule: args.schedule },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: { include: { project: true } }, plcSnapshot: true },
      });
      if (booking.status !== "REQUEST_PENDING") {
        blocked("Only a Booking Request still Waiting for Booking Approval can be replaced.");
      }

      const pending = await tx.bookingReviewVersion.findFirst({
        where: { bookingId: args.bookingId, status: "PENDING" },
      });
      if (!pending) blocked("There is no pending review version to replace.");

      await validateSoldBy(tx, args.soldByType, args.soldByPersonId ?? null);

      // The superseded version stays in History exactly as submitted (PRD §9.1).
      await tx.bookingReviewVersion.update({
        where: { id: pending.id },
        data: {
          status: "CANCELLED",
          decidedByRef: args.actorRef,
          decidedAt: new Date(),
          decisionNote: args.reason,
        },
      });
      await tx.paymentScheduleVersion.updateMany({
        where: { bookingId: args.bookingId, status: "PENDING" },
        data: { status: "SUPERSEDED" },
      });

      // Replace the commercial parties, keeping the old rows effective-dated.
      await tx.bookingParty.updateMany({
        where: { bookingId: args.bookingId, kind: "COMMERCIAL", effectiveTo: null },
        data: { effectiveTo: new Date(), changeReason: args.reason },
      });
      await tx.bookingParty.createMany({
        data: args.parties.map((p) => ({
          bookingId: args.bookingId,
          personId: p.personId,
          role: p.role,
          sharePercent: p.sharePercent ?? null,
          changeReason: args.reason,
          actorRef: args.actorRef,
        })),
      });
      for (const party of args.parties) await ensureCustomerProfile(tx, party.personId);

      await tx.booking.update({
        where: { id: args.bookingId },
        data: {
          primaryPersonId: primary.personId,
          soldByType: args.soldByType,
          soldByPersonId: args.soldByPersonId ?? null,
          bookingDate: args.bookingDate,
          customerType: args.customerType ?? null,
          remark: args.remark ?? null,
        },
      });

      const schedule = await createScheduleVersion(tx, {
        bookingId: args.bookingId,
        lines: args.schedule,
        bookingDate: args.bookingDate,
        status: "PENDING",
        createdByRef: args.actorRef,
        reason: args.reason,
      });

      const version = pending.version + 1;
      await tx.bookingReviewVersion.create({
        data: {
          bookingId: args.bookingId,
          version,
          snapshot: reviewSnapshot({
            projectId: booking.projectId,
            plotId: booking.plotId,
            parties: args.parties,
            // The Plot is unchanged, so the frozen PLC carries into the new version.
            plc: {
              totalPercent: booking.plcSnapshot?.totalPercent.toFixed(3) ?? null,
              components: booking.plcSnapshot?.components ?? null,
            },
            soldByType: args.soldByType,
            soldByPersonId: args.soldByPersonId ?? null,
            bookingDate: args.bookingDate,
            customerType: args.customerType ?? null,
            schedule: schedule.instalments,
            remark: args.remark ?? null,
          }) as never,
          submittedByRef: args.actorRef,
        },
      });

      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        `Replaced by review version ${version} — ${args.reason}`,
        "BOOKING_REVIEW"
      );
      await accountsBookingTask(
        tx,
        booking,
        `${booking.requestNo} · ${booking.plot.project.name} ${booking.plot.plotNumber}`,
        version
      );
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "BOOKING_REQUEST_REVISED",
          detail: { fromVersion: pending.version, toVersion: version },
          reason: args.reason,
        },
      });

      return {
        result: { bookingId: args.bookingId, reviewVersion: version },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "BOOKING_REQUEST_REVISED",
          before: { version: pending.version },
          after: { version },
          reason: args.reason,
        },
      };
    }
  );
}

/* -------------------------------------------------------- Accounts decision */

/**
 * PRD §11.5 — Accounts approves or rejects. There is no Revise. Approval may
 * happen at 0% Payment Received and creates the permanent Booking Number
 * atomically; rejection restores the exact previous Plot and Hold state.
 */
export async function decideBookingRequest(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  approve: boolean;
  rejectReason?: BookingRejectReason;
  /** True where the submitted request claimed a payment had been received. */
  requestClaimedPayment?: boolean;
  note: string;
}): Promise<BookingDecisionResult> {
  if (!args.note.trim()) blocked("A compulsory remark is required on the Accounts decision.");
  if (!args.approve && !args.rejectReason) blocked("Select a rejection reason.");

  return runCommand<BookingDecisionResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BOOKING_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, approve: args.approve, rejectReason: args.rejectReason },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: { include: { project: true } }, hold: true },
      });
      if (booking.status !== "REQUEST_PENDING") {
        blocked(`This request is already ${booking.status.replaceAll("_", " ").toLowerCase()}.`);
      }
      // PRD §3.3 — the account that submitted may not be the account that decides.
      if (booking.submittedByRef === args.actorRef) {
        blocked("A Booking Request must be decided by a different staff account (PRD §3.3).");
      }

      const review = await tx.bookingReviewVersion.findFirstOrThrow({
        where: { bookingId: args.bookingId, status: "PENDING" },
      });
      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };

      if (!args.approve) {
        const reasonCheck = validateRejectReason(args.rejectReason!, args.requestClaimedPayment ?? false);
        if (!reasonCheck.ok) blocked(reasonCheck.reason);

        await tx.bookingReviewVersion.update({
          where: { id: review.id },
          data: { status: "REJECTED", rejectReason: args.rejectReason, ...decision },
        });
        await tx.paymentScheduleVersion.updateMany({
          where: { bookingId: args.bookingId, status: "PENDING" },
          data: { status: "REJECTED", ...decision },
        });
        await restorePlotAfterRelease(tx, booking, args.actorRef, `Booking Request rejected — ${args.note}`);
        await tx.booking.update({
          where: { id: args.bookingId },
          data: { status: "REQUEST_REJECTED", closedAt: new Date(), closeReason: args.note },
        });
        await closeTasksFor(tx, "Booking", args.bookingId, args.actorRef, `Rejected — ${args.note}`, "BOOKING_REVIEW");
        await tx.bookingEvent.create({
          data: {
            bookingId: args.bookingId,
            actorRef: args.actorRef,
            action: "BOOKING_REQUEST_REJECTED",
            fromStatus: "REQUEST_PENDING",
            toStatus: "REQUEST_REJECTED",
            detail: { rejectReason: args.rejectReason },
            reason: args.note,
          },
        });

        return {
          result: { bookingId: args.bookingId, status: "REQUEST_REJECTED", bookingNumber: null },
          audit: {
            entity: "Booking",
            entityId: args.bookingId,
            action: "BOOKING_REQUEST_REJECTED",
            after: { rejectReason: args.rejectReason },
            reason: args.note,
          },
        };
      }

      const move = canTransition("REQUEST_PENDING", "BOOKED");
      if (!move.ok) blocked(move.reason);

      // RD-03 — a Booking Request may be saved, but Accounts cannot approve it
      // while the generated commission combination exceeds 4%. Nothing is
      // trimmed: the conflict is raised for CRM/Admin to correct the source.
      const commission = await previewCommission(tx, args.bookingId);
      if (!commission.ok) {
        await raiseCommissionConflict(tx, args.bookingId, commission.conflict, args.actorRef);
        blocked(commission.conflict);
      }

      const bookingNumber = await nextReference(tx, "BKG", "BookingNumber");
      await tx.bookingReviewVersion.update({
        where: { id: review.id },
        data: { status: "APPROVED", ...decision },
      });
      await tx.paymentScheduleVersion.updateMany({
        where: { bookingId: args.bookingId, status: "PENDING" },
        data: { status: "ACTIVE", ...decision },
      });
      await tx.booking.update({
        where: { id: args.bookingId },
        data: {
          bookingNumber,
          status: "BOOKED",
          approvedByRef: args.actorRef,
          approvedAt: new Date(),
        },
      });

      // Approval permanently ends the Hold and the Plot becomes Booked.
      if (booking.holdId) {
        await tx.hold.update({
          where: { id: booking.holdId },
          data: {
            status: "CONVERTED_TO_BOOKING",
            closedAt: new Date(),
            closeReason: `Converted to Booking ${bookingNumber}`,
            frozenRemainingMs: null,
          },
        });
        await closeTasksFor(tx, "Hold", booking.holdId, args.actorRef, `Booked as ${bookingNumber}`);
      }
      await tx.plot.update({ where: { id: booking.plotId }, data: { lifecycle: "BOOKED" } });
      await tx.plotEvent.create({
        data: {
          plotId: booking.plotId,
          actorRef: args.actorRef,
          action: "BOOKING_APPROVED",
          fromLifecycle: "WAITING_FOR_BOOKING_APPROVAL",
          toLifecycle: "BOOKED",
          reason: args.note,
        },
      });
      if (booking.enquiryId) {
        await tx.enquiry.update({ where: { id: booking.enquiryId }, data: { status: "BOOKED" } });
        await closeTasksFor(
          tx,
          "Enquiry",
          booking.enquiryId,
          args.actorRef,
          `Booked as ${bookingNumber}`,
          "ENQUIRY_FOLLOW_UP"
        );
      }

      await closeTasksFor(tx, "Booking", args.bookingId, args.actorRef, `Approved — ${args.note}`, "BOOKING_REVIEW");
      await syncPaymentFollowUp(tx, args.bookingId, args.actorRef);
      // main-PRD §11.5 — the payment and commission engines start on approval.
      await generateForBooking(tx, args.bookingId, args.actorRef);
      await reassessCommission(tx, args.bookingId, args.actorRef);
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "BOOKING_APPROVED",
          fromStatus: "REQUEST_PENDING",
          toStatus: "BOOKED",
          detail: { bookingNumber },
          reason: args.note,
        },
      });

      return {
        result: { bookingId: args.bookingId, status: "BOOKED", bookingNumber },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "BOOKING_APPROVED",
          after: { bookingNumber },
          reason: args.note,
        },
      };
    }
  );
}

/**
 * PRD §15 — the one restriction-aware return, plus the frozen Hold remainder.
 * Used by rejection and by pre-approval cancellation so the two can never drift.
 */
async function restorePlotAfterRelease(
  tx: Tx,
  booking: {
    plotId: string;
    holdId: string | null;
    plot: { restriction: PlotRestriction; restrictionReason: string | null };
  },
  actorRef: string,
  reason: string
) {
  const hold = booking.holdId
    ? await tx.hold.findUniqueOrThrow({ where: { id: booking.holdId } })
    : null;

  if (hold && hold.status === "FROZEN") {
    // PRD §10.5 — rejection restores exactly the remainder that was frozen.
    await tx.hold.update({
      where: { id: hold.id },
      data: {
        status: "ACTIVE",
        expiresAt: restoreHold(hold.frozenRemainingMs ?? 0),
        frozenRemainingMs: null,
        frozenAt: null,
      },
    });
    await tx.plot.update({ where: { id: booking.plotId }, data: { lifecycle: "HOLD" } });
    await tx.plotEvent.create({
      data: {
        plotId: booking.plotId,
        actorRef,
        action: "HOLD_REMAINDER_RESTORED",
        fromLifecycle: "WAITING_FOR_BOOKING_APPROVAL",
        toLifecycle: "HOLD",
        reason,
      },
    });
    return;
  }

  const next = plotReturnState(booking.plot.restriction, booking.plot.restrictionReason);
  await tx.plot.update({ where: { id: booking.plotId }, data: { lifecycle: next.lifecycle } });
  await tx.plotEvent.create({
    data: {
      plotId: booking.plotId,
      actorRef,
      action: "BOOKING_REQUEST_RELEASED",
      fromLifecycle: "WAITING_FOR_BOOKING_APPROVAL",
      toLifecycle: next.lifecycle,
      reason: next.message ? `${reason} — ${next.message}` : reason,
    },
  });
}

/* ------------------------------------------------------------ cancellation */

/**
 * PRD §9.2, §9.3 — one visible action, two backend paths. Before approval the
 * request simply closes and never enters Refund Pending; after approval a
 * formal cancellation starts and Accounts verifies the refund.
 */
export async function cancelBooking(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  reason: string;
  remark?: string | null;
}): Promise<BookingCancelResult> {
  if (!args.reason.trim()) blocked("A cancellation reason is required.");

  return runCommand<BookingCancelResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BOOKING_CANCEL",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, reason: args.reason },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: { include: { project: true } } },
      });

      const free = assertProcessFree(booking.activeProcess, "Cancel Booking");
      if (!free.ok) blocked(free.reason);

      /* ---- before Accounts approval: close the request only (PRD §9.2) ---- */
      if (booking.status === "REQUEST_PENDING") {
        await tx.bookingReviewVersion.updateMany({
          where: { bookingId: args.bookingId, status: "PENDING" },
          data: {
            status: "CANCELLED",
            decidedByRef: args.actorRef,
            decidedAt: new Date(),
            decisionNote: args.reason,
          },
        });
        await tx.paymentScheduleVersion.updateMany({
          where: { bookingId: args.bookingId, status: "PENDING" },
          data: { status: "REJECTED", decidedByRef: args.actorRef, decidedAt: new Date() },
        });
        await restorePlotAfterRelease(tx, booking, args.actorRef, `Booking Request cancelled — ${args.reason}`);
        await tx.booking.update({
          where: { id: args.bookingId },
          data: { status: "REQUEST_CANCELLED", closedAt: new Date(), closeReason: args.reason },
        });
        // The linked Enquiry stays Active (PRD §7.2).
        await closeTasksFor(tx, "Booking", args.bookingId, args.actorRef, "Request Cancelled", "BOOKING_REVIEW");
        await tx.bookingEvent.create({
          data: {
            bookingId: args.bookingId,
            actorRef: args.actorRef,
            action: "BOOKING_REQUEST_CANCELLED",
            fromStatus: "REQUEST_PENDING",
            toStatus: "REQUEST_CANCELLED",
            reason: args.reason,
          },
        });

        return {
          result: { bookingId: args.bookingId, status: "REQUEST_CANCELLED", refundPending: false },
          audit: {
            entity: "Booking",
            entityId: args.bookingId,
            action: "BOOKING_REQUEST_CANCELLED",
            reason: args.reason,
          },
        };
      }

      /* ---- after approval: formal cancellation and Refund Pending (§9.3) ---- */
      const move = canTransition(booking.status, "REFUND_PENDING");
      if (!move.ok) blocked(move.reason);

      // main-PRD §15.4 — a rejection must restore the exact previous state, so
      // it is captured now rather than reconstructed later from history.
      await tx.cancellationRequest.create({
        data: {
          bookingId: args.bookingId,
          reason: args.reason,
          remark: args.remark ?? null,
          restoreSnapshot: {
            bookingStatus: booking.status,
            plotLifecycle: booking.plot.lifecycle,
          },
          requestedByRef: args.actorRef,
        },
      });

      await tx.booking.update({
        where: { id: args.bookingId },
        data: {
          status: "REFUND_PENDING",
          activeProcess: "REFUND_PENDING",
          closeReason: args.reason,
        },
      });
      await tx.plot.update({ where: { id: booking.plotId }, data: { lifecycle: "REFUND_PENDING" } });
      await tx.plotEvent.create({
        data: {
          plotId: booking.plotId,
          actorRef: args.actorRef,
          action: "REFUND_PENDING",
          fromLifecycle: booking.plot.lifecycle,
          toLifecycle: "REFUND_PENDING",
          reason: args.reason,
        },
      });
      // Payment follow-up pauses while the cancellation is under review (PRD §15.3).
      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        `Paused — Refund Pending (${args.reason})`,
        "PAYMENT_FOLLOW_UP"
      );
      // PRD §15.3 — commission goes On Hold — Refund Pending while the
      // cancellation is under review. Slots are released only when Accounts
      // approves the cancellation, in Phase 5.
      await reassessCommission(tx, args.bookingId, args.actorRef);
      await ensureTask(tx, {
        recordKind: "Booking",
        recordId: args.bookingId,
        recordName: `${booking.bookingNumber} · ${booking.plot.project.name} ${booking.plot.plotNumber}`,
        purpose: "REFUND_REVIEW",
        title: "Accounts Verification — Refund",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult: args.remark ? `${args.reason} — ${args.remark}` : args.reason,
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "BOOKING_CANCELLATION_SUBMITTED",
          fromStatus: booking.status,
          toStatus: "REFUND_PENDING",
          reason: args.reason,
        },
      });

      return {
        result: { bookingId: args.bookingId, status: "REFUND_PENDING", refundPending: true },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "BOOKING_CANCELLATION_SUBMITTED",
          before: { status: booking.status },
          after: { status: "REFUND_PENDING" },
          reason: args.reason,
        },
      };
    }
  );
}

/* -------------------------------------------------------- ownership shares */

/**
 * PRD §12.2 — after approval and before Delivered, CRM may change shares with a
 * compulsory reason. Old and new both stay in History and no separate Admin
 * approval is required.
 */
export async function changeOwnershipShares(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  parties: BookingPartyInput[];
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to change ownership shares.");
  const primary = primaryOf(args.parties);
  const shares = validateShares(args.parties.map((p) => ({ personId: p.personId, sharePercent: p.sharePercent })));
  if (!shares.ok) blocked(shares.reason);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BOOKING_SHARES_CHANGE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, parties: args.parties },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: args.bookingId } });

      if (booking.status === "DELIVERED") {
        blocked("Ownership shares cannot be changed after Delivered. Use an exceptional audited correction.");
      }
      if (!["BOOKED", "PAYMENT_COMPLETED"].includes(booking.status)) {
        blocked("Ownership shares change applies to an approved Booking.");
      }
      const free = assertProcessFree(booking.activeProcess, "Change ownership shares");
      if (!free.ok) blocked(free.reason);
      if (primary.personId !== booking.primaryPersonId) {
        blocked("Use Change Primary Customer to replace the Primary Customer — it needs Accounts approval.");
      }

      const before = await currentParties(tx, args.bookingId);
      await tx.bookingParty.updateMany({
        where: { bookingId: args.bookingId, kind: "COMMERCIAL", effectiveTo: null },
        data: { effectiveTo: new Date(), changeReason: args.reason },
      });
      await tx.bookingParty.createMany({
        data: args.parties.map((p) => ({
          bookingId: args.bookingId,
          personId: p.personId,
          role: p.role,
          sharePercent: p.sharePercent ?? null,
          changeReason: args.reason,
          actorRef: args.actorRef,
        })),
      });
      for (const party of args.parties) await ensureCustomerProfile(tx, party.personId);

      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "OWNERSHIP_SHARES_CHANGED",
          detail: {
            before: before.map((p) => ({ personId: p.personId, share: p.sharePercent?.toFixed(4) ?? null })),
            after: args.parties.map((p) => ({ personId: p.personId, share: p.sharePercent ?? null })),
          },
          reason: args.reason,
        },
      });

      return {
        result: { bookingId: args.bookingId, parties: args.parties.length },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "OWNERSHIP_SHARES_CHANGED",
          before: { parties: before.map((p) => p.sharePercent?.toFixed(4) ?? null) },
          after: { parties: args.parties.map((p) => p.sharePercent ?? null) },
          reason: args.reason,
        },
      };
    }
  );
}

/* -------------------------------------------------- Primary Customer change */

/** PRD §12.3 — the old Customer stays official until Accounts approves. */
export async function requestPrimaryCustomerChange(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  toPersonId: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to change the Primary Customer.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PRIMARY_CUSTOMER_CHANGE_REQUEST",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, toPersonId: args.toPersonId },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: { include: { project: true } } },
      });
      if (!["BOOKED", "PAYMENT_COMPLETED"].includes(booking.status)) {
        blocked("Change Primary Customer applies to an approved Booking.");
      }
      const free = assertProcessFree(booking.activeProcess, "Change Primary Customer");
      if (!free.ok) blocked(free.reason);
      if (args.toPersonId === booking.primaryPersonId) {
        blocked("The proposed Customer is already the Primary Customer.");
      }
      await ensureCustomerProfile(tx, args.toPersonId);

      const request = await tx.primaryCustomerChange.create({
        data: {
          bookingId: args.bookingId,
          fromPersonId: booking.primaryPersonId,
          toPersonId: args.toPersonId,
          reason: args.reason,
          requestedByRef: args.actorRef,
        },
      });
      await tx.booking.update({
        where: { id: args.bookingId },
        data: { activeProcess: "PRIMARY_CUSTOMER_CHANGE_UNDER_REVIEW" },
      });
      await ensureTask(tx, {
        recordKind: "Booking",
        recordId: args.bookingId,
        recordName: `${booking.bookingNumber} · ${booking.plot.project.name} ${booking.plot.plotNumber}`,
        purpose: "PRIMARY_CUSTOMER_CHANGE_REVIEW",
        title: "Accounts Verification — Primary Customer Change",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult: args.reason,
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "PRIMARY_CUSTOMER_CHANGE_REQUESTED",
          detail: { fromPersonId: booking.primaryPersonId, toPersonId: args.toPersonId },
          reason: args.reason,
        },
      });

      return {
        result: { requestId: request.id },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "PRIMARY_CUSTOMER_CHANGE_REQUESTED",
          before: { primaryPersonId: booking.primaryPersonId },
          after: { primaryPersonId: args.toPersonId },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * PRD §12.3 — on approval the new Customer becomes official. The Booking
 * Number, Plot, Payment Received percentage and Payment Reference Numbers all
 * carry forward unchanged.
 */
export async function decidePrimaryCustomerChange(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  approve: boolean;
  note: string;
}) {
  if (!args.note.trim()) blocked("A compulsory remark is required on the Accounts decision.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PRIMARY_CUSTOMER_CHANGE_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, approve: args.approve },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const request = await tx.primaryCustomerChange.findFirst({
        where: { bookingId: args.bookingId, status: "PENDING" },
      });
      if (!request) blocked("There is no Primary Customer change waiting for a decision.");
      if (request.requestedByRef === args.actorRef) {
        blocked("A Primary Customer change must be approved by a different staff account (PRD §3.3).");
      }

      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };
      await tx.primaryCustomerChange.update({
        where: { id: request.id },
        data: { status: args.approve ? "APPROVED" : "REJECTED", ...decision },
      });

      if (args.approve) {
        // The old Primary row is closed and the new one opens; shares stay at
        // 100% because the replacement inherits the outgoing buyer's share.
        const outgoing = await tx.bookingParty.findFirstOrThrow({
          where: {
            bookingId: args.bookingId,
            personId: request.fromPersonId,
            kind: "COMMERCIAL",
            effectiveTo: null,
          },
        });
        await tx.bookingParty.update({
          where: { id: outgoing.id },
          data: { effectiveTo: new Date(), changeReason: request.reason },
        });
        await tx.bookingParty.create({
          data: {
            bookingId: args.bookingId,
            personId: request.toPersonId,
            role: outgoing.role,
            kind: "COMMERCIAL",
            sharePercent: outgoing.sharePercent,
            changeReason: request.reason,
            actorRef: args.actorRef,
          },
        });
        await tx.booking.update({
          where: { id: args.bookingId },
          data: { primaryPersonId: request.toPersonId, activeProcess: "NONE" },
        });
      } else {
        await tx.booking.update({ where: { id: args.bookingId }, data: { activeProcess: "NONE" } });
      }

      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        args.approve ? `Approved — ${args.note}` : `Rejected — ${args.note}`,
        "PRIMARY_CUSTOMER_CHANGE_REVIEW"
      );
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: args.approve ? "PRIMARY_CUSTOMER_CHANGED" : "PRIMARY_CUSTOMER_CHANGE_REJECTED",
          detail: { fromPersonId: request.fromPersonId, toPersonId: request.toPersonId },
          reason: args.note,
        },
      });

      return {
        result: { requestId: request.id, status: args.approve ? "APPROVED" : "REJECTED" },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: args.approve ? "PRIMARY_CUSTOMER_CHANGED" : "PRIMARY_CUSTOMER_CHANGE_REJECTED",
          after: { primaryPersonId: args.approve ? request.toPersonId : request.fromPersonId },
          reason: args.note,
        },
      };
    }
  );
}


/* ------------------------------------------------------- Sold By correction */

/**
 * PRD §6.10 — after Booking approval, CRM or Admin raises a Sold By Correction
 * with a compulsory reason and supporting remark. Nothing changes yet: the
 * attribution correction itself needs Admin or MD approval, and Accounts then
 * reviews the commission impact. Booking and Payment history are never touched.
 */
export async function requestSoldByCorrection(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  toSoldByType: SoldByType;
  toSoldByPersonId?: string | null;
  reason: string;
  supportingNote: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required for a Sold By Correction.");
  if (!args.supportingNote.trim()) {
    blocked("A compulsory supporting remark is required for a Sold By Correction (PRD §6.10).");
  }

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "SOLD_BY_CORRECTION_REQUEST",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: {
        bookingId: args.bookingId,
        toSoldByType: args.toSoldByType,
        toSoldByPersonId: args.toSoldByPersonId ?? null,
      },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: { include: { project: true } } },
      });

      if (!["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"].includes(booking.status)) {
        blocked("Sold By Correction applies to an approved Booking (PRD §6.10).");
      }
      const free = assertProcessFree(booking.activeProcess, "Sold By Correction");
      if (!free.ok) blocked(free.reason);

      const unchanged =
        booking.soldByType === args.toSoldByType &&
        (booking.soldByPersonId ?? null) === (args.toSoldByPersonId ?? null);
      if (unchanged) blocked("The proposed attribution is the same as the current one.");

      // The same closer rules the Booking itself enforces (PRD §6.7, §11.3).
      await validateSoldBy(tx, args.toSoldByType, args.toSoldByPersonId ?? null);

      const correction = await tx.soldByCorrection.create({
        data: {
          bookingId: args.bookingId,
          fromSoldByType: booking.soldByType,
          fromSoldByPersonId: booking.soldByPersonId,
          toSoldByType: args.toSoldByType,
          toSoldByPersonId: args.toSoldByPersonId ?? null,
          reason: args.reason,
          supportingNote: args.supportingNote,
          requestedByRef: args.actorRef,
        },
      });
      await tx.booking.update({
        where: { id: args.bookingId },
        data: { activeProcess: "SOLD_BY_CORRECTION_UNDER_REVIEW" },
      });

      await ensureTask(tx, {
        recordKind: "Booking",
        recordId: args.bookingId,
        recordName: `${booking.bookingNumber} · ${booking.plot.project.name} ${booking.plot.plotNumber}`,
        purpose: "SOLD_BY_CORRECTION_REVIEW",
        title: "Sold By Correction — Admin/MD approval",
        assigneeRole: "ADMIN",
        dueAt: new Date(),
        decision: true,
        latestResult: `${args.reason} — ${args.supportingNote}`,
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "SOLD_BY_CORRECTION_REQUESTED",
          detail: {
            from: { type: booking.soldByType, personId: booking.soldByPersonId },
            to: { type: args.toSoldByType, personId: args.toSoldByPersonId ?? null },
          },
          reason: args.reason,
        },
      });

      return {
        result: { correctionId: correction.id },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "SOLD_BY_CORRECTION_REQUESTED",
          before: { soldByType: booking.soldByType, soldByPersonId: booking.soldByPersonId },
          after: { soldByType: args.toSoldByType, soldByPersonId: args.toSoldByPersonId ?? null },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * PRD §6.10 — Admin or MD approves the attribution correction. On approval the
 * old current commission records are superseded, new valid records are created,
 * and anything already Paid or Paid Early becomes Accounts Adjustment Required.
 * Accounts then reviews the impact, which is what the task that follows is for.
 */
export async function decideSoldByCorrection(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bookingId: string;
  approve: boolean;
  note: string;
}): Promise<SoldByDecisionResult> {
  if (!args.note.trim()) blocked("A compulsory remark is required on the decision.");
  if (args.actorRole !== "ADMIN" && args.actorRole !== "MD") {
    blocked("Only Admin or MD may approve a Sold By Correction (PRD §6.10).");
  }

  return runCommand<SoldByDecisionResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "SOLD_BY_CORRECTION_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bookingId: args.bookingId, approve: args.approve },
    },
    async (tx) => {
      await lockBooking(tx, args.bookingId);
      const correction = await tx.soldByCorrection.findFirst({
        where: { bookingId: args.bookingId, status: "PENDING" },
      });
      if (!correction) blocked("There is no Sold By Correction waiting for a decision.");
      if (correction.requestedByRef === args.actorRef) {
        blocked("A Sold By Correction must be approved by a different staff account (PRD §3.3).");
      }

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: args.bookingId },
        include: { plot: { include: { project: true } } },
      });
      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };

      await tx.soldByCorrection.update({
        where: { id: correction.id },
        data: { status: args.approve ? "APPROVED" : "REJECTED", ...decision },
      });
      await closeTasksFor(
        tx,
        "Booking",
        args.bookingId,
        args.actorRef,
        args.approve ? `Approved — ${args.note}` : `Rejected — ${args.note}`,
        "SOLD_BY_CORRECTION_REVIEW"
      );

      if (!args.approve) {
        await tx.booking.update({
          where: { id: args.bookingId },
          data: { activeProcess: "NONE" },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId: args.bookingId,
            actorRef: args.actorRef,
            action: "SOLD_BY_CORRECTION_REJECTED",
            reason: args.note,
          },
        });
        return {
          result: { correctionId: correction.id, status: "REJECTED" },
          audit: {
            entity: "Booking",
            entityId: args.bookingId,
            action: "SOLD_BY_CORRECTION_REJECTED",
            reason: args.note,
          },
        };
      }

      // Booking and Payment history stay exactly as they are; only the
      // attribution moves, and the commission engine follows it.
      await tx.booking.update({
        where: { id: args.bookingId },
        data: {
          soldByType: correction.toSoldByType,
          soldByPersonId: correction.toSoldByPersonId,
          activeProcess: "NONE",
        },
      });

      const regenerated = await generateForBooking(tx, args.bookingId, args.actorRef);
      await reassessCommission(tx, args.bookingId, args.actorRef);

      // PRD §6.10 step 4 — Accounts reviews the commission impact.
      await ensureTask(tx, {
        recordKind: "Booking",
        recordId: args.bookingId,
        recordName: `${booking.bookingNumber} · ${booking.plot.project.name} ${booking.plot.plotNumber}`,
        purpose: "SOLD_BY_COMMISSION_IMPACT",
        title: "Accounts Verification — Commission after Sold By Correction",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult: regenerated.conflict ?? `${regenerated.generated} current record(s) after the correction.`,
      });

      await tx.bookingEvent.create({
        data: {
          bookingId: args.bookingId,
          actorRef: args.actorRef,
          action: "SOLD_BY_CORRECTED",
          detail: {
            from: { type: correction.fromSoldByType, personId: correction.fromSoldByPersonId },
            to: { type: correction.toSoldByType, personId: correction.toSoldByPersonId },
          },
          reason: args.note,
        },
      });

      return {
        result: { correctionId: correction.id, status: "APPROVED" },
        audit: {
          entity: "Booking",
          entityId: args.bookingId,
          action: "SOLD_BY_CORRECTED",
          before: { soldByType: correction.fromSoldByType, soldByPersonId: correction.fromSoldByPersonId },
          after: { soldByType: correction.toSoldByType, soldByPersonId: correction.toSoldByPersonId },
          reason: args.note,
        },
      };
    }
  );
}

/* -------------------------------------------------------------- read model */

export function listBookings() {
  return db.booking.findMany({
    include: {
      project: true,
      plot: true,
      primaryPerson: true,
      soldByPerson: true,
      reviewVersions: { where: { status: "PENDING" }, take: 1 },
    },
    orderBy: { submittedAt: "desc" },
    take: 200,
  });
}

export function getBooking(bookingId: string) {
  return db.booking.findUnique({
    where: { id: bookingId },
    include: {
      project: true,
      plot: true,
      primaryPerson: true,
      soldByPerson: true,
      // PLC spec §15.3 — the frozen total, its breakdown and its version, plus
      // enough to tell a corrected snapshot from an original one.
      plcSnapshot: { include: { ruleVersion: true, supersedes: { select: { id: true } } } },
      parties: { include: { person: true }, orderBy: { effectiveFrom: "asc" } },
      reviewVersions: { orderBy: { version: "desc" } },
      scheduleVersions: { include: { instalments: { orderBy: { seq: "asc" } } }, orderBy: { version: "desc" } },
      paymentEntries: { include: { externalReference: true }, orderBy: { recordedAt: "desc" } },
      customerChanges: { orderBy: { requestedAt: "desc" } },
      soldByCorrections: { orderBy: { requestedAt: "desc" } },
      // Reopened completions stay in the list: they are the Delivered history
      // (PRD §4.4).
      completions: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { at: "desc" } },
    },
  });
}
