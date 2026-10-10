// Project commission settings — SSOT §12–§16; Change Pack §7, §8, §65 NT01.
//
// Admin prepares and sends; MD approves or rejects. An approved version takes
// effect at its Effective from — at approval when none was proposed — never
// earlier than the approval (SSOT §16), and then supersedes the previous one.
// One with a later time waits as Approved until a scheduled job, or the next
// Booking Request on the Project, activates it. Nothing is edited after it
// leaves Draft (SSOT §14 "no silent overwrite"); every change is a new version.

import { db } from "@/lib/db";
import {
  needsLoyaltyException,
  rateLabel,
  validateCommissionTerms,
  type CommissionTermsInput,
} from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";

export type CommissionVersionInput = CommissionTermsInput & {
  reason: string;
  /** CP §7.1 — optional, future only. Null takes effect at MD approval. */
  effectiveFrom?: Date | null;
};

/** CP §65 NT01 — Project Commercial Settings Approval, assigned to MD. */
export const SETTINGS_APPROVAL_PURPOSE = "COMMISSION_VERSION_APPROVAL";

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

const termsData = (t: CommissionVersionInput) => ({
  directEnabled: t.directEnabled,
  directPercent: t.directEnabled ? t.directPercent!.trim() : null,
  loyaltyEnabled: t.loyaltyEnabled,
  loyaltyPercent: t.loyaltyEnabled ? t.loyaltyPercent!.trim() : null,
  loyaltyExceptionReason: t.loyaltyExceptionReason?.trim() || null,
  reason: t.reason.trim(),
  effectiveFrom: t.effectiveFrom ?? null,
});

/**
 * The checks every prepared version passes, wherever it is prepared — the
 * Project page or the create form.
 */
export function checkPreparable(actorRole: string, input: CommissionVersionInput) {
  if (actorRole !== "ADMIN") blocked("Only Admin prepares commission settings.");
  if (!input.reason.trim()) blocked("A compulsory reason is required for a commission settings version.");
  const valid = validateCommissionTerms(input);
  if (!valid.ok) blocked(valid.reason);
  if (input.effectiveFrom && input.effectiveFrom.getTime() <= Date.now()) {
    blocked("Effective from must be in the future, or left empty to take effect on MD approval.");
  }
}

/** A new Draft, numbered after the Project's latest version. */
export async function insertDraft(tx: Tx, projectId: string, actorRef: string, input: CommissionVersionInput) {
  const latest = await tx.projectCommissionVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return tx.projectCommissionVersion.create({
    data: {
      projectId,
      version: (latest?.version ?? 0) + 1,
      ...termsData(input),
      preparedByRef: actorRef,
    },
  });
}

/** Serialises every write to one Project's versions. */
const lockProject = (tx: Tx, projectId: string) => lockKey(tx, `commission-version:${projectId}`);

/** The version, read after the Project lock so a concurrent change is seen. */
async function lockedVersion(tx: Tx, versionId: string) {
  const found = await tx.projectCommissionVersion.findUnique({
    where: { id: versionId },
    select: { projectId: true },
  });
  if (!found) blocked("That commission settings version no longer exists.");
  await lockProject(tx, found.projectId);
  return tx.projectCommissionVersion.findUniqueOrThrow({ where: { id: versionId } });
}

/**
 * v2.1 §14 step 1 — Admin creates the Draft, or edits it while it is still one.
 * A Draft is the only state that can be edited.
 */
export async function prepareCommissionDraft(args: Actor & { projectId: string } & CommissionVersionInput) {
  checkPreparable(args.actorRole, args);

  return runCommand<{ versionId: string; version: number; projectId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_VERSION_PREPARE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, ...termsData(args) },
    },
    async (tx) => {
      await lockProject(tx, args.projectId);
      await activateDueVersions(tx, args.projectId);
      const open = await tx.projectCommissionVersion.findFirst({
        where: { projectId: args.projectId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
      });
      if (open?.status === "PENDING_APPROVAL") {
        blocked(`Version ${open.version} is waiting for MD. It can no longer be edited.`);
      }
      if (open?.status === "APPROVED") {
        blocked(
          `Version ${open.version} is approved and takes effect on ${formatIst(open.effectiveFrom!)}. ` +
            `Prepare the next version after it takes effect.`
        );
      }

      const saved = open
        ? await tx.projectCommissionVersion.update({
            where: { id: open.id },
            data: { ...termsData(args), preparedByRef: args.actorRef, preparedAt: new Date() },
          })
        : await insertDraft(tx, args.projectId, args.actorRef, args);

      return {
        result: { versionId: saved.id, version: saved.version, projectId: args.projectId },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: open ? "COMMISSION_VERSION_EDITED" : "COMMISSION_VERSION_DRAFTED",
          after: { version: saved.version, ...termsData(args) },
          reason: args.reason,
        },
      };
    }
  );
}

