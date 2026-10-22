// Project commission settings — SSOT §12–§16; Change Pack §7, §8, §65 NT01.
//
// MD creates each version, and MD creating it is its approval (the owner folded
// Admin into MD, so there is no second step). A version takes effect at its
// Effective from — at creation when none is given — and then supersedes the
// previous one. One with a later time waits as Approved until a scheduled job,
// or the next Booking Request on the Project, activates it. Nothing is ever
// edited (SSOT §14 "no silent overwrite"); every change is a new version.

import { db } from "@/lib/db";
import {
  needsLoyaltyException,
  rateLabel,
  validateCommissionTerms,
  type CommissionTermsInput,
} from "@/lib/domain/commission";
import { validateTokenQuantity } from "@/lib/domain/tokens";
import { validateTripSettings, type TripSettingsInput } from "@/lib/domain/trip";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";

/** CP §9; SSOT §44 — the version's Trip inventory: exclusions and shared pools. */
export type TripInventoryInput = {
  excludedPlotIds: string[];
  /** A child Plot sharing its parent's credit pool. */
  sharedPools: { plotId: string; parentPlotId: string }[];
};

export type CommissionVersionInput = CommissionTermsInput & {
  reason: string;
  /** CP §7.1 — optional, future only. Null takes effect at creation. */
  effectiveFrom?: Date | null;
  /** SSOT §12.3; CP §7.1 — absent means the Trip Programme is Disabled. */
  trip?: TripSettingsInput & TripInventoryInput;
  /** docss/11 §1 — whole tokens a qualifying Royalty earns on this Project. Required. */
  royaltyTokensPerAward: number;
  /** CP §7.4 — MD confirms the Rewards economics were reviewed. Required when Rewards are on. */
  economicsReviewed?: boolean;
};

const TRIP_DISABLED: TripSettingsInput = {
  tripEnabled: false,
  tripTotalTarget: null,
  tripMinOwnCredits: null,
  tripMaxReferenceCredits: null,
  tripProgrammeCode: null,
  tripProgrammeVersionRef: null,
  tripTermsVersionRef: null,
  tripCutOffAt: null,
  tripWindDownAt: null,
};

const tripData = (t: CommissionVersionInput) => {
  const trip = t.trip?.tripEnabled ? t.trip : TRIP_DISABLED;
  return {
    tripEnabled: trip.tripEnabled,
    tripTotalTarget: trip.tripTotalTarget,
    tripMinOwnCredits: trip.tripMinOwnCredits,
    tripMaxReferenceCredits: trip.tripMaxReferenceCredits,
    tripProgrammeCode: trip.tripProgrammeCode?.trim() || null,
    tripProgrammeVersionRef: trip.tripProgrammeVersionRef?.trim() || null,
    tripTermsVersionRef: trip.tripTermsVersionRef?.trim() || null,
    tripCutOffAt: trip.tripCutOffAt,
    tripWindDownAt: trip.tripWindDownAt,
  };
};

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

const termsData = (t: CommissionVersionInput) => ({
  directEnabled: t.directEnabled,
  directPercent: t.directEnabled ? t.directPercent!.trim() : null,
  loyaltyEnabled: t.loyaltyEnabled,
  loyaltyPercent: t.loyaltyEnabled ? t.loyaltyPercent!.trim() : null,
  loyaltyExceptionReason: t.loyaltyExceptionReason?.trim() || null,
  reason: t.reason.trim(),
  effectiveFrom: t.effectiveFrom ?? null,
  ...tripData(t),
  royaltyTokensPerAward: t.royaltyTokensPerAward,
});

/**
 * The checks every prepared version passes, wherever it is prepared — the
 * Project page or the create form.
 */
export function checkPreparable(actorRole: string, input: CommissionVersionInput) {
  if (actorRole !== "MD") blocked("Only MD creates commission settings.");
  if (!input.reason.trim()) blocked("A compulsory reason is required for a commission settings version.");
  const valid = validateCommissionTerms(input);
  if (!valid.ok) blocked(valid.reason);
  const tokens = validateTokenQuantity("Royalty points per qualifying purchase", input.royaltyTokensPerAward);
  if (!tokens.ok) blocked(tokens.reason);
  if (input.effectiveFrom && input.effectiveFrom.getTime() <= Date.now()) {
    blocked("Effective from must be in the future, or left empty to take effect now.");
  }
  if (input.trip?.tripEnabled) {
    const trip = validateTripSettings(input.trip);
    if (!trip.ok) blocked(trip.reason);
    if (!input.economicsReviewed) blocked("Confirm the Rewards economics were reviewed.");
  }
}

/**
 * CP §9; SSOT §44 — the Draft's Trip inventory rules, replaced whole. Every
 * Plot is eligible unless excluded; a child shares a parent's credit pool.
 */
