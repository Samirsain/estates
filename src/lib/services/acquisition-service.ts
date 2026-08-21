// Buyback, Purchase for Resale and Payment Given — PRD §11; main-PRD §17.
//
// The acquisition side mirrors the sale side's protected mechanics (PRD §11.2)
// but stays a separate dataset throughout: Payment Given entries never mix with
// Payment Received, and no rupee value is stored anywhere here.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  acquisitionDuplicateKey,
  buyingCommissionMilestoneReached,
  canApproveAcquisition,
  cancelAcquisition,
  likelyDuplicateReasons,
  plotStateAfterAcquisitionApproval,
  plotStateAfterAcquisitionCancelled,
  resolvePaymentGivenCorrection,
  validateBuyingCommission,
  type DuplicateCandidate,
} from "@/lib/domain/acquisition";
import {
  allocatePayment,
  canTransition,
  notFutureDated,
  progressAfter,
  validateSchedule,
} from "@/lib/domain/booking";
import { blocked, lockKey, lockPlot, nextReference, runCommand, type Tx } from "./command";
import {
  applyAllocation,
  createReference,
  createScheduleVersion,
  toLines,
  type ScheduleInput,
} from "./payment-service";
import { cancelCommissionForBooking, reassessCommission } from "./commission-service";
import { closeTasksFor, ensureTask } from "./task-service";

const D = Prisma.Decimal;

/* ------------------------------------------------------------- helpers */

