// Sales & Reference Trip Reward — SSOT §37–§66, §99; Change Pack §22–§39, §60,
// §65 (NT03–NT05, NT10), §76, §86; Trip Terms 6.1.
//
// Everything here is derived from current state and idempotent: each event
// that can move a Booking (approval, payment, cancellation, Buyback, Change
// Plot, Sold By Correction) calls `syncTripForBooking`, which decides what its
// Own-Sale Credit and any Reference Credit should be, then re-evaluates the
// buckets they feed. Non-cash throughout: no rupee value is stored.

import type { Prisma, RewardHoldReason, RewardRecipient, TripCredit } from "@prisma/client";
import { db } from "@/lib/db";
import { notFutureDated } from "@/lib/domain/booking";
import { BUYBACK_MIN_SOURCE_PAYMENT } from "@/lib/domain/commission";
import { allocate, creditExpiry, type AllocatableCredit } from "@/lib/domain/trip";
import { recordAudit } from "@/lib/security/audit";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { outstandingRecovery } from "./commission-service";
import { closeTasksFor, ensureTask } from "./task-service";
import { assertIndependent, controlHoldReason } from "./benefit-control-service";

/** CP §65 NT03. */
export const TRIP_FULFILMENT_PURPOSE = "TRIP_REWARD_FULFILMENT";
/** CP §65 NT04. */
export const TRIP_DEFICIENCY_PURPOSE = "TRIP_REWARD_DEFICIENCY";
/** CP §65 NT05. */
export const TRIP_WIND_DOWN_PURPOSE = "TRIP_BUCKET_WIND_DOWN";
/** CP §65 NT10 — the same task type Royalty uses. */
export const TRIP_NOMINEE_PURPOSE = "REWARD_NOMINEE_APPROVAL";
export const TRIP_REWARD_KIND = "Trip Reward";
export const TRIP_BUCKET_KIND = "Trip Bucket";

const CLOSED_BOOKING = ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"];

async function event(
  tx: Tx,
  memberProfileId: string,
  ids: { creditId?: string; bucketId?: string; rewardId?: string },
  actorRef: string,
  action: string,
  from?: string | null,
  to?: string | null,
  reason?: string
) {
  await tx.tripEvent.create({
    data: { memberProfileId, ...ids, actorRef, action, fromState: from ?? null, toState: to ?? null, reason: reason ?? null },
  });
}

/** SSOT §46, §59 — 100% Payment Received, else an Approved Buyback after 25%, else none. */
async function qualification(
  tx: Tx,
  booking: { id: string; paymentReceivedPercent: Prisma.Decimal }
): Promise<"PAYMENT_100" | "APPROVED_BUYBACK" | null> {
  if (booking.paymentReceivedPercent.gte(100)) return "PAYMENT_100";
  if (booking.paymentReceivedPercent.lt(BUYBACK_MIN_SOURCE_PAYMENT)) return null;
  const buyback = await tx.acquisition.count({
    where: { sourceBookingId: booking.id, type: "BUYBACK", status: "APPROVED" },
  });
  return buyback > 0 ? "APPROVED_BUYBACK" : null;
}

/* --------------------------------------------------------------- credits */

/**
 * SSOT §63 — a credit whose basis is gone. Used credits (a Travelled Trip)
 * are final and never touched (SSOT §64). An allocated one leaves its bucket,
 * whose reward is then backfilled or becomes Deficient.
 */
export async function invalidate(tx: Tx, credit: TripCredit, actorRef: string, reason: string) {
  if (credit.state === "USED" || credit.state === "REVERSED" || credit.state === "EXPIRED") return;
  await tx.tripCredit.update({
    where: { id: credit.id },
    data: { state: "REVERSED", reversedAt: new Date(), reversalReason: reason, bucketId: null },
  });
  await event(tx, credit.memberProfileId, { creditId: credit.id }, actorRef, "CREDIT_REVERSED", credit.state, "REVERSED", reason);
  if (credit.creditType === "REFERENCE" && credit.introducedMemberId) {
    // CP §79 — the opportunity reopens where valid before fulfilment.
    await tx.memberProfile.update({
      where: { id: credit.introducedMemberId },
      data: { referenceOpportunityConsumedAt: null, referenceWinningBookingId: null },
    });
  }
}

/** Qualification lost (SSOT §99): back to Pending, out of any bucket. */
async function unqualify(tx: Tx, credit: TripCredit, actorRef: string) {
  if (credit.state !== "QUALIFIED" && credit.state !== "ALLOCATED") return;
  await tx.tripCredit.update({
    where: { id: credit.id },
    data: { state: "PENDING", qualifiedAt: null, expiresAt: null, qualificationRoute: null, bucketId: null },
  });
  await event(tx, credit.memberProfileId, { creditId: credit.id }, actorRef, "QUALIFICATION_LOST", credit.state, "PENDING");
}

