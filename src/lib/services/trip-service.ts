// Sales & Reference Trip Reward — SSOT §37–§66, §99; Change Pack §22–§39, §60,
// §65 (NT03–NT05, NT10), §76, §86; Trip Terms 6.1.
//
// Everything here is derived from current state and idempotent: each event
// that can move a Booking (approval, payment, cancellation, Buyback, Change
// Plot, Sold By Correction) calls `syncTripForBooking`, which decides what its
// Own-Sale Credit and any Reference Credit should be, then re-evaluates the
// buckets they feed. Non-cash throughout: no rupee value is stored.
//
// Owner, 27 Oct 2026 (docs/Rewards_Guide.md): at most one Reward per Member
// per Project; a sale locked into an earned Reward stays there whatever
// happens to its Booking later; credits do not expire; and there is no
// Reward Sale Cancelled (NT04) or Reward Expiry (NT05) task.

import type { Prisma, RewardHoldReason, RewardRecipient, TripCredit } from "@prisma/client";
import { db } from "@/lib/db";
import { notFutureDated } from "@/lib/domain/booking";
import { BUYBACK_MIN_SOURCE_PAYMENT } from "@/lib/domain/commission";
import { createsInviteCycle } from "@/lib/domain/network";
import { allocate, CREDIT_REASON, type AllocatableCredit } from "@/lib/domain/trip";
import { recordAudit } from "@/lib/security/audit";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { outstandingRecovery } from "./commission-service";
import { closeTasksFor, completeTask, ensureTask } from "./task-service";
import { assertIndependent, controlHoldReason } from "./benefit-control-service";

/** CP §65 NT03. */
export const TRIP_FULFILMENT_PURPOSE = "TRIP_REWARD_FULFILMENT";
export const TRIP_REWARD_KIND = "Trip Reward";
export const TRIP_BUCKET_KIND = "Trip Bucket";
/** What a closed Reward Earned task reads — "Reward" and nothing more. */
export const REWARD_EARNED_RESULT = "Reward earned.";

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

/** A credit inside an earned Reward: final, whatever happens to its Booking. */
const locked = (credit: TripCredit) => credit.state === "ALLOCATED" || credit.state === "USED";

/**
 * SSOT §63 — a credit whose basis is gone. One locked into an earned Reward
 * is final and never touched (owner, 27 Oct 2026).
 */
