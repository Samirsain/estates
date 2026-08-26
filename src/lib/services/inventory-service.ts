// Project and Plot setup — PRD.md §15, §16; DESIGN.md §7.

import type { BoundaryKind, BoundarySide, PlotType } from "@prisma/client";
import { db } from "@/lib/db";
import { buildPlcSnapshot, calculateAreas, plotReturnState, type AreaInput } from "@/lib/domain/inventory";
import { blocked, lockPlot, runCommand, type Tx } from "./command";
import { plcRules } from "./plc-service";

export type BoundaryInput = {
  side: BoundarySide;
  kind: BoundaryKind;
  /** Compulsory when the side is a Road — it decides the PLC band (PRD §16.2). */
  roadWidthFt?: string;
  /** What is on that side, if it is worth naming. Optional for every kind. */
  reference?: string;
};

export type PlotRow = {
  plotNumber: string;
  plotType: PlotType;
  widthFt?: string;
  lengthFt?: string;
  exactAreaSqFt?: string;
  exactAreaReason?: string;
  /** No PLC field: applicability derives from these (PLC spec §4.1). */
  boundaries?: BoundaryInput[];
};

/**
 * PRD §16.2 — a Road side needs its width. That one is not decoration: without
 * it there is no PLC band to land in, so the row is refused rather than saving
 * inventory that cannot be priced.
 *
 * Every other side's reference is optional. Knowing a Plot sits on the east side
 * is useful even when nobody recorded which Plot it is.
 */
function validateBoundaries(plotNumber: string, boundaries: readonly BoundaryInput[] | undefined) {
  const seen = new Set<BoundarySide>();
  for (const boundary of boundaries ?? []) {
    if (seen.has(boundary.side)) {
      blocked(`Plot ${plotNumber}: the ${boundary.side.toLowerCase()} side is listed twice.`);
    }
    seen.add(boundary.side);

    if (boundary.kind === "ROAD" && !boundary.roadWidthFt?.trim()) {
      blocked(`Plot ${plotNumber}: a Road side needs its road width.`);
    }
    if (boundary.kind === "ROAD" && Number(boundary.roadWidthFt) <= 0) {
      blocked(`Plot ${plotNumber}: road width must be greater than zero.`);
    }
  }
}