/**
 * The Own-Sale and Reference Credits one Booking should carry, recomputed
 * from the Booking and its frozen version, and the buckets they feed.
 */
export async function syncTripForBooking(tx: Tx, bookingId: string, actorRef: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      commissionVersion: { include: { tripInventoryRules: true } },
      soldByPerson: { include: { memberProfile: true } },
    },
  });
  const v = booking.commissionVersion;
  const touched = new Set<string>();

  // ---- the Own-Sale Credit (SSOT §41–§43, §45, §48, §60; CP §25–§27)
  let live = await tx.tripCredit.findFirst({
    where: { sourceBookingId: bookingId, creditType: "OWN_SALE", state: { not: "REVERSED" } },
  });
  const owner = booking.soldByType === "MEMBER" ? booking.soldByPerson?.memberProfile ?? null : null;
  const rule = v?.tripInventoryRules.find((r) => r.plotId === booking.plotId);
  const creditPlotId = rule?.parentCreditPoolPlotId ?? booking.plotId;
  let why: string | null = null;
  if (!booking.bookingNumber || !booking.approvedAt || CLOSED_BOOKING.includes(booking.status)) why = "The Booking is not a live approved sale.";
  else if (!v?.tripEnabled) why = "The frozen Project settings have no Trip Programme.";
  else if (v.tripCutOffAt && booking.approvedAt > v.tripCutOffAt) why = "Approved after the programme cut-off (SSOT §48).";
  else if (!owner) why = "Not Sold By a Member, so no Own-Sale Credit (SSOT §60).";
  else if (rule && !rule.eligible) why = "The final Plot is excluded from the Trip Programme (SSOT §45).";
  else {
    const earned = await tx.tripCredit.findFirst({
      where: {
        creditType: "OWN_SALE",
        state: { not: "REVERSED" },
        memberProfileId: owner.id,
        projectId: booking.projectId,
        programmeCode: v.tripProgrammeCode!,
        creditPlotId,
        sourceBookingId: { not: bookingId },
      },
    });
    if (earned) why = "This Member already earned an Own-Sale Credit on this unit in this programme (SSOT §43).";
  }

  if (why) {
    if (live) {
      touched.add(live.memberProfileId);
      await invalidate(tx, live, actorRef, why);
      live = null;
    }
  } else {
    if (live && live.memberProfileId !== owner!.id) {
      touched.add(live.memberProfileId);
      await invalidate(tx, live, actorRef, "Sold By corrected to another Member (CP §59).");
      live = null;
    }
    if (live && live.creditPlotId !== creditPlotId) {
      await tx.tripCredit.update({ where: { id: live.id }, data: { creditPlotId } });
      await event(tx, live.memberProfileId, { creditId: live.id }, actorRef, "CREDIT_UNIT_CHANGED", live.state, live.state, "Change Plot (SSOT §107).");
    }
    if (!live) {
      live = await tx.tripCredit.create({
        data: {
          memberProfileId: owner!.id,
          projectId: booking.projectId,
          programmeCode: v!.tripProgrammeCode!,
          settingsVersionId: v!.id,
          creditType: "OWN_SALE",
          sourceBookingId: bookingId,
          creditPlotId,
          state: "PENDING",
          pendingAt: new Date(),
        },
      });
      await event(tx, owner!.id, { creditId: live.id }, actorRef, "CREDIT_PENDING", null, "PENDING", booking.bookingNumber!);
      await openBucketIfNone(tx, live, v!, actorRef);
    }
    touched.add(live.memberProfileId);
    const route = await qualification(tx, booking);
    if (route && live.state === "PENDING") {
      const now = new Date();
      live = await tx.tripCredit.update({
        where: { id: live.id },
        data: { state: "QUALIFIED", qualifiedAt: now, expiresAt: creditExpiry(now), qualificationRoute: route },
      });
      await event(tx, live.memberProfileId, { creditId: live.id }, actorRef, "CREDIT_QUALIFIED", "PENDING", "QUALIFIED", route);
    } else if (route && live.qualificationRoute !== route && live.state !== "USED") {
      live = await tx.tripCredit.update({ where: { id: live.id }, data: { qualificationRoute: route } });
    } else if (!route) {
      await unqualify(tx, live, actorRef);
      live = await tx.tripCredit.findUniqueOrThrow({ where: { id: live.id } });
    }
  }

  // ---- the Reference Credit (SSOT §49–§55; CP §28–§30)
  const existingRef = await tx.tripCredit.findFirst({
    where: { sourceBookingId: bookingId, creditType: "REFERENCE", state: { not: "REVERSED" } },
  });
  const introduced = owner;
  const qualified = live && ["QUALIFIED", "ALLOCATED", "USED"].includes(live.state);
  const thirdParty = booking.primaryPersonId !== booking.soldByPersonId;
  const refEligible = !!(live && qualified && thirdParty && introduced?.invitedByMemberId);
  if (existingRef && !refEligible) {
    touched.add(existingRef.memberProfileId);
    await invalidate(tx, existingRef, actorRef, "The introduced Member's first sale no longer qualifies.");
  }
  if (!existingRef && refEligible) {
    await lockKey(tx, `reference:${introduced!.id}`);
    const fresh = await tx.memberProfile.findUniqueOrThrow({ where: { id: introduced!.id } });
    if (!fresh.referenceOpportunityConsumedAt) {
      const inviter = await tx.memberProfile.findUniqueOrThrow({ where: { id: fresh.invitedByMemberId! } });
      const now = new Date();
      const ref = await tx.tripCredit.create({
        data: {
          memberProfileId: inviter.id,
          projectId: booking.projectId,
          programmeCode: v!.tripProgrammeCode!,
          settingsVersionId: v!.id,
          creditType: "REFERENCE",
          sourceBookingId: bookingId,
          creditPlotId: booking.plotId,
          introducedMemberId: fresh.id,
          // CP §30 — a Deactivated inviter's credit is created but held.
          state: inviter.status === "ACTIVE" ? "QUALIFIED" : "HELD",
          qualifiedAt: now,
          expiresAt: creditExpiry(now),
          qualificationRoute: live!.qualificationRoute,
        },
      });
      await tx.memberProfile.update({
        where: { id: fresh.id },
        data: { referenceOpportunityConsumedAt: now, referenceWinningBookingId: bookingId },
      });
      await event(tx, inviter.id, { creditId: ref.id }, actorRef, "REFERENCE_CREDIT", null, ref.state, `${fresh.memberId}'s first qualifying sale ${booking.bookingNumber}.`);
      touched.add(inviter.id);
    }
  }

  if (v?.tripProgrammeCode) {
    for (const memberProfileId of touched) {
      await evaluateBuckets(tx, memberProfileId, booking.projectId, v.tripProgrammeCode, actorRef);
    }
  }
}