async function activeGivenSchedule(tx: Tx, acquisitionId: string) {
  return tx.paymentScheduleVersion.findFirst({
    where: { acquisitionId, status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
}

/**
 * PRD §11.4 — an acquisition cannot be unwound while a new buyer already holds
 * or has booked the property.
 */
async function hasBuyerProcess(tx: Tx, plotId: string | null): Promise<boolean> {
  if (!plotId) return false;
  const [holds, bookings] = await Promise.all([
    tx.hold.count({ where: { plotId, status: "ACTIVE" } }),
    tx.booking.count({
      where: {
        plotId,
        status: { in: ["REQUEST_PENDING", "BOOKED", "PAYMENT_COMPLETED", "REFUND_PENDING", "DELIVERED"] },
      },
    }),
  ]);
  return holds + bookings > 0;
}

async function acquisitionLabel(tx: Tx, acquisitionId: string): Promise<string> {
  const acquisition = await tx.acquisition.findUniqueOrThrow({
    where: { id: acquisitionId },
    include: { plot: { include: { project: true } } },
  });
  if (acquisition.plot) {
    return `${acquisition.acquisitionNo} · ${acquisition.plot.project.name} ${acquisition.plot.plotNumber}`;
  }
  return `${acquisition.acquisitionNo} · ${acquisition.propertyName} ${acquisition.propertyNumber}`;
}

/* ------------------------------------------------------------ create */

export type AcquisitionCreateResult = {
  acquisitionId: string;
  acquisitionNo: string;
  /** PRD §11.5 — soft matches the operator was warned about. */
  duplicateWarnings: string[];
};

/**
 * main-PRD §17.1 — a Buyback names the Booking it takes back; a Purchase for
 * Resale names the outside property instead. Both carry a Payment Given
 * schedule from the start, because approval needs 20% confirmed against it.
 */
export async function createAcquisition(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  type: "BUYBACK" | "PURCHASE_FOR_RESALE";
  /** Buyback: the Booking being taken back. */
  sourceBookingId?: string | null;
  sellerPersonId: string;
  arrangedByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  arrangedByPersonId?: string | null;
  purchaseDate: Date;
  remark: string;
  schedule: ScheduleInput[];
  /** Purchase for Resale only. */
  property?: {
    propertyName: string;
    location: string;
    propertyNumber: string;
    projectType?: "RESIDENTIAL" | "COMMERCIAL" | "MIXED" | null;
    areaSqFt?: string | null;
    plcPercent?: string | null;
    resaleGroupId?: string | null;
  } | null;
  /** PRD §11.5 — proceed despite a soft duplicate warning. */
  acknowledgeDuplicate?: boolean;
}): Promise<AcquisitionCreateResult> {
  if (!args.remark.trim()) blocked("A compulsory remark is required on an acquisition.");

  const dated = notFutureDated("Purchase Date", args.purchaseDate);
  if (!dated.ok) blocked(dated.reason);

  const scheduleCheck = validateSchedule(
    args.schedule.map((line) => ({
      seq: line.seq,
      scheduledPercent: line.percent,
      dueDate: line.dueDate,
    })),
    args.purchaseDate
  );
  if (!scheduleCheck.ok) blocked(scheduleCheck.reason);

  if (args.arrangedByType === "THREE_PERCENT_CLUB" && args.arrangedByPersonId) {
    blocked("A 3% Club acquisition names no arranging Person.");
  }
  if (args.arrangedByType !== "THREE_PERCENT_CLUB" && !args.arrangedByPersonId) {
    blocked("Select the Member or Customer who arranged this acquisition.");
  }
  if (args.arrangedByPersonId === args.sellerPersonId) {
    blocked(
      "The seller cannot also be the arranger — that is the Buying Commission conflict in PRD §11.7."
    );
  }

  return runCommand<AcquisitionCreateResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ACQUISITION_CREATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: {
        type: args.type,
        sourceBookingId: args.sourceBookingId ?? null,
        sellerPersonId: args.sellerPersonId,
        property: args.property ?? null,
      },
    },
    async (tx) => {
      let plotId: string | null = null;
      let duplicateKey: string | null = null;
      const duplicateWarnings: string[] = [];

      if (args.type === "BUYBACK") {
        if (!args.sourceBookingId) blocked("A Buyback names the Booking it takes back.");

        const booking = await tx.booking.findUniqueOrThrow({
          where: { id: args.sourceBookingId },
          include: { parties: { where: { effectiveTo: null } } },
        });
        // ARCHITECTURE §6.3 — one major conflicting process per Booking.
        if (booking.activeProcess !== "NONE") {
          blocked(
            `This Booking is already under ${booking.activeProcess.replaceAll("_", " ").toLowerCase()}.`
          );
        }
        if (!["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"].includes(booking.status)) {
          blocked("A Buyback applies to an approved Booking.");
        }

        await lockPlot(tx, booking.plotId);
        plotId = booking.plotId;

        // PRD §11.5 — one active acquisition per Plot.
        const existing = await tx.acquisition.findFirst({
          where: { plotId, status: { in: ["PENDING_APPROVAL", "APPROVED"] } },
        });
        if (existing) {
          blocked(`This Plot already has an active acquisition (${existing.acquisitionNo}).`);
        }

        // main-PRD §17.9 on submission — the Plot is blocked, Buyback Under
        // Process is visible, and unpaid old-sale commission goes on hold. The
        // hold itself is derived from activeProcess by the commission rules.
        await tx.booking.update({
          where: { id: booking.id },
          data: { activeProcess: "BUYBACK_PENDING" },
        });
        await reassessCommission(tx, booking.id, args.actorRef);
        await tx.plotEvent.create({
          data: {
            plotId: booking.plotId,
            actorRef: args.actorRef,
            action: "BUYBACK_UNDER_PROCESS",
            reason: args.remark,
          },
        });
      } else {
        if (!args.property) blocked("A Purchase for Resale needs the outside property details.");

        duplicateKey = acquisitionDuplicateKey({
          propertyName: args.property.propertyName,
          location: args.property.location,
          propertyNumber: args.property.propertyNumber,
        });

        // The unique index blocks an exact active duplicate; this is the softer
        // warning the operator may acknowledge (PRD §11.5).
        const candidates = await tx.acquisition.findMany({
          where: {
            type: "PURCHASE_FOR_RESALE",
            status: { in: ["PENDING_APPROVAL", "APPROVED"] },
          },
        });
        const candidate: DuplicateCandidate = {
          propertyName: args.property.propertyName,
          location: args.property.location,
          propertyNumber: args.property.propertyNumber,
          sellerPersonId: args.sellerPersonId,
          areaSqFt: args.property.areaSqFt ?? null,
        };
        for (const existing of candidates) {
          if (existing.duplicateKey === duplicateKey) {
            blocked(
              `An active acquisition already exists for this property (${existing.acquisitionNo}).`
            );
          }
          const reasons = likelyDuplicateReasons(candidate, {
            propertyName: existing.propertyName ?? "",
            location: existing.location ?? "",
            propertyNumber: existing.propertyNumber ?? "",
            sellerPersonId: existing.sellerPersonId,
            areaSqFt: existing.areaSqFt?.toString() ?? null,
          });
          if (reasons.length >= 2) {
            duplicateWarnings.push(`${existing.acquisitionNo}: ${reasons.join(", ")}`);
          }
        }
        if (duplicateWarnings.length > 0 && !args.acknowledgeDuplicate) {
          blocked(
            `This looks like an existing acquisition — ${duplicateWarnings.join("; ")}. ` +
              `Confirm it is genuinely different to continue.`
          );
        }
      }

      const acquisitionNo = await nextReference(tx, "ACQ", "Acquisition");
      const acquisition = await tx.acquisition.create({
        data: {
          acquisitionNo,
          type: args.type,
          status: "PENDING_APPROVAL",
          plotId,
          sourceBookingId: args.type === "BUYBACK" ? args.sourceBookingId! : null,
          sellerPersonId: args.sellerPersonId,
          arrangedByType: args.arrangedByType,
          arrangedByPersonId: args.arrangedByPersonId ?? null,
          propertyName: args.property?.propertyName ?? null,
          location: args.property?.location ?? null,
          projectType: args.property?.projectType ?? null,
          propertyNumber: args.property?.propertyNumber ?? null,
          areaSqFt: args.property?.areaSqFt ?? null,
          plcPercent: args.property?.plcPercent ?? null,
          duplicateKey,
          resaleGroupId: args.property?.resaleGroupId ?? null,
          purchaseDate: args.purchaseDate,
          remark: args.remark,
          submittedByRef: args.actorRef,
        },
      });

      await createScheduleVersion(tx, {
        acquisitionId: acquisition.id,
        lines: args.schedule,
        bookingDate: args.purchaseDate,
        status: "ACTIVE",
        createdByRef: args.actorRef,
      });

      await tx.acquisitionEvent.create({
        data: {
          acquisitionId: acquisition.id,
          actorRef: args.actorRef,
          action: "ACQUISITION_CREATED",
          toStatus: "PENDING_APPROVAL",
          detail: { type: args.type, duplicateWarnings },
          reason: args.remark,
        },
      });

      // Accounts decides it once 20% Payment Given is confirmed (PRD §11.3).
      await ensureTask(tx, {
        recordKind: "Acquisition",
        recordId: acquisition.id,
        recordName: acquisitionNo,
        purpose: "ACQUISITION_REVIEW",
        title: "Acquisition approval",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult: "Waiting for at least 20% Payment Given.",
      });

      return {
        result: { acquisitionId: acquisition.id, acquisitionNo, duplicateWarnings },
        audit: {
          entity: "Acquisition",
          entityId: acquisition.id,
          action: "ACQUISITION_CREATED",
          after: { acquisitionNo, type: args.type, plotId },
          reason: args.remark,
        },
      };
    }
  );
}

