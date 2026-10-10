// Royalty Relationship Reward — SSOT §64, §72–§83, §98; Change Pack §43–§49,
// §60, §65 (NT06, NT10), §85; Terms 6.2 and doc 5 Part III–IV.
//
// One qualifying event = one Royalty Credit = one catalogue Gift. A Final
// Royalty Linked Member earns it when their Customer's first qualifying
// Club-direct personal purchase reaches 100% Payment Received, or an Approved
// Buyback once 25% was received. The Gift Programme Version is the one frozen
// on that Booking. Fulfilment (select → order → deliver) is held while a
// Recovery, a deactivation, an unstable Buyback or an unapproved non-family
// recipient stands. A delivered Gift is final. No rate, amount or cash anywhere.

import type { Prisma, RewardHoldReason, RewardRecipient } from "@prisma/client";
import { notFutureDated } from "@/lib/domain/booking";
import { BUYBACK_MIN_SOURCE_PAYMENT } from "@/lib/domain/commission";
import { db } from "@/lib/db";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { outstandingRecovery } from "./commission-service";
import { closeTasksFor, ensureTask } from "./task-service";
import { assertIndependent, controlHoldReason } from "./benefit-control-service";

/** CP §65 NT06 — Royalty Gift Selection / Fulfilment. */
export const GIFT_FULFILMENT_PURPOSE = "ROYALTY_GIFT_FULFILMENT";
/** CP §65 NT10 — Non-Family Reward Nominee Approval. */
export const NOMINEE_APPROVAL_PURPOSE = "REWARD_NOMINEE_APPROVAL";
export const CREDIT_RECORD_KIND = "Royalty Credit";

const LIVE_STATES = ["ELIGIBLE", "SELECTED", "ORDERED"] as const;

/**
 * SSOT §36; CP §21 — a Primary Customer Change "changes ownership/customer
 * details only" and does not create a Royalty relationship from the transfer.
 * So the Royalty rules read each Booking's original Primary Customer: the one
 * before its earliest approved change, or the current one if it never changed.
 * Returns the approved, uncancelled Bookings whose original Primary Customer is
 * this Person.
 */
export async function originalPurchasesOf(tx: Tx, personId: string) {
  const bookings = await tx.booking.findMany({
    where: {
      bookingNumber: { not: null },
      approvedAt: { not: null },
      status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
      OR: [
        { primaryPersonId: personId },
        { customerChanges: { some: { status: "APPROVED", fromPersonId: personId } } },
      ],
    },
    include: {
      customerChanges: { where: { status: "APPROVED" }, orderBy: { decidedAt: "asc" }, take: 1 },
    },
  });
  return bookings.filter((b) => (b.customerChanges[0]?.fromPersonId ?? b.primaryPersonId) === personId);
}

/**
 * SSOT §72, §79, §80 — how a reward-triggering Booking qualifies now: 100%
 * Payment Received, else an Approved Buyback once 25% was received, else not.
 * Final Sold By must be 3% Club (SSOT §73).
 */
async function triggerRoute(
  tx: Tx,
  booking: { id: string; soldByType: string; status: string; paymentReceivedPercent: Prisma.Decimal }
): Promise<"PAYMENT_100" | "APPROVED_BUYBACK" | null> {
  if (booking.soldByType !== "THREE_PERCENT_CLUB") return null;
  if (["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"].includes(booking.status)) return null;
  if (booking.paymentReceivedPercent.gte(100)) return "PAYMENT_100";
  if (booking.paymentReceivedPercent.lt(BUYBACK_MIN_SOURCE_PAYMENT)) return null;
  const buyback = await tx.acquisition.count({
    where: { sourceBookingId: booking.id, type: "BUYBACK", status: "APPROVED" },
  });
  return buyback > 0 ? "APPROVED_BUYBACK" : null;
}

async function event(tx: Tx, creditId: string, actorRef: string, action: string, from?: string, to?: string, reason?: string) {
  await tx.royaltyCreditEvent.create({
    data: { creditId, actorRef, action, fromState: from ?? null, toState: to ?? null, reason: reason ?? null },
  });
}

