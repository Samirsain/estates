// Performance cycles — Approved Changes (2) CR-014, CR-027.
//
// A cycle is a set of positions, not a span of time. It opens on an anniversary
// and it ends when positions 1 to 9 have each completed their qualifying
// transaction, however many anniversaries that takes. Nothing resets.
//
// The whole state of a cycle is derived from its positions, and a position's
// success is its consumed one-time opportunity. Nothing here is incremented, so
// nothing here can drift: every path that consumes or reopens an opportunity
// calls `refreshCyclesFor` and the counts are recomputed from the rows.

import type { PerformanceCycleKind } from "@prisma/client";
import {
  CYCLE_POSITIONS,
  countsTowardsCycle,
  cycleComplete,
  cycleEntitlement,
  mayOpenNextCycle,
} from "@/lib/domain/commission";
import { istDay } from "@/lib/tasks";
import { blocked, lockKey, type Tx } from "./command";

/** The IST calendar day, as the DATE column stores it. */
const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

/**
 * CR-014 — the cycle a new position joins: the Member's highest-numbered one.
 *
 * Cycle 1 is opened here rather than at activation for the ordinary reason that
 * a Member activated before this change has none, and asking for their current
 * cycle is exactly the moment one is needed. It is serialised on the Member and
 * counter, so two activations in the same instant cannot each create cycle 1.
 */
export async function currentCycle(
  tx: Tx,
  memberProfileId: string,
  kind: PerformanceCycleKind
) {
  await lockKey(tx, `performance-cycle:${kind}:${memberProfileId}`);

  const existing = await tx.performanceCycle.findFirst({
    where: { memberProfileId, kind },
    orderBy: { cycleNumber: "desc" },
  });
  if (existing) return existing;

  const member = await tx.memberProfile.findUniqueOrThrow({ where: { id: memberProfileId } });
  if (!member.activationDate) {
    blocked("This Member is not activated, so they have no performance cycle yet.");
  }
  return tx.performanceCycle.create({
    data: {
      memberProfileId,
      kind,
      cycleNumber: 1,
      openedOn: asDate(istDay(member.activationDate!)),
    },
  });
}

/** The positions in one cycle, with whether each has completed. */
async function positionsOf(tx: Tx, cycleId: string, kind: PerformanceCycleKind) {
  if (kind === "INVITE") {
    const rows = await tx.memberProfile.findMany({
      where: { inviteCycleId: cycleId, invitePosition: { not: null } },
      select: { invitePosition: true, personId: true },
    });
    return rows.map((r) => ({ position: r.invitePosition!, subjectPersonId: r.personId }));
  }
  const rows = await tx.customerProfile.findMany({
    where: { royaltyCycleId: cycleId, royaltyPosition: { not: null } },
    select: { royaltyPosition: true, personId: true },
  });
  return rows.map((r) => ({ position: r.royaltyPosition!, subjectPersonId: r.personId }));
}

/**
 * CR-014 — recomputes one cycle from its own positions.
 *
 * "Successfully complete" is the consumed opportunity, for both counters: it is
 * written at 100% Payment Received and reopened when a sale is cancelled before
 * completion, which is the pack's "cancelled/reversed qualifying events do not
 * count" already implemented once.
 */
