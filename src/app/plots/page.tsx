// Plot Inventory — DESIGN.md §7.1 columns and §7.3 state actions.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { buildPlcSnapshot, shortSides } from "@/lib/domain/inventory";
import { plcRules } from "@/lib/services/plc-service";
import { listPendingHoldRequests } from "@/lib/services/hold-service";
import { listPlots } from "@/lib/services/inventory-service";
import PlotsClient, { type HoldRequestView, type PlotRowView } from "./plots-client";

export const dynamic = "force-dynamic";

export default async function PlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const actor = await requireStaff();
  // A Project detail page links here for its own Plots. Without this the link
  // would land on every Plot in the company and leave the filtering to whoever
  // followed it.
  const { project: initialProject } = await searchParams;

  const [plots, projects, people, requests] = await Promise.all([
    listPlots(),
    db.project.findMany({
      include: { plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 } },
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

  // PLC spec §15.2 — the effective PLC for Available / Not Active inventory is
  // derived on read from the published version, never stored, so publishing a
  // new version updates this list by construction (§4.3).
  const publishedPlc = new Map(
    projects.map((project) => [project.id, project.plcRuleVersions[0] ?? null])
  );

  const rows: PlotRowView[] = plots.map((plot) => {
    const hold = plot.holds[0];
    const version = publishedPlc.get(plot.projectId) ?? null;

    let plc: PlotRowView["plc"] = null;
    let plcIssue: string | null = version ? null : "No published PLC version for this Project";
    if (version) {
      try {
        const effective = buildPlcSnapshot(
          plot.boundaries.map((b) => ({
            side: b.side,
            kind: b.kind,
            roadWidthFt: b.roadWidthFt?.toString(),
          })),
          plcRules(version.components)
        );
        // What the list shows is what the charge is FOR — corner, park facing,
        // the sides that qualified. The total travels too, but only the Plot's
        // own page prints it: a column of percentages is not what anyone scans
        // a plot list for.
        plc = {
          version: version.version,
          totalPercent: effective.totalPercent.toFixed(4),
          components: effective.components.map((c) => ({
            label: c.label,
            evidence: shortSides(c.evidence),
          })),
        };
      } catch (error) {
        // PLC spec §5.3 — a configuration or a boundary that cannot be
        // evaluated is surfaced, never silently dropped from the total.
        plcIssue = error instanceof Error ? error.message : "PLC could not be evaluated";
      }
    }

    return {
      plc,
      plcIssue,
      id: plot.id,
      project: plot.project.name,
      projectId: plot.projectId,
      plotType: plot.plotType,
      plotNumber: plot.plotNumber,
      // Square feet at stored precision — it is the figure a Plot is sold by.
      // The two conversions are rounded; nobody quotes a Plot to four decimals
      // of a square metre.
      areaSqYd: plot.areaSqYd.toDecimalPlaces(2).toString(),
      areaSqFt: plot.areaSqFt.toString(),
      areaSqM: plot.areaSqM.toDecimalPlaces(2).toString(),
      status: plot.status,
      pastHolds: plot.events.map((e) => ({
        at: e.at.toISOString(),
        actorRef: e.actorRef,
        reason: e.reason,
      })),
      restriction: plot.restriction,
      restrictionReason: plot.restrictionReason,
      isResale: plot.isResale,
      widthFt: plot.widthFt?.toString() ?? "",
      lengthFt: plot.lengthFt?.toString() ?? "",
      exactAreaSqFt: plot.exactAreaSqFt?.toString() ?? "",
      exactAreaReason: plot.exactAreaReason ?? "",
      boundaries: plot.boundaries.map((b) => ({
        side: b.side,
        kind: b.kind,
        roadWidthFt: b.roadWidthFt?.toString() ?? "",
        reference: b.reference ?? "",
      })),
      hold: hold
        ? {
            id: hold.id,
            heldForName: hold.person.fullName,
            heldForPersonId: hold.person.id,
            expiresAt: hold.expiresAt.toISOString(),
            extensionCount: hold.extensionCount,
            // "There is a request" used to mean "there is a pending request",
            // which was true only because the query filtered for it somewhere
            // else. Now the status is read where the meaning is.
            pendingExtension: hold.extensionRequests.some((r) => r.status === "PENDING"),
            pendingExtensionId:
              hold.extensionRequests.find((r) => r.status === "PENDING")?.id ?? null,
            pendingExtensionReason:
              hold.extensionRequests.find((r) => r.status === "PENDING")?.reason ?? null,
            /** Every request on this Hold, newest first, for the extend dialog. */
            extensions: hold.extensionRequests.map((r) => ({
              at: r.createdAt.toISOString(),
              byRef: r.requestedByRef,
              reason: r.reason,
              hours: r.requestedHours,
              status: r.status,
              decidedByRef: r.decidedByRef,
              decisionNote: r.decisionNote,
            })),
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
    plotStatus: r.plot.status,
    buyer: r.person.fullName,
    buyerPersonId: r.person.id,
    member: `${r.member.memberId} · ${r.member.person.fullName}`,
    memberPersonId: r.member.person.id,
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
      initialProject={initialProject ?? "ALL"}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        location: p.location,
        status: p.status,
        // The grid needs the configured bands themselves, so it can compute the
        // same effective PLC the server will, live, as the row is typed.
        plcComponents: plcRules(p.plcRuleVersions[0]?.components ?? []).map((c) => ({
          category: c.category,
          threshold: c.threshold == null ? null : String(c.threshold),
          percent: String(c.percent),
          remark: c.remark || null,
        })),
      }))}
      people={people}
      permissions={{
        makeAvailable: can(actor.role, "PLOT_MAKE_AVAILABLE"),
        hold: can(actor.role, "HOLD_CREATE"),
        extend: can(actor.role, "HOLD_EXTEND_FIRST"),
        decideExtension: can(actor.role, "HOLD_EXTEND_FURTHER"),
        setup: can(actor.role, "PLOT_SETUP"),
        reviewRequests: can(actor.role, "HOLD_REQUEST_REVIEW"),
      }}
    />
  );
}