/**
 * SSOT §62, §99; CP §47, §84 — an unfulfilled Credit whose basis is gone is
 * reversed and the opportunity reopens. No replacement is created on that
 * event. A delivered Gift is never reversed (SSOT §64).
 */
export async function reverseUndeliveredCredit(tx: Tx, customerProfileId: string, actorRef: string, reason: string) {
  const live = await tx.royaltyCredit.findFirst({
    where: { customerProfileId, state: { in: [...LIVE_STATES] } },
  });
  if (!live) return null;
  await tx.royaltyCredit.update({
    where: { id: live.id },
    data: { state: "REVERSED", reversedAt: new Date(), reversalReason: reason, holdReason: null },
  });
  await tx.customerProfile.update({ where: { id: customerProfileId }, data: { royaltyOpportunityConsumedAt: null } });
  await event(tx, live.id, actorRef, "REVERSED", live.state, "REVERSED", reason);
  await closeTasksFor(tx, CREDIT_RECORD_KIND, live.id, actorRef, `Reversed — ${reason}`);
  return live;
}

/**
 * CP §85; doc 5 §8, §9, §88 — the first hold that stops fulfilment, or null.
 * SSOT §80 — Buyback-based eligibility waits for Stable Buyback Completion
 * unless the purchase itself has reached 100% since.
 */
async function holdFor(
  tx: Tx,
  credit: { triggerBookingId: string; recipient: RewardRecipient | null; recipientApprovedAt: Date | null },
  member: { personId: string; status: string }
): Promise<RewardHoldReason | null> {
  if (await outstandingRecovery(tx, member.personId)) return "RECOVERY_OUTSTANDING";
  if (member.status === "DEACTIVATED") return "MEMBER_DEACTIVATED";
  const trigger = await tx.booking.findUniqueOrThrow({
    where: { id: credit.triggerBookingId },
    select: { paymentReceivedPercent: true },
  });
  if (trigger.paymentReceivedPercent.lt(100)) {
    const stable = await tx.acquisition.count({
      where: {
        sourceBookingId: credit.triggerBookingId,
        type: "BUYBACK",
        status: "APPROVED",
        stableCompletedAt: { not: null },
      },
    });
    if (stable === 0) return "BUYBACK_STABLE_COMPLETION_PENDING";
  }
  if (credit.recipient === "NON_FAMILY" && !credit.recipientApprovedAt) return "NOMINEE_APPROVAL_PENDING";
  return null;
}

/**
 * The Royalty Credit for one Customer, recomputed from current state.
 * Idempotent and serialised per Customer (UAT SYS-09: one Credit per
 * opportunity however the events race).
 */
