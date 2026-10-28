// Royalty Tokens — docss/11 (owner-approved handoff, 12 Oct 2026), built on the
// Royalty relationship (SSOT §67–§74, §98–§100; Change Pack §40–§49).
//
// A final linked Customer's first qualifying Club-direct purchase creates one
// RoyaltyAward for the Royalty Linked Member, at the token rate frozen on that
// purchase's Booking Request version. The award posts to the append-only token
// ledger only once its release conditions hold: a hold before release keeps it
// PENDING, a hold after release restricts it from funding anything. A Member
// spends from one pooled balance across every Project; spending arranged
// outside the CRM is recorded here and funded oldest-released-first. A deficit
// is a recorded redemption not yet fully funded, which later earnings clear
// through the same allocation. Nothing is overwritten: reversals and
// corrections are linked entries. No cash, no rate in rupees, no expiry.
//
// Locks: the Customer (`royalty:<customerProfileId>`) is always taken before the
// Member (`royalty-tokens:<memberProfileId>`); nothing takes a Customer lock
// while holding a Member lock.

import type { Prisma, RewardHoldReason, RewardRecipient } from "@prisma/client";
import { BUYBACK_MIN_SOURCE_PAYMENT } from "@/lib/domain/commission";
import { allocate, tokenFigures, validateBusinessDay, validateTokenQuantity } from "@/lib/domain/tokens";
import { db } from "@/lib/db";
import { istDay } from "@/lib/tasks";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { outstandingRecovery } from "./commission-service";
import { closeTasksFor } from "./task-service";
import { assertIndependent, controlHoldReason } from "./benefit-control-service";

export const AWARD_RECORD_KIND = "Royalty Award";

const LIVE = ["PENDING", "RELEASED"] as const;
const RECIPIENTS: readonly RewardRecipient[] = ["SELF", "SPOUSE", "PARENT", "CHILD", "SIBLING", "NON_FAMILY"];

const lockMember = (tx: Tx, memberProfileId: string) => lockKey(tx, `royalty-tokens:${memberProfileId}`);

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

async function awardEvent(tx: Tx, awardId: string, actorRef: string, action: string, from?: string, to?: string, reason?: string) {
  await tx.royaltyAwardEvent.create({
    data: { awardId, actorRef, action, fromState: from ?? null, toState: to ?? null, reason: reason ?? null },
  });
}

const sum = (rows: readonly { tokens: number }[]) => rows.reduce((n, r) => n + r.tokens, 0);

/* --------------------------------------------------------------- allocation */

/**
 * docss/11 §1 — funds every recorded redemption not yet fully funded from the
 * released, unrestricted awards with tokens left: oldest released first, then
 * id. A redemption left part-funded is the deficit later earnings clear. Any
 * award used is consumed for good. The caller holds the Member lock.
 */
