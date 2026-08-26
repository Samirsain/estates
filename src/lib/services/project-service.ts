// Project and PLC rule setup — PRD.md §16.1, §16.3; main-PRD §16.
//
// PLC is a percentage only. A rule change never rewrites history: it creates the
// next version, and Holds and Bookings keep the snapshot they froze.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  PLC_CATEGORIES,
  buildPlcSnapshot,
  normaliseLink,
  plcComponentLabel,
  releaseOnActivation,
  validatePlcComponents,
  type PlcCategory,
} from "@/lib/domain/inventory";
import { blocked, runCommand, type Tx } from "./command";
import { plcRules } from "./plc-service";

const D = Prisma.Decimal;

/**
 * A configured PLC row. There is no code and no label: the category comes from
 * the fixed catalogue, the band is a number, and the label is generated from
 * both. Nothing here is free text.
 */
export type PlcComponentInput = {
  category: PlcCategory;
  threshold?: string | null;
  percent: string;
  remark?: string | null;
};

/**
 * A Project could not be changed at all until now: the service offered
 * createProject and setProjectLifecycle and nothing else, so a name typed
 * wrongly at setup stayed wrong for the life of the Project.
 *
 * Two fields are missing on purpose. The Project Code is generated and is what
 * ties an issued export back to what it described. The External Resale Property
 * Group flag is what PRD §11.6 uses to tell a development Project from an
 * acquisition container, so flipping it would change the meaning of records
 * already attached to it. Lifecycle keeps its own command: moving a Project to
 * Active is a release decision, not an edit.
 */
