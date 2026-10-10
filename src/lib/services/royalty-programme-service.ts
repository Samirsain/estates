// Royalty Gift Programme Versions — SSOT §76, §77, §101; Change Pack §7.4,
// §46, §65 NT07; Terms 6.2 §14, §38; doc 5 §12, §13, §66, §92.
//
// Company-wide. Admin prepares and sends; MD approves (recording that the
// economics were reviewed outside the CRM) or rejects. An approved version
// takes effect at its Effective from — at approval when none was proposed —
// never earlier, and supersedes the previous one. The catalogue itself stays
// outside the CRM; a version carries its references. Nothing is edited after
// it leaves Draft; every change is a new version.

import { db } from "@/lib/db";
import { formatIst } from "@/lib/tasks";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";

/** CP §65 NT07 — Royalty Gift Programme Activation Approval, assigned to MD. */
export const PROGRAMME_APPROVAL_PURPOSE = "ROYALTY_PROGRAMME_APPROVAL";
const RECORD_KIND = "Royalty Programme";

export type RoyaltyProgrammeInput = {
  programmeRef: string;
  catalogueVersion: string;
  termsVersion: string;
  reason: string;
  effectiveFrom?: Date | null;
};

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

const lockProgrammes = (tx: Tx) => lockKey(tx, "royalty-programme");

function checkInput(actorRole: string, input: RoyaltyProgrammeInput) {
  if (actorRole !== "ADMIN") blocked("Only Admin prepares a Royalty Gift Programme Version.");
  if (!input.programmeRef.trim()) blocked("Enter the Programme Version reference, e.g. RGP-01.");
  if (!input.catalogueVersion.trim()) blocked("Enter the approved Catalogue Version.");
  if (!input.termsVersion.trim()) blocked("Enter the Royalty Gift Terms version.");
  if (!input.reason.trim()) blocked("A compulsory reason is required.");
  if (input.effectiveFrom && input.effectiveFrom.getTime() <= Date.now()) {
    blocked("Effective from must be in the future, or left empty to take effect on MD approval.");
  }
}

const data = (input: RoyaltyProgrammeInput) => ({
  programmeRef: input.programmeRef.trim(),
  catalogueVersion: input.catalogueVersion.trim(),
  termsVersion: input.termsVersion.trim(),
  reason: input.reason.trim(),
  effectiveFrom: input.effectiveFrom ?? null,
});

/** Admin creates the Draft, or edits it while it is still one. */
export async function prepareRoyaltyProgramme(args: Actor & RoyaltyProgrammeInput) {
  checkInput(args.actorRole, args);
  return runCommand<{ versionId: string; version: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ROYALTY_PROGRAMME_PREPARE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: data(args),
    },
    async (tx) => {
      await lockProgrammes(tx);
      await activateDueRoyaltyProgrammes(tx);
      const open = await tx.royaltyProgrammeVersion.findFirst({
        where: { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
      });
      if (open?.status === "PENDING_APPROVAL") blocked(`Version ${open.version} is waiting for MD.`);
      if (open?.status === "APPROVED") {
        blocked(`Version ${open.version} is approved and takes effect on ${formatIst(open.effectiveFrom!)}.`);
      }
      const latest = await tx.royaltyProgrammeVersion.findFirst({ orderBy: { version: "desc" } });
      const saved = open
        ? await tx.royaltyProgrammeVersion.update({
            where: { id: open.id },
            data: { ...data(args), preparedByRef: args.actorRef, preparedAt: new Date() },
          })
        : await tx.royaltyProgrammeVersion.create({
            data: { version: (latest?.version ?? 0) + 1, ...data(args), preparedByRef: args.actorRef },
          });
      return {
        result: { versionId: saved.id, version: saved.version },
        audit: {
          entity: "RoyaltyProgrammeVersion",
          entityId: saved.id,
          action: open ? "ROYALTY_PROGRAMME_EDITED" : "ROYALTY_PROGRAMME_DRAFTED",
          after: { version: saved.version, ...data(args), effectiveFrom: args.effectiveFrom?.toISOString() ?? null },
          reason: args.reason,
        },
      };
    }
  );
}

/** Admin sends the Draft to MD; it can no longer be edited. Raises NT07. */
export async function sendRoyaltyProgramme(args: Actor & { versionId: string }) {
  if (args.actorRole !== "ADMIN") blocked("Only Admin sends a Royalty Gift Programme Version to MD.");
  return runCommand<{ versionId: string; version: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ROYALTY_PROGRAMME_SEND",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { versionId: args.versionId },
    },
    async (tx) => {
      await lockProgrammes(tx);
      const version = await tx.royaltyProgrammeVersion.findUniqueOrThrow({ where: { id: args.versionId } });
      if (version.status !== "DRAFT") blocked("Only a Draft can be edited or sent.");
      if (version.effectiveFrom && version.effectiveFrom.getTime() <= Date.now()) {
        blocked("Its Effective from has already passed. Edit the Draft and choose a later time, or leave it empty.");
      }
      await tx.royaltyProgrammeVersion.update({
        where: { id: version.id },
        data: { status: "PENDING_APPROVAL", submittedAt: new Date() },
      });
      await ensureTask(tx, {
        recordKind: RECORD_KIND,
        recordId: version.id,
        recordName: `${version.programmeRef} · Catalogue ${version.catalogueVersion}`,
        purpose: PROGRAMME_APPROVAL_PURPOSE,
        title: "Royalty Gift Programme Activation Approval",
        assigneeRole: "MD",
        dueAt: new Date(),
        decision: true,
        latestResult:
          `Version ${version.version}: ${version.programmeRef}, Catalogue ${version.catalogueVersion}, ` +
          `Terms ${version.termsVersion}` +
          (version.effectiveFrom ? `. Effective from ${formatIst(version.effectiveFrom)}` : "") +
          ". Approving confirms its economics were reviewed outside the CRM.",
      });
      return {
        result: { versionId: version.id, version: version.version },
        audit: {
          entity: "RoyaltyProgrammeVersion",
          entityId: version.id,
          action: "ROYALTY_PROGRAMME_SENT",
          after: { version: version.version },
        },
      };
    }
  );
}

