// Benefits & rewards — Change Pack §90 (Monetary / Trip / Royalty / Recovery).
// Read-only, current state, no rupee totals (CP §67 "Do not show rupee totals").

import { db } from "@/lib/db";

/** CP §90 — the open work behind each card, for the Rewards page. */
export async function rewardLists() {
  const [monetary, recoveries, heldAwards] = await Promise.all([
    db.commissionRecord.findMany({
      where: { isCurrent: true, payment: { in: ["NOT_PAID", "ACCOUNTS_ADJUSTMENT_REQUIRED"] }, eligibility: { in: ["READY", "ON_HOLD"] } },
      include: {
        beneficiaryPerson: { select: { id: true, fullName: true } },
        booking: { select: { id: true, bookingNumber: true, project: { select: { name: true } }, plot: { select: { plotNumber: true } } } },
        // A Purchase for Resale has no Plot until approval, only the outside
        // property's own name and number.
        acquisition: {
          select: {
            id: true,
            acquisitionNo: true,
            propertyName: true,
            propertyNumber: true,
            plot: { select: { plotNumber: true, project: { select: { name: true } } } },
          },
        },
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
    // docss/11 — Royalty awards not yet posted or restricted.
    db.royaltyAward.findMany({
      where: { OR: [{ state: "PENDING" }, { state: "RELEASED", holdReason: { not: null } }] },
      include: {
        memberProfile: { select: { memberId: true, person: { select: { id: true, fullName: true } } } },
        customerProfile: { select: { customerId: true } },
        triggerBooking: { select: { id: true, bookingNumber: true } },
        project: { select: { name: true } },
      },
      orderBy: { qualifiedAt: "asc" },
    }),
  ]);
  return { monetary, recoveries, royalty: { heldAwards } };
}

/** CP §55 — circumvention reviews, open first, for the Reviews tab. */
export async function reviewRows() {
  const circumventions = await db.circumventionReview.findMany({
    include: {
      subjectPerson: { select: { id: true, fullName: true } },
      recovery: { select: { recoveryNo: true, status: true, person: { select: { fullName: true } } } },
    },
    orderBy: [{ status: "asc" }, { raisedAt: "desc" }],
    take: 200,
  });
  const decided = (by: string | null, at: Date | null, why: string | null) => (by && at ? `${by} · ${at.toISOString().slice(0, 10)} · ${why ?? ""}` : null);
  return circumventions.map((c) => ({
    id: c.id,
    person: c.subjectPerson.fullName,
    personId: c.subjectPerson.id,
    benefit: `${c.recovery.recoveryNo} · owed by ${c.recovery.person.fullName} (${c.recovery.status.toLowerCase()})`,
    detail: `Shared ${c.indicators.map((i) => i.replace("_", " ").toLowerCase()).join(", ")}`,
    status: c.status,
    decided: decided(c.decidedByRef, c.decidedAt, c.reason),
  }));
}