export async function syncRoyaltyReward(tx: Tx, customerPersonId: string, actorRef: string) {
  const customer = await tx.customerProfile.findUnique({ where: { personId: customerPersonId } });
  if (!customer) return null;
  await lockKey(tx, `royalty:${customer.id}`);

  // 1. The live Credit still stands only while its Booking still qualifies.
  let live = await tx.royaltyCredit.findFirst({
    where: { customerProfileId: customer.id, state: { in: [...LIVE_STATES] } },
  });
  if (live) {
    const trigger = await tx.booking.findUniqueOrThrow({ where: { id: live.triggerBookingId } });
    const linkHolds = customer.royaltyLinkFinalAt && customer.royaltyLinkedMemberId === live.memberProfileId;
    if (!linkHolds || !(await triggerRoute(tx, trigger))) {
      await reverseUndeliveredCredit(
        tx,
        customer.id,
        actorRef,
        linkHolds
          ? `${trigger.bookingNumber} no longer qualifies (payment, Buyback, cancellation or Sold By changed).`
          : "The Royalty relationship it rested on is no longer final for this Member."
      );
      live = null;
    }
  }

  // 2. With the opportunity unused, the first qualifying Club-direct purchase earns it.
  // SSOT §100 — one real person, one opportunity: a merged-away identity earns
  // nothing, and one consumed under a merged identity is consumed here too.
  const identity = await tx.person.findUniqueOrThrow({
    where: { id: customerPersonId },
    select: { mergeStatus: true, mergedPersons: { select: { customerProfile: { select: { royaltyOpportunityConsumedAt: true } } } } },
  });
  const consumedByMerge =
    identity.mergeStatus === "MERGED_AWAY" || identity.mergedPersons.some((p) => p.customerProfile?.royaltyOpportunityConsumedAt);
  const fresh = await tx.customerProfile.findUniqueOrThrow({ where: { id: customer.id } });
  if (!live && !consumedByMerge && !fresh.royaltyOpportunityConsumedAt && fresh.royaltyLinkFinalAt && fresh.royaltyLinkedMemberId) {
    const candidates = (await originalPurchasesOf(tx, customerPersonId))
      .filter((b) => b.id !== fresh.royaltyLinkFirstBookingId && b.royaltyProgrammeVersionId)
      .sort((a, b) => (a.bookingNumber! < b.bookingNumber! ? -1 : 1));
    for (const booking of candidates) {
      const route = await triggerRoute(tx, booking);
      if (!route) continue;
      const previous = await tx.royaltyCredit.findUnique({ where: { triggerBookingId: booking.id } });
      const data = {
        customerProfileId: customer.id,
        memberProfileId: fresh.royaltyLinkedMemberId,
        programmeVersionId: booking.royaltyProgrammeVersionId!,
        state: "ELIGIBLE" as const,
        qualificationRoute: route,
        eligibleAt: new Date(),
        holdReason: null,
        selectedRewardRef: null,
        selectedAt: null,
        recipient: null,
        recipientName: null,
        recipientApprovedByRef: null,
        recipientApprovedAt: null,
        orderedAt: null,
        orderReference: null,
        reversedAt: null,
        reversalReason: null,
      };
      // SSOT §99 — the same Booking re-qualifying brings the same entitlement back.
      live = previous
        ? await tx.royaltyCredit.update({ where: { id: previous.id }, data })
        : await tx.royaltyCredit.create({ data: { ...data, triggerBookingId: booking.id } });
      await tx.customerProfile.update({ where: { id: customer.id }, data: { royaltyOpportunityConsumedAt: new Date() } });
      await event(
        tx,
        live.id,
        actorRef,
        previous ? "REQUALIFIED" : "ELIGIBLE",
        previous?.state,
        "ELIGIBLE",
        `${booking.bookingNumber} — ${route === "PAYMENT_100" ? "100% Payment Received" : "Approved Buyback after 25%"}.`
      );
      break;
    }
  }

  if (live) await refreshCredit(tx, live.id, actorRef);
  return live?.id ?? null;
}

/** Recomputes a live Credit's hold and its fulfilment task. */
export async function refreshCredit(tx: Tx, creditId: string, actorRef: string) {
  const credit = await tx.royaltyCredit.findUniqueOrThrow({
    where: { id: creditId },
    include: {
      memberProfile: { select: { personId: true, status: true, memberId: true, person: { select: { fullName: true } } } },
      customerProfile: { select: { customerId: true } },
    },
  });
  if (!LIVE_STATES.includes(credit.state as (typeof LIVE_STATES)[number])) return;
  // CP §55, §58 — the release controls raise their reviews even behind another hold.
  const control = await controlHoldReason(tx, {
    recordKind: CREDIT_RECORD_KIND,
    recordId: credit.id,
    personId: credit.memberProfile.personId,
    recordName: `${credit.memberProfile.memberId} · ${credit.memberProfile.person.fullName} · ${credit.customerProfile.customerId}`,
  });
  const hold = (await holdFor(tx, credit, credit.memberProfile)) ?? control;
  if (hold !== credit.holdReason) {
    await tx.royaltyCredit.update({ where: { id: credit.id }, data: { holdReason: hold } });
    await event(tx, credit.id, actorRef, hold ? "HELD" : "RELEASED", credit.holdReason ?? undefined, hold ?? undefined);
  }
  // CP §65 NT06, §66 — one task when the human work can start, not before.
  if (!hold) {
    await ensureTask(tx, {
      recordKind: CREDIT_RECORD_KIND,
      recordId: credit.id,
      recordName: `${credit.memberProfile.memberId} · ${credit.memberProfile.person.fullName} · ${credit.customerProfile.customerId}`,
      purpose: GIFT_FULFILMENT_PURPOSE,
      title: "Royalty Gift Selection / Fulfilment",
      assigneeRole: "CRM",
      dueAt: new Date(),
      latestResult: "Royalty Credit eligible. Record the Gift chosen from the frozen catalogue, then the order and delivery.",
    });
  }
}