/* --------------------------------------------------------------- buckets */

/**
 * SSOT §47; CP §32 — the Member's first Pending credit in a programme opens a
 * bucket, frozen from that Booking's version.
 */
async function openBucketIfNone(
  tx: Tx,
  credit: TripCredit,
  v: {
    id: string;
    tripTotalTarget: number | null;
    tripMinOwnCredits: number | null;
    tripMaxReferenceCredits: number | null;
    tripProgrammeVersionRef: string | null;
    tripTermsVersionRef: string | null;
    tripWindDownAt: Date | null;
  },
  actorRef: string
) {
  const open = await tx.tripBucket.findFirst({
    where: { memberProfileId: credit.memberProfileId, projectId: credit.projectId, programmeCode: credit.programmeCode, state: "OPEN" },
  });
  if (open) return open;
  const bucket = await tx.tripBucket.create({
    data: {
      memberProfileId: credit.memberProfileId,
      projectId: credit.projectId,
      programmeCode: credit.programmeCode,
      settingsVersionId: v.id,
      totalTarget: v.tripTotalTarget!,
      minOwnCredits: v.tripMinOwnCredits!,
      maxReferenceCredits: v.tripMaxReferenceCredits!,
      programmeVersionRef: v.tripProgrammeVersionRef!,
      termsVersionRef: v.tripTermsVersionRef!,
      windDownAt: v.tripWindDownAt,
      openingCreditId: credit.id,
    },
  });
  await event(tx, credit.memberProfileId, { bucketId: bucket.id }, actorRef, "BUCKET_OPENED", null, "OPEN",
    `Target ${bucket.totalTarget}, min Own ${bucket.minOwnCredits}, max Reference ${bucket.maxReferenceCredits}.`);
  return bucket;
}

const asAllocatable = (c: TripCredit): AllocatableCredit => ({ id: c.id, type: c.creditType, qualifiedAt: c.qualifiedAt! });

/**
 * SSOT §57, §58, §63; CP §33, §34, §39 — earned rewards not yet booked are
 * kept whole (backfilled FIFO, else Deficient); then the open bucket earns if
 * the pool now meets its frozen target and composition.
 */
