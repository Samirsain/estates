"use server";

// Reports and exports — PRD.md §21; DESIGN.md §16.
// Reports are live. Exports are masked and logged, every time.

import { requireStaff } from "@/lib/security/current-actor";
import { CommandError } from "@/lib/services/command";
import {
  exportReport,
  runReport,
  type ReportFilters,
  type ReportName,
} from "@/lib/services/report-service";
import { activityHistory } from "@/lib/services/report-service";

export type ReportRow = Record<string, unknown>;
export type ReportResult =
  | { ok: true; rows: ReportRow[]; columns: string[]; exportId?: string }
  | { ok: false; error: string };

function toResult(error: unknown): { ok: false; error: string } {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Report failed." };
}

function columnsOf(rows: ReportRow[]): string[] {
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

/** Dates arrive as YYYY-MM-DD strings from the form. */
function toFilters(input: { projectId?: string; from?: string; to?: string }): ReportFilters {
  return {
    projectId: input.projectId || undefined,
    from: input.from ? new Date(`${input.from}T00:00:00+05:30`) : undefined,
    to: input.to ? new Date(`${input.to}T23:59:59+05:30`) : undefined,
  };
}

export async function runReportAction(
  report: ReportName,
  input: { projectId?: string; from?: string; to?: string }
): Promise<ReportResult> {
  await requireStaff("REPORT_VIEW");
  try {
    const rows = await runReport(report, toFilters(input));
    return { ok: true, rows, columns: columnsOf(rows) };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §21 — the export is masked and the log stores report, filters, timestamp,
 * user and row count. A separate permission from viewing.
 */
export async function exportReportAction(
  report: ReportName,
  input: { projectId?: string; from?: string; to?: string }
): Promise<ReportResult> {
  const actor = await requireStaff("REPORT_EXPORT");
  try {
    const exported = await exportReport({
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      report,
      filters: toFilters(input),
    });
    return {
      ok: true,
      rows: exported.rows,
      columns: columnsOf(exported.rows),
      exportId: exported.exportId,
    };
  } catch (error) {
    return toResult(error);
  }
}

export type ActivityRow = {
  at: string;
  actorRef: string;
  actorRole: string | null;
  action: string;
  reason: string | null;
};

/** Activity History for one record (PRD §21; main-PRD §14.2). */
export async function activityHistoryAction(
  entity: string,
  entityId: string
): Promise<{ ok: true; rows: ActivityRow[] } | { ok: false; error: string }> {
  await requireStaff("AUDIT_VIEW");
  try {
    const events = await activityHistory(entity, entityId);
    return {
      ok: true,
      rows: events.map((event) => ({
        at: event.at.toISOString(),
        actorRef: event.actorRef,
        actorRole: event.actorRole,
        action: event.action,
        reason: event.reason,
      })),
    };
  } catch (error) {
    return toResult(error);
  }
}
