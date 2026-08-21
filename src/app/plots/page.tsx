// Plot Inventory — DESIGN.md §7.1 columns and §7.3 state actions.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { derivedFacing } from "@/lib/domain/inventory";
import { listPendingHoldRequests } from "@/lib/services/hold-service";
import { listPlots } from "@/lib/services/inventory-service";
import PlotsClient, { type HoldRequestView, type PlotRowView } from "./plots-client";

export const dynamic = "force-dynamic";

export default async function PlotsPage() {
  const actor = await requireStaff();

  const [plots, projects, people, requests] = await Promise.all([
    listPlots(),
    db.project.findMany({
      include: { plcRuleVersions: { where: { isCurrent: true }, include: { components: true }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    db.person.findMany({
      where: { mergeStatus: { not: "MERGED_AWAY" } },
      select: { id: true, fullName: true, primaryMobile: true },
      orderBy: { fullName: "asc" },
      take: 200,
    }),
    listPendingHoldRequests(),
  ]);

  const rows: PlotRowView[] = plots.map((plot) => {
    const hold = plot.holds[0];
    return {
      id: plot.id,
      project: plot.project.name,
      projectId: plot.projectId,
      plotType: plot.plotType,
      plotNumber: plot.plotNumber,
      areaSqYd: plot.areaSqYd.toFixed(2),
      areaSqFt: plot.areaSqFt.toFixed(2),
      lifecycle: plot.lifecycle,
      restriction: plot.restriction,
      restrictionReason: plot.restrictionReason,
      isResale: plot.isResale,
      plcCodes: plot.plcComponentCodes,
      facing: derivedFacing(
        plot.boundaries.map((b) => ({ side: b.side, kind: b.kind, roadWidthFt: b.roadWidthFt?.toString() })),
        plot.parkFacing
      ),
      hold: hold
        ? {
            id: hold.id,
            heldForName: hold.person.fullName,
            expiresAt: hold.expiresAt.toISOString(),
            extensionCount: hold.extensionCount,
            pendingExtension: hold.extensionRequests.length > 0,
            pendingExtensionId: hold.extensionRequests[0]?.id ?? null,
            pendingExtensionReason: hold.extensionRequests[0]?.reason ?? null,
            // PRD §10.5 — a frozen Hold's timer is not running, so its stored
            // expiry must never be shown as a live countdown.
            frozen: hold.status === "FROZEN",
          }
        : null,
    };
  });

  const holdRequests: HoldRequestView[] = requests.map((r) => ({
    id: r.id,
    project: r.plot.project.name,
    plot: `${r.plot.plotType.replaceAll("_", " ")} ${r.plot.plotNumber}`,
    plotLifecycle: r.plot.lifecycle,
    buyer: r.person.fullName,
    member: `${r.member.memberId} · ${r.member.person.fullName}`,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    queuePosition: r.queuePosition,
  }));

  return (
    <PlotsClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      rows={rows}
      holdRequests={holdRequests}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        lifecycle: p.lifecycle,
        plcCodes: p.plcRuleVersions[0]?.components.map((c) => `${c.code} (${c.percent.toFixed(2)}%)`) ?? [],
        rawPlcCodes: p.plcRuleVersions[0]?.components.map((c) => c.code) ?? [],
      }))}
      people={people}
      permissions={{
        makeAvailable: can(actor.role, "PLOT_MAKE_AVAILABLE"),
        restriction: can(actor.role, "PLOT_RESTRICTION_MANAGE"),
        hold: can(actor.role, "HOLD_CREATE"),
        extend: can(actor.role, "HOLD_EXTEND_FIRST"),
        decideExtension: can(actor.role, "HOLD_EXTEND_FURTHER"),
        setup: can(actor.role, "PLOT_SETUP"),
        reviewRequests: can(actor.role, "HOLD_REQUEST_REVIEW"),
      }}
    />
  );
}