export async function evaluateBuckets(tx: Tx, memberProfileId: string, projectId: string, programmeCode: string, actorRef: string) {
  await lockKey(tx, `trip:${memberProfileId}:${projectId}:${programmeCode}`);
  const scope = { memberProfileId, projectId, programmeCode };
  const pool = async () =>
    (await tx.tripCredit.findMany({ where: { ...scope, state: "QUALIFIED", bucketId: null } })).map(asAllocatable);
  const rule = (b: { totalTarget: number; minOwnCredits: number; maxReferenceCredits: number }) => ({
    target: b.totalTarget,
    minOwn: b.minOwnCredits,
    maxRef: b.maxReferenceCredits,
  });
  const take = async (bucketId: string, ids: string[]) => {
    if (ids.length === 0) return;
    await tx.tripCredit.updateMany({ where: { id: { in: ids } }, data: { state: "ALLOCATED", bucketId } });
    for (const id of ids) await event(tx, memberProfileId, { creditId: id, bucketId }, actorRef, "CREDIT_ALLOCATED", "QUALIFIED", "ALLOCATED");
  };

  // 1. Earned, not yet travelled: still whole?
  const earned = await tx.tripBucket.findMany({
    where: { ...scope, state: { in: ["EARNED", "DEFICIENT"] }, reward: { state: { in: ["EARNED", "DEFICIENT", "BOOKED"] } } },
    include: { reward: true, credits: { where: { state: "ALLOCATED" } } },
    orderBy: { earnedAt: "asc" },
  });
  for (const bucket of earned) {
    const reward = bucket.reward!;
    const kept = bucket.credits.map(asAllocatable);
    const add = allocate(reward.state === "BOOKED" ? [] : await pool(), rule(bucket), kept);
    if (add) {
      await take(bucket.id, add);
      if (reward.state === "DEFICIENT") {
        await tx.tripBucket.update({ where: { id: bucket.id }, data: { state: "EARNED" } });
        await tx.tripReward.update({ where: { id: reward.id }, data: { state: "EARNED" } });
        await event(tx, memberProfileId, { bucketId: bucket.id, rewardId: reward.id }, actorRef, "REWARD_BACKFILLED", "DEFICIENT", "EARNED");
        await closeTasksFor(tx, TRIP_REWARD_KIND, reward.id, actorRef, "Backfilled and whole again.", TRIP_DEFICIENCY_PURPOSE);
      }
    } else if (reward.state === "BOOKED") {
      // SSOT §63 — once Booked the Trip Terms govern; a human reviews it.
      await deficiencyTask(tx, reward.id, memberProfileId, "A credit used by this booked Trip is no longer valid. The Trip Terms govern what happens next.");
    } else if (reward.state === "EARNED") {
      await tx.tripBucket.update({ where: { id: bucket.id }, data: { state: "DEFICIENT" } });
      await tx.tripReward.update({ where: { id: reward.id }, data: { state: "DEFICIENT" } });
      await event(tx, memberProfileId, { bucketId: bucket.id, rewardId: reward.id }, actorRef, "REWARD_DEFICIENT", "EARNED", "DEFICIENT");
      await deficiencyTask(tx, reward.id, memberProfileId, "A credit this earned Trip used is no longer valid and no unused credit can replace it.");
    }
    await refreshTripReward(tx, reward.id, actorRef);
  }

  // 2. The open bucket.
  const open = await tx.tripBucket.findFirst({ where: { ...scope, state: "OPEN" } });
  if (!open) return;
  const add = allocate(await pool(), rule(open));
  if (add) {
    await take(open.id, add);
    await tx.tripBucket.update({ where: { id: open.id }, data: { state: "EARNED", earnedAt: new Date() } });
    const reward = await tx.tripReward.create({
      data: { bucketId: open.id, memberProfileId, termsVersionRef: open.termsVersionRef },
    });
    await event(tx, memberProfileId, { bucketId: open.id, rewardId: reward.id }, actorRef, "TRIP_EARNED", "OPEN", "EARNED");
    await refreshTripReward(tx, reward.id, actorRef);
    return;
  }
  // CP §32 — an opening credit gone with nothing else valid closes the empty bucket.
  if (open.openingCreditId) {
    const opener = await tx.tripCredit.findUnique({ where: { id: open.openingCreditId } });
    const valid = await tx.tripCredit.count({ where: { ...scope, state: { in: ["PENDING", "QUALIFIED", "HELD"] } } });
    if (opener?.state === "REVERSED" && valid === 0) {
      await tx.tripBucket.update({ where: { id: open.id }, data: { state: "CLOSED", closedAt: new Date() } });
      await event(tx, memberProfileId, { bucketId: open.id }, actorRef, "BUCKET_CLOSED", "OPEN", "CLOSED", "Its opening credit reversed and nothing else remains (CP §32).");
    }
  }
}

async function deficiencyTask(tx: Tx, rewardId: string, memberProfileId: string, text: string) {
  const member = await tx.memberProfile.findUniqueOrThrow({ where: { id: memberProfileId }, include: { person: { select: { fullName: true } } } });
  await ensureTask(tx, {
    recordKind: TRIP_REWARD_KIND,
    recordId: rewardId,
    recordName: `${member.memberId} · ${member.person.fullName}`,
    purpose: TRIP_DEFICIENCY_PURPOSE,
    title: "Trip Reward Deficiency Review",
    assigneeRole: "CRM",
    dueAt: new Date(),
    latestResult: text,
  });
}

/* --------------------------------------------------------------- rewards */