/** v2.1 §14 step 2 — Admin sends the Draft to MD; it can no longer be edited. */
export async function sendCommissionVersion(args: Actor & { versionId: string }) {
  if (args.actorRole !== "ADMIN") blocked("Only Admin sends commission settings to MD.");

  return runCommand<{ versionId: string; version: number; projectId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_VERSION_SEND",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { versionId: args.versionId },
    },
    async (tx) => {
      const version = await lockedVersion(tx, args.versionId);
      if (version.status !== "DRAFT") blocked("Only a Draft can be edited or sent.");
      if (version.effectiveFrom && version.effectiveFrom.getTime() <= Date.now()) {
        blocked("Its Effective from has already passed. Edit the Draft and choose a later time, or leave it empty.");
      }
      await tx.projectCommissionVersion.update({
        where: { id: version.id },
        data: { status: "PENDING_APPROVAL", submittedAt: new Date() },
      });
      const project = await tx.project.findUniqueOrThrow({ where: { id: version.projectId } });
      const rate = (enabled: boolean, percent: { toString(): string } | null) =>
        enabled && percent ? `${rateLabel(percent.toString())}%` : "Disabled";
      await ensureTask(tx, {
        recordKind: "Project",
        recordId: version.projectId,
        recordName: `${project.projectCode} · ${project.name}`,
        purpose: SETTINGS_APPROVAL_PURPOSE,
        title: "Project Commercial Settings Approval",
        assigneeRole: "MD",
        dueAt: new Date(),
        decision: true,
        latestResult:
          `Version ${version.version}: Direct ${rate(version.directEnabled, version.directPercent)}, ` +
          `Loyalty ${rate(version.loyaltyEnabled, version.loyaltyPercent)}` +
          (version.loyaltyExceptionReason ? `. MD exception: ${version.loyaltyExceptionReason}` : "") +
          (version.effectiveFrom ? `. Effective from ${formatIst(version.effectiveFrom)}` : ""),
      });
      return {
        result: { versionId: version.id, version: version.version, projectId: version.projectId },
        audit: {
          entity: "Project",
          entityId: version.projectId,
          action: "COMMISSION_VERSION_SENT",
          after: { version: version.version },
        },
      };
    }
  );
}

/**
 * SSOT §13, §14, §16; CP §7.3, §8 — MD approves or rejects with a note. An
 * approval takes effect now, or waits as Approved for a proposed later time; a
 * proposed time that has already passed is refused (no backdating). MD's
 * approval of a version that needs the Loyalty exception is that exception,
 * with its written reason and audit.
 */