/* ------------------------------------------------------ payment given */

/**
 * PRD §11.2 — Confirm Payment Given. Incremental, oldest unpaid instalment
 * first, never above 100%, and its reference is globally unique across both
 * payment datasets.
 */
export async function confirmPaymentGiven(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  acquisitionId: string;
  percent: string;
  paidOn: Date;
  reference: string;
  remark?: string;
}) {
  const dated = notFutureDated("Payment Given Date", args.paidOn);
  if (!dated.ok) blocked(dated.reason);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_GIVEN_CONFIRM",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { acquisitionId: args.acquisitionId, percent: args.percent, reference: args.reference },
    },
    async (tx) => {
      await lockKey(tx, `acquisition:${args.acquisitionId}`);
      const acquisition = await tx.acquisition.findUniqueOrThrow({
        where: { id: args.acquisitionId },
      });
      if (!["PENDING_APPROVAL", "APPROVED"].includes(acquisition.status)) {
        blocked(`This acquisition is ${acquisition.status.replaceAll("_", " ").toLowerCase()}.`);
      }

      const schedule = await activeGivenSchedule(tx, args.acquisitionId);
      if (!schedule) blocked("This acquisition has no live Payment Given schedule.");

      let allocations;
      let progress;
      try {
        allocations = allocatePayment(toLines(schedule.instalments), args.percent).allocations;
        progress = progressAfter(acquisition.paymentGivenPercent.toString(), args.percent);
      } catch (error) {
        blocked(error instanceof Error ? error.message : "Payment could not be allocated.");
      }

      const reference = await createReference(tx, {
        rawValue: args.reference,
        purpose: "PAYMENT_GIVEN",
        actionDate: args.paidOn,
        actorRef: args.actorRef,
      });

      const entry = await tx.paymentGivenEntry.create({
        data: {
          acquisitionId: args.acquisitionId,
          percent: new D(args.percent).toFixed(4),
          paidOn: args.paidOn,
          externalReferenceId: reference.id,
          allocations: allocations as never,
          confirmedByRef: args.actorRef,
          remark: args.remark ?? null,
        },
      });

      await applyAllocation(tx, schedule.id, allocations, 1);
      await tx.acquisition.update({
        where: { id: args.acquisitionId },
        data: { paymentGivenPercent: progress.toFixed(4) },
      });

      // PRD §11.7 — the Buying Commission milestone is 100% Payment Given.
      if (buyingCommissionMilestoneReached(progress)) {
        await settleBuyingCommission(tx, args.acquisitionId, args.actorRef);
      }
      await syncGivenFollowUp(tx, args.acquisitionId, args.actorRef);

      await tx.acquisitionEvent.create({
        data: {
          acquisitionId: args.acquisitionId,
          actorRef: args.actorRef,
          action: "PAYMENT_GIVEN",
          detail: { percent: args.percent, progress: progress.toFixed(4), reference: reference.rawValue },
        },
      });

      return {
        result: {
          entryId: entry.id,
          progressPercent: progress.toFixed(4),
          approvalThresholdMet: canApproveAcquisition(progress).ok,
        },
        audit: {
          entity: "Acquisition",
          entityId: args.acquisitionId,
          action: "PAYMENT_GIVEN_CONFIRMED",
          before: { progress: acquisition.paymentGivenPercent.toFixed(4) },
          after: { progress: progress.toFixed(4), reference: reference.rawValue },
          reason: args.remark,
        },
      };
    }
  );
}