export async function updateProject(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  projectId: string;
  name: string;
  /** MIXED is no longer offered for a new Project, but one that already
   *  carries it must be able to save without silently changing type. */
  type: "RESIDENTIAL" | "COMMERCIAL" | "AGRICULTURAL" | "MIXED";
  developer?: string | null;
  location?: string | null;
  locationUrl?: string | null;
  driveUrl?: string | null;
  city?: string | null;
  amenities?: string | null;
  reraNumber?: string | null;
  reason: string;
}) {
  if (!args.name.trim()) blocked("A Project Name is required.");
  if (!args.reason.trim()) blocked("A compulsory reason is required to change a Project.");

  return runCommand<{ projectId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PROJECT_UPDATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, name: args.name, type: args.type },
    },
    async (tx) => {
      const snapshot = (project: {
        name: string;
        type: string;
        developer: string | null;
        location: string | null;
        locationUrl: string | null;
        driveUrl: string | null;
        city: string | null;
        amenities: string | null;
        reraNumber: string | null;
      }) => ({
        name: project.name,
        type: project.type,
        developer: project.developer,
        location: project.location,
        locationUrl: project.locationUrl,
        driveUrl: project.driveUrl,
        city: project.city,
        amenities: project.amenities,
        reraNumber: project.reraNumber,
      });

      const before = await tx.project.findUniqueOrThrow({ where: { id: args.projectId } });
      const after = await tx.project.update({
        where: { id: args.projectId },
        data: {
          name: args.name.trim(),
          type: args.type,
          developer: args.developer?.trim() || null,
          location: args.location?.trim() || null,
          locationUrl: normaliseLink(args.locationUrl, "Location link"),
          driveUrl: normaliseLink(args.driveUrl, "Structure and layout link"),
          city: args.city?.trim() || null,
          amenities: args.amenities?.trim() || null,
          reraNumber: args.reraNumber?.trim() || null,
        },
      });

      return {
        result: { projectId: after.id },
        audit: {
          entity: "Project",
          entityId: after.id,
          action: "PROJECT_UPDATED",
          before: snapshot(before),
          after: snapshot(after),
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * PRD §16.1 — a Project starts as Setup / Not Active. Inventory can be prepared
 * while it is inactive; nothing may be sold until it is Active.
 */
/**
 * The Project Code is no longer typed. It stays in the database, unique, and
 * remains the key that ties a report or an export back to a Project — but
 * nobody should have to invent one, and Project.name carries no uniqueness to
 * replace it with.
 */
async function generateProjectCode(tx: Tx, name: string): Promise<string> {
  const stem = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "PRJ";

  const taken = await tx.project.findMany({
    where: { projectCode: { startsWith: `${stem}-` } },
    select: { projectCode: true },
  });
  const used = new Set(taken.map((p) => p.projectCode));

  for (let n = 1; n < 100; n += 1) {
    const candidate = `${stem}-${String(n).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  blocked(`Too many Projects already share the code ${stem}. Give this one a different name.`);
}

export async function createProject(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  name: string;
  /** MIXED is absent on purpose: it cannot be created, only carried forward. */
  type: "RESIDENTIAL" | "COMMERCIAL" | "AGRICULTURAL";
  developer?: string | null;
  location?: string | null;
  locationUrl?: string | null;
  driveUrl?: string | null;
  city?: string | null;
  /** One amenity per line. */
  amenities?: string | null;
  reraNumber?: string | null;
  /** PRD §11.6 — an External Resale Property Group holds acquired properties. */
  isExternalResaleGroup?: boolean;
  components: PlcComponentInput[];
}) {
  if (!args.name.trim()) blocked("A Project Name is required.");

  validateComponents(args.components);

  return runCommand<{ projectId: string; projectCode: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PROJECT_CREATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { name: args.name, type: args.type },
    },
    async (tx) => {
      const code = await generateProjectCode(tx, args.name);

      const project = await tx.project.create({
        data: {
          projectCode: code,
          name: args.name.trim(),
          type: args.type,
          developer: args.developer?.trim() || null,
          location: args.location?.trim() || null,
          locationUrl: normaliseLink(args.locationUrl, "Location link"),
          driveUrl: normaliseLink(args.driveUrl, "Structure and layout link"),
          city: args.city?.trim() || null,
          amenities: args.amenities?.trim() || null,
          reraNumber: args.reraNumber?.trim() || null,
          isExternalResaleGroup: args.isExternalResaleGroup ?? false,
          lifecycle: "SETUP_NOT_ACTIVE",
        },
      });

      if (args.components.length > 0) {
        const now = new Date();
        await tx.plcRuleVersion.create({
          data: {
            projectId: project.id,
            version: 1,
            status: "PUBLISHED",
            effectiveFrom: now,
            publishedBy: args.actorRef,
            publishedAt: now,
            createdBy: args.actorRef,
            reason: "Initial setup",
            components: { create: componentRows(args.components) },
          },
        });
      }

      return {
        result: { projectId: project.id, projectCode: project.projectCode },
        audit: {
          entity: "Project",
          entityId: project.id,
          action: "PROJECT_CREATED",
          after: { projectCode: project.projectCode, name: project.name, type: project.type },
        },
      };
    }
  );
}

/** PRD §16.1 — the lifecycle gate on selling. */
export async function setProjectLifecycle(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  projectId: string;
  lifecycle: "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED";
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to change a Project lifecycle.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PROJECT_LIFECYCLE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, lifecycle: args.lifecycle },
    },
    async (tx) => {
      const project = await tx.project.findUniqueOrThrow({ where: { id: args.projectId } });
      if (project.lifecycle === args.lifecycle) {
        blocked(`This Project is already ${args.lifecycle.replaceAll("_", " ").toLowerCase()}.`);
      }

      // Closing a Project with live allocations would strand them.
      if (args.lifecycle === "SOLD_OUT" || args.lifecycle === "COMPLETED") {
        const live = await tx.plot.count({
          where: {
            projectId: args.projectId,
            lifecycle: { in: ["HOLD", "WAITING_FOR_BOOKING_APPROVAL", "BOOKED", "PAYMENT_COMPLETED"] },
          },
        });
        if (live > 0) {
          blocked(
            `${live} Plot(s) still hold a live allocation. Complete or release them before marking ` +
              `the Project ${args.lifecycle.replaceAll("_", " ").toLowerCase()}.`
          );
        }
      }

      await tx.project.update({
        where: { id: args.projectId },
        data: { lifecycle: args.lifecycle },
      });

      // Activating a Project releases the inventory that was only waiting on it.
      //
      // A Plot is created Not Available / Not Yet Released, and until now every
      // one of them had to be released by hand afterwards — a hundred Plots was
      // a hundred clicks to say the one thing the activation already said.
      //
      // Two filters decide what moves, and between them they protect everything
      // that matters. The lifecycle filter takes only NOT_AVAILABLE, so a Hold,
      // a Booking under review, a Booked or Delivered Plot is never touched.
      // The restriction filter takes only NONE and NOT_YET_RELEASED, so Not for
      // Sale and Pledge survive — those are decisions somebody made about that
      // Plot, and a Project-wide action must not overrule them. NOT_YET_RELEASED
      // is cleared on purpose: it is not a restriction anyone chose, it is the
      // absence of this very release.
      let released = 0;
      let heldBack = 0;
      let restricted = 0;

      if (args.lifecycle === "ACTIVE") {
        const plots = await tx.plot.findMany({
          where: { projectId: args.projectId },
          select: { id: true, lifecycle: true, restriction: true },
        });

        for (const plot of plots) {
          const outcome = releaseOnActivation(plot.lifecycle, plot.restriction);
          if (outcome === "ALLOCATED") {
            heldBack++;
            continue;
          }
          if (outcome === "RESTRICTED") {
            restricted++;
            continue;
          }

          await tx.plot.update({
            where: { id: plot.id },
            data: { lifecycle: "AVAILABLE", restriction: "NONE", restrictionReason: null },
          });
          // ARCHITECTURE §3.2 — the Plot's history is append-only, and a release
          // that left no event would be a state change nobody could trace.
          await tx.plotEvent.create({
            data: {
              plotId: plot.id,
              actorRef: args.actorRef,
              action: "PLOT_MADE_AVAILABLE",
              fromLifecycle: plot.lifecycle,
              toLifecycle: "AVAILABLE",
              fromRestriction: plot.restriction,
              toRestriction: "NONE",
              reason: `Project activated — ${args.reason}`,
            },
          });
          released++;
        }
      }

      return {
        result: {
          projectId: args.projectId,
          lifecycle: args.lifecycle,
          released,
          heldBack,
          restricted,
        },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: "PROJECT_LIFECYCLE_CHANGED",
          before: { lifecycle: project.lifecycle },
          after: { lifecycle: args.lifecycle, plotsReleased: released },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * PLC spec §3.1 — a new version is prepared as a Draft. It changes nothing:
 * inventory keeps using the published version until the draft is published.
 */
export async function savePlcDraft(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  projectId: string;
  components: PlcComponentInput[];
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to draft a PLC version.");
  validateComponents(args.components);

  return runCommand<{ plcRuleVersionId: string; version: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLC_DRAFT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, components: args.components },
    },
    async (tx) => {
      const version = await createDraft(tx, args);
      return {
        result: { plcRuleVersionId: version.id, version: version.version },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: "PLC_DRAFTED",
          after: { version: version.version, components: args.components },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * PLC spec §3.5 — publishing is atomic: the draft becomes the one published
 * version, the previous one is closed and marked superseded, and the whole
 * history is preserved. Two simultaneous publishes cannot both win — the
 * one_published_plc_version_per_project index refuses the second, rather than a
 * read-then-write check that can interleave.
 */
export async function publishPlcVersion(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  plcRuleVersionId: string;
}) {
  return runCommand<{
    plcRuleVersionId: string;
    version: number;
    supersededVersion: number | null;
  }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLC_PUBLISH",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { plcRuleVersionId: args.plcRuleVersionId },
    },
    async (tx) => {
      const draft = await tx.plcRuleVersion.findUnique({
        where: { id: args.plcRuleVersionId },
        include: { components: true },
      });
      if (!draft) blocked("That PLC version no longer exists.");
      // PLC spec §3.4 — a published version is never edited or published again.
      if (draft.status !== "DRAFT") {
        blocked(
          `PLC version ${draft.version} is already ${draft.status.toLowerCase()} and cannot be published again.`
        );
      }
      if (draft.components.length === 0) {
        blocked("A PLC version needs at least one component before it is published.");
      }

      const superseded = await publishDraft(tx, draft.projectId, draft.id, args.actorRef);

      return {
        result: {
          plcRuleVersionId: draft.id,
          version: draft.version,
          supersededVersion: superseded?.version ?? null,
        },
        audit: {
          entity: "Project",
          entityId: draft.projectId,
          action: "PLC_PUBLISHED",
          before: superseded ? { version: superseded.version } : undefined,
          after: { version: draft.version },
          reason: draft.reason,
        },
      };
    }
  );
}

/**
 * PRD §16.3 — a PLC change creates the next version and supersedes the current
 * one. Frozen snapshots on existing Holds and Bookings are untouched, which is
 * the whole point of snapshotting them.
 *
 * Draft and publish in one transaction, for the setup screen that revises and
 * publishes in a single step. A staged change calls savePlcDraft first.
 */
export async function revisePlcRules(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  projectId: string;
  components: PlcComponentInput[];
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to revise PLC rules.");
  validateComponents(args.components);

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLC_REVISE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, components: args.components },
    },
    async (tx) => {
      if (args.components.length === 0) {
        blocked("A PLC version needs at least one component before it is published.");
      }
      const version = await createDraft(tx, args);
      const superseded = await publishDraft(tx, args.projectId, version.id, args.actorRef);

      return {
        result: { plcRuleVersionId: version.id, version: version.version },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: "PLC_REVISED",
          before: superseded ? { version: superseded.version } : undefined,
          after: { version: version.version, components: args.components },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * PLC spec §7.2, §11 — a frozen snapshot is never rewritten. The correction
 * builds a fresh snapshot from the corrected applicability, links it to the old
 * one, and repoints the Hold, Booking and Change Plot that were reading it. The
 * old snapshot stays, superseded and searchable, with its own totals intact.
 *
 * The corrected snapshot keeps the rule version the original froze. Correcting
 * which version applies is a different correction and must not ride in on this
 * one.
 */
export async function correctPlcSnapshot(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  snapshotId: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to correct a PLC snapshot.");

  return runCommand<{
    snapshotId: string;
    oldTotalPercent: string;
    newTotalPercent: string;
  }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PLC_SNAPSHOT_CORRECT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { snapshotId: args.snapshotId },
    },
    async (tx) => {
      const old = await tx.plcSnapshot.findUnique({
        where: { id: args.snapshotId },
        include: { ruleVersion: { include: { components: true } }, plot: { include: { boundaries: true } } },
      });
      if (!old) blocked("That PLC snapshot no longer exists.");
      if (!old.isCurrent) {
        blocked("That PLC snapshot has already been superseded. Correct the current one instead.");
      }

      // The correction re-derives from the Plot's boundaries as they stand now,
      // against the rule version the snapshot froze. There is no applicability
      // to retype: an authorised Plot correction fixes the boundary, and this
      // carries that fix into the frozen record (PRD §8.7).
      let rebuilt: ReturnType<typeof buildPlcSnapshot>;
      try {
        rebuilt = buildPlcSnapshot(old.plot.boundaries, plcRules(old.ruleVersion.components));
      } catch (error) {
        // PLC spec §5.3 — a configuration that cannot be evaluated is refused,
        // never quietly reduced to a smaller total.
        blocked(
          error instanceof Error ? error.message : "The corrected PLC applicability is not valid."
        );
      }

      const corrected = await tx.plcSnapshot.create({
        data: {
          ruleVersionId: old.ruleVersionId,
          plotId: old.plotId,
          components: rebuilt!.components as never,
          totalPercent: rebuilt!.totalPercent.toFixed(4),
          correctionReason: args.reason.trim(),
          correctedBy: args.actorRef,
        },
      });

      await tx.plcSnapshot.update({
        where: { id: old.id },
        data: { isCurrent: false, supersededById: corrected.id },
      });

      // Everything that was reading the old snapshot now reads the corrected
      // one. The old row keeps its own numbers for History.
      await tx.hold.updateMany({
        where: { plcSnapshotId: old.id },
        data: { plcSnapshotId: corrected.id },
      });
      await tx.booking.updateMany({
        where: { plcSnapshotId: old.id },
        data: { plcSnapshotId: corrected.id },
      });
      await tx.changePlotRequest.updateMany({
        where: { replacementPlcSnapshotId: old.id },
        data: { replacementPlcSnapshotId: corrected.id },
      });

      return {
        result: {
          snapshotId: corrected.id,
          oldTotalPercent: old.totalPercent.toFixed(4),
          newTotalPercent: corrected.totalPercent.toFixed(4),
        },
        audit: {
          entity: "PlcSnapshot",
          entityId: corrected.id,
          action: "PLC_SNAPSHOT_CORRECTED",
          before: {
            snapshotId: old.id,
            totalPercent: old.totalPercent.toFixed(4),
            components: old.components,
          },
          after: {
            totalPercent: corrected.totalPercent.toFixed(4),
            components: corrected.components,
          },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * The correction chain that ends at this snapshot, oldest first — PLC spec
 * §11.3, §15.3. Built from one query rather than a recursive include, so a
 * chain of any depth is returned whole.
 */
export async function plcSnapshotHistory(snapshotId: string) {
  const current = await db.plcSnapshot.findUnique({
    where: { id: snapshotId },
    include: { ruleVersion: true },
  });
  if (!current) return [];

  const onThisPlot = await db.plcSnapshot.findMany({
    where: { plotId: current.plotId },
    include: { ruleVersion: true },
  });
  const predecessorOf = new Map(
    onThisPlot.filter((s) => s.supersededById).map((s) => [s.supersededById!, s])
  );

  const chain = [current];
  for (let node = predecessorOf.get(current.id); node; node = predecessorOf.get(node.id)) {
    chain.unshift(node);
  }
  return chain;
}

function componentRows(components: readonly PlcComponentInput[]) {
  return components.map((component) => ({
    category: component.category,
    threshold: PLC_CATEGORIES[component.category].banded ? new D(component.threshold!).toFixed(2) : null,
    percent: new D(component.percent).toFixed(4),
    remark: component.remark || null,
  }));
}

/** The next version number for the Project, as a Draft that changes nothing. */
async function createDraft(
  tx: Tx,
  args: { projectId: string; actorRef: string; components: PlcComponentInput[]; reason: string }
) {
  const latest = await tx.plcRuleVersion.findFirst({
    where: { projectId: args.projectId },
    orderBy: { version: "desc" },
  });

  return tx.plcRuleVersion.create({
    data: {
      projectId: args.projectId,
      version: (latest?.version ?? 0) + 1,
      status: "DRAFT",
      createdBy: args.actorRef,
      reason: args.reason,
      components: { create: componentRows(args.components) },
    },
  });
}

/** Closes the published version, then promotes the draft (§3.5). */
async function publishDraft(tx: Tx, projectId: string, draftId: string, actorRef: string) {
  const now = new Date();
  const current = await tx.plcRuleVersion.findFirst({
    where: { projectId, status: "PUBLISHED" },
  });

  if (current) {
    await tx.plcRuleVersion.update({
      where: { id: current.id },
      data: { status: "SUPERSEDED", effectiveTo: now, supersededById: draftId },
    });
  }

  await tx.plcRuleVersion.update({
    where: { id: draftId },
    data: { status: "PUBLISHED", effectiveFrom: now, publishedBy: actorRef, publishedAt: now },
  });

  return current;
}

/**
 * PRD §16.3 and PLC spec §5.2 — percentage only, one row per category and band,
 * and nothing at or below zero. The shape rules (which categories take a band,
 * what a band may hold) live with the calculation in the domain layer, so the
 * screen and the publish check can never disagree about them.
 */
function validateComponents(components: readonly PlcComponentInput[]) {
  try {
    validatePlcComponents(components);
  } catch (error) {
    blocked(error instanceof Error ? error.message : "The PLC configuration is not valid.");
  }

  for (const component of components) {
    const name = plcComponentLabel(component.category, component.threshold);
    let percent: Prisma.Decimal;
    try {
      percent = new D(component.percent);
    } catch {
      blocked(`${name} has an invalid percentage.`);
    }
    if (percent!.lt(0)) blocked(`${name} cannot be a negative percentage.`);
    if (percent!.gt(100)) blocked(`${name} cannot exceed 100%.`);
  }
}

/**
 * PLC spec §15.1 — the setup screen shows the published version, any draft and
 * the version history together, so "what applies now" and "what changed when"
 * are answerable from one place. Newest version first.
 */
export async function listProjects() {
  // The breakdown is counted in the database rather than by loading every Plot:
  // a Project with five hundred Plots should not cost five hundred rows to say
  // how many of each type it holds.
  const [projects, byType] = await Promise.all([
    db.project.findMany({
      include: {
        plcRuleVersions: {
          include: { components: { orderBy: [{ category: "asc" }, { threshold: "desc" }] } },
          orderBy: { version: "desc" },
        },
        _count: { select: { plots: true } },
      },
      orderBy: { projectCode: "asc" },
    }),
    db.plot.groupBy({ by: ["projectId", "plotType"], _count: { _all: true } }),
  ]);

  return projects.map((project) => ({
    ...project,
    plotTypeCounts: byType
      .filter((row) => row.projectId === project.id)
      .map((row) => ({ plotType: row.plotType, count: row._count._all })),
  }));
}