export async function decideCommissionVersion(args: Actor & { versionId: string; approve: boolean; note: string }) {
  if (args.actorRole !== "MD") blocked("Only MD approves or rejects commission settings.");
  if (!args.note.trim()) blocked("A compulsory note is required on the MD decision.");

  return runCommand<{
    versionId: string;
    version: number;
    projectId: string;
    status: "APPROVED" | "ACTIVE" | "REJECTED";
    supersededVersion: number | null;
  }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_VERSION_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { versionId: args.versionId, approve: args.approve },
    },
    async (tx) => {
      const version = await lockedVersion(tx, args.versionId);
      if (version.status !== "PENDING_APPROVAL") {
        blocked(`Version ${version.version} is not waiting for MD.`);
      }
      const now = new Date();
      const decision = { decidedByRef: args.actorRef, decidedAt: now, decisionNote: args.note.trim() };
      const ids = { versionId: version.id, version: version.version, projectId: version.projectId };

      if (args.approve && version.effectiveFrom && version.effectiveFrom < now) {
        blocked(
          `Version ${version.version}'s Effective from (${formatIst(version.effectiveFrom)}) has already ` +
            `passed, and a version cannot take effect before its approval. Reject it so Admin can prepare ` +
            `it again with a later time.`
        );
      }
      await closeTasksFor(
        tx,
        "Project",
        version.projectId,
        args.actorRef,
        `${args.approve ? "Approved" : "Rejected"} — ${args.note.trim()}`,
        SETTINGS_APPROVAL_PURPOSE
      );

      if (!args.approve) {
        await tx.projectCommissionVersion.update({
          where: { id: version.id },
          data: { status: "REJECTED", ...decision },
        });
        return {
          result: { ...ids, status: "REJECTED" as const, supersededVersion: null },
          audit: {
            entity: "Project",
            entityId: version.projectId,
            action: "COMMISSION_VERSION_REJECTED",
            after: { version: version.version },
            reason: args.note,
          },
        };
      }

      // CP §8 — a later Effective from waits as Approved; nothing changes yet.
      const waits = version.effectiveFrom !== null && version.effectiveFrom > now;
      await tx.projectCommissionVersion.update({
        where: { id: version.id },
        data: { status: "APPROVED", ...decision, effectiveFrom: waits ? version.effectiveFrom : now },
      });
      const superseded = waits ? null : await activate(tx, version.id, now);

      return {
        result: {
          ...ids,
          status: waits ? ("APPROVED" as const) : ("ACTIVE" as const),
          supersededVersion: superseded?.version ?? null,
        },
        audit: {
          entity: "Project",
          entityId: version.projectId,
          action: "COMMISSION_VERSION_APPROVED",
          before: superseded ? { version: superseded.version } : undefined,
          after: {
            version: version.version,
            directPercent: version.directPercent?.toString() ?? null,
            loyaltyPercent: version.loyaltyPercent?.toString() ?? null,
            loyaltyExceptionReason: version.loyaltyExceptionReason,
            // CP §7.3 — MD's approval is the exception where one was needed.
            commercialExceptionApproved: needsLoyaltyException({
              directEnabled: version.directEnabled,
              directPercent: version.directPercent?.toString() ?? null,
              loyaltyEnabled: version.loyaltyEnabled,
              loyaltyPercent: version.loyaltyPercent?.toString() ?? null,
              loyaltyExceptionReason: version.loyaltyExceptionReason,
            }),
            effectiveFrom: (waits ? version.effectiveFrom! : now).toISOString(),
          },
          reason: args.note,
        },
      };
    }
  );
}

/**
 * Makes an Approved version Active at `at` and supersedes the one it replaces.
 * The caller holds the Project lock. Returns the superseded version, if any.
 */
async function activate(tx: Tx, versionId: string, at: Date) {
  const version = await tx.projectCommissionVersion.findUniqueOrThrow({ where: { id: versionId } });
  const current = await tx.projectCommissionVersion.findFirst({
    where: { projectId: version.projectId, status: "ACTIVE" },
  });
  if (current) {
    await tx.projectCommissionVersion.update({
      where: { id: current.id },
      data: { status: "SUPERSEDED", effectiveTo: at },
    });
  }
  await tx.projectCommissionVersion.update({
    where: { id: version.id },
    data: { status: "ACTIVE", effectiveFrom: at },
  });
  return current;
}

/**
 * CP §8, §76 — activates every Approved version whose Effective from has
 * arrived: for one Project just before a Booking Request freezes its settings
 * (so a late job never freezes the old version), or for every Project from the
 * scheduled job. Idempotent, and CP §66 — no task, because no human acts.
 */
export async function activateDueVersions(tx: Tx, projectId?: string): Promise<number> {
  const due = await tx.projectCommissionVersion.findMany({
    where: { status: "APPROVED", effectiveFrom: { lte: new Date() }, ...(projectId ? { projectId } : {}) },
    select: { id: true, projectId: true },
  });
  let activated = 0;
  for (const { id, projectId: dueProject } of due) {
    await lockProject(tx, dueProject);
    const version = await tx.projectCommissionVersion.findUniqueOrThrow({ where: { id } });
    if (version.status !== "APPROVED") continue; // another run got there first
    const superseded = await activate(tx, id, version.effectiveFrom!);
    await tx.auditEvent.create({
      data: {
        actorRef: "SYSTEM:COMMISSION_VERSION_ACTIVATION",
        entity: "Project",
        entityId: dueProject,
        action: "COMMISSION_VERSION_ACTIVATED",
        beforeMasked: superseded ? { version: superseded.version } : undefined,
        afterMasked: { version: version.version, effectiveFrom: version.effectiveFrom!.toISOString() },
      },
    });
    activated++;
  }
  return activated;
}

/** Newest first: the Active one, any Draft, Pending or Approved, and the history. */
export function listCommissionVersions(projectId: string) {
  return db.projectCommissionVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}
