// Project commission settings — Business Model v2.1 §12–§15.
//
// Admin prepares and sends; MD approves or rejects. An approved version is
// Active at once, effective no earlier than its approval, and supersedes the
// previous one. Nothing is edited after it leaves Draft (§14 "no silent
// overwrite"), and every material change is a new version.

import { db } from "@/lib/db";
import { validateCommissionTerms, type CommissionTermsInput } from "@/lib/domain/commission";
import { blocked, lockKey, runCommand, type Tx } from "./command";

export type CommissionVersionInput = CommissionTermsInput & { reason: string };

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

const termsData = (t: CommissionVersionInput) => ({
  directEnabled: t.directEnabled,
  directPercent: t.directEnabled ? t.directPercent!.trim() : null,
  loyaltyEnabled: t.loyaltyEnabled,
  loyaltyPercent: t.loyaltyEnabled ? t.loyaltyPercent!.trim() : null,
  loyaltyExceptionReason: t.loyaltyExceptionReason?.trim() || null,
  reason: t.reason.trim(),
});

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
  if (args.actorRole !== "ADMIN") blocked("Only Admin prepares commission settings.");
  if (!args.reason.trim()) blocked("A compulsory reason is required for a commission settings version.");
  const valid = validateCommissionTerms(args);
  if (!valid.ok) blocked(valid.reason);

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
      const open = await tx.projectCommissionVersion.findFirst({
        where: { projectId: args.projectId, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
      });
      if (open?.status === "PENDING_APPROVAL") {
        blocked(`Version ${open.version} is waiting for MD. It can no longer be edited.`);
      }

      let saved;
      if (open) {
        saved = await tx.projectCommissionVersion.update({
          where: { id: open.id },
          data: { ...termsData(args), preparedByRef: args.actorRef, preparedAt: new Date() },
        });
      } else {
        const latest = await tx.projectCommissionVersion.findFirst({
          where: { projectId: args.projectId },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        saved = await tx.projectCommissionVersion.create({
          data: {
            projectId: args.projectId,
            version: (latest?.version ?? 0) + 1,
            ...termsData(args),
            preparedByRef: args.actorRef,
          },
        });
      }

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
      await tx.projectCommissionVersion.update({
        where: { id: version.id },
        data: { status: "PENDING_APPROVAL", submittedAt: new Date() },
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
 * v2.1 §13, §14 steps 3–4 — MD approves (Active at once, the previous Active
 * superseded) or rejects with a note. MD's approval of a version that needs the
 * Loyalty exception is that exception, with its written reason and audit.
 */
export async function decideCommissionVersion(args: Actor & { versionId: string; approve: boolean; note: string }) {
  if (args.actorRole !== "MD") blocked("Only MD approves or rejects commission settings.");
  if (!args.note.trim()) blocked("A compulsory note is required on the MD decision.");

  return runCommand<{
    versionId: string;
    version: number;
    projectId: string;
    status: "ACTIVE" | "REJECTED";
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

      if (!args.approve) {
        await tx.projectCommissionVersion.update({
          where: { id: version.id },
          data: { status: "REJECTED", ...decision },
        });
        return {
          result: {
            versionId: version.id,
            version: version.version,
            projectId: version.projectId,
            status: "REJECTED" as const,
            supersededVersion: null,
          },
          audit: {
            entity: "Project",
            entityId: version.projectId,
            action: "COMMISSION_VERSION_REJECTED",
            after: { version: version.version },
            reason: args.note,
          },
        };
      }

      const current = await tx.projectCommissionVersion.findFirst({
        where: { projectId: version.projectId, status: "ACTIVE" },
      });
      if (current) {
        await tx.projectCommissionVersion.update({
          where: { id: current.id },
          data: { status: "SUPERSEDED", effectiveTo: now },
        });
      }
      await tx.projectCommissionVersion.update({
        where: { id: version.id },
        data: { status: "ACTIVE", effectiveFrom: now, ...decision },
      });

      return {
        result: {
          versionId: version.id,
          version: version.version,
          projectId: version.projectId,
          status: "ACTIVE" as const,
          supersededVersion: current?.version ?? null,
        },
        audit: {
          entity: "Project",
          entityId: version.projectId,
          action: "COMMISSION_VERSION_APPROVED",
          before: current ? { version: current.version } : undefined,
          after: {
            version: version.version,
            directPercent: version.directPercent?.toString() ?? null,
            loyaltyPercent: version.loyaltyPercent?.toString() ?? null,
            loyaltyExceptionReason: version.loyaltyExceptionReason,
          },
          reason: args.note,
        },
      };
    }
  );
}

/** Newest first: the Active one, any Draft or Pending, and the history. */
export function listCommissionVersions(projectId: string) {
  return db.projectCommissionVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}
