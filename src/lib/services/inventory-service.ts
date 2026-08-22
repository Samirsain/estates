// Project and Plot setup — PRD.md §15, §16; DESIGN.md §7.

import type { BoundaryKind, BoundarySide, PlotType } from "@prisma/client";
import { db } from "@/lib/db";
import { calculateAreas, plotReturnState, type AreaInput } from "@/lib/domain/inventory";
import { blocked, lockPlot, runCommand, type Tx } from "./command";

export type PlotRow = {
  plotNumber: string;
  plotType: PlotType;
  widthFt?: string;
  lengthFt?: string;
  exactAreaSqFt?: string;
  exactAreaReason?: string;
  parkFacing?: boolean;
  plcComponentCodes?: string[];
  boundaries?: Array<{
    side: BoundarySide;
    kind: BoundaryKind;
    roadWidthFt?: string;
    adjacentPlotNumber?: string;
  }>;
};

function areaInput(row: PlotRow): AreaInput {
  if (row.exactAreaSqFt) {
    return {
      kind: "EXACT",
      exactAreaSqFt: row.exactAreaSqFt,
      reason: row.exactAreaReason ?? "",
    };
  }
  if (!row.widthFt || !row.lengthFt) {
    throw new Error(`Plot ${row.plotNumber}: enter Width and Length, or an exact area with a reason.`);
  }
  return { kind: "REGULAR", widthFt: row.widthFt, lengthFt: row.lengthFt };
}

/**
 * PRD §16.4 — controlled Excel-style grid preparation inside the CRM. This is
 * the only bulk path; there is no routine user CSV upload.
 */
export async function prepareInventory(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  projectId: string;
  rows: PlotRow[];
}) {
  if (args.rows.length === 0) blocked("Add at least one Plot row before saving.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "INVENTORY_PREPARE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, rows: args.rows },
    },
    async (tx) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: args.projectId },
        include: { plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 } },
      });
      const validCodes = new Set(project.plcRuleVersions[0]?.components.map((c) => c.code) ?? []);

      // Fail the whole grid rather than saving half of it.
      const seen = new Set<string>();
      for (const row of args.rows) {
        const key = `${row.plotType}|${row.plotNumber.trim()}`;
        if (seen.has(key)) {
          blocked(`Plot ${row.plotNumber} (${row.plotType}) appears twice in this grid.`);
        }
        seen.add(key);
        for (const code of row.plcComponentCodes ?? []) {
          if (!validCodes.has(code)) {
            blocked(`Plot ${row.plotNumber}: PLC component "${code}" is not in the Project's current rule version.`);
          }
        }
      }

      const created: string[] = [];
      for (const row of args.rows) {
        const areas = calculateAreas(areaInput(row));
        const plot = await tx.plot.create({
          data: {
            projectId: args.projectId,
            plotNumber: row.plotNumber.trim(),
            plotType: row.plotType,
            widthFt: row.widthFt ?? null,
            lengthFt: row.lengthFt ?? null,
            exactAreaSqFt: row.exactAreaSqFt ?? null,
            exactAreaReason: row.exactAreaReason ?? null,
            areaSqFt: areas.areaSqFt.toFixed(3),
            areaSqYd: areas.areaSqYd.toFixed(3),
            areaSqM: areas.areaSqM.toFixed(3),
            parkFacing: row.parkFacing ?? false,
            plcComponentCodes: [...new Set(row.plcComponentCodes ?? [])],
            // New inventory starts unreleased; Admin/MD releases it (PRD §16.1).
            lifecycle: "NOT_AVAILABLE",
            restriction: "NOT_YET_RELEASED",
            boundaries: row.boundaries
              ? {
                  create: row.boundaries.map((b) => ({
                    side: b.side,
                    kind: b.kind,
                    roadWidthFt: b.roadWidthFt ?? null,
                    adjacentPlotNumber: b.adjacentPlotNumber ?? null,
                  })),
                }
              : undefined,
          },
        });
        await tx.plotEvent.create({
          data: {
            plotId: plot.id,
            actorRef: args.actorRef,
            action: "PLOT_PREPARED",
            toLifecycle: "NOT_AVAILABLE",
            toRestriction: "NOT_YET_RELEASED",
          },
        });
        created.push(plot.id);
      }

      return {
        result: { createdPlotIds: created, count: created.length },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: "INVENTORY_PREPARED",
          after: { count: created.length },
        },
      };
    }
  );
}