/**
 * CP §76.3, §76.4, §86 — re-evaluates the Credits a Member owns after a
 * Recovery, a deactivation or reactivation changed what holds them.
 */
export async function refreshCreditsOfMember(tx: Tx, memberPersonId: string, actorRef: string) {
  const credits = await tx.royaltyCredit.findMany({
    where: { memberProfile: { personId: memberPersonId }, state: { in: [...LIVE_STATES] } },
    select: { id: true },
  });
  for (const { id } of credits) await refreshCredit(tx, id, actorRef);
  return credits.length;
}

/** SSOT §80 — a Buyback became, or stopped being, stable: its Booking's Credit is rechecked. */
export async function refreshCreditOfBooking(tx: Tx, bookingId: string, actorRef: string) {
  const credit = await tx.royaltyCredit.findUnique({ where: { triggerBookingId: bookingId }, select: { id: true } });
  if (credit) await refreshCredit(tx, credit.id, actorRef);
}

/* ------------------------------------------------------------ fulfilment */

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

/** CP §77 — CRM supports fulfilment; Admin operates it. */
function fulfilmentRole(role: string) {
  if (role !== "CRM" && role !== "ADMIN") blocked("Only CRM or Admin records Royalty Gift fulfilment.");
}

async function lockedCredit(tx: Tx, creditId: string) {
  const found = await tx.royaltyCredit.findUnique({ where: { id: creditId }, select: { customerProfileId: true } });
  if (!found) blocked("That Royalty Credit no longer exists.");
  await lockKey(tx, `royalty:${found.customerProfileId}`);
  return tx.royaltyCredit.findUniqueOrThrow({ where: { id: creditId } });
}

/**
 * Terms 6.2 §18, §20; doc 5 §6, §70 — the Gift chosen from the frozen
 * catalogue, and who receives it. A non-family recipient needs MD (NT10) and
 * holds fulfilment until approved. The choice may change until ordering.
 */
export async function selectRoyaltyGift(
  args: Actor & { creditId: string; rewardRef: string; recipient: RewardRecipient; recipientName: string }
) {
  fulfilmentRole(args.actorRole);
  if (!args.rewardRef.trim()) blocked("Enter the Reward Reference from the Programme's catalogue.");
  if (args.recipient !== "SELF" && !args.recipientName.trim()) blocked("Enter the recipient's name.");

  return runCommand<{ creditId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ROYALTY_GIFT_SELECT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { creditId: args.creditId, rewardRef: args.rewardRef.trim(), recipient: args.recipient },
    },
    async (tx) => {
      const credit = await lockedCredit(tx, args.creditId);
      if (credit.state !== "ELIGIBLE" && credit.state !== "SELECTED") {
        blocked("The Gift can only be chosen or changed before it is ordered.");
      }
      const recipientName = args.recipient === "SELF" ? null : args.recipientName.trim();
      await tx.royaltyCredit.update({
        where: { id: credit.id },
        data: {
          state: "SELECTED",
          selectedRewardRef: args.rewardRef.trim(),
          selectedAt: new Date(),
          recipient: args.recipient,
          recipientName,
          recipientApprovedByRef: null,
          recipientApprovedAt: null,
        },
      });
      await event(tx, credit.id, args.actorRef, "SELECTED", credit.state, "SELECTED", `${args.rewardRef.trim()} for ${args.recipient}`);
      if (args.recipient === "NON_FAMILY") {
        await ensureTask(tx, {
          recordKind: CREDIT_RECORD_KIND,
          recordId: credit.id,
          recordName: recipientName!,
          purpose: NOMINEE_APPROVAL_PURPOSE,
          title: "Non-Family Reward Nominee Approval",
          assigneeRole: "MD",
          dueAt: new Date(),
          decision: true,
          latestResult: `Royalty Gift ${args.rewardRef.trim()} to ${recipientName}, who is not immediate family.`,
        });
      } else {
        await closeTasksFor(tx, CREDIT_RECORD_KIND, credit.id, args.actorRef, "Recipient changed to family.", NOMINEE_APPROVAL_PURPOSE);
      }
      await refreshCredit(tx, credit.id, args.actorRef);
      return {
        result: { creditId: credit.id },
        audit: {
          entity: "RoyaltyCredit",
          entityId: credit.id,
          action: "ROYALTY_GIFT_SELECTED",
          after: { rewardRef: args.rewardRef.trim(), recipient: args.recipient, recipientName },
        },
      };
    }
  );
}