/**
 * PRD §11.3, §24 — the original entry is never deleted. The correction
 * supersedes it, links the replacement, and the domain decides what the new
 * total releases or withholds.
 */
export async function correctPaymentGiven(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  entryId: string;
  percent: string;
  paidOn: Date;
  reference: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to correct a Payment Given entry.");

  const dated = notFutureDated("Payment Given Date", args.paidOn);
  if (!dated.ok) blocked(dated.reason);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PAYMENT_GIVEN_CORRECT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { entryId: args.entryId, percent: args.percent, reference: args.reference },
    },
    async (tx) => {
      const original = await tx.paymentGivenEntry.findUniqueOrThrow({
        where: { id: args.entryId },
        include: { externalReference: true },
      });
      if (original.status !== "CONFIRMED") blocked("This entry has already been superseded.");
      // PRD §11.2 — maker and checker must differ on a money correction.
      if (original.confirmedByRef === args.actorRef) {
        blocked("A Payment Given correction must be made by a different staff account.");
      }

      await lockKey(tx, `acquisition:${original.acquisitionId}`);
      const acquisition = await tx.acquisition.findUniqueOrThrow({
        where: { id: original.acquisitionId },
        include: { plot: true },
      });

      const schedule = await activeGivenSchedule(tx, original.acquisitionId);
      if (!schedule) blocked("This acquisition has no live Payment Given schedule.");

      // Reverse the original, then apply the replacement.
      const originalAllocations = original.allocations as unknown as Array<{ seq: number; percent: string }>;
      await applyAllocation(tx, schedule.id, originalAllocations, -1);

      const reversed = new D(acquisition.paymentGivenPercent).sub(original.percent);
      let allocations;
      let progress;
      try {
        const refreshed = await activeGivenSchedule(tx, original.acquisitionId);
        allocations = allocatePayment(toLines(refreshed!.instalments), args.percent).allocations;
        progress = progressAfter(reversed.toString(), args.percent);
      } catch (error) {
        blocked(error instanceof Error ? error.message : "The correction could not be allocated.");
      }

      await tx.externalReference.update({
        where: { id: original.externalReferenceId },
        data: { status: "SUPERSEDED", reason: args.reason },
      });
      const replacement = await createReference(tx, {
        rawValue: args.reference,
        purpose: "PAYMENT_GIVEN",
        actionDate: args.paidOn,
        actorRef: args.actorRef,
        replacesId: original.externalReferenceId,
        reason: args.reason,
      });

      await tx.paymentGivenEntry.update({
        where: { id: original.id },
        data: { status: "SUPERSEDED", reason: args.reason },
      });
      const entry = await tx.paymentGivenEntry.create({
        data: {
          acquisitionId: original.acquisitionId,
          percent: new D(args.percent).toFixed(4),
          paidOn: args.paidOn,
          externalReferenceId: replacement.id,
          allocations: allocations as never,
          confirmedByRef: args.actorRef,
          correctsEntryId: original.id,
          reason: args.reason,
        },
      });

      await applyAllocation(tx, schedule.id, allocations, 1);

      const buyerProcess = await hasBuyerProcess(tx, acquisition.plotId);
      const outcome = resolvePaymentGivenCorrection({
        previousPercent: acquisition.paymentGivenPercent.toString(),
        newPercent: progress.toString(),
        hasBuyerProcess: buyerProcess,
      });

      await tx.acquisition.update({
        where: { id: acquisition.id },
        data: { paymentGivenPercent: progress.toFixed(4) },
      });

      // The Plot moves only where the domain says it may (PRD §11.3).
      if (acquisition.status === "APPROVED" && acquisition.plotId && outcome.plotLifecycle) {
        await tx.plot.update({
          where: { id: acquisition.plotId },
          data: { lifecycle: outcome.plotLifecycle },
        });
        await tx.plotEvent.create({
          data: {
            plotId: acquisition.plotId,
            actorRef: args.actorRef,
            action: "PAYMENT_GIVEN_CORRECTED",
            toLifecycle: outcome.plotLifecycle,
            reason: outcome.note,
          },
        });
      }

      if (outcome.buyingCommissionMilestoneLost) {
        await stepBackBuyingCommission(tx, acquisition.id, args.actorRef, outcome.note);
      }

      if (outcome.managementActionRequired) {
        await ensureTask(tx, {
          recordKind: "Acquisition",
          recordId: acquisition.id,
          recordName: await acquisitionLabel(tx, acquisition.id),
          purpose: "MANAGEMENT_ACTION_REQUIRED",
          title: "Management Action Required",
          assigneeRole: "MD",
          dueAt: new Date(),
          urgent: true,
          latestResult: outcome.note,
        });
      }

      await syncGivenFollowUp(tx, acquisition.id, args.actorRef);
      await tx.acquisitionEvent.create({
        data: {
          acquisitionId: acquisition.id,
          actorRef: args.actorRef,
          action: "PAYMENT_GIVEN_CORRECTED",
          detail: {
            supersededEntryId: original.id,
            replacementEntryId: entry.id,
            progress: progress.toFixed(4),
          },
          reason: args.reason,
        },
      });

      return {
        result: {
          entryId: entry.id,
          progressPercent: progress.toFixed(4),
          managementActionRequired: outcome.managementActionRequired,
          note: outcome.note,
        },
        audit: {
          entity: "Acquisition",
          entityId: acquisition.id,
          action: "PAYMENT_GIVEN_CORRECTED",
          before: { progress: acquisition.paymentGivenPercent.toFixed(4) },
          after: { progress: progress.toFixed(4), note: outcome.note },
          reason: args.reason,
        },
      };
    }
  );
}

