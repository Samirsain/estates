// A Member's Trip, grouped by Project programme — SSOT §40, §47, §54, §56;
// Change Pack §68, §70. Safe for the Member portal: credits and rewards only,
// never a Customer's identity, and no value.

import { db } from "@/lib/db";

export type TripProgrammeView = {
  key: string;
  project: string;
  code: string;
  open: { target: number; minOwn: number; maxRef: number; termsRef: string; openedAt: string } | null;
  /** The rules the next Trip is judged by: the open bucket's, else the latest bucket's. */
  rules: { target: number; minOwn: number; maxRef: number; termsRef: string } | null;
  pendingOwn: number;
  qualifiedOwn: number;
  qualifiedReference: number;
  /** CP §68 — qualified Reference beyond Maximum Reference, kept for a later Trip. */
  banked: number;
  held: number;
  expired: number;
  nearestExpiry: string | null;
  /** CP §68 — every credit of the programme, oldest first (staff view; empty in the portal). */
  credits: Array<{
    id: string;
    type: string;
    state: string;
    route: string | null;
    qualifiedAt: string | null;
    expiresAt: string | null;
    bucketId: string | null;
    booking: string | null;
    plot: string | null;
    via: string | null;
    reversalReason: string | null;
  }>;
  rewards: Array<{
    id: string;
    bucketId: string;
    /** CP §37 — the rules the Trip was judged by, frozen on its bucket. */
    rules: { target: number; minOwn: number; maxRef: number; termsRef: string };
    state: "EARNED" | "BOOKED" | "TRAVELLED" | "DEFICIENT" | "CANCELLED";
    holdReason: string | null;
    earnedAt: string;
    bookedAt: string | null;
    recipient: string | null;
    recipientName: string | null;
    recipientApproved: boolean;
    bookingReference: string | null;
    travelledAt: string | null;
  }>;
};

/** Reads and groups everything for one Member. */
export async function tripOfMember(memberProfileId: string) {
  const [credits, buckets] = await Promise.all([
    db.tripCredit.findMany({
      where: { memberProfileId },
      select: { projectId: true, programmeCode: true, creditType: true, state: true, bucketId: true, expiresAt: true },
    }),
    db.tripBucket.findMany({ where: { memberProfileId }, include: { reward: true }, orderBy: { openedAt: "desc" } }),
  ]);
  return tripProgrammes(credits, buckets);
}

/** CP §68 — the Member's Trip, grouped by Project programme. */
export async function tripProgrammes(
  credits: {
    projectId: string;
    programmeCode: string;
    creditType: string;
    state: string;
    bucketId: string | null;
    expiresAt: Date | null;
    // The staff view passes these for the credit list; the portal does not.
    id?: string;
    qualificationRoute?: string | null;
    qualifiedAt?: Date | null;
    createdAt?: Date;
    reversalReason?: string | null;
    sourceBooking?: { bookingNumber: string | null; plot: { plotNumber: string } };
    introducedMember?: { memberId: string } | null;
  }[],
  buckets: Array<{
    id: string;
    projectId: string;
    programmeCode: string;
    state: string;
    totalTarget: number;
    minOwnCredits: number;
    maxReferenceCredits: number;
    termsVersionRef: string;
    openedAt: Date;
    reward: {
      id: string;
      state: "EARNED" | "BOOKED" | "TRAVELLED" | "DEFICIENT" | "CANCELLED";
      holdReason: string | null;
      earnedAt: Date;
      recipient: string | null;
      recipientName: string | null;
      recipientApprovedAt: Date | null;
      bookingReference: string | null;
      bookedAt?: Date | null;
      travelledAt: Date | null;
    } | null;
  }>
): Promise<TripProgrammeView[]> {
  const keys = [...new Set([...credits, ...buckets].map((x) => `${x.projectId}|${x.programmeCode}`))];
  const projects = await db.project.findMany({
    where: { id: { in: keys.map((k) => k.split("|")[0]) } },
    select: { id: true, name: true },
  });
  return keys.map((key) => {
    const [projectId, code] = key.split("|");
    const mine = credits.filter((c) => c.projectId === projectId && c.programmeCode === code);
    const own = (state: string) => mine.filter((c) => c.creditType === "OWN_SALE" && c.state === state && !c.bucketId).length;
    const open = buckets.find((b) => b.projectId === projectId && b.programmeCode === code && b.state === "OPEN");
    // Buckets arrive newest first, so after a Trip is earned its rules still show.
    const latest = open ?? buckets.find((b) => b.projectId === projectId && b.programmeCode === code);
    const expiries = mine.filter((c) => c.state === "QUALIFIED" && !c.bucketId && c.expiresAt).map((c) => c.expiresAt!.getTime());
    return {
      key,
      project: projects.find((p) => p.id === projectId)?.name ?? "—",
      code,
      open: open
        ? {
            target: open.totalTarget,
            minOwn: open.minOwnCredits,
            maxRef: open.maxReferenceCredits,
            termsRef: open.termsVersionRef,
            openedAt: open.openedAt.toISOString(),
          }
        : null,
      rules: latest
        ? { target: latest.totalTarget, minOwn: latest.minOwnCredits, maxRef: latest.maxReferenceCredits, termsRef: latest.termsVersionRef }
        : null,
      pendingOwn: own("PENDING"),
      qualifiedOwn: own("QUALIFIED"),
      qualifiedReference: mine.filter((c) => c.creditType === "REFERENCE" && c.state === "QUALIFIED" && !c.bucketId).length,
      banked: latest
        ? Math.max(0, mine.filter((c) => c.creditType === "REFERENCE" && c.state === "QUALIFIED" && !c.bucketId).length - latest.maxReferenceCredits)
        : 0,
      credits: mine
        .filter((c) => c.id)
        .sort((a, b) => (a.qualifiedAt ?? a.createdAt ?? new Date(0)).getTime() - (b.qualifiedAt ?? b.createdAt ?? new Date(0)).getTime())
        .map((c) => ({
          id: c.id!,
          type: c.creditType,
          state: c.state,
          route: c.qualificationRoute ?? null,
          qualifiedAt: c.qualifiedAt?.toISOString() ?? null,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          bucketId: c.bucketId,
          booking: c.sourceBooking?.bookingNumber ?? null,
          plot: c.sourceBooking?.plot.plotNumber ?? null,
          via: c.introducedMember?.memberId ?? null,
          reversalReason: c.reversalReason ?? null,
        })),
      held: mine.filter((c) => c.state === "HELD").length,
      expired: mine.filter((c) => c.state === "EXPIRED").length,
      nearestExpiry: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null,
      rewards: buckets
        .filter((b) => b.projectId === projectId && b.programmeCode === code && b.reward)
        .map((b) => ({
          id: b.reward!.id,
          bucketId: b.id,
          rules: { target: b.totalTarget, minOwn: b.minOwnCredits, maxRef: b.maxReferenceCredits, termsRef: b.termsVersionRef },
          state: b.reward!.state,
          holdReason: b.reward!.holdReason,
          earnedAt: b.reward!.earnedAt.toISOString(),
          bookedAt: b.reward!.bookedAt?.toISOString() ?? null,
          recipient: b.reward!.recipient,
          recipientName: b.reward!.recipientName,
          recipientApproved: b.reward!.recipientApprovedAt !== null,
          bookingReference: b.reward!.bookingReference,
          travelledAt: b.reward!.travelledAt?.toISOString() ?? null,
        })),
    };
  });
}