export async function invalidate(tx: Tx, credit: TripCredit, actorRef: string, reason: string) {
  if (locked(credit) || credit.state === "REVERSED" || credit.state === "EXPIRED") return;
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

/** Qualification lost (SSOT §99): back to Pending. Never reached for a locked credit. */
async function unqualify(tx: Tx, credit: TripCredit, actorRef: string) {
  if (credit.state !== "QUALIFIED") return;
  await tx.tripCredit.update({
    where: { id: credit.id },
    data: { state: "PENDING", qualifiedAt: null, expiresAt: null, qualificationRoute: null },
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
  // The sale is locked into an earned Reward: nothing about it changes now,
  // and its Reference Credit was settled when it qualified.
  if (live && locked(live)) return;
  const owner = booking.soldByType === "MEMBER" ? booking.soldByPerson?.memberProfile ?? null : null;
  const rule = v?.tripInventoryRules.find((r) => r.plotId === booking.plotId);
  const creditPlotId = rule?.parentCreditPoolPlotId ?? booking.plotId;
  let why: string | null = null;
  if (!booking.bookingNumber || !booking.approvedAt || CLOSED_BOOKING.includes(booking.status)) why = CREDIT_REASON.BOOKING_NOT_LIVE;
  else if (!v?.tripEnabled) why = "The frozen Project settings have Rewards Disabled.";
  else if (v.tripCutOffAt && booking.approvedAt > v.tripCutOffAt) why = "Approved after the programme cut-off (SSOT §48).";
  else if (!owner) why = "Not Sold By a Member, so no Own-Sale Credit (SSOT §60).";
  else if (rule && !rule.eligible) why = "The final Plot is excluded from Rewards (SSOT §45).";
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
      await invalidate(tx, live, actorRef, CREDIT_REASON.SOLD_BY_CORRECTED);
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
        data: { state: "QUALIFIED", qualifiedAt: now, qualificationRoute: route },
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
  if (await hasReward(tx, credit.memberProfileId, credit.projectId)) return null;
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

/** Owner, 27 Oct 2026 — at most one Reward per Member per Project, across its programmes. */
async function hasReward(tx: Tx, memberProfileId: string, projectId: string) {
  return (await tx.tripReward.count({ where: { memberProfileId, state: { not: "CANCELLED" }, bucket: { projectId } } })) > 0;
}

/**
 * SSOT §57, §58; CP §33, §34 — the open bucket earns if the pool now meets
 * its frozen target and composition, and the Member has no Reward in this
 * Project yet. An earned Reward never changes after: its sales are locked.
 */
export async function evaluateBuckets(tx: Tx, memberProfileId: string, projectId: string, programmeCode: string, actorRef: string) {
  await lockKey(tx, `trip:${memberProfileId}:${projectId}:${programmeCode}`);
  const scope = { memberProfileId, projectId, programmeCode };
  const open = await tx.tripBucket.findFirst({ where: { ...scope, state: "OPEN" } });
  if (!open) return;
  const pool = (await tx.tripCredit.findMany({ where: { ...scope, state: "QUALIFIED", bucketId: null } })).map(asAllocatable);
  const add = allocate(pool, { target: open.totalTarget, minOwn: open.minOwnCredits, maxRef: open.maxReferenceCredits });
  if (add && !(await hasReward(tx, memberProfileId, projectId))) {
    await tx.tripCredit.updateMany({ where: { id: { in: add } }, data: { state: "ALLOCATED", bucketId: open.id } });
    for (const id of add) await event(tx, memberProfileId, { creditId: id, bucketId: open.id }, actorRef, "CREDIT_ALLOCATED", "QUALIFIED", "ALLOCATED");
    await tx.tripBucket.update({ where: { id: open.id }, data: { state: "EARNED", earnedAt: new Date() } });
    const reward = await tx.tripReward.create({
      data: { bucketId: open.id, memberProfileId, termsVersionRef: open.termsVersionRef },
    });
    await event(tx, memberProfileId, { bucketId: open.id, rewardId: reward.id }, actorRef, "TRIP_EARNED", "OPEN", "EARNED");
    // Owner, 27 Oct 2026 — the Reward Earned task closes as the Reward is
    // earned: the Task List records that it happened and asks for nothing
    // more, since fulfilling a Reward is not shown anywhere.
    const member = await tx.memberProfile.findUniqueOrThrow({ where: { id: memberProfileId }, include: { person: { select: { fullName: true } } } });
    const task = await ensureTask(tx, {
      recordKind: TRIP_REWARD_KIND,
      recordId: reward.id,
      recordName: `${member.memberId} · ${member.person.fullName}`,
      purpose: TRIP_FULFILMENT_PURPOSE,
      title: "Reward Earned",
      assigneeRole: "CRM",
      dueAt: new Date(),
    });
    await completeTask(tx, task.id, actorRef, REWARD_EARNED_RESULT);
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
  return null;
}

/** Recomputes a reward's hold (CP §65, §66). Its NT03 task is raised and closed when it is earned. */
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
  if (role !== "CRM" && role !== "MD") blocked("Only CRM or MD records Reward fulfilment.");
}

async function lockedReward(tx: Tx, rewardId: string) {
  const found = await tx.tripReward.findUnique({ where: { id: rewardId }, select: { memberProfileId: true } });
  if (!found) blocked("That Reward no longer exists.");
  await lockKey(tx, `trip-reward:${rewardId}`);
  return tx.tripReward.findUniqueOrThrow({ where: { id: rewardId } });
}

/** SSOT §65; doc 5 §6 — the traveller. Family or not, it stands as recorded: the owner removed MD approval for a non-family nominee (14 Oct 2026). */
export async function recordTripNominee(args: Actor & { rewardId: string; recipient: RewardRecipient; recipientName: string }) {
  fulfilmentRole(args.actorRole);
  if (args.recipient !== "SELF" && !args.recipientName.trim()) blocked("Enter the nominee's name.");
  return runCommand<{ rewardId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "TRIP_NOMINEE", actorRef: args.actorRef, actorRole: args.actorRole, payload: { rewardId: args.rewardId, recipient: args.recipient } },
    async (tx) => {
      const reward = await lockedReward(tx, args.rewardId);
      if (reward.state !== "EARNED") blocked("The traveller can only be recorded before the Reward is booked.");
      const name = args.recipient === "SELF" ? null : args.recipientName.trim();
      await tx.tripReward.update({ where: { id: reward.id }, data: { recipient: args.recipient, recipientName: name } });
      await event(tx, reward.memberProfileId, { rewardId: reward.id }, args.actorRef, "NOMINEE_RECORDED", null, args.recipient, name ?? undefined);
      await refreshTripReward(tx, reward.id, args.actorRef);
      return { result: { rewardId: reward.id }, audit: { entity: "TripReward", entityId: reward.id, action: "TRIP_NOMINEE_RECORDED", after: { recipient: args.recipient, name } } };
    }
  );
}

/** CP §58, §78 — the Trip's owner, for the independent-processor check. */
async function tripOwner(rewardId: string) {
  const reward = await db.tripReward.findUnique({ where: { id: rewardId }, select: { memberProfile: { select: { personId: true } } } });
  if (!reward) blocked("That Reward no longer exists.");
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
      if (reward.state !== "EARNED") blocked("Only an Earned Reward can be booked.");
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

/** SSOT §64 — travelled, on screen "Mark Delivered": the credits it used stay
 *  consumed forever. An Earned Reward is delivered directly, with no booking
 *  step (owner, 27 Oct 2026). */
export async function markTripTravelled(args: Actor & { rewardId: string; travelledOn: Date }) {
  fulfilmentRole(args.actorRole);
  await assertIndependent({ ...args, beneficiaryPersonId: await tripOwner(args.rewardId), action: "TRIP_TRAVELLED" });
  const dated = notFutureDated("Travel date", args.travelledOn);
  if (!dated.ok) blocked(dated.reason);
  return runCommand<{ rewardId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "TRIP_TRAVELLED", actorRef: args.actorRef, actorRole: args.actorRole, payload: { rewardId: args.rewardId } },
    async (tx) => {
      const reward = await lockedReward(tx, args.rewardId);
      if (reward.state !== "EARNED" && reward.state !== "BOOKED") blocked("Only an Earned Reward can be marked delivered.");
      await refreshTripReward(tx, reward.id, args.actorRef);
      const now = await tx.tripReward.findUniqueOrThrow({ where: { id: reward.id } });
      if (now.holdReason) blocked(`Fulfilment is on hold: ${now.holdReason.replaceAll("_", " ").toLowerCase()}.`);
      await tx.tripReward.update({ where: { id: reward.id }, data: { state: "TRAVELLED", travelledAt: args.travelledOn, holdReason: null } });
      await tx.tripCredit.updateMany({ where: { bucketId: reward.bucketId, state: "ALLOCATED" }, data: { state: "USED", usedAt: args.travelledOn } });
      await event(tx, reward.memberProfileId, { rewardId: reward.id }, args.actorRef, "TRIP_TRAVELLED", reward.state, "TRAVELLED");
      await closeTasksFor(tx, TRIP_REWARD_KIND, reward.id, args.actorRef, "Reward completed.");
      return { result: { rewardId: reward.id }, audit: { entity: "TripReward", entityId: reward.id, action: "TRIP_TRAVELLED", after: { travelledOn: args.travelledOn.toISOString() } } };
    }
  );
}

/* ---------------------------------------------------------------- inviter */

/**
 * SSOT §37, §38; CP §22 — MD corrects the Membership inviter with a
 * reason, but not once the introduced Member's first Reference-eligible
 * Booking Request is submitted (a third-party sale in a Trip-enabled
 * version). A refused attempt is audited (CP §79).
 */
/** docss/11 §3 — refuses self-referral and an inviter that would close a loop in who invited whom. */
export async function refuseInviteLoop(tx: Tx, memberProfileId: string, inviterId: string) {
  if (inviterId === memberProfileId) blocked("A Member cannot be their own inviter.");
  // ponytail: loads every Member's inviter at once; walk it by query if the network outgrows memory.
  const rows = await tx.memberProfile.findMany({ select: { id: true, invitedByMemberId: true } });
  const inviterOf = new Map(rows.map((r) => [r.id, r.invitedByMemberId]));
  if (createsInviteCycle(memberProfileId, inviterId, (id) => inviterOf.get(id) ?? null)) {
    blocked("That inviter would make a loop in who invited whom.");
  }
}

/** SSOT §38 — once the Member's first Reference-eligible Booking Request is in, the inviter is final. */
export async function inviterCutOffReached(personId: string) {
  const count = await db.booking.count({
    where: {
      soldByType: "MEMBER",
      soldByPersonId: personId,
      primaryPersonId: { not: personId },
      commissionVersion: { tripEnabled: true },
    },
  });
  return count > 0;
}

export async function correctInviter(args: Actor & { memberProfileId: string; invitedByMemberId: string | null; reason: string }) {
  if (args.actorRole !== "MD") blocked("Only MD may correct an inviter.");
  if (!args.reason.trim()) blocked("A compulsory reason is required.");
  const member = await db.memberProfile.findUnique({ where: { id: args.memberProfileId } });
  if (!member) blocked("That Member no longer exists.");
  if (await inviterCutOffReached(member.personId)) {
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
        await refuseInviteLoop(tx, member.id, args.invitedByMemberId);
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
 * SSOT §48; CP §36, §76.2 — once a programme's cut-off has passed, each open
 * bucket expires at the final wind-down deadline. No task is raised (owner,
 * 27 Oct 2026). The closure is read from the Project's live version of that
 * programme.
 */
export async function windDownTripBuckets(tx: Tx, now: Date) {
  const open = await tx.tripBucket.findMany({ where: { state: "OPEN" } });
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
      changed++;
    }
  }
  return changed;
}