/** CP §65 NT10; doc 5 §6 — MD approves or rejects a non-family recipient. */
export async function decideRoyaltyRecipient(args: Actor & { creditId: string; approve: boolean; note: string }) {
  if (args.actorRole !== "MD") blocked("Only MD decides a non-family recipient.");
  if (!args.note.trim()) blocked("A compulsory note is required.");

  return runCommand<{ creditId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ROYALTY_RECIPIENT_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { creditId: args.creditId, approve: args.approve },
    },
    async (tx) => {
      const credit = await lockedCredit(tx, args.creditId);
      if (credit.recipient !== "NON_FAMILY" || credit.recipientApprovedAt || credit.state !== "SELECTED") {
        blocked("No non-family recipient is waiting for MD on this Royalty Credit.");
      }
      const note = args.note.trim();
      await tx.royaltyCredit.update({
        where: { id: credit.id },
        data: args.approve
          ? { recipientApprovedByRef: args.actorRef, recipientApprovedAt: new Date() }
          : // Refused: the Gift goes back to being chosen, with a family or own recipient.
            { state: "ELIGIBLE", recipient: null, recipientName: null, selectedAt: null, selectedRewardRef: null },
      });
      await event(tx, credit.id, args.actorRef, args.approve ? "RECIPIENT_APPROVED" : "RECIPIENT_REJECTED", credit.state, args.approve ? credit.state : "ELIGIBLE", note);
      await closeTasksFor(tx, CREDIT_RECORD_KIND, credit.id, args.actorRef, `${args.approve ? "Approved" : "Rejected"} — ${note}`, NOMINEE_APPROVAL_PURPOSE);
      await refreshCredit(tx, credit.id, args.actorRef);
      return {
        result: { creditId: credit.id },
        audit: {
          entity: "RoyaltyCredit",
          entityId: credit.id,
          action: args.approve ? "ROYALTY_RECIPIENT_APPROVED" : "ROYALTY_RECIPIENT_REJECTED",
          after: { recipientName: credit.recipientName },
          reason: note,
        },
      };
    }
  );
}

/** Terms 6.2 §18, §33 — ordered from the supplier; the choice locks. */
/** CP §58, §78 — the Gift's owner, for the independent-processor check. */
async function giftOwner(creditId: string) {
  const credit = await db.royaltyCredit.findUnique({ where: { id: creditId }, select: { memberProfile: { select: { personId: true } } } });
  if (!credit) blocked("That Royalty Credit no longer exists.");
  return credit.memberProfile.personId;
}