export async function refreshCycle(tx: Tx, cycleId: string, actorRef: string) {
  const before = await tx.performanceCycle.findUniqueOrThrow({ where: { id: cycleId } });
  const positions = await positionsOf(tx, cycleId, before.kind);
  const inCycle = positions.filter((p) => countsTowardsCycle(p.position));

  const consumed = inCycle.length
    ? await tx.commissionOpportunity.findMany({
        where: {
          kind: before.kind,
          status: "CONSUMED",
          subjectPersonId: { in: inCycle.map((p) => p.subjectPersonId) },
        },
        select: { subjectPersonId: true },
      })
    : [];
  const successful = new Set(consumed.map((c) => c.subjectPersonId));
  const successfulPositions = inCycle
    .filter((p) => successful.has(p.subjectPersonId))
    .map((p) => p.position);

  const complete = cycleComplete(successfulPositions);
  const cycle = await tx.performanceCycle.update({
    where: { id: cycleId },
    data: {
      positionsFilled: inCycle.length,
      positionsComplete: successfulPositions.length,
      status: complete ? "UPGRADE_ELIGIBLE" : "IN_PROGRESS",
      // The first completion timestamp stands; only losing completion clears it,
      // and the anniversary job reads it to decide whether the roll may happen.
      completedAt: complete ? (before.completedAt ?? new Date()) : null,
      entitlement: complete ? cycleEntitlement(before.kind, before.cycleNumber) : null,
    },
  });

  if (before.status !== cycle.status) {
    await tx.auditEvent.create({
      data: {
        actorRef,
        actorRole: "SYSTEM",
        entity: "PerformanceCycle",
        entityId: cycleId,
        action: complete ? "CYCLE_UPGRADE_ELIGIBLE" : "CYCLE_REOPENED",
        beforeMasked: { status: before.status, positionsComplete: before.positionsComplete },
        afterMasked: {
          status: cycle.status,
          positionsComplete: cycle.positionsComplete,
          entitlement: cycle.entitlement,
        },
      },
    });
  }
  return cycle;
}

/**
 * The one hook every entitlement change calls. A consumed or reopened
 * opportunity is the only thing that can change a cycle's answer, so this is
 * the only place a cycle is recomputed outside the anniversary job.
 */
export async function refreshCyclesFor(
  tx: Tx,
  kind: PerformanceCycleKind,
  subjectPersonId: string,
  actorRef: string
) {
  const cycleId =
    kind === "INVITE"
      ? (await tx.memberProfile.findUnique({ where: { personId: subjectPersonId } }))?.inviteCycleId
      : (await tx.customerProfile.findUnique({ where: { personId: subjectPersonId } }))
          ?.royaltyCycleId;
  if (cycleId) await refreshCycle(tx, cycleId, actorRef);
}

/**
 * CR-027 — the anniversary run, for one Member and one counter.
 *
 * Returns whether a new cycle was opened. Re-running it changes nothing: after
 * the roll the current cycle is the new IN_PROGRESS one, which `mayOpenNextCycle`
 * refuses, and the unique key on (Member, kind, number) is the backstop.
 */
export async function upgradeCycleIfDue(
  tx: Tx,
  memberProfileId: string,
  kind: PerformanceCycleKind,
  at: Date,
  actorRef: string
): Promise<boolean> {
  const member = await tx.memberProfile.findUniqueOrThrow({ where: { id: memberProfileId } });
  if (!member.activationDate || member.status !== "ACTIVE") return false;

  const cycle = await currentCycle(tx, memberProfileId, kind);
  if (
    !mayOpenNextCycle({
      activationDate: member.activationDate,
      status: cycle.status,
      completedAt: cycle.completedAt,
      at,
    })
  ) {
    return false;
  }

  const opened = await tx.performanceCycle.create({
    data: {
      memberProfileId,
      kind,
      cycleNumber: cycle.cycleNumber + 1,
      openedOn: asDate(istDay(at)),
    },
  });
  await tx.auditEvent.create({
    data: {
      actorRef,
      actorRole: "SYSTEM",
      entity: "PerformanceCycle",
      entityId: opened.id,
      action: "CYCLE_OPENED",
      beforeMasked: { previousCycle: cycle.cycleNumber, status: cycle.status },
      afterMasked: { kind, cycleNumber: opened.cycleNumber, openedOn: istDay(at) },
      reason:
        `${kind === "INVITE" ? "Invite" : "Royalty"} cycle ${cycle.cycleNumber} was Upgrade ` +
        `Eligible on the Member Activation Anniversary, so cycle ${opened.cycleNumber} opens. ` +
        `Positions 1 to ${CYCLE_POSITIONS} of the previous cycle keep their rates and never renumber.`,
    },
  });
  return true;
}
