// Project and PLC rule setup — PRD.md §16.1, §16.3; main-PRD §16.
//
// PLC is a percentage only. A rule change never rewrites history: it creates the
// next version, and Holds and Bookings keep the snapshot they froze.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { blocked, runCommand } from "./command";

const D = Prisma.Decimal;

export type PlcComponentInput = { code: string; label: string; percent: string };

/**
 * PRD §16.1 — a Project starts as Setup / Not Active. Inventory can be prepared
 * while it is inactive; nothing may be sold until it is Active.
 */
export async function createProject(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  projectCode: string;
  name: string;
  type: "RESIDENTIAL" | "COMMERCIAL" | "MIXED";
  developer?: string | null;
  location?: string | null;
  reraNumber?: string | null;
  reraExpiryDate?: Date | null;
  /** PRD §11.6 — an External Resale Property Group holds acquired properties. */
  isExternalResaleGroup?: boolean;
  components: PlcComponentInput[];
}) {
  const code = args.projectCode.trim().toUpperCase();
  if (!code) blocked("A Project Code is required.");
  if (!args.name.trim()) blocked("A Project Name is required.");

  validateComponents(args.components);

  return runCommand<{ projectId: string; projectCode: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PROJECT_CREATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectCode: code, name: args.name, type: args.type },
    },
    async (tx) => {
      const clash = await tx.project.findUnique({ where: { projectCode: code } });
      if (clash) blocked(`Project Code ${code} already exists.`);

      const project = await tx.project.create({
        data: {
          projectCode: code,
          name: args.name.trim(),
          type: args.type,
          developer: args.developer?.trim() || null,
          location: args.location?.trim() || null,
          reraNumber: args.reraNumber?.trim() || null,
          reraExpiryDate: args.reraExpiryDate ?? null,
          isExternalResaleGroup: args.isExternalResaleGroup ?? false,
          lifecycle: "SETUP_NOT_ACTIVE",
        },
      });

      if (args.components.length > 0) {
        await tx.plcRuleVersion.create({
          data: {
            projectId: project.id,
            version: 1,
            isCurrent: true,
            createdBy: args.actorRef,
            reason: "Initial setup",
            components: {
              create: args.components.map((component) => ({
                code: component.code.trim().toUpperCase(),
                label: component.label.trim(),
                percent: new D(component.percent).toFixed(3),
              })),
            },
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

      return {
        result: { projectId: args.projectId, lifecycle: args.lifecycle },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: "PROJECT_LIFECYCLE_CHANGED",
          before: { lifecycle: project.lifecycle },
          after: { lifecycle: args.lifecycle },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * PRD §16.3 — a PLC change creates the next version and supersedes the current
 * one. Frozen snapshots on existing Holds and Bookings are untouched, which is
 * the whole point of snapshotting them.
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
      const latest = await tx.plcRuleVersion.findFirst({
        where: { projectId: args.projectId },
        orderBy: { version: "desc" },
      });

      await tx.plcRuleVersion.updateMany({
        where: { projectId: args.projectId, isCurrent: true },
        data: { isCurrent: false },
      });

      const version = await tx.plcRuleVersion.create({
        data: {
          projectId: args.projectId,
          version: (latest?.version ?? 0) + 1,
          isCurrent: true,
          createdBy: args.actorRef,
          reason: args.reason,
          components: {
            create: args.components.map((component) => ({
              code: component.code.trim().toUpperCase(),
              label: component.label.trim(),
              percent: new D(component.percent).toFixed(3),
            })),
          },
        },
      });

      return {
        result: { plcRuleVersionId: version.id, version: version.version },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: "PLC_REVISED",
          after: { version: version.version, components: args.components },
          reason: args.reason,
        },
      };
    }
  );
}

/** PRD §16.3 — percentage only, each code once, and nothing at or below zero. */
function validateComponents(components: readonly PlcComponentInput[]) {
  const seen = new Set<string>();
  for (const component of components) {
    const code = component.code.trim().toUpperCase();
    if (!code) blocked("Every PLC component needs a code.");
    if (!component.label.trim()) blocked(`PLC component ${code} needs a label.`);
    if (seen.has(code)) blocked(`PLC component ${code} appears twice.`);
    seen.add(code);

    let percent: Prisma.Decimal;
    try {
      percent = new D(component.percent);
    } catch {
      blocked(`PLC component ${code} has an invalid percentage.`);
    }
    if (percent!.lte(0)) blocked(`PLC component ${code} must be greater than 0%.`);
    if (percent!.gt(100)) blocked(`PLC component ${code} cannot exceed 100%.`);
  }
}

export function listProjects() {
  return db.project.findMany({
    include: {
      plcRuleVersions: {
        where: { isCurrent: true },
        include: { components: true },
        take: 1,
      },
      _count: { select: { plots: true } },
    },
    orderBy: { projectCode: "asc" },
  });
}