async function writeInventory(tx: Tx, versionId: string, projectId: string, input: CommissionVersionInput) {
  await tx.tripInventoryRule.deleteMany({ where: { settingsVersionId: versionId } });
  if (!input.trip?.tripEnabled) return;
  const { excludedPlotIds, sharedPools } = input.trip;
  const plotIds = [...new Set([...excludedPlotIds, ...sharedPools.flatMap((p) => [p.plotId, p.parentPlotId])])];
  const found = await tx.plot.count({ where: { id: { in: plotIds }, projectId } });
  if (found !== plotIds.length) blocked("Every Reward inventory Plot must belong to this Project.");
  for (const pool of sharedPools) {
    if (pool.plotId === pool.parentPlotId) blocked("A Plot cannot share its own credit pool.");
    if (sharedPools.some((p) => p.plotId === pool.parentPlotId)) blocked("A parent Plot cannot itself be a child in a shared pool.");
    if (excludedPlotIds.includes(pool.parentPlotId) || excludedPlotIds.includes(pool.plotId)) {
      blocked("An excluded Plot cannot share a credit pool.");
    }
  }
  await tx.tripInventoryRule.createMany({
    data: [
      ...excludedPlotIds.map((plotId) => ({ settingsVersionId: versionId, plotId, eligible: false, reason: "Excluded from Rewards" })),
      ...sharedPools.map((p) => ({
        settingsVersionId: versionId,
        plotId: p.plotId,
        eligible: true,
        parentCreditPoolPlotId: p.parentPlotId,
        reason: "Shares the parent unit's credit pool (SSOT §44)",
      })),
    ],
  });
}

/**
 * A new version, numbered after the Project's latest, approved by the MD who
 * created it: Active now, or Approved until its Effective from. The caller
 * holds the Project lock (or owns a Project nobody else can see yet).
 */
export async function insertVersion(tx: Tx, projectId: string, actorRef: string, input: CommissionVersionInput) {
  await activateDueVersions(tx, projectId);
  // A version still waiting for its Effective from (or a Draft/Pending one from
  // before MD-only) is replaced by the new one: it never took effect, so
  // nothing that froze it changes. Only one open version may exist per Project.
  const waiting = await tx.projectCommissionVersion.findFirst({
    where: { projectId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
  });
  if (waiting) {
    const replaced = `Replaced by a newer version before it took effect — ${input.reason.trim()}`;
    await tx.projectCommissionVersion.update({
      where: { id: waiting.id },
      data:
        waiting.status === "APPROVED"
          ? { status: "SUPERSEDED", decisionNote: replaced }
          : {
              status: "REJECTED",
              submittedAt: waiting.submittedAt ?? new Date(),
              decidedByRef: actorRef,
              decidedAt: new Date(),
              decisionNote: replaced,
            },
    });
  }
  const latest = await tx.projectCommissionVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const now = new Date();
  const waits = input.effectiveFrom != null && input.effectiveFrom > now;
  const trip = tripData(input).tripEnabled;
  const created = await tx.projectCommissionVersion.create({
    data: {
      projectId,
      version: (latest?.version ?? 0) + 1,
      ...termsData(input),
      effectiveFrom: waits ? input.effectiveFrom! : now,
      status: "APPROVED",
      preparedByRef: actorRef,
      submittedAt: now,
      decidedByRef: actorRef,
      decidedAt: now,
      decisionNote: input.reason.trim(),
      economicsReviewedByRef: trip ? actorRef : null,
      economicsReviewedAt: trip ? now : null,
    },
  });
  await writeInventory(tx, created.id, projectId, input);
  const superseded = waits ? null : await activate(tx, created.id, now);
  return { ...created, status: waits ? ("APPROVED" as const) : ("ACTIVE" as const), superseded };
}

/** Serialises every write to one Project's versions. */
const lockProject = (tx: Tx, projectId: string) => lockKey(tx, `commission-version:${projectId}`);

/** SSOT §13–§16; CP §7.3, §8 — MD creates a version; creating it approves it. */
export async function createCommissionVersion(args: Actor & { projectId: string } & CommissionVersionInput) {
  checkPreparable(args.actorRole, args);

  return runCommand<{ versionId: string; version: number; projectId: string; status: "APPROVED" | "ACTIVE" }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_VERSION_CREATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, ...termsData(args) },
    },
    async (tx) => {
      await lockProject(tx, args.projectId);
      const saved = await insertVersion(tx, args.projectId, args.actorRef, args);
      return {
        result: { versionId: saved.id, version: saved.version, projectId: args.projectId, status: saved.status },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: "COMMISSION_VERSION_APPROVED",
          before: saved.superseded ? { version: saved.superseded.version } : undefined,
          after: {
            version: saved.version,
            ...termsData(args),
            // CP §7.3 — MD creating it is the exception where one was needed.
            commercialExceptionApproved: needsLoyaltyException(args),
            economicsReviewed: tripData(args).tripEnabled,
            effectiveFrom: saved.effectiveFrom!.toISOString(),
          },
          reason: args.reason,
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