/** CP §85 — the first hold that stops Trip fulfilment, or null. */
async function rewardHold(tx: Tx, rewardId: string): Promise<RewardHoldReason | null> {
  const reward = await tx.tripReward.findUniqueOrThrow({
    where: { id: rewardId },
    include: {
      memberProfile: { select: { personId: true, status: true } },
      bucket: { include: { credits: { where: { state: { in: ["ALLOCATED", "USED"] } }, include: { sourceBooking: true } } } },
    },
  });
  if (await outstandingRecovery(tx, reward.memberProfile.personId)) return "RECOVERY_OUTSTANDING";
  if (reward.memberProfile.status === "DEACTIVATED") return "MEMBER_DEACTIVATED";
  // SSOT §61 — a Buyback-qualified credit is usable only after Stable Completion.
  for (const credit of reward.bucket.credits) {
    if (credit.qualificationRoute !== "APPROVED_BUYBACK" || credit.sourceBooking.paymentReceivedPercent.gte(100)) continue;
    const stable = await tx.acquisition.count({
      where: { sourceBookingId: credit.sourceBookingId, type: "BUYBACK", status: "APPROVED", stableCompletedAt: { not: null } },
    });
    if (stable === 0) return "BUYBACK_STABLE_COMPLETION_PENDING";
  }
  if (reward.recipient === "NON_FAMILY" && !reward.recipientApprovedAt) return "NOMINEE_APPROVAL_PENDING";
  return null;
}

/** Recomputes a reward's hold and its NT03 task (CP §65, §66). */
export async function refreshTripReward(tx: Tx, rewardId: string, actorRef: string) {
  const reward = await tx.tripReward.findUniqueOrThrow({
    where: { id: rewardId },
    include: { memberProfile: { include: { person: { select: { fullName: true } } } } },
  });
  if (reward.state !== "EARNED" && reward.state !== "BOOKED") return;
  // CP §55, §58 — the release controls raise their reviews even behind another hold.
  const control = await controlHoldReason(tx, {
    recordKind: TRIP_REWARD_KIND,
    recordId: reward.id,
    personId: reward.memberProfile.personId,
    recordName: `${reward.memberProfile.memberId} · ${reward.memberProfile.person.fullName}`,
  });
  const hold = (await rewardHold(tx, reward.id)) ?? control;
  if (hold !== reward.holdReason) {
    await tx.tripReward.update({ where: { id: reward.id }, data: { holdReason: hold } });
    await event(tx, reward.memberProfileId, { rewardId: reward.id }, actorRef, hold ? "REWARD_HELD" : "REWARD_RELEASED", reward.holdReason, hold);
  }
  if (!hold && reward.state === "EARNED") {
    await ensureTask(tx, {
      recordKind: TRIP_REWARD_KIND,
      recordId: reward.id,
      recordName: `${reward.memberProfile.memberId} · ${reward.memberProfile.person.fullName}`,
      purpose: TRIP_FULFILMENT_PURPOSE,
      title: "Trip Reward Fulfilment",
      assigneeRole: "CRM",
      dueAt: new Date(),
      latestResult: "Trip Reward earned. Record the traveller/nominee, the booking, then the travel.",
    });
  }
}

/**
 * CP §76.4, §86 — after a Recovery or a Member status change: a Reference
 * Credit held for a Deactivated inviter is released on reactivation, and the
 * Member's rewards are rechecked. No new opportunity is created.
 */
export async function refreshTripOfMember(tx: Tx, personId: string, actorRef: string) {
  const member = await tx.memberProfile.findUnique({ where: { personId } });
  if (!member) return;
  if (member.status === "ACTIVE") {
    const held = await tx.tripCredit.findMany({ where: { memberProfileId: member.id, state: "HELD" } });
    for (const credit of held) {
      await tx.tripCredit.update({ where: { id: credit.id }, data: { state: "QUALIFIED" } });
      await event(tx, member.id, { creditId: credit.id }, actorRef, "CREDIT_RELEASED", "HELD", "QUALIFIED", "Member reactivated (CP §86).");
    }
    for (const key of new Set(held.map((c) => `${c.projectId}|${c.programmeCode}`))) {
      const [projectId, code] = key.split("|");
      await evaluateBuckets(tx, member.id, projectId, code, actorRef);
    }
  }
  const rewards = await tx.tripReward.findMany({ where: { memberProfileId: member.id, state: { in: ["EARNED", "BOOKED"] } }, select: { id: true } });
  for (const { id } of rewards) await refreshTripReward(tx, id, actorRef);
}

/** SSOT §61 — a Buyback became or stopped being stable: rewards using that sale are rechecked. */
export async function refreshTripOfBooking(tx: Tx, bookingId: string, actorRef: string) {
  const rewards = await tx.tripReward.findMany({
    where: { state: { in: ["EARNED", "BOOKED"] }, bucket: { credits: { some: { sourceBookingId: bookingId } } } },
    select: { id: true },
  });
  for (const { id } of rewards) await refreshTripReward(tx, id, actorRef);
}

/* ------------------------------------------------------------ fulfilment */

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