export async function orderRoyaltyGift(args: Actor & { creditId: string; orderReference: string; orderedOn: Date }) {
  fulfilmentRole(args.actorRole);
  await assertIndependent({ ...args, beneficiaryPersonId: await giftOwner(args.creditId), action: "ROYALTY_GIFT_ORDER" });
  if (!args.orderReference.trim()) blocked("Enter the order reference.");
  const dated = notFutureDated("Order date", args.orderedOn);
  if (!dated.ok) blocked(dated.reason);

  return runCommand<{ creditId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ROYALTY_GIFT_ORDER",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { creditId: args.creditId, orderReference: args.orderReference.trim() },
    },
    async (tx) => {
      const credit = await lockedCredit(tx, args.creditId);
      if (credit.state !== "SELECTED") blocked("Choose the Gift and its recipient before ordering it.");
      await refreshCredit(tx, credit.id, args.actorRef);
      const now = await tx.royaltyCredit.findUniqueOrThrow({ where: { id: credit.id } });
      if (now.holdReason) blocked(`Fulfilment is on hold: ${now.holdReason.replaceAll("_", " ").toLowerCase()}.`);
      await tx.royaltyCredit.update({
        where: { id: credit.id },
        data: { state: "ORDERED", orderedAt: args.orderedOn, orderReference: args.orderReference.trim() },
      });
      await event(tx, credit.id, args.actorRef, "ORDERED", "SELECTED", "ORDERED", args.orderReference.trim());
      return {
        result: { creditId: credit.id },
        audit: { entity: "RoyaltyCredit", entityId: credit.id, action: "ROYALTY_GIFT_ORDERED", after: { orderReference: args.orderReference.trim() } },
      };
    }
  );
}

/**
 * SSOT §64; Terms 6.2 §26 — delivered: the opportunity and the Credit stay
 * consumed forever; a later cancellation does not reopen them.
 */
export async function deliverRoyaltyGift(
  args: Actor & { creditId: string; deliveredOn: Date; deliveryReference: string }
) {
  fulfilmentRole(args.actorRole);
  await assertIndependent({ ...args, beneficiaryPersonId: await giftOwner(args.creditId), action: "ROYALTY_GIFT_DELIVER" });
  const dated = notFutureDated("Delivery date", args.deliveredOn);
  if (!dated.ok) blocked(dated.reason);

  return runCommand<{ creditId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ROYALTY_GIFT_DELIVER",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { creditId: args.creditId },
    },
    async (tx) => {
      const credit = await lockedCredit(tx, args.creditId);
      if (credit.state !== "ORDERED") blocked("Only an ordered Gift can be marked delivered.");
      await refreshCredit(tx, credit.id, args.actorRef);
      const now = await tx.royaltyCredit.findUniqueOrThrow({ where: { id: credit.id } });
      if (now.holdReason) blocked(`Fulfilment is on hold: ${now.holdReason.replaceAll("_", " ").toLowerCase()}.`);
      await tx.royaltyCredit.update({
        where: { id: credit.id },
        data: {
          state: "DELIVERED",
          deliveredAt: args.deliveredOn,
          deliveryReference: args.deliveryReference.trim() || null,
          holdReason: null,
        },
      });
      await event(tx, credit.id, args.actorRef, "DELIVERED", "ORDERED", "DELIVERED", args.deliveryReference.trim() || undefined);
      await closeTasksFor(tx, CREDIT_RECORD_KIND, credit.id, args.actorRef, "Gift delivered.", GIFT_FULFILMENT_PURPOSE);
      return {
        result: { creditId: credit.id },
        audit: {
          entity: "RoyaltyCredit",
          entityId: credit.id,
          action: "ROYALTY_GIFT_DELIVERED",
          after: { deliveredOn: args.deliveredOn.toISOString(), deliveryReference: args.deliveryReference.trim() || null },
        },
      };
    }
  );
}

/**
 * CP §60; SSOT §98 — whether a Sold By Correction on this Booking would touch
 * a delivered Gift: the Booking triggered one, or is the first purchase of a
 * Customer whose Gift was delivered. Such a correction needs MD.
 */
export async function touchesDeliveredGift(tx: Tx, bookingId: string): Promise<boolean> {
  const count = await tx.royaltyCredit.count({
    where: {
      state: "DELIVERED",
      OR: [{ triggerBookingId: bookingId }, { customerProfile: { royaltyLinkFirstBookingId: bookingId } }],
    },
  });
  return count > 0;
}