/**
 * SSOT §101; CP §7.4 — MD approves only with the economics review confirmed
 * (only the fact, approver and date are stored), or rejects with a note.
 */
export async function decideRoyaltyProgramme(
  args: Actor & { versionId: string; approve: boolean; note: string; economicsReviewed: boolean }
) {
  if (args.actorRole !== "MD") blocked("Only MD approves or rejects a Royalty Gift Programme Version.");
  if (!args.note.trim()) blocked("A compulsory note is required on the MD decision.");
  if (args.approve && !args.economicsReviewed) {
    blocked("Confirm the Programme's economics were reviewed outside the CRM before approving it.");
  }

  return runCommand<{ versionId: string; version: number; status: "APPROVED" | "ACTIVE" | "REJECTED" }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ROYALTY_PROGRAMME_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { versionId: args.versionId, approve: args.approve },
    },
    async (tx) => {
      await lockProgrammes(tx);
      const version = await tx.royaltyProgrammeVersion.findUniqueOrThrow({ where: { id: args.versionId } });
      if (version.status !== "PENDING_APPROVAL") blocked(`Version ${version.version} is not waiting for MD.`);
      const now = new Date();
      if (args.approve && version.effectiveFrom && version.effectiveFrom < now) {
        blocked(
          `Version ${version.version}'s Effective from has already passed, and a version cannot take effect ` +
            `before its approval. Reject it so Admin can prepare it again with a later time.`
        );
      }
      const note = args.note.trim();
      const decision = { decidedByRef: args.actorRef, decidedAt: now, decisionNote: note };
      await closeTasksFor(
        tx,
        RECORD_KIND,
        version.id,
        args.actorRef,
        `${args.approve ? "Approved" : "Rejected"} — ${note}`,
        PROGRAMME_APPROVAL_PURPOSE
      );

      if (!args.approve) {
        await tx.royaltyProgrammeVersion.update({ where: { id: version.id }, data: { status: "REJECTED", ...decision } });
        return {
          result: { versionId: version.id, version: version.version, status: "REJECTED" as const },
          audit: { entity: "RoyaltyProgrammeVersion", entityId: version.id, action: "ROYALTY_PROGRAMME_REJECTED", reason: note },
        };
      }

      const waits = version.effectiveFrom !== null && version.effectiveFrom > now;
      await tx.royaltyProgrammeVersion.update({
        where: { id: version.id },
        data: {
          status: "APPROVED",
          ...decision,
          economicsReviewedByRef: args.actorRef,
          economicsReviewedAt: now,
          effectiveFrom: waits ? version.effectiveFrom : now,
        },
      });
      if (!waits) await activate(tx, version.id, now);
      return {
        result: { versionId: version.id, version: version.version, status: waits ? ("APPROVED" as const) : ("ACTIVE" as const) },
        audit: {
          entity: "RoyaltyProgrammeVersion",
          entityId: version.id,
          action: "ROYALTY_PROGRAMME_APPROVED",
          after: {
            version: version.version,
            programmeRef: version.programmeRef,
            catalogueVersion: version.catalogueVersion,
            economicsReviewed: true,
            effectiveFrom: (waits ? version.effectiveFrom! : now).toISOString(),
          },
          reason: note,
        },
      };
    }
  );
}

async function activate(tx: Tx, versionId: string, at: Date) {
  const current = await tx.royaltyProgrammeVersion.findFirst({ where: { status: "ACTIVE" } });
  if (current) {
    await tx.royaltyProgrammeVersion.update({ where: { id: current.id }, data: { status: "SUPERSEDED", effectiveTo: at } });
  }
  await tx.royaltyProgrammeVersion.update({ where: { id: versionId }, data: { status: "ACTIVE", effectiveFrom: at } });
}

/** CP §8, §76 — an Approved version becomes Active at its time. Idempotent. */
export async function activateDueRoyaltyProgrammes(tx: Tx): Promise<number> {
  const dueWhere = { status: "APPROVED" as const, effectiveFrom: { lte: new Date() } };
  if ((await tx.royaltyProgrammeVersion.count({ where: dueWhere })) === 0) return 0;
  // Read again under the lock, so two Booking Requests cannot both activate it.
  await lockProgrammes(tx);
  const due = await tx.royaltyProgrammeVersion.findMany({ where: dueWhere, orderBy: { effectiveFrom: "asc" } });
  for (const version of due) {
    await activate(tx, version.id, version.effectiveFrom!);
    await tx.auditEvent.create({
      data: {
        actorRef: "SYSTEM:ROYALTY_PROGRAMME_ACTIVATION",
        entity: "RoyaltyProgrammeVersion",
        entityId: version.id,
        action: "ROYALTY_PROGRAMME_ACTIVATED",
        afterMasked: { version: version.version, effectiveFrom: version.effectiveFrom!.toISOString() },
      },
    });
  }
  return due.length;
}

/** SSOT §76 — the version a Booking Request freezes now, or null when none is live. */
export async function liveRoyaltyProgramme(tx: Tx) {
  await activateDueRoyaltyProgrammes(tx);
  return tx.royaltyProgrammeVersion.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
}

export function listRoyaltyProgrammes() {
  return db.royaltyProgrammeVersion.findMany({ orderBy: { version: "desc" } });
}