/** PRD §18 — one rolling Payment Given follow-up, mirroring the sale side. */
export async function syncGivenFollowUp(tx: Tx, acquisitionId: string, actorRef: string) {
  const schedule = await activeGivenSchedule(tx, acquisitionId);
  const unpaid = (schedule?.instalments ?? []).filter((i) => i.receivedPercent.lt(i.scheduledPercent));

  if (unpaid.length === 0) {
    await closeTasksFor(
      tx,
      "Acquisition",
      acquisitionId,
      actorRef,
      "Payment Given reached 100%.",
      "PAYMENT_GIVEN_FOLLOW_UP"
    );
    return null;
  }

  const next = unpaid[0];
  return ensureTask(tx, {
    recordKind: "Acquisition",
    recordId: acquisitionId,
    recordName: await acquisitionLabel(tx, acquisitionId),
    purpose: "PAYMENT_GIVEN_FOLLOW_UP",
    title: "Payment Given Follow-up",
    assigneeRole: "ACCOUNTS",
    dueAt: next.dueDate,
    latestResult: `Instalment ${next.seq}: ${next.scheduledPercent
      .sub(next.receivedPercent)
      .toFixed(2)}% still due`,
  });
}

/* ---------------------------------------------------------- decision */

/**
 * PRD §11.3 — Accounts approves only at 20% Payment Given or above. On approval
 * a Purchase for Resale enters normal inventory as Available + RESALE, and a
 * Buyback returns its Plot through the one restriction-aware rule.
 */
export type AcquisitionDecisionResult = {
  acquisitionId: string;
  status: "APPROVED" | "REJECTED";
  plotId?: string | null;
  plotMessage?: string | null;
};