function fulfilmentRole(role: string) {
  if (role !== "CRM" && role !== "ADMIN") blocked("Only CRM or Admin records Trip fulfilment.");
}

async function lockedReward(tx: Tx, rewardId: string) {
  const found = await tx.tripReward.findUnique({ where: { id: rewardId }, select: { memberProfileId: true } });
  if (!found) blocked("That Trip Reward no longer exists.");
  await lockKey(tx, `trip-reward:${rewardId}`);
  return tx.tripReward.findUniqueOrThrow({ where: { id: rewardId } });
}

/** SSOT §65; doc 5 §6 — the traveller. Non-family needs MD (NT10) before fulfilment. */
export async function recordTripNominee(args: Actor & { rewardId: string; recipient: RewardRecipient; recipientName: string }) {
  fulfilmentRole(args.actorRole);
  if (args.recipient !== "SELF" && !args.recipientName.trim()) blocked("Enter the nominee's name.");
  return runCommand<{ rewardId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "TRIP_NOMINEE", actorRef: args.actorRef, actorRole: args.actorRole, payload: { rewardId: args.rewardId, recipient: args.recipient } },
    async (tx) => {
      const reward = await lockedReward(tx, args.rewardId);
      if (reward.state !== "EARNED") blocked("The traveller can only be recorded before the Trip is booked.");
      const name = args.recipient === "SELF" ? null : args.recipientName.trim();
      await tx.tripReward.update({
        where: { id: reward.id },
        data: { recipient: args.recipient, recipientName: name, recipientApprovedByRef: null, recipientApprovedAt: null },
      });
      await event(tx, reward.memberProfileId, { rewardId: reward.id }, args.actorRef, "NOMINEE_RECORDED", null, args.recipient, name ?? undefined);
      if (args.recipient === "NON_FAMILY") {
        await ensureTask(tx, {
          recordKind: TRIP_REWARD_KIND,
          recordId: reward.id,
          recordName: name!,
          purpose: TRIP_NOMINEE_PURPOSE,
          title: "Non-Family Reward Nominee Approval",
          assigneeRole: "MD",
          dueAt: new Date(),
          decision: true,
          latestResult: `Trip Reward nominee ${name}, who is not immediate family.`,
        });
      } else {
        await closeTasksFor(tx, TRIP_REWARD_KIND, reward.id, args.actorRef, "Nominee is family.", TRIP_NOMINEE_PURPOSE);
      }
      await refreshTripReward(tx, reward.id, args.actorRef);
      return { result: { rewardId: reward.id }, audit: { entity: "TripReward", entityId: reward.id, action: "TRIP_NOMINEE_RECORDED", after: { recipient: args.recipient, name } } };
    }
  );
}

/** CP §65 NT10 — MD approves or rejects a non-family Trip nominee. */
export async function decideTripNominee(args: Actor & { rewardId: string; approve: boolean; note: string }) {
  if (args.actorRole !== "MD") blocked("Only MD decides a non-family nominee.");
  if (!args.note.trim()) blocked("A compulsory note is required.");
  return runCommand<{ rewardId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "TRIP_NOMINEE_DECIDE", actorRef: args.actorRef, actorRole: args.actorRole, payload: { rewardId: args.rewardId, approve: args.approve } },
    async (tx) => {
      const reward = await lockedReward(tx, args.rewardId);
      if (reward.recipient !== "NON_FAMILY" || reward.recipientApprovedAt) blocked("No non-family nominee is waiting for MD on this Trip.");
      await tx.tripReward.update({
        where: { id: reward.id },
        data: args.approve
          ? { recipientApprovedByRef: args.actorRef, recipientApprovedAt: new Date() }
          : { recipient: null, recipientName: null },
      });
      await event(tx, reward.memberProfileId, { rewardId: reward.id }, args.actorRef, args.approve ? "NOMINEE_APPROVED" : "NOMINEE_REJECTED", null, null, args.note.trim());
      await closeTasksFor(tx, TRIP_REWARD_KIND, reward.id, args.actorRef, `${args.approve ? "Approved" : "Rejected"} — ${args.note.trim()}`, TRIP_NOMINEE_PURPOSE);
      await refreshTripReward(tx, reward.id, args.actorRef);
      return { result: { rewardId: reward.id }, audit: { entity: "TripReward", entityId: reward.id, action: args.approve ? "TRIP_NOMINEE_APPROVED" : "TRIP_NOMINEE_REJECTED", reason: args.note.trim() } };
    }
  );
}

/** CP §58, §78 — the Trip's owner, for the independent-processor check. */
async function tripOwner(rewardId: string) {
  const reward = await db.tripReward.findUnique({ where: { id: rewardId }, select: { memberProfile: { select: { personId: true } } } });
  if (!reward) blocked("That Trip Reward no longer exists.");
  return reward.memberProfile.personId;
}

