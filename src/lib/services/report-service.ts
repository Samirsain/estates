// Live reports and masked exports — PRD §21.
//
// Reports read current state; nothing is snapshotted. Payment Received and
// Payment Given stay separate datasets, commission totals count only current
// records, and a merged-away Person is never counted twice.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
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
        lifecycle: p.lifecycle,
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
