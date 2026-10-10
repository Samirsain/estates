// A Member's Trip, grouped by Project programme — SSOT §40, §47, §54, §56;
// Change Pack §68, §70. Safe for the Member portal: credits and rewards only,
// never a Customer's identity, and no value.

import { db } from "@/lib/db";

export type TripProgrammeView = {
  key: string;
  project: string;
  code: string;
  open: { target: number; minOwn: number; maxRef: number; termsRef: string; openedAt: string } | null;
  pendingOwn: number;
  qualifiedOwn: number;
  qualifiedReference: number;
  held: number;
  expired: number;
  nearestExpiry: string | null;
  rewards: Array<{
    id: string;
    state: "EARNED" | "BOOKED" | "TRAVELLED" | "DEFICIENT" | "CANCELLED";
    holdReason: string | null;
    earnedAt: string;
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
  credits: { projectId: string; programmeCode: string; creditType: string; state: string; bucketId: string | null; expiresAt: Date | null }[],
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
      pendingOwn: own("PENDING"),
      qualifiedOwn: own("QUALIFIED"),
      qualifiedReference: mine.filter((c) => c.creditType === "REFERENCE" && c.state === "QUALIFIED" && !c.bucketId).length,
      held: mine.filter((c) => c.state === "HELD").length,
      expired: mine.filter((c) => c.state === "EXPIRED").length,
      nearestExpiry: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null,
      rewards: buckets
        .filter((b) => b.projectId === projectId && b.programmeCode === code && b.reward)
        .map((b) => ({
          id: b.reward!.id,
          state: b.reward!.state,
          holdReason: b.reward!.holdReason,
          earnedAt: b.reward!.earnedAt.toISOString(),
          recipient: b.reward!.recipient,
          recipientName: b.reward!.recipientName,
          recipientApproved: b.reward!.recipientApprovedAt !== null,
          bookingReference: b.reward!.bookingReference,
          travelledAt: b.reward!.travelledAt?.toISOString() ?? null,
        })),
    };
  });
}