/**
 * DESIGN §7.4 — Make Available carries a compulsory reason. It never also
 * places a Hold; the combined action was removed (PRD §15.1).
 */
export async function makeAvailable(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  plotId: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to make a Plot Available.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLOT_MAKE_AVAILABLE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { plotId: args.plotId },
    },
    async (tx) => {
      await lockPlot(tx, args.plotId);
      const plot = await tx.plot.findUniqueOrThrow({ where: { id: args.plotId } });

      if (plot.lifecycle !== "NOT_AVAILABLE") {
        blocked(`Plot is ${plot.lifecycle.replaceAll("_", " ").toLowerCase()}; only a Not Available Plot can be released.`);
      }

      await tx.plot.update({
        where: { id: args.plotId },
        data: { restriction: "NONE", restrictionReason: null, lifecycle: "AVAILABLE" },
      });
      await tx.plotEvent.create({
        data: {
          plotId: args.plotId,
          actorRef: args.actorRef,
          action: "PLOT_MADE_AVAILABLE",
          fromLifecycle: plot.lifecycle,
          toLifecycle: "AVAILABLE",
          fromRestriction: plot.restriction,
          toRestriction: "NONE",
          reason: args.reason,
        },
      });

      return {
        result: { plotId: args.plotId, lifecycle: "AVAILABLE" },
        audit: {
          entity: "Plot",
          entityId: args.plotId,
          action: "PLOT_MADE_AVAILABLE",
          before: { lifecycle: plot.lifecycle, restriction: plot.restriction },
          after: { lifecycle: "AVAILABLE", restriction: "NONE" },
          reason: args.reason,
        },
      };
    }
  );
}

/** Applying Not for Sale or Pledge routes through the same return rule. */
export async function setRestriction(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  plotId: string;
  restriction: "NONE" | "NOT_YET_RELEASED" | "NOT_FOR_SALE" | "PLEDGE";
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to change a Plot restriction.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLOT_SET_RESTRICTION",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { plotId: args.plotId, restriction: args.restriction },
    },
    async (tx) => {
      await lockPlot(tx, args.plotId);
      const plot = await tx.plot.findUniqueOrThrow({ where: { id: args.plotId } });

      if (!["AVAILABLE", "NOT_AVAILABLE"].includes(plot.lifecycle)) {
        blocked(
          `Plot is ${plot.lifecycle.replaceAll("_", " ").toLowerCase()}. Restrictions apply only to ` +
            `unallocated inventory — release the current allocation first.`
        );
      }

      const next = plotReturnState(args.restriction, args.reason);
      await tx.plot.update({
        where: { id: args.plotId },
        data: {
          restriction: args.restriction,
          restrictionReason: args.restriction === "NONE" ? null : args.reason,
          lifecycle: next.lifecycle,
        },
      });
      await tx.plotEvent.create({
        data: {
          plotId: args.plotId,
          actorRef: args.actorRef,
          action: "PLOT_RESTRICTION_CHANGED",
          fromLifecycle: plot.lifecycle,
          toLifecycle: next.lifecycle,
          fromRestriction: plot.restriction,
          toRestriction: args.restriction,
          reason: args.reason,
        },
      });

      return {
        result: { plotId: args.plotId, lifecycle: next.lifecycle, message: next.message },
        audit: {
          entity: "Plot",
          entityId: args.plotId,
          action: "PLOT_RESTRICTION_CHANGED",
          before: { restriction: plot.restriction, lifecycle: plot.lifecycle },
          after: { restriction: args.restriction, lifecycle: next.lifecycle },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * The one inventory query. The Plot Inventory page reads through this rather
 * than repeating the shape, so a change to what a row needs happens once.
 */
export function listPlots(projectId?: string) {
  return db.plot.findMany({
    where: projectId ? { projectId } : undefined,
    include: {
      project: true,
      boundaries: true,
      // FROZEN is included so a Plot Waiting for Booking Approval still shows
      // who it is held for, instead of an empty panel.
      holds: {
        where: { status: { in: ["ACTIVE", "FROZEN"] } },
        include: { person: true, extensionRequests: { where: { status: "PENDING" } } },
        take: 1,
      },
    },
    orderBy: [{ project: { name: "asc" } }, { plotType: "asc" }, { plotNumber: "asc" }],
    take: 500,
  });
}