export async function decideAcquisition(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  acquisitionId: string;
  approve: boolean;
  note: string;
}) {
  if (!args.note.trim()) blocked("A compulsory remark is required on the Accounts decision.");

  return runCommand<AcquisitionDecisionResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ACQUISITION_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { acquisitionId: args.acquisitionId, approve: args.approve },
    },
    async (tx) => {
      await lockKey(tx, `acquisition:${args.acquisitionId}`);
      const acquisition = await tx.acquisition.findUniqueOrThrow({
        where: { id: args.acquisitionId },
        include: { plot: true, sourceBooking: true },
      });
      if (acquisition.status !== "PENDING_APPROVAL") {
        blocked(`This acquisition is ${acquisition.status.replaceAll("_", " ").toLowerCase()}.`);
      }
      // PRD §3.3 — the account that raised it may not decide it.
      if (acquisition.submittedByRef === args.actorRef) {
        blocked("An acquisition must be decided by a different staff account (PRD §3.3).");
      }

      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };

      if (!args.approve) {
        await tx.acquisition.update({
          where: { id: acquisition.id },
          data: { status: "REJECTED", ...decision },
        });
        if (acquisition.sourceBookingId) {
          await tx.booking.update({
            where: { id: acquisition.sourceBookingId },
            data: { activeProcess: "NONE" },
          });
        }
        await closeTasksFor(
          tx,
          "Acquisition",
          acquisition.id,
          args.actorRef,
          `Rejected — ${args.note}`,
          "ACQUISITION_REVIEW"
        );
        await tx.acquisitionEvent.create({
          data: {
            acquisitionId: acquisition.id,
            actorRef: args.actorRef,
            action: "ACQUISITION_REJECTED",
            fromStatus: "PENDING_APPROVAL",
            toStatus: "REJECTED",
            reason: args.note,
          },
        });

        return {
          result: { acquisitionId: acquisition.id, status: "REJECTED" as const },
          audit: {
            entity: "Acquisition",
            entityId: acquisition.id,
            action: "ACQUISITION_REJECTED",
            reason: args.note,
          },
        };
      }

      const threshold = canApproveAcquisition(acquisition.paymentGivenPercent.toString());
      if (!threshold.ok) blocked(threshold.reason);

      let plotId = acquisition.plotId;

      // main-PRD §17.4 — an external property enters inventory on approval.
      if (!plotId && acquisition.type === "PURCHASE_FOR_RESALE") {
        if (!acquisition.resaleGroupId) {
          blocked(
            "Select the External Resale Property Group this property belongs to before approving " +
              "(PRD §11.6)."
          );
        }
        const created = await tx.plot.create({
          data: {
            projectId: acquisition.resaleGroupId,
            plotType: "INFORMAL_SECTOR",
            plotNumber: acquisition.propertyNumber!,
            areaSqFt: acquisition.areaSqFt ?? "0",
            areaSqYd: acquisition.areaSqFt
              ? new D(acquisition.areaSqFt).div(9).toFixed(3)
              : "0",
            areaSqM: acquisition.areaSqFt
              ? new D(acquisition.areaSqFt).mul("0.09290304").toFixed(3)
              : "0",
            lifecycle: "NOT_AVAILABLE",
            restriction: "NONE",
          },
        });
        plotId = created.id;
        await tx.acquisition.update({ where: { id: acquisition.id }, data: { plotId } });
      }

      const state = plotStateAfterAcquisitionApproval(
        acquisition.plot?.restriction ?? "NONE",
        acquisition.plot?.restrictionReason ?? null,
        acquisition.paymentGivenPercent.toString()
      );

      if (plotId) {
        await lockPlot(tx, plotId);
        await tx.plot.update({
          where: { id: plotId },
          data: { lifecycle: state.lifecycle, isResale: true },
        });
        await tx.plotEvent.create({
          data: {
            plotId,
            actorRef: args.actorRef,
            action: "ACQUISITION_APPROVED",
            toLifecycle: state.lifecycle,
            reason: state.message ? `${args.note} — ${state.message}` : args.note,
          },
        });
      }

      await tx.acquisition.update({
        where: { id: acquisition.id },
        data: { status: "APPROVED", ...decision },
      });

      // main-PRD §17.9 — the old Booking becomes closed history and the previous
      // Customer leaves the active allocation. Its one-shot commission slots
      // reopen only where the sale had not reached legal completion
      // (PRD §6.1, §6.5): a Delivered Booking was legally completed.
      if (acquisition.sourceBooking) {
        const move = canTransition(acquisition.sourceBooking.status, "BUYBACK_COMPLETED");
        if (!move.ok) blocked(move.reason);

        const legallyCompleted = acquisition.sourceBooking.status === "DELIVERED";
        await tx.booking.update({
          where: { id: acquisition.sourceBooking.id },
          data: {
            status: "BUYBACK_COMPLETED",
            activeProcess: "NONE",
            closedAt: new Date(),
            closeReason: `Buyback ${acquisition.acquisitionNo} approved — ${args.note}`,
          },
        });
        await cancelCommissionForBooking(tx, acquisition.sourceBooking.id, args.actorRef, {
          legallyCompleted,
          reason: `Buyback ${acquisition.acquisitionNo} approved`,
        });
        await closeTasksFor(
          tx,
          "Booking",
          acquisition.sourceBooking.id,
          args.actorRef,
          `Buyback ${acquisition.acquisitionNo} approved.`
        );
        await tx.bookingEvent.create({
          data: {
            bookingId: acquisition.sourceBooking.id,
            actorRef: args.actorRef,
            action: "BUYBACK_COMPLETED",
            fromStatus: acquisition.sourceBooking.status,
            toStatus: "BUYBACK_COMPLETED",
            reason: args.note,
          },
        });

        // main-PRD §17.9 — the paper task depends on how far the old sale got.
        const completion = await tx.bookingCompletion.findFirst({
          where: { bookingId: acquisition.sourceBooking.id, reopenedAt: null },
        });
        if (completion) {
          await ensureTask(tx, {
            recordKind: "Acquisition",
            recordId: acquisition.id,
            recordName: acquisition.acquisitionNo,
            purpose: "BUYBACK_PAPERS",
            title:
              completion.route === "ALLOTMENT"
                ? "Collect Allotment Papers Back"
                : "Complete Registry Back",
            assigneeRole: "CRM",
            dueAt: new Date(),
          });
        }
      }

      await closeTasksFor(
        tx,
        "Acquisition",
        acquisition.id,
        args.actorRef,
        `Approved — ${args.note}`,
        "ACQUISITION_REVIEW"
      );
      await tx.acquisitionEvent.create({
        data: {
          acquisitionId: acquisition.id,
          actorRef: args.actorRef,
          action: "ACQUISITION_APPROVED",
          fromStatus: "PENDING_APPROVAL",
          toStatus: "APPROVED",
          detail: { plotId, plotMessage: state.message },
          reason: args.note,
        },
      });

      return {
        result: {
          acquisitionId: acquisition.id,
          status: "APPROVED" as const,
          plotId,
          plotMessage: state.message,
        },
        audit: {
          entity: "Acquisition",
          entityId: acquisition.id,
          action: "ACQUISITION_APPROVED",
          after: { plotId, lifecycle: state.lifecycle, isResale: true },
          reason: args.note,
        },
      };
    }
  );
}