async function settleMember(tx: Tx, memberProfileId: string) {
  const live = { where: { voidedAt: null }, select: { tokens: true } } as const;
  const awards = await tx.royaltyAward.findMany({
    where: { memberProfileId, state: "RELEASED", holdReason: null },
    include: { allocations: live },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
  });
  const redemptions = await tx.tokenRedemption.findMany({
    where: { memberProfileId, state: "RECORDED" },
    include: { allocations: live },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  });
  const plan = allocate(
    awards.map((a) => ({ awardId: a.id, free: a.tokens - sum(a.allocations) })),
    redemptions.map((r) => ({ redemptionId: r.id, unfunded: r.tokens - sum(r.allocations) }))
  );
  if (plan.length === 0) return;
  await tx.tokenAllocation.createMany({ data: plan.map((p) => ({ memberProfileId, ...p })) });
  await tx.royaltyAward.updateMany({
    where: { id: { in: [...new Set(plan.map((p) => p.awardId))] }, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

/* ------------------------------------------------------------ the award */

/**
 * docss/11 §1 — an award whose basis is gone. A posted one is reversed exactly
 * once, spent or not: its allocations are voided (spending stays recorded) and
 * the gap is a deficit. An unconsumed award gives the Customer's opportunity
 * back; a consumed one keeps it consumed.
 */
async function reverseAward(tx: Tx, awardId: string, actorRef: string, reason: string) {
  const found = await tx.royaltyAward.findUniqueOrThrow({ where: { id: awardId }, select: { memberProfileId: true } });
  await lockMember(tx, found.memberProfileId);
  const award = await tx.royaltyAward.findUniqueOrThrow({ where: { id: awardId } });
  if (award.state === "REVERSED") return;

  if (award.state === "RELEASED") {
    const posted = await tx.tokenLedgerEntry.findFirstOrThrow({
      where: { awardId, kind: "AWARD_POSTED", cycle: award.postings },
    });
    await tx.tokenLedgerEntry.create({
      data: {
        memberProfileId: award.memberProfileId,
        kind: "AWARD_REVERSED",
        tokens: -award.tokens,
        awardId,
        cycle: award.postings,
        reversesEntryId: posted.id,
        actorRef,
        reason,
      },
    });
    await tx.tokenAllocation.updateMany({
      where: { awardId, voidedAt: null },
      data: { voidedAt: new Date(), voidReason: `Award reversed — ${reason}` },
    });
  }
  await tx.royaltyAward.update({
    where: { id: awardId },
    data: { state: "REVERSED", reversedAt: new Date(), reversalReason: reason, holdReason: null },
  });
  if (!award.consumedAt) {
    await tx.customerProfile.update({ where: { id: award.customerProfileId }, data: { royaltyOpportunityConsumedAt: null } });
  }
  await awardEvent(tx, awardId, actorRef, "REVERSED", award.state, "REVERSED", reason);
  await closeTasksFor(tx, AWARD_RECORD_KIND, awardId, actorRef, `Cancelled — ${reason}`);
  // The voided allocations left a gap; other free tokens fill it first.
  if (award.state === "RELEASED") await settleMember(tx, award.memberProfileId);
}

/** CP §85; SSOT §80 — the first condition that stops release, after the control reviews. */
async function holdFor(
  tx: Tx,
  award: { triggerBookingId: string },
  member: { personId: string; status: string }
): Promise<RewardHoldReason | null> {
  if (await outstandingRecovery(tx, member.personId)) return "RECOVERY_OUTSTANDING";
  if (member.status === "DEACTIVATED") return "MEMBER_DEACTIVATED";
  const trigger = await tx.booking.findUniqueOrThrow({
    where: { id: award.triggerBookingId },
    select: { paymentReceivedPercent: true },
  });
  // docss/11 §1 — Buyback eligibility posts nothing until Stable Buyback
  // Completion, unless the purchase itself has since reached 100%.
  if (trigger.paymentReceivedPercent.lt(100)) {
    const stable = await tx.acquisition.count({
      where: { sourceBookingId: award.triggerBookingId, type: "BUYBACK", status: "APPROVED", stableCompletedAt: { not: null } },
    });
    if (stable === 0) return "BUYBACK_STABLE_COMPLETION_PENDING";
  }
  return null;
}

/**
 * Rechecks one award's hold. A PENDING award with none posts its tokens (one
 * AWARD_POSTED per posting cycle); a RELEASED award with one is restricted —
 * still earned, never used to fund anything. Then the Member is settled.
 */
export async function refreshAward(tx: Tx, awardId: string, actorRef: string) {
  const found = await tx.royaltyAward.findUnique({ where: { id: awardId }, select: { memberProfileId: true } });
  if (!found) return;
  await lockMember(tx, found.memberProfileId);
  const award = await tx.royaltyAward.findUniqueOrThrow({
    where: { id: awardId },
    include: {
      memberProfile: { select: { personId: true, status: true, memberId: true, person: { select: { fullName: true } } } },
      customerProfile: { select: { customerId: true } },
      triggerBooking: { select: { bookingNumber: true } },
    },
  });
  if (award.state === "REVERSED") return;

  // CP §55, §58 — the release controls raise their reviews even behind another hold.
  const control = await controlHoldReason(tx, {
    recordKind: AWARD_RECORD_KIND,
    recordId: award.id,
    personId: award.memberProfile.personId,
    recordName: `${award.memberProfile.memberId} · ${award.memberProfile.person.fullName} · ${award.customerProfile.customerId}`,
  });
  const hold = (await holdFor(tx, award, award.memberProfile)) ?? control;
  if (hold !== award.holdReason) {
    await tx.royaltyAward.update({ where: { id: award.id }, data: { holdReason: hold } });
    await awardEvent(tx, award.id, actorRef, hold ? "HELD" : "CLEARED", award.holdReason ?? undefined, hold ?? undefined);
  }

  if (award.state === "PENDING" && !hold) {
    const cycle = award.postings + 1;
    await tx.tokenLedgerEntry.create({
      data: {
        memberProfileId: award.memberProfileId,
        kind: "AWARD_POSTED",
        tokens: award.tokens,
        awardId: award.id,
        cycle,
        actorRef,
        reason: `${award.triggerBooking.bookingNumber} — Royalty from ${award.customerProfile.customerId}`,
      },
    });
    await tx.royaltyAward.update({ where: { id: award.id }, data: { state: "RELEASED", postings: cycle, releasedAt: new Date() } });
    await awardEvent(tx, award.id, actorRef, "POSTED", "PENDING", "RELEASED", `${award.tokens} points`);
  }
  await settleMember(tx, award.memberProfileId);
}

/**
 * The award for one Customer, recomputed from current state. Idempotent and
 * serialised per Customer: re-running it, or receiving the same event twice,
 * changes nothing the second time.
 */
export async function syncRoyaltyReward(tx: Tx, customerPersonId: string, actorRef: string) {
  const customer = await tx.customerProfile.findUnique({ where: { personId: customerPersonId } });
  if (!customer) return null;
  await lockKey(tx, `royalty:${customer.id}`);

  // 1. A live award stands only while its link is final to its Member and its
  //    Booking still qualifies.
  let live = await tx.royaltyAward.findFirst({ where: { customerProfileId: customer.id, state: { in: [...LIVE] } } });
  if (live) {
    const trigger = await tx.booking.findUniqueOrThrow({ where: { id: live.triggerBookingId } });
    const linkHolds = customer.royaltyLinkFinalAt !== null && customer.royaltyLinkedMemberId === live.memberProfileId;
    if (!linkHolds || !(await triggerRoute(tx, trigger))) {
      await reverseAward(
        tx,
        live.id,
        actorRef,
        linkHolds
          ? `${trigger.bookingNumber} no longer qualifies (payment, Buyback, cancellation or Sold By changed).`
          : "The Royalty relationship it rested on is no longer final for this Member."
      );
      live = null;
    }
  }

  // 2. With none live: an unused opportunity is taken by the first qualifying
  //    Club-direct purchase; a consumed one can only bring its own award back.
  //    SSOT §100 — one real person, one opportunity: a merged-away identity
  //    earns nothing, and one consumed under a merged identity is consumed here.
  const identity = await tx.person.findUniqueOrThrow({
    where: { id: customerPersonId },
    select: { mergeStatus: true, mergedPersons: { select: { customerProfile: { select: { royaltyOpportunityConsumedAt: true } } } } },
  });
  const consumedByMerge =
    identity.mergeStatus === "MERGED_AWAY" || identity.mergedPersons.some((p) => p.customerProfile?.royaltyOpportunityConsumedAt);
  const fresh = await tx.customerProfile.findUniqueOrThrow({ where: { id: customer.id } });
  const linkedMemberId = fresh.royaltyLinkedMemberId;
  if (!live && !consumedByMerge && fresh.royaltyLinkFinalAt && linkedMemberId) {
    const bound = fresh.royaltyOpportunityConsumedAt
      ? await tx.royaltyAward.findFirst({
          where: { customerProfileId: customer.id, state: "REVERSED", consumedAt: { not: null } },
          orderBy: { consumedAt: "desc" },
        })
      : null;
    const candidates = fresh.royaltyOpportunityConsumedAt
      ? bound && bound.memberProfileId === linkedMemberId
        ? [await tx.booking.findUniqueOrThrow({ where: { id: bound.triggerBookingId } })]
        : []
      : (await originalPurchasesOf(tx, customerPersonId))
          .filter((b) => b.id !== fresh.royaltyLinkFirstBookingId && b.royaltyTokensPerAward !== null)
          .sort((a, b) => (a.bookingNumber! < b.bookingNumber! ? -1 : 1));

    for (const booking of candidates) {
      const route = await triggerRoute(tx, booking);
      if (!route) continue;
      const previous = await tx.royaltyAward.findUnique({ where: { triggerBookingId: booking.id } });
      const state = {
        memberProfileId: linkedMemberId,
        state: "PENDING" as const,
        qualificationRoute: route,
        qualifiedAt: new Date(),
        holdReason: null,
        reversedAt: null,
        reversalReason: null,
      };
      if (previous) {
        // docss/11 §1 — a legitimate requalification restores the same award,
        // under its original saved rate; never a second benefit.
        live = await tx.royaltyAward.update({ where: { id: previous.id }, data: state });
      } else {
        const approved = await tx.bookingReviewVersion.findFirst({
          where: { bookingId: booking.id, status: "APPROVED" },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        live = await tx.royaltyAward.create({
          data: {
            ...state,
            customerProfileId: customer.id,
            triggerBookingId: booking.id,
            bookingReviewVersion: approved?.version ?? 1,
            projectId: booking.projectId,
            tokens: booking.royaltyTokensPerAward!,
          },
        });
      }
      if (!fresh.royaltyOpportunityConsumedAt) {
        await tx.customerProfile.update({ where: { id: customer.id }, data: { royaltyOpportunityConsumedAt: new Date() } });
      }
      await awardEvent(
        tx,
        live.id,
        actorRef,
        previous ? "RESTORED" : "QUALIFIED",
        previous?.state,
        "PENDING",
        `${booking.bookingNumber} — ${route === "PAYMENT_100" ? "100% Payment Received" : "Approved Buyback after 25%"}.`
      );
      break;
    }
  }

  if (live) await refreshAward(tx, live.id, actorRef);
  return live?.id ?? null;
}

/**
 * SSOT §100; CP §59 — the Customer's live award, reversed: a merge made it a
 * duplicate, or a Sold By Correction moved the relationship it rested on.
 */
export async function reverseLiveAward(tx: Tx, customerProfileId: string, actorRef: string, reason: string) {
  await lockKey(tx, `royalty:${customerProfileId}`);
  const live = await tx.royaltyAward.findFirst({ where: { customerProfileId, state: { in: [...LIVE] } } });
  if (live) await reverseAward(tx, live.id, actorRef, reason);
  return live;
}

/** CP §76.3, §76.4, §86 — a Recovery, deactivation or reactivation changed what holds this Member's awards. */
export async function refreshAwardsOfMember(tx: Tx, memberPersonId: string, actorRef: string) {
  const awards = await tx.royaltyAward.findMany({
    where: { memberProfile: { personId: memberPersonId }, state: { in: [...LIVE] } },
    select: { id: true },
  });
  for (const { id } of awards) await refreshAward(tx, id, actorRef);
  return awards.length;
}

/** SSOT §80 — a Buyback became, or stopped being, stable: its Booking's award is rechecked. */
export async function refreshAwardOfBooking(tx: Tx, bookingId: string, actorRef: string) {
  const award = await tx.royaltyAward.findUnique({ where: { triggerBookingId: bookingId }, select: { id: true } });
  if (award) await refreshAward(tx, award.id, actorRef);
}

/* ------------------------------------------------------------- position */

export type MemberHold = "MERGED_AWAY" | "MEMBER_DEACTIVATED" | "RECOVERY_OUTSTANDING";

export type TokenPosition = {
  earned: number;
  spent: number;
  balance: number;
  /** Released, unrestricted tokens free to spend, less any deficit. Negative in deficit. */
  available: number;
  /** Released tokens whose source is on hold: earned, but not usable. */
  restricted: number;
  restrictions: RewardHoldReason[];
  memberHold: MemberHold | null;
};

/** docss/11 §1 — the three figures from the ledger, and what can be spent now. */
export async function tokenPosition(tx: Tx, memberProfileId: string): Promise<TokenPosition> {
  const live = { where: { voidedAt: null }, select: { tokens: true } } as const;
  // One wave: the Member and their ledger do not depend on each other.
  const [member, ledger, awards, redemptions] = await Promise.all([
    tx.memberProfile.findUniqueOrThrow({
      where: { id: memberProfileId },
      select: { status: true, personId: true, person: { select: { mergeStatus: true } } },
    }),
    tx.tokenLedgerEntry.findMany({ where: { memberProfileId }, select: { kind: true, tokens: true } }),
    tx.royaltyAward.findMany({ where: { memberProfileId, state: "RELEASED" }, include: { allocations: live } }),
    tx.tokenRedemption.findMany({ where: { memberProfileId, state: "RECORDED" }, include: { allocations: live } }),
  ]);
  const unfunded = redemptions.reduce((n, r) => n + r.tokens - sum(r.allocations), 0);
  const free = (held: boolean) =>
    awards.filter((a) => (a.holdReason !== null) === held).reduce((n, a) => n + a.tokens - sum(a.allocations), 0);
  const memberHold: MemberHold | null =
    member.person.mergeStatus === "MERGED_AWAY"
      ? "MERGED_AWAY"
      : member.status === "DEACTIVATED"
        ? "MEMBER_DEACTIVATED"
        : (await outstandingRecovery(tx, member.personId))
          ? "RECOVERY_OUTSTANDING"
          : null;
  return {
    ...tokenFigures(ledger),
    available: free(false) - unfunded,
    restricted: free(true),
    restrictions: [...new Set(awards.flatMap((a) => (a.holdReason && a.tokens > sum(a.allocations) ? [a.holdReason] : [])))],
    memberHold,
  };
}

const HOLD_WORDS: Record<string, string> = {
  RECOVERY_OUTSTANDING: "a pending Recovery",
  MEMBER_DEACTIVATED: "the Member being Deactivated",
  BUYBACK_STABLE_COMPLETION_PENDING: "a Buyback not yet stably complete",
  RECOVERY_CIRCUMVENTION_REVIEW: "a Recovery Review",
};

/** Staff-facing: why spending is blocked or limited now. */
export function tokenBlockers(p: TokenPosition): string[] {
  const out: string[] = [];
  if (p.memberHold === "MERGED_AWAY") out.push("This identity was merged into another; record spending on the surviving Member.");
  if (p.memberHold === "MEMBER_DEACTIVATED") out.push("The Member is Deactivated: spending is blocked until reactivation. The balance is kept.");
  if (p.memberHold === "RECOVERY_OUTSTANDING") out.push("The Member has a pending Recovery: spending is blocked until it is cleared. The balance is kept.");
  if (p.available < 0) out.push(`The balance is below zero by ${-p.available} points; points earned next cover it first.`);
  if (p.restricted > 0) {
    out.push(`${p.restricted} points are restricted while their source is held (${p.restrictions.map((r) => HOLD_WORDS[r] ?? r).join(", ")}).`);
  }
  return out;
}

/** Member-safe: one sentence when something stops spending. */
function memberNotice(p: TokenPosition): string | null {
  if (p.memberHold === "MEMBER_DEACTIVATED") return "Spending is paused while your membership is inactive.";
  if (p.memberHold === "RECOVERY_OUTSTANDING") return "Spending is paused while an amount is being recovered.";
  if (p.available < 0) return `Your balance is below zero by ${-p.available} points. Points you earn next will cover this first.`;
  if (p.restricted > 0) return "Some points are under review and cannot be used yet.";
  return null;
}

function refuseUnlessSpendable(p: TokenPosition, tokens: number) {
  const reasons = tokenBlockers(p);
  if (p.memberHold) blocked(reasons.join(" "));
  if (tokens > p.available) {
    blocked(`Not enough points: ${Math.max(0, p.available)} can be spent now.${reasons.length ? ` ${reasons.join(" ")}` : ""}`);
  }
}

/** Every live award of the Member rechecked — holds re-read, anything releasable posted. */
async function refreshMemberAwards(tx: Tx, memberProfileId: string, actorRef: string) {
  const awards = await tx.royaltyAward.findMany({ where: { memberProfileId, state: { in: [...LIVE] } }, select: { id: true } });
  for (const { id } of awards) await refreshAward(tx, id, actorRef);
}

/* ---------------------------------------------------------- redemptions */

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

/** docss/11 §1 — recording spending keeps the existing CRM/Admin fulfilment permission. */
function fulfilmentRole(role: string) {
  if (role !== "CRM" && role !== "MD") blocked("Only CRM or MD records token spending.");
}

async function postRedemption(tx: Tx, redemption: { id: string; memberProfileId: string; tokens: number; reference: string | null }, actorRef: string) {
  await tx.tokenLedgerEntry.create({
    data: {
      memberProfileId: redemption.memberProfileId,
      kind: "REDEMPTION",
      tokens: -redemption.tokens,
      redemptionId: redemption.id,
      actorRef,
      reason: redemption.reference,
    },
  });
  await settleMember(tx, redemption.memberProfileId);
}

async function ownerOf(memberProfileId: string) {
  const member = await db.memberProfile.findUnique({ where: { id: memberProfileId }, select: { personId: true, memberId: true } });
  if (!member) blocked("That Member no longer exists.");
  return member;
}

/**
 * docss/11 §1 — staff record spending arranged outside the CRM. Holds are
 * rechecked and availability recomputed under the Member lock, so two
 * redemptions at once can never overspend. Any recipient, family or not, posts
 * at once: the owner removed MD approval for a non-family recipient (14 Oct 2026).
 */
export async function recordTokenRedemption(
  args: Actor & {
    memberProfileId: string;
    tokens: number;
    redeemedOn: string;
    recipient: RewardRecipient;
    recipientName: string;
    reference: string;
  }
) {
  fulfilmentRole(args.actorRole);
  const quantity = validateTokenQuantity("Tokens", args.tokens);
  if (!quantity.ok) blocked(quantity.reason);
  const dated = validateBusinessDay("Redemption date", args.redeemedOn, istDay(new Date()));
  if (!dated.ok) blocked(dated.reason);
  if (!RECIPIENTS.includes(args.recipient)) blocked("Choose who receives it.");
  const recipientName = args.recipient === "SELF" ? null : args.recipientName.trim();
  if (args.recipient !== "SELF" && !recipientName) blocked("Enter the recipient's name.");
  const reference = args.reference.trim() || null;
  const owner = await ownerOf(args.memberProfileId);
  await assertIndependent({ ...args, beneficiaryPersonId: owner.personId, action: "TOKEN_REDEMPTION_RECORD" });

  return runCommand<{ redemptionId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "TOKEN_REDEMPTION_RECORD",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { memberProfileId: args.memberProfileId, tokens: args.tokens, redeemedOn: args.redeemedOn, recipient: args.recipient, recipientName, reference },
    },
    async (tx) => {
      await lockMember(tx, args.memberProfileId);
      // The same submission arriving twice at once: the second finds the first.
      const already = await tx.tokenRedemption.findUnique({ where: { requestKey: args.idempotencyKey } });
      if (already) {
        return {
          result: { redemptionId: already.id },
          audit: { entity: "MemberProfile", entityId: args.memberProfileId, action: "TOKEN_REDEMPTION_REPLAYED", after: { redemptionId: already.id } },
        };
      }
      await refreshMemberAwards(tx, args.memberProfileId, args.actorRef);
      refuseUnlessSpendable(await tokenPosition(tx, args.memberProfileId), args.tokens);

      const redemption = await tx.tokenRedemption.create({
        data: {
          memberProfileId: args.memberProfileId,
          tokens: args.tokens,
          redeemedOn: new Date(`${args.redeemedOn}T00:00:00.000Z`),
          recipient: args.recipient,
          recipientName,
          reference,
          state: "RECORDED",
          requestKey: args.idempotencyKey,
          recordedByRef: args.actorRef,
        },
      });
      await postRedemption(tx, redemption, args.actorRef);
      return {
        result: { redemptionId: redemption.id },
        audit: {
          entity: "MemberProfile",
          entityId: args.memberProfileId,
          action: "TOKEN_REDEMPTION_RECORDED",
          after: { redemptionId: redemption.id, tokens: args.tokens, redeemedOn: args.redeemedOn, recipient: args.recipient, recipientName, reference },
        },
      };
    }
  );
}

/**
 * docss/11 §1 — an erroneous redemption is corrected by a linked entry giving
 * back exactly its tokens; its allocations are voided. The awards it used stay
 * consumed: a correction never reopens a lifetime reward.
 */
export async function correctTokenRedemption(args: Actor & { redemptionId: string; reason: string }) {
  if (args.actorRole !== "MD") blocked("Only MD corrects a recorded redemption.");
  if (!args.reason.trim()) blocked("A compulsory reason is required.");
  const found = await db.tokenRedemption.findUnique({ where: { id: args.redemptionId }, select: { memberProfileId: true } });
  if (!found) blocked("That redemption no longer exists.");
  const owner = await ownerOf(found.memberProfileId);
  await assertIndependent({ ...args, beneficiaryPersonId: owner.personId, action: "TOKEN_REDEMPTION_CORRECT" });

  return runCommand<{ redemptionId: string }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "TOKEN_REDEMPTION_CORRECT",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { redemptionId: args.redemptionId },
    },
    async (tx) => {
      await lockMember(tx, found.memberProfileId);
      const redemption = await tx.tokenRedemption.findUniqueOrThrow({ where: { id: args.redemptionId } });
      if (redemption.state !== "RECORDED") blocked("Only a recorded redemption can be corrected.");
      const entry = await tx.tokenLedgerEntry.findFirstOrThrow({ where: { redemptionId: redemption.id, kind: "REDEMPTION" } });
      const reason = args.reason.trim();
      await tx.tokenLedgerEntry.create({
        data: {
          memberProfileId: redemption.memberProfileId,
          kind: "REDEMPTION_CORRECTED",
          tokens: redemption.tokens,
          redemptionId: redemption.id,
          reversesEntryId: entry.id,
          actorRef: args.actorRef,
          reason,
        },
      });
      await tx.tokenAllocation.updateMany({
        where: { redemptionId: redemption.id, voidedAt: null },
        data: { voidedAt: new Date(), voidReason: `Redemption corrected — ${reason}` },
      });
      await tx.tokenRedemption.update({
        where: { id: redemption.id },
        data: { state: "CORRECTED", correctedByRef: args.actorRef, correctedAt: new Date(), correctionReason: reason },
      });
      // The freed tokens may fund an older deficit.
      await settleMember(tx, redemption.memberProfileId);
      return {
        result: { redemptionId: redemption.id },
        audit: {
          entity: "MemberProfile",
          entityId: redemption.memberProfileId,
          action: "TOKEN_REDEMPTION_CORRECTED",
          before: { tokens: redemption.tokens, redeemedOn: redemption.redeemedOn.toISOString().slice(0, 10) },
          reason,
        },
      };
    }
  );
}

/* ------------------------------------------------------------ read model */

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * docss/11 §1 — what a screen shows. A Member sees only the three figures,
 * each recorded redemption's tokens and date, and a one-line notice when
 * something stops spending. Staff also see every redemption, the awards behind
 * the balance (as history, never as wallets) and what can be recorded now.
 */
export async function memberTokenView(memberProfileId: string, audience: "STAFF" | "MEMBER") {
  // Everything here reads independently, so it loads in one wave rather than
  // one round trip after another.
  const [position, recorded, staffRows] = await Promise.all([
    tokenPosition(db, memberProfileId),
    db.tokenRedemption.findMany({
      where: { memberProfileId, state: "RECORDED" },
      orderBy: [{ redeemedOn: "desc" }, { recordedAt: "desc" }],
      select: { tokens: true, redeemedOn: true },
    }),
    audience === "STAFF"
      ? Promise.all([
          db.tokenRedemption.findMany({ where: { memberProfileId }, orderBy: [{ recordedAt: "desc" }] }),
          db.royaltyAward.findMany({
            where: { memberProfileId },
            include: {
              customerProfile: { select: { customerId: true, person: { select: { fullName: true } } } },
              triggerBooking: { select: { id: true, bookingNumber: true } },
              project: { select: { name: true } },
            },
            orderBy: { qualifiedAt: "desc" },
          }),
        ])
      : null,
  ]);
  const figures = { earned: position.earned, spent: position.spent, balance: position.balance };
  const redemptions = recorded.map((r) => ({ tokens: r.tokens, redeemedOn: dayOf(r.redeemedOn) }));
  if (!staffRows) return { figures, redemptions, notice: memberNotice(position), staff: null };

  const [all, awards] = staffRows;
  return {
    figures,
    redemptions,
    notice: memberNotice(position),
    staff: {
      canRecordUpTo: position.memberHold ? 0 : Math.max(0, position.available),
      blockers: tokenBlockers(position),
      redemptions: all.map((r) => ({
        id: r.id,
        memberProfileId: r.memberProfileId,
        tokens: r.tokens,
        redeemedOn: dayOf(r.redeemedOn),
        state: r.state,
        recipient: r.recipient,
        recipientName: r.recipientName,
        reference: r.reference,
        recordedByRef: r.recordedByRef,
        recordedAt: r.recordedAt.toISOString(),
        decisionNote: r.decisionNote,
        correctionReason: r.correctionReason,
      })),
      awards: awards.map((a) => ({
        id: a.id,
        customerId: a.customerProfile.customerId,
        customerName: a.customerProfile.person.fullName,
        bookingId: a.triggerBooking.id,
        bookingNumber: a.triggerBooking.bookingNumber,
        project: a.project.name,
        tokens: a.tokens,
        state: a.state,
        holdReason: a.holdReason,
        route: a.qualificationRoute,
        consumed: a.consumedAt !== null,
        qualifiedAt: a.qualifiedAt.toISOString(),
        reversalReason: a.reversalReason,
      })),
    },
  };
}

export type MemberTokenView = Awaited<ReturnType<typeof memberTokenView>>;
