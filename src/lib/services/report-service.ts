// Live reports and masked exports — PRD §21.
//
// Reports read current state; nothing is snapshotted. Payment Received and
// Payment Given stay separate datasets, commission totals count only current
// records, and a merged-away Person is never counted twice.

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, inWaves } from "@/lib/db";
import { BUYING_CAP_PERCENT } from "@/lib/domain/acquisition";
import { maskExportRow } from "@/lib/domain/completion";
import { blocked } from "./command";

export type ReportName =
  | "BOOKINGS"
  | "PAYMENTS_RECEIVED"
  | "PAYMENTS_GIVEN"
  | "COMMISSION"
  | "INVENTORY"
  | "COMPLETIONS";

export type ReportFilters = {
  projectId?: string;
  from?: Date;
  to?: Date;
};

const between = (filters: ReportFilters) =>
  filters.from || filters.to
    ? { gte: filters.from ?? undefined, lte: filters.to ?? undefined }
    : undefined;

/** PRD §21 — merged duplicates are never double-counted. */
const NOT_MERGED_AWAY = { mergeStatus: { not: "MERGED_AWAY" as const } };

export async function runReport(
  report: ReportName,
  filters: ReportFilters = {}
): Promise<Record<string, unknown>[]> {
  const at = between(filters);

  switch (report) {
    case "BOOKINGS": {
      const rows = await db.booking.findMany({
        where: {
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          ...(at ? { bookingDate: at } : {}),
          primaryPerson: NOT_MERGED_AWAY,
        },
        include: { project: true, plot: true, primaryPerson: true },
        orderBy: { bookingDate: "desc" },
      });
      return rows.map((b) => ({
        bookingNumber: b.bookingNumber ?? b.requestNo,
        status: b.status,
        project: b.project.name,
        plotNumber: b.plot.plotNumber,
        customer: b.primaryPerson.fullName,
        primaryMobile: b.primaryPerson.primaryMobile,
        bookingDate: b.bookingDate,
        paymentReceivedPercent: b.paymentReceivedPercent.toFixed(2),
      }));
    }

    case "PAYMENTS_RECEIVED": {
      const rows = await db.paymentReceivedEntry.findMany({
        where: {
          status: "CONFIRMED",
          ...(at ? { paidOn: at } : {}),
          ...(filters.projectId ? { booking: { projectId: filters.projectId } } : {}),
        },
        include: { booking: { include: { plot: true, project: true } }, externalReference: true },
        orderBy: { paidOn: "desc" },
      });
      return rows.map((e) => ({
        dataset: "PAYMENT_RECEIVED",
        bookingNumber: e.booking.bookingNumber ?? e.booking.requestNo,
        project: e.booking.project.name,
        plotNumber: e.booking.plot.plotNumber,
        receivedPercent: e.percent.toFixed(2),
        paidOn: e.paidOn,
        reference: e.externalReference?.rawValue ?? null,
      }));
    }

    case "PAYMENTS_GIVEN": {
      const rows = await db.paymentGivenEntry.findMany({
        where: { status: "CONFIRMED", ...(at ? { paidOn: at } : {}) },
        include: { acquisition: true, externalReference: true },
        orderBy: { paidOn: "desc" },
      });
      return rows.map((e) => ({
        dataset: "PAYMENT_GIVEN",
        acquisitionRef: e.acquisition.acquisitionNo,
        acquisitionType: e.acquisition.type,
        givenPercent: e.percent.toFixed(2),
        paidOn: e.paidOn,
        reference: e.externalReference?.rawValue ?? null,
      }));
    }

    case "COMMISSION": {
      // PRD §21 — superseded records are excluded from every total.
      const rows = await db.commissionRecord.findMany({
        where: { isCurrent: true, beneficiaryPerson: NOT_MERGED_AWAY },
        include: { beneficiaryPerson: true, booking: { include: { project: true, plot: true } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((c) => ({
        beneficiary: c.beneficiaryPerson.fullName,
        beneficiaryRole: c.beneficiaryRole,
        type: c.type,
        percent: c.percent.toFixed(2),
        milestonePercent: c.milestonePercent.toFixed(2),
        eligibility: c.eligibility,
        holdReason: c.holdReason,
        paymentState: c.payment,
        project: c.booking?.project.name ?? null,
        plotNumber: c.booking?.plot.plotNumber ?? null,
      }));
    }

    case "INVENTORY": {
      const rows = await db.plot.findMany({
        where: filters.projectId ? { projectId: filters.projectId } : {},
        include: { project: true },
        orderBy: [{ projectId: "asc" }, { plotNumber: "asc" }],
      });
      return rows.map((p) => ({
        project: p.project.name,
        plotNumber: p.plotNumber,
        plotType: p.plotType,
        status: p.status,
        restriction: p.restriction,
        isResale: p.isResale,
        areaSqFt: p.areaSqFt.toFixed(3),
      }));
    }

    case "COMPLETIONS": {
      const rows = await db.bookingCompletion.findMany({
        where: {
          reopenedAt: null,
          ...(at ? { deliveredAt: at } : {}),
          ...(filters.projectId ? { booking: { projectId: filters.projectId } } : {}),
        },
        include: { booking: { include: { project: true, plot: true } } },
        orderBy: { deliveredAt: "desc" },
      });
      return rows.map((c) => ({
        bookingNumber: c.booking.bookingNumber ?? c.booking.requestNo,
        project: c.booking.project.name,
        plotNumber: c.booking.plot.plotNumber,
        route: c.route,
        allotmentNumber: c.allotmentNumber,
        pattaStatus: c.pattaStatus,
        advocateName: c.advocateName,
        registryDate: c.registryDate,
        deliveredAt: c.deliveredAt,
        papersLegallyTransferred: c.papersLegallyTransferred,
      }));
    }
  }
}

/**
 * PRD §21 — an export is the masked report plus a log line holding report,
 * filters, timestamp, user and row count. The rows themselves are not retained;
 * the optional hash is what proves a later copy is the one that was exported.
 */
export async function exportReport(args: {
  actorRef: string;
  actorRole: string;
  report: ReportName;
  filters?: ReportFilters;
}): Promise<{ rows: Record<string, unknown>[]; exportId: string; rowCount: number }> {
  const filters = args.filters ?? {};
  const rows = (await runReport(args.report, filters)).map(maskExportRow);
  const contentHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");

  const log = await db.exportLog.create({
    data: {
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      report: args.report,
      filters: filters as never,
      rowCount: rows.length,
      contentHash,
    },
  });

  return { rows, exportId: log.id, rowCount: rows.length };
}

/** PRD §21, main-PRD §14.2 — Activity History for one record. */
export async function activityHistory(entity: string, entityId: string) {
  if (!entity.trim() || !entityId.trim()) blocked("An entity and record are required.");
  return db.auditEvent.findMany({
    where: { entity, entityId },
    orderBy: { at: "desc" },
    take: 500,
  });
}

/* ------------------------------------------------------- business state */

/**
 * AC-07 — the Dashboard's business-state figures.
 *
 * Every number here is counted from the transaction-level records themselves,
 * in one pass, rather than from a separate rollup table. That is the point of
 * the requirement: a dashboard total that disagreed with the records behind it
 * would be a second source of truth, and the first thing anyone would find is
 * that the two do not match.
 *
 * Nothing is snapshotted and nothing is cached — the page recomputes on every
 * load, exactly as the other reports do (PRD §21).
 */
export type BusinessState = {
  /** AC-01 — split by the classification frozen at approval, never by who the buyer is today. */
  business: { customer: number; member: number; unclassified: number };
  transactions: { active: number; unwound: number; cancelled: number; completed: number };
  /**
   * AC-02, TC-ROY-001/002 — earned means the qualifying activity is complete,
   * which is not the same as paid. A Royalty at its 100% payment milestone but
   * not yet legally completed is pending, however far the money has come.
   */
  royalty: { earned: number; pending: number; paid: number };
  cycles: { inProgress: number; upgradeEligible: number; positions: number };
  buying: { records: number; totalPercent: string; overCapExceptions: number };
  paidEarly: { approvedAwaitingPayment: number; notReadyUnapproved: number; processed: number };
  conflicts: { aboveCap: number };
  recoveries: { refundPending: number; cancellationsDecided: number };
  conversions: { customersActivatedAsMembers: number };
  audit: { reversals: number; supersededRecords: number };
  /** Test plan §18 — the volumes every other figure has to reconcile against. */
  volumes: {
    enquiries: number;
    holds: number;
    approvedBookings: number;
    paymentsReceived: number;
  };
};

export async function businessState(): Promise<BusinessState> {
  const approved = { bookingNumber: { not: null } } as const;

  // Kept out of the count waves below: it returns rows rather than a number,
  // and the percentages are needed for both the total and the cap exceptions.
  const buyingRecords = await db.commissionRecord.findMany({
    where: { type: "BUYING", isCurrent: true },
    select: { percent: true },
  });

  const [
    customerBusiness,
    memberBusiness,
    unclassified,
    activeTx,
    unwoundTx,
    cancelledTx,
    completedTx,
    royaltyEarned,
    royaltyPending,
    royaltyPaid,
    cyclesInProgress,
    cyclesUpgradeEligible,
    cyclePositions,
    paidEarlyApproved,
    paidEarlyUnapproved,
    paidEarlyProcessed,
    conflicts,
    refundPending,
    cancellationsDecided,
    conversions,
    supersededRecords,
    reversals,
    enquiries,
    holds,
    paymentsReceived,
  ] = await inWaves([
    () => db.booking.count({ where: { ...approved, originalClassification: "CUSTOMER" } }),
    () => db.booking.count({ where: { ...approved, originalClassification: "MEMBER" } }),
    () => db.booking.count({ where: { ...approved, originalClassification: null } }),
    () => db.booking.count({ where: { ...approved, status: { in: ["BOOKED", "PAYMENT_COMPLETED"] } } }),
    () => db.booking.count({ where: { status: "BUYBACK_COMPLETED" } }),
    () => db.booking.count({ where: { status: { in: ["CANCELLED", "REFUND_PENDING"] } } }),
    () => db.booking.count({ where: { status: "DELIVERED" } }),
    // CR-004 — Royalty is earned at its own milestone now, so "earned" is the
    // consumed one-time opportunity rather than a completed cycle, and pending
    // is everything still short of it.
    () => db.commissionRecord.count({
      where: { type: "ROYALTY", isCurrent: true, opportunityId: { not: null } },
    }),
    () => db.commissionRecord.count({
      where: {
        type: "ROYALTY",
        isCurrent: true,
        opportunityId: null,
        payment: { notIn: ["CANCELLED"] },
      },
    }),
    () => db.commissionRecord.count({
      where: { type: "ROYALTY", isCurrent: true, payment: { in: ["PAID", "PAID_EARLY"] } },
    }),
    // CR-014 — cycles in progress, cycles that reached Upgrade Eligible, and the
    // positions those cycles hold.
    () => db.performanceCycle.count({ where: { status: "IN_PROGRESS" } }),
    () => db.performanceCycle.count({ where: { status: "UPGRADE_ELIGIBLE" } }),
    () => db.performanceCycle
      .aggregate({ _sum: { positionsFilled: true } })
      .then((r) => r._sum.positionsFilled ?? 0),
    () => db.commissionRecord.count({
      where: { isCurrent: true, payment: "NOT_PAID", earlyApprovedAt: { not: null } },
    }),
    // Unpaid, not yet Ready and carrying no MD approval — the records for which
    // Paid Early is the only route, and which cannot move until MD approves.
    () => db.commissionRecord.count({
      where: {
        isCurrent: true,
        payment: "NOT_PAID",
        earlyApprovedAt: null,
        eligibility: { in: ["ON_HOLD", "MILESTONE_PENDING"] },
      },
    }),
    () => db.commissionRecord.count({ where: { payment: "PAID_EARLY" } }),
    () => db.commissionRecord.count({
      where: { isCurrent: true, holdReason: "COMMISSION_CONFLICT_ABOVE_4" },
    }),
    () => db.booking.count({ where: { activeProcess: "REFUND_PENDING" } }),
    () => db.cancellationRequest.count({ where: { status: { not: "PENDING" } } }),
    // AC-01 — a Customer who later activated as a Member, evidenced by the
    // Customer Bookings that stayed Customer business through the activation.
    () => db.booking.count({
      where: {
        ...approved,
        originalClassification: "CUSTOMER",
        primaryPerson: { memberProfile: { activationDate: { not: null } } },
      },
    }),
    () => db.commissionRecord.count({ where: { isCurrent: false } }),
    () => db.commissionEvent.count({
      where: {
        action: {
          in: [
            "BOOKING_CANCELLED",
            "MILESTONE_LOST",
            "OPPORTUNITY_LOST",
            "SUPERSEDED",
            "CYCLE_RELEASED",
            "CYCLE_REOPENED",
            "CYCLE_ACTIVITY_REOPENED",
          ],
        },
      },
    }),
    () => db.enquiry.count(),
    () => db.hold.count(),
    () => db.paymentReceivedEntry.count({ where: { status: "CONFIRMED" } }),
  ]);

  const totalBuying = buyingRecords.reduce((sum, r) => sum.add(r.percent), new Prisma.Decimal(0));
  // AC-04 — the cap is enforced on entry, so a row above it can only be legacy
  // data. It is surfaced rather than hidden: an exception that nobody can see
  // is an exception nobody corrects.
  const overCap = buyingRecords.filter((r) => r.percent.gt(BUYING_CAP_PERCENT)).length;

  return {
    business: { customer: customerBusiness, member: memberBusiness, unclassified },
    transactions: {
      active: activeTx,
      unwound: unwoundTx,
      cancelled: cancelledTx,
      completed: completedTx,
    },
    royalty: { earned: royaltyEarned, pending: royaltyPending, paid: royaltyPaid },
    cycles: {
      inProgress: cyclesInProgress,
      upgradeEligible: cyclesUpgradeEligible,
      positions: cyclePositions,
    },
    buying: {
      records: buyingRecords.length,
      totalPercent: totalBuying.toFixed(2),
      overCapExceptions: overCap,
    },
    paidEarly: {
      approvedAwaitingPayment: paidEarlyApproved,
      notReadyUnapproved: paidEarlyUnapproved,
      processed: paidEarlyProcessed,
    },
    conflicts: { aboveCap: conflicts },
    recoveries: { refundPending, cancellationsDecided },
    conversions: { customersActivatedAsMembers: conversions },
    audit: { reversals, supersededRecords },
    volumes: {
      enquiries,
      holds,
      approvedBookings: customerBusiness + memberBusiness + unclassified,
      paymentsReceived,
    },
  };
}