function boundaryRows(boundaries: readonly BoundaryInput[] | undefined) {
  return (boundaries ?? []).map((b) => ({
    side: b.side,
    kind: b.kind,
    roadWidthFt: b.kind === "ROAD" ? b.roadWidthFt ?? null : null,
    reference: b.kind === "ROAD" ? null : b.reference?.trim() || null,
  }));
}

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
      const project = await tx.project.findUniqueOrThrow({ where: { id: args.projectId } });

      // Fail the whole grid rather than saving half of it.
      const seen = new Set<string>();
      for (const row of args.rows) {
        const key = `${row.plotType}|${row.plotNumber.trim()}`;
        if (seen.has(key)) {
          blocked(`Plot ${row.plotNumber} (${row.plotType}) appears twice in this grid.`);
        }
        seen.add(key);

        // PRD §8.1 — a Commercial Project cannot contain a Residential Plot.
        if (project.type === "COMMERCIAL" && row.plotType === "RESIDENTIAL") {
          blocked(`Plot ${row.plotNumber}: a Commercial Project cannot contain a Residential Plot.`);
        }
        validateBoundaries(row.plotNumber, row.boundaries);
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
            areaSqFt: areas.areaSqFt.toFixed(4),
            areaSqYd: areas.areaSqYd.toFixed(4),
            areaSqM: areas.areaSqM.toFixed(4),
            // New inventory starts unreleased; Admin/MD releases it (PRD §16.1).
            lifecycle: "NOT_AVAILABLE",
            restriction: "NOT_YET_RELEASED",
            boundaries: { create: boundaryRows(row.boundaries) },
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
 * PRD §8.4 "Edit Plot Details" — the authorised correction that had no home.
 * Until now a Plot's dimensions and boundaries could only be set once, at
 * Prepare Inventory, and never fixed; a wrong road width was wrong for the life
 * of the Plot, and with it the PLC.
 *
 * PRD §8.7 governs it: a compulsory reason, old and new kept in History, and
 * revalidation of PLC. The first two are written below. The third needs no code
 * of its own — effective PLC derives from these boundaries on every read, so an
 * Available Plot is already correct the moment this returns. What a frozen Hold
 * or Booking snapshot froze is deliberately untouched (PLC spec §7.2): this
 * reports that the snapshot no longer matches, and correctPlcSnapshot is the
 * separate, audited decision to carry the fix into it.
 */
export async function updatePlotDetails(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  plotId: string;
  widthFt?: string;
  lengthFt?: string;
  exactAreaSqFt?: string;
  exactAreaReason?: string;
  boundaries: BoundaryInput[];
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to edit Plot details.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLOT_UPDATE_DETAILS",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { plotId: args.plotId },
    },
    async (tx) => {
      await lockPlot(tx, args.plotId);
      const plot = await tx.plot.findUniqueOrThrow({
        where: { id: args.plotId },
        include: {
          boundaries: true,
          plcSnapshots: { where: { isCurrent: true }, take: 1 },
          project: {
            include: {
              plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 },
            },
          },
        },
      });

      validateBoundaries(plot.plotNumber, args.boundaries);
      const areas = calculateAreas(
        areaInput({
          plotNumber: plot.plotNumber,
          plotType: plot.plotType,
          widthFt: args.widthFt,
          lengthFt: args.lengthFt,
          exactAreaSqFt: args.exactAreaSqFt,
          exactAreaReason: args.exactAreaReason,
        })
      );

      const before = {
        widthFt: plot.widthFt?.toString() ?? null,
        lengthFt: plot.lengthFt?.toString() ?? null,
        areaSqFt: plot.areaSqFt.toFixed(4),
        boundaries: plot.boundaries.map((b) => ({
          side: b.side,
          kind: b.kind,
          roadWidthFt: b.roadWidthFt?.toString() ?? null,
          reference: b.reference,
        })),
      };

      // Replaced wholesale: the four sides are one fact about the Plot, and
      // patching them side by side would let a half-applied edit survive.
      await tx.plotBoundary.deleteMany({ where: { plotId: args.plotId } });
      await tx.plot.update({
        where: { id: args.plotId },
        data: {
          widthFt: args.widthFt ?? null,
          lengthFt: args.lengthFt ?? null,
          exactAreaSqFt: args.exactAreaSqFt ?? null,
          exactAreaReason: args.exactAreaReason ?? null,
          areaSqFt: areas.areaSqFt.toFixed(4),
          areaSqYd: areas.areaSqYd.toFixed(4),
          areaSqM: areas.areaSqM.toFixed(4),
          boundaries: { create: boundaryRows(args.boundaries) },
        },
      });

      // PRD §8.7 revalidation. The Plot's own PLC is already right; the question
      // this answers is whether a frozen snapshot has drifted away from it.
      const version = plot.project.plcRuleVersions[0];
      const frozen = plot.plcSnapshots[0] ?? null;
      let plcSnapshotNeedsCorrection = false;
      if (version && frozen) {
        try {
          const effective = buildPlcSnapshot(args.boundaries, plcRules(version.components));
          plcSnapshotNeedsCorrection = !effective.totalPercent.equals(frozen.totalPercent);
        } catch {
          // An unevaluable configuration is a PLC problem, not a reason to
          // refuse a boundary correction that may be what fixes it.
          plcSnapshotNeedsCorrection = true;
        }
      }

      const after = {
        widthFt: args.widthFt ?? null,
        lengthFt: args.lengthFt ?? null,
        areaSqFt: areas.areaSqFt.toFixed(4),
        boundaries: boundaryRows(args.boundaries),
      };

      await tx.plotEvent.create({
        data: {
          plotId: args.plotId,
          actorRef: args.actorRef,
          action: "PLOT_DETAILS_CORRECTED",
          reason: args.reason,
        },
      });

      return {
        result: { plotId: args.plotId, plcSnapshotNeedsCorrection },
        audit: {
          entity: "Plot",
          entityId: args.plotId,
          action: "PLOT_DETAILS_CORRECTED",
          before,
          after,
          reason: args.reason,
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
 * One Plot, with everything DESIGN §7.2 puts on its page. Payment and
 * commission are deliberately not read here: the Booking owns both and its own
 * screen shows them, so the page links there rather than growing a second copy
 * that has to be kept in step.
 */
export function getPlot(plotId: string) {
  return db.plot.findUnique({
    where: { id: plotId },
    include: {
      project: {
        include: {
          plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 },
        },
      },
      boundaries: true,
      holds: {
        where: { status: { in: ["ACTIVE", "FROZEN"] } },
        include: { person: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      bookings: {
        orderBy: { createdAt: "desc" },
        include: { primaryPerson: true },
        take: 1,
      },
      // Append-only, newest first (PRD §23.5).
      events: { orderBy: { at: "desc" }, take: 50 },
    },
  });
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
        include: {
          person: true,
          // Decided requests as well as the pending one: an Admin deciding a
          // further extension is deciding it against the ones before it.
          extensionRequests: { orderBy: { createdAt: "desc" }, take: 5 },
        },
        take: 1,
      },
      // Why this Plot was held before, for the Hold dialog to show. A Plot that
      // has been held and let go three times is worth knowing about before
      // holding it a fourth, and the reason was already being written here.
      // Three, not all of them: this is context beside a form, not a history.
      events: {
        where: { action: "HOLD_CREATED" },
        orderBy: { at: "desc" },
        take: 3,
      },
    },
    orderBy: [{ project: { name: "asc" } }, { plotType: "asc" }, { plotNumber: "asc" }],
    take: 500,
  });
}
