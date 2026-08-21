// Reports — PRD.md §21; DESIGN.md §16.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import ReportsClient from "./reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const actor = await requireStaff("REPORT_VIEW");

  const [projects, recentExports] = await Promise.all([
    db.project.findMany({
      select: { id: true, name: true, projectCode: true },
      orderBy: { name: "asc" },
    }),
    // PRD §21 — the export log is itself visible to whoever may export.
    can(actor.role, "REPORT_EXPORT", actor.extraPermissions)
      ? db.exportLog.findMany({ orderBy: { at: "desc" }, take: 20 })
      : Promise.resolve([]),
  ]);

  return (
    <ReportsClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      canExport={can(actor.role, "REPORT_EXPORT", actor.extraPermissions)}
      projects={projects}
      recentExports={recentExports.map((log) => ({
        id: log.id,
        at: log.at.toISOString(),
        report: log.report,
        actorRef: log.actorRef,
        rowCount: log.rowCount,
      }))}
    />
  );
}
