// Benefits & rewards at a glance — Change Pack §67 (Dashboard cards) and §90
// (Monetary / Trip / Royalty / Recovery). Read-only, current state, no rupee
// totals (CP §67 "Do not show rupee totals").

import { db } from "@/lib/db";

/** CP §67 — the recommended operational cards, as counts. */
export async function rewardCounts() {
  const monetary = (type: "DIRECT" | "LOYALTY", eligibility: "READY" | "ON_HOLD") =>
    db.commissionRecord.count({ where: { type, eligibility, isCurrent: true, payment: "NOT_PAID" } });
  const [
    directReady,
    directHeld,
    loyaltyReady,
    loyaltyHeld,
    recoveries,
    tripsAwaiting,
    tripsDeficient,
    giftsAwaitingSelection,
    giftsAwaitingDelivery,
    settingsAwaitingMd,
    buybackReviews,
    controlReviews,
  ] = await Promise.all([
    monetary("DIRECT", "READY"),
    monetary("DIRECT", "ON_HOLD"),
    monetary("LOYALTY", "READY"),
    monetary("LOYALTY", "ON_HOLD"),
    db.recovery.count({ where: { status: "OUTSTANDING" } }),
    db.tripReward.count({ where: { state: { in: ["EARNED", "BOOKED"] } } }),
    db.tripReward.count({ where: { state: "DEFICIENT" } }),
    db.royaltyCredit.count({ where: { state: { in: ["ELIGIBLE", "SELECTED"] } } }),
    db.royaltyCredit.count({ where: { state: "ORDERED" } }),
    db.projectCommissionVersion.count({ where: { status: "PENDING_APPROVAL" } }),
    db.task.count({ where: { status: "PENDING", purpose: { in: ["BUYBACK_COMMISSION_REVIEW", "BUYBACK_UNWIND_REVIEW"] } } }),
    // CP §65 NT08, NT09 — release-control reviews waiting for a decision.
    Promise.all([
      db.staffConflictReview.count({ where: { status: "PENDING" } }),
      db.circumventionReview.count({ where: { status: "PENDING_REVIEW" } }),
    ]).then(([a, b]) => a + b),
  ]);
  return {
    directReady,
    directHeld,
    loyaltyReady,
    loyaltyHeld,
    recoveries,
    tripsAwaiting,
    tripsDeficient,
    giftsAwaitingSelection,
    giftsAwaitingDelivery,
    settingsAwaitingMd,
    buybackReviews,
    controlReviews,
  };
}

export type RewardCounts = Awaited<ReturnType<typeof rewardCounts>>;

/** CP §90 — the open work behind each card, for the Rewards page. */
export async function rewardLists() {
  const [monetary, recoveries, trips, gifts] = await Promise.all([
    db.commissionRecord.findMany({
      where: { isCurrent: true, payment: { in: ["NOT_PAID", "ACCOUNTS_ADJUSTMENT_REQUIRED"] }, eligibility: { in: ["READY", "ON_HOLD"] } },
      include: {
        beneficiaryPerson: { select: { id: true, fullName: true } },
        booking: { select: { id: true, bookingNumber: true, project: { select: { name: true } }, plot: { select: { plotNumber: true } } } },
        acquisition: { select: { id: true, acquisitionNo: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.recovery.findMany({
      where: { status: "OUTSTANDING" },
      include: {
        person: { select: { id: true, fullName: true } },
        commissionRecord: { select: { type: true, booking: { select: { id: true, bookingNumber: true } } } },
      },
      orderBy: { dueOn: "asc" },
    }),
    db.tripReward.findMany({
      where: { state: { in: ["EARNED", "BOOKED", "DEFICIENT"] } },
      include: {
        memberProfile: { select: { memberId: true, person: { select: { id: true, fullName: true } } } },
        bucket: { select: { programmeCode: true, totalTarget: true, settingsVersion: { select: { project: { select: { name: true } } } } } },
      },
      orderBy: { earnedAt: "asc" },
    }),
    db.royaltyCredit.findMany({
      where: { state: { in: ["ELIGIBLE", "SELECTED", "ORDERED"] } },
      include: {
        memberProfile: { select: { memberId: true, person: { select: { id: true, fullName: true } } } },
        customerProfile: { select: { customerId: true } },
        triggerBooking: { select: { id: true, bookingNumber: true } },
        programmeVersion: { select: { programmeRef: true } },
      },
      orderBy: { eligibleAt: "asc" },
    }),
  ]);
  return { monetary, recoveries, trips, gifts };
}

/** CP §55, §58 — staff-conflict and circumvention reviews, open first, for the Reviews tab. */
export async function reviewRows() {
  const [conflicts, circumventions] = await Promise.all([
    db.staffConflictReview.findMany({
      include: { person: { select: { id: true, fullName: true } } },
      orderBy: [{ status: "asc" }, { raisedAt: "desc" }],
      take: 200,
    }),
    db.circumventionReview.findMany({
      include: {
        subjectPerson: { select: { id: true, fullName: true } },
        recovery: { select: { recoveryNo: true, status: true, person: { select: { fullName: true } } } },
      },
      orderBy: [{ status: "asc" }, { raisedAt: "desc" }],
      take: 200,
    }),
  ]);
  const staffNames = new Map(
    (
      await db.person.findMany({
        where: { id: { in: [...new Set(conflicts.flatMap((c) => c.staffPersonIds))] } },
        select: { id: true, fullName: true },
      })
    ).map((p) => [p.id, p.fullName])
  );
  // The NT09 task carries the benefit's one-line name.
  const names = new Map(
    (
      await db.task.findMany({
        where: { recordKind: "Staff Conflict", recordId: { in: conflicts.map((c) => c.id) } },
        select: { recordId: true, recordName: true },
      })
    ).map((t) => [t.recordId, t.recordName])
  );
  const decided = (by: string | null, at: Date | null, why: string | null) => (by && at ? `${by} · ${at.toISOString().slice(0, 10)} · ${why ?? ""}` : null);
  return [
    ...conflicts.map((c) => ({
      id: c.id,
      kind: "CONFLICT" as const,
      person: c.person.fullName,
      personId: c.person.id,
      benefit: names.get(c.id) ?? `${c.recordKind}`,
      detail: `Conflict with staff: ${c.staffPersonIds.map((id) => staffNames.get(id) ?? id).join(", ")}`,
      status: c.status,
      decided: decided(c.decidedByRef, c.decidedAt, c.decisionNote),
    })),
    ...circumventions.map((c) => ({
      id: c.id,
      kind: "CIRCUMVENTION" as const,
      person: c.subjectPerson.fullName,
      personId: c.subjectPerson.id,
      benefit: `${c.recovery.recoveryNo} · owed by ${c.recovery.person.fullName} (${c.recovery.status.toLowerCase()})`,
      detail: `Shared ${c.indicators.map((i) => i.replace("_", " ").toLowerCase()).join(", ")}`,
      status: c.status,
      decided: decided(c.decidedByRef, c.decidedAt, c.reason),
    })),
  ];
}
