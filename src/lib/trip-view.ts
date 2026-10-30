// A Member's Trip, grouped by Project programme — SSOT §40, §47, §54, §56;
// Change Pack §68, §70. Credits and rewards only, never a Customer's identity,
// and no value.

import { db } from "@/lib/db";

export type TripProgrammeView = {
  key: string;
  project: string;
  code: string;
  open: { target: number; minOwn: number; maxRef: number; termsRef: string; openedAt: string } | null;
  /** The rules the next Trip is judged by: the open bucket's, else the latest bucket's, else the Project settings. */
  rules: { target: number; minOwn: number; maxRef: number; termsRef: string } | null;
  pendingOwn: number;
  qualifiedOwn: number;
  qualifiedReference: number;
  /** CP §68 — qualified Reference beyond Maximum Reference, kept for a later Trip. */
  banked: number;
  held: number;
  expired: number;
  /** CP §68 — every credit of the programme, oldest first. */
  credits: Array<{
    id: string;
    type: string;
    state: string;
    route: string | null;
    qualifiedAt: string | null;
    expiresAt: string | null;
    bucketId: string | null;
    booking: string | null;
    bookingId: string | null;
    plot: string | null;
    /** A Reference credit's introduced Member: profile id (for the link), Member ID and full name. */
    via: { id: string; memberId: string; name: string } | null;
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
    bookingReference: string | null;
    travelledAt: string | null;
  }>;
};

/** Credit states a sale only reaches once it qualified; PENDING and REVERSED never did. */
const QUALIFYING = new Set(["QUALIFIED", "ALLOCATED", "USED", "HELD", "EXPIRED"]);

/** CP §68 — the Member's Trip, grouped by Project programme. */
export async function tripProgrammes(
  credits: {
    projectId: string;
    programmeCode: string;
    creditType: string;
    state: string;
    bucketId: string | null;
    expiresAt: Date | null;
    // Passed for the credit list on the Member's page.
    id?: string;
    qualificationRoute?: string | null;
    qualifiedAt?: Date | null;
    createdAt?: Date;
    reversalReason?: string | null;
    sourceBooking?: { id: string; bookingNumber: string | null; plot: { plotNumber: string } };
    introducedMember?: { id: string; memberId: string; person?: { fullName: string } } | null;
    /** The Project settings the credit was made under: the rule before any bucket exists. */
    settingsVersion?: {
      tripTotalTarget: number | null;
      tripMinOwnCredits: number | null;
      tripMaxReferenceCredits: number | null;
      tripTermsVersionRef: string | null;
    } | null;
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
      bookingReference: string | null;
      bookedAt?: Date | null;
      travelledAt: Date | null;
    } | null;
  }>
): Promise<TripProgrammeView[]> {
  // Only programmes with a qualifying sale: a credit that reached 100% payment
  // (or an Approved Buyback) at some point, or an earned Reward. A Project with
  // nothing but sales still waiting for payment, or cancelled ones, stays out.
  const keys = [
    ...new Set([
      ...credits.filter((c) => QUALIFYING.has(c.state)).map((c) => `${c.projectId}|${c.programmeCode}`),
      ...buckets.filter((b) => b.reward).map((b) => `${b.projectId}|${b.programmeCode}`),
    ]),
  ];
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
    // No bucket yet (say, a Reference alone): the rule a bucket would freeze,
    // from the Project settings its qualifying credit was made under.
    const set = mine.find((c) => QUALIFYING.has(c.state) && c.settingsVersion?.tripTotalTarget != null)?.settingsVersion;
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
        : set
          ? {
              target: set.tripTotalTarget!,
              minOwn: set.tripMinOwnCredits ?? 0,
              maxRef: set.tripMaxReferenceCredits ?? 0,
              termsRef: set.tripTermsVersionRef ?? "",
            }
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
          bookingId: c.sourceBooking?.id ?? null,
          plot: c.sourceBooking?.plot.plotNumber ?? null,
          via: c.introducedMember
            ? {
                id: c.introducedMember.id,
                memberId: c.introducedMember.memberId,
                name: c.introducedMember.person?.fullName.trim() ?? "",
              }
            : null,
          reversalReason: c.reversalReason ?? null,
        })),
      held: mine.filter((c) => c.state === "HELD").length,
      expired: mine.filter((c) => c.state === "EXPIRED").length,
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
          bookingReference: b.reward!.bookingReference,
          travelledAt: b.reward!.travelledAt?.toISOString() ?? null,
        })),
    };
  });
}