/** PRD §11.4 — Deal Cancelled, only while no new buyer process is active. */
export async function cancelAcquisitionDeal(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  acquisitionId: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to cancel a deal.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ACQUISITION_CANCEL",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { acquisitionId: args.acquisitionId },
    },
    async (tx) => {
      await lockKey(tx, `acquisition:${args.acquisitionId}`);
      const acquisition = await tx.acquisition.findUniqueOrThrow({
        where: { id: args.acquisitionId },
      });
      if (!["PENDING_APPROVAL", "APPROVED"].includes(acquisition.status)) {
        blocked(`This acquisition is ${acquisition.status.replaceAll("_", " ").toLowerCase()}.`);
      }

      const buyerProcess = await hasBuyerProcess(tx, acquisition.plotId);
      const allowed = cancelAcquisition(buyerProcess);
      if (!allowed.ok) blocked(allowed.reason);

      await tx.acquisition.update({
        where: { id: acquisition.id },
        data: { status: "CANCELLED", closedReason: args.reason },
      });

      if (acquisition.plotId) {
        const state = plotStateAfterAcquisitionCancelled();
        await tx.plot.update({
          where: { id: acquisition.plotId },
          data: { lifecycle: state.lifecycle },
        });
        await tx.plotEvent.create({
          data: {
            plotId: acquisition.plotId,
            actorRef: args.actorRef,
            action: "CANCELLED",
            toLifecycle: state.lifecycle,
            reason: `${args.reason} — ${state.message}`,
          },
        });
      }

      if (acquisition.sourceBookingId) {
        await tx.booking.update({
          where: { id: acquisition.sourceBookingId },
          data: { activeProcess: "NONE" },
        });
      }

      await stepBackBuyingCommission(tx, acquisition.id, args.actorRef, `Deal cancelled — ${args.reason}`);
      await closeTasksFor(tx, "Acquisition", acquisition.id, args.actorRef, `Deal cancelled — ${args.reason}`);
      await tx.acquisitionEvent.create({
        data: {
          acquisitionId: acquisition.id,
          actorRef: args.actorRef,
          action: "CANCELLED",
          toStatus: "CANCELLED",
          reason: args.reason,
        },
      });

      return {
        result: { acquisitionId: acquisition.id, status: "CANCELLED" as const },
        audit: {
          entity: "Acquisition",
          entityId: acquisition.id,
          action: "CANCELLED",
          reason: args.reason,
        },
      };
    }
  );
}

/* -------------------------------------------------- Buying Commission */