/** CP §37 — the Trip is booked with the travel provider. */
export async function bookTripReward(args: Actor & { rewardId: string; bookingReference: string; bookedOn: Date }) {
  fulfilmentRole(args.actorRole);
  await assertIndependent({ ...args, beneficiaryPersonId: await tripOwner(args.rewardId), action: "TRIP_BOOK" });
  if (!args.bookingReference.trim()) blocked("Enter the travel booking reference.");
  const dated = notFutureDated("Booking date", args.bookedOn);
  if (!dated.ok) blocked(dated.reason);
  return runCommand<{ rewardId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "TRIP_BOOK", actorRef: args.actorRef, actorRole: args.actorRole, payload: { rewardId: args.rewardId } },
    async (tx) => {
      const reward = await lockedReward(tx, args.rewardId);
      if (reward.state !== "EARNED") blocked("Only an Earned Trip can be booked.");
      if (!reward.recipient) blocked("Record who travels before booking (SSOT §65).");
      await refreshTripReward(tx, reward.id, args.actorRef);
      const now = await tx.tripReward.findUniqueOrThrow({ where: { id: reward.id } });
      if (now.holdReason) blocked(`Fulfilment is on hold: ${now.holdReason.replaceAll("_", " ").toLowerCase()}.`);
      await tx.tripReward.update({
        where: { id: reward.id },
        data: { state: "BOOKED", bookingReference: args.bookingReference.trim(), bookedAt: args.bookedOn },
      });
      await event(tx, reward.memberProfileId, { rewardId: reward.id }, args.actorRef, "TRIP_BOOKED", "EARNED", "BOOKED", args.bookingReference.trim());
      return { result: { rewardId: reward.id }, audit: { entity: "TripReward", entityId: reward.id, action: "TRIP_BOOKED", after: { bookingReference: args.bookingReference.trim() } } };
    }
  );
}

/** SSOT §64 — travelled: the credits it used stay consumed forever. */
export async function markTripTravelled(args: Actor & { rewardId: string; travelledOn: Date }) {
  fulfilmentRole(args.actorRole);
  await assertIndependent({ ...args, beneficiaryPersonId: await tripOwner(args.rewardId), action: "TRIP_TRAVELLED" });
  const dated = notFutureDated("Travel date", args.travelledOn);
  if (!dated.ok) blocked(dated.reason);
  return runCommand<{ rewardId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "TRIP_TRAVELLED", actorRef: args.actorRef, actorRole: args.actorRole, payload: { rewardId: args.rewardId } },
    async (tx) => {
      const reward = await lockedReward(tx, args.rewardId);
      if (reward.state !== "BOOKED") blocked("Only a booked Trip can be marked travelled.");
      await refreshTripReward(tx, reward.id, args.actorRef);
      const now = await tx.tripReward.findUniqueOrThrow({ where: { id: reward.id } });
      if (now.holdReason) blocked(`Fulfilment is on hold: ${now.holdReason.replaceAll("_", " ").toLowerCase()}.`);
      await tx.tripReward.update({ where: { id: reward.id }, data: { state: "TRAVELLED", travelledAt: args.travelledOn, holdReason: null } });
      await tx.tripCredit.updateMany({ where: { bucketId: reward.bucketId, state: "ALLOCATED" }, data: { state: "USED", usedAt: args.travelledOn } });
      await event(tx, reward.memberProfileId, { rewardId: reward.id }, args.actorRef, "TRIP_TRAVELLED", "BOOKED", "TRAVELLED");
      await closeTasksFor(tx, TRIP_REWARD_KIND, reward.id, args.actorRef, "Travelled.");
      return { result: { rewardId: reward.id }, audit: { entity: "TripReward", entityId: reward.id, action: "TRIP_TRAVELLED", after: { travelledOn: args.travelledOn.toISOString() } } };
    }
  );
}

/** CP §60 — a Booking whose credit a Travelled Trip used. */
export async function touchesTravelledTrip(tx: Tx, bookingId: string): Promise<boolean> {
  return (await tx.tripCredit.count({ where: { sourceBookingId: bookingId, state: "USED" } })) > 0;
}

/* ---------------------------------------------------------------- inviter */

/**
 * SSOT §37, §38; CP §22 — Admin or MD corrects the Membership inviter with a
 * reason, but not once the introduced Member's first Reference-eligible
 * Booking Request is submitted (a third-party sale in a Trip-enabled
 * version). A refused attempt is audited (CP §79).
 */