/**
 * PRD §11.7 — one Buying Commission per acquisition, outside the 4% sale cap,
 * eligible at 100% Payment Given. Raised when the arranger is a Member or
 * Customer; a 3% Club acquisition earns none.
 */
export async function recordBuyingCommission(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  acquisitionId: string;
  beneficiaryPersonId: string;
  percent: string;
  ruleVersion?: string;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BUYING_COMMISSION_RECORD",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: {
        acquisitionId: args.acquisitionId,
        beneficiaryPersonId: args.beneficiaryPersonId,
        percent: args.percent,
      },
    },
    async (tx) => {
      await lockKey(tx, `acquisition:${args.acquisitionId}`);
      const acquisition = await tx.acquisition.findUniqueOrThrow({
        where: { id: args.acquisitionId },
        include: { sourceBooking: { include: { parties: { where: { effectiveTo: null } } } } },
      });

      const existing = await tx.commissionRecord.findFirst({
        where: { acquisitionId: args.acquisitionId, isCurrent: true },
      });
      if (existing) blocked("This acquisition already carries a current Buying Commission record.");

      const check = validateBuyingCommission({
        beneficiaryPersonId: args.beneficiaryPersonId,
        sellerPersonId: acquisition.sellerPersonId,
        buybackPartyPersonIds: acquisition.sourceBooking?.parties.map((p) => p.personId) ?? [],
        percent: args.percent,
      });
      if (!check.ok) blocked(check.reason);

      const record = await tx.commissionRecord.create({
        data: {
          acquisitionId: args.acquisitionId,
          type: "BUYING",
          beneficiaryRole: "ACQUISITION_ARRANGER",
          beneficiaryPersonId: args.beneficiaryPersonId,
          percent: new D(args.percent).toFixed(4),
          ruleVersion: args.ruleVersion ?? "BUYING-1",
          milestonePercent: "100",
          eligibility: buyingCommissionMilestoneReached(acquisition.paymentGivenPercent.toString())
            ? "READY"
            : "MILESTONE_PENDING",
        },
      });
      await tx.commissionEvent.create({
        data: {
          recordId: record.id,
          actorRef: args.actorRef,
          action: "CREATED",
          toState: record.eligibility,
        },
      });

      return {
        result: { recordId: record.id, eligibility: record.eligibility },
        audit: {
          entity: "Acquisition",
          entityId: args.acquisitionId,
          action: "BUYING_COMMISSION_RECORDED",
          after: { beneficiaryPersonId: args.beneficiaryPersonId, percent: args.percent },
        },
      };
    }
  );
}

/** 100% Payment Given makes the Buying Commission Ready (PRD §11.7). */
async function settleBuyingCommission(tx: Tx, acquisitionId: string, actorRef: string) {
  const record = await tx.commissionRecord.findFirst({
    where: { acquisitionId, isCurrent: true, eligibility: "MILESTONE_PENDING" },
  });
  if (!record) return;

  await tx.commissionRecord.update({ where: { id: record.id }, data: { eligibility: "READY" } });
  await tx.commissionEvent.create({
    data: {
      recordId: record.id,
      actorRef,
      action: "MILESTONE_REACHED",
      fromState: "MILESTONE_PENDING",
      toState: "READY",
      reason: "Payment Given reached 100%.",
    },
  });
}

/** A correction below 100% steps the milestone back (PRD §11.3). */
async function stepBackBuyingCommission(tx: Tx, acquisitionId: string, actorRef: string, reason: string) {
  const record = await tx.commissionRecord.findFirst({
    where: { acquisitionId, isCurrent: true },
  });
  if (!record || record.eligibility === "MILESTONE_PENDING") return;

  // A record already paid cannot be un-paid silently; Accounts must adjust it.
  const paid = record.payment === "PAID" || record.payment === "PAID_EARLY";
  await tx.commissionRecord.update({
    where: { id: record.id },
    data: {
      eligibility: "MILESTONE_PENDING",
      payment: paid ? "ACCOUNTS_ADJUSTMENT_REQUIRED" : record.payment,
    },
  });
  await tx.commissionEvent.create({
    data: {
      recordId: record.id,
      actorRef,
      action: "MILESTONE_LOST",
      fromState: record.eligibility,
      toState: "MILESTONE_PENDING",
      reason,
    },
  });
}

/* ------------------------------------------------------------- reads */

export function listAcquisitions() {
  return db.acquisition.findMany({
    include: {
      plot: { include: { project: true } },
      sellerPerson: true,
      arrangedByPerson: true,
      sourceBooking: true,
      paymentEntries: { where: { status: "CONFIRMED" } },
      commissions: { where: { isCurrent: true }, include: { beneficiaryPerson: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: 200,
  });
}