export async function correctInviter(args: Actor & { memberProfileId: string; invitedByMemberId: string | null; reason: string }) {
  if (args.actorRole !== "ADMIN" && args.actorRole !== "MD") blocked("Only Admin or MD may correct an inviter.");
  if (!args.reason.trim()) blocked("A compulsory reason is required.");
  const member = await db.memberProfile.findUnique({ where: { id: args.memberProfileId } });
  if (!member) blocked("That Member no longer exists.");
  const cutOff = await db.booking.count({
    where: {
      soldByType: "MEMBER",
      soldByPersonId: member.personId,
      primaryPersonId: { not: member.personId },
      commissionVersion: { tripEnabled: true },
    },
  });
  if (cutOff > 0) {
    await recordAudit({
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      entity: "MemberProfile",
      entityId: member.id,
      action: "INVITER_CORRECTION_DENIED",
      after: { invitedByMemberId: args.invitedByMemberId },
      reason: args.reason.trim(),
    });
    blocked(
      "This Member has already submitted a Reference-eligible Booking Request, so the inviter can no longer be " +
        "changed for Reference purposes (SSOT §38)."
    );
  }
  return runCommand<{ memberProfileId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "INVITER_CORRECT", actorRef: args.actorRef, actorRole: args.actorRole, payload: { memberProfileId: args.memberProfileId, invitedByMemberId: args.invitedByMemberId } },
    async (tx) => {
      if (args.invitedByMemberId) {
        if (args.invitedByMemberId === member.id) blocked("A Member cannot be their own inviter.");
        const inviter = await tx.memberProfile.findUnique({ where: { id: args.invitedByMemberId } });
        if (!inviter?.activationDate) blocked("The inviting Member is not activated.");
      }
      await tx.memberProfile.update({
        where: { id: member.id },
        data: { invitedByMemberId: args.invitedByMemberId, inviterFrozenAt: new Date() },
      });
      return {
        result: { memberProfileId: member.id },
        audit: {
          entity: "MemberProfile",
          entityId: member.id,
          action: "INVITER_CORRECTED",
          before: { invitedByMemberId: member.invitedByMemberId },
          after: { invitedByMemberId: args.invitedByMemberId },
          reason: args.reason.trim(),
        },
      };
    }
  );
}

/* ------------------------------------------------------------------- jobs */

/**
 * SSOT §56; CP §35, §76.1 — Qualified credits not allocated expire 12 months
 * after qualification. Used or allocated credits never do. Idempotent.
 */
export async function expireTripCredits(tx: Tx, now: Date) {
  const due = await tx.tripCredit.findMany({
    where: { state: { in: ["QUALIFIED", "HELD"] }, bucketId: null, expiresAt: { lte: now } },
  });
  for (const credit of due) {
    await tx.tripCredit.update({ where: { id: credit.id }, data: { state: "EXPIRED" } });
    await event(tx, credit.memberProfileId, { creditId: credit.id }, "SYSTEM:TRIP_CREDIT_EXPIRY", "CREDIT_EXPIRED", credit.state, "EXPIRED", "12 months after qualification.");
  }
  return due.length;
}

/**
 * SSOT §48; CP §36, §76.2 — once a programme's cut-off has passed, each open
 * bucket gets one NT05; at the final wind-down deadline it expires. The
 * closure is read from the Project's live version of that programme.
 */
export async function windDownTripBuckets(tx: Tx, now: Date) {
  const open = await tx.tripBucket.findMany({
    where: { state: "OPEN" },
    include: { memberProfile: { include: { person: { select: { fullName: true } } } } },
  });
  let changed = 0;
  for (const bucket of open) {
    const live = await tx.projectCommissionVersion.findFirst({ where: { projectId: bucket.projectId, status: "ACTIVE" } });
    const same = live?.tripProgrammeCode === bucket.programmeCode ? live : null;
    const cutOff = same?.tripCutOffAt ?? null;
    const windDown = same?.tripWindDownAt ?? bucket.windDownAt;
    if (!cutOff || cutOff > now) continue;
    if (windDown && windDown <= now) {
      await tx.tripBucket.update({ where: { id: bucket.id }, data: { state: "EXPIRED", closedAt: now } });
      await event(tx, bucket.memberProfileId, { bucketId: bucket.id }, "SYSTEM:TRIP_WIND_DOWN", "BUCKET_EXPIRED", "OPEN", "EXPIRED", "Programme final wind-down deadline passed.");
      await closeTasksFor(tx, TRIP_BUCKET_KIND, bucket.id, "SYSTEM:TRIP_WIND_DOWN", "Wind-down deadline passed.", TRIP_WIND_DOWN_PURPOSE);
      changed++;
      continue;
    }
    await ensureTask(tx, {
      recordKind: TRIP_BUCKET_KIND,
      recordId: bucket.id,
      recordName: `${bucket.memberProfile.memberId} · ${bucket.memberProfile.person.fullName} · ${bucket.programmeCode}`,
      purpose: TRIP_WIND_DOWN_PURPOSE,
      title: "Trip Credit Expiry / Bucket Wind-Down Review",
      assigneeRole: "CRM",
      dueAt: windDown ?? now,
      latestResult: `The ${bucket.programmeCode} programme has closed; this open bucket ends ${windDown ? `on its wind-down deadline` : "when its wind-down deadline is set"}.`,
    });
  }
  return changed;
}
