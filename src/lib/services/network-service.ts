// Member activation, who invited whom, and the Royalty relationship.
// SSOT §37, §67–§71; prd-complete §7.1, §14.3.
//
// The Invite and Royalty positions, bands and cycles are gone (Removal Audit
// OL-02 to OL-14). What stays is the relationship itself: the inviting Member
// (Part 3, Reference Credit) and the Royalty Linked Member (Part 2, Gift).

import type { Prisma } from "@prisma/client";
import { BUYBACK_MIN_SOURCE_PAYMENT } from "@/lib/domain/commission";
import { INITIAL_PORTAL_PASSWORD, hashPassword } from "@/lib/security/auth";
import { blocked, nextReference, runCommand, type Tx } from "./command";
import { CLOSING_LIMIT_PURPOSE, reassessCommission } from "./commission-service";
import {
  originalPurchasesOf,
  refreshCreditsOfMember,
  reverseUndeliveredCredit,
  syncRoyaltyReward,
} from "./royalty-service";
import { closeTasksFor, ensureTask } from "./task-service";

/**
 * The Royalty relationship — SSOT §67–§71; CP §40–§42 — recomputed from the
 * Bookings themselves, then the Royalty Credit it may lead to (SSOT §72).
 *
 * One idempotent function: every event that could move the link (approval, a
 * payment, a Buyback approved or unwound, a cancellation, a Sold By
 * Correction) calls this, and the answer is derived from current state.
 *
 * - the first qualifying purchase is the Customer's earliest approved Booking
 *   as original Primary Customer; an exact tie goes to the lower Booking Number;
 * - Sold By Member on it is the Provisional Royalty Linked Member; Sold By
 *   3% Club or Sold By Customer means no Member relationship (SSOT §71);
 * - it becomes Final at 100% verified Payment Received, or at an Approved
 *   Buyback on that Booking once it has 25% received (SSOT §68, §59);
 * - a Final link is not recomputed by later sales or cancellations, except
 *   that a link made final only by a Buyback goes back to Provisional if that
 *   Buyback unwinds before 100% and the opportunity is still unused (SSOT §62),
 *   and a Sold By Correction on the first purchase re-links it (CP §59; see
 *   `relinkAfterSoldByCorrection`).
 */
export async function syncRoyaltyLink(tx: Tx, personId: string, actorRef: string) {
  const linked = await syncLink(tx, personId, actorRef);
  await syncRoyaltyReward(tx, personId, actorRef);
  return linked;
}

/** The first qualifying purchase's Buyback-or-payment milestone, if reached. */
async function finalisationRoute(
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

async function syncLink(tx: Tx, personId: string, actorRef: string) {
  let customer = await tx.customerProfile.findUnique({ where: { personId } });
  if (!customer) return null;

  // SSOT §62 — a Buyback-only finalisation unwinds with its Buyback.
  if (
    customer.royaltyLinkFinalAt &&
    customer.royaltyLinkFinalRoute === "APPROVED_BUYBACK" &&
    !customer.royaltyOpportunityConsumedAt &&
    customer.royaltyLinkFirstBookingId
  ) {
    const first = await tx.booking.findUniqueOrThrow({ where: { id: customer.royaltyLinkFirstBookingId } });
    if ((await finalisationRoute(tx, first)) === null) {
      customer = await tx.customerProfile.update({
        where: { id: customer.id },
        data: { royaltyLinkFinalAt: null, royaltyLinkFinalRoute: null },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: first.id,
          actorRef,
          action: "ROYALTY_LINK_PROVISIONAL_AGAIN",
          reason:
            "The Approved Buyback that made this Royalty relationship final has unwound before 100% " +
            "Payment Received, so the relationship is provisional again (SSOT §62).",
        },
      });
    }
  }
  if (customer.royaltyLinkFinalAt) return customer.royaltyLinkedMemberId;

  const candidates = (await originalPurchasesOf(tx, personId)).sort(
    (a, b) =>
      a.approvedAt!.getTime() - b.approvedAt!.getTime() || (a.bookingNumber! < b.bookingNumber! ? -1 : 1)
  );
  const first = candidates[0];

  if (!first) {
    // SSOT §70 — every candidate is gone, so the provisional link goes with
    // them. History stays on the Booking events; nothing was consumed.
    if (customer.royaltyLinkFirstBookingId) {
      await tx.bookingEvent.create({
        data: {
          bookingId: customer.royaltyLinkFirstBookingId,
          actorRef,
          action: "ROYALTY_LINK_REMOVED",
          reason:
            "The Booking that held the provisional Royalty relationship is no longer a qualifying first " +
            "purchase. The opportunity was not consumed (SSOT §70).",
        },
      });
      await tx.customerProfile.update({
        where: { id: customer.id },
        data: { royaltyLinkedMemberId: null, royaltyLinkFirstBookingId: null },
      });
    }
    return null;
  }

  const linkedMember =
    first.soldByType === "MEMBER" && first.soldByPersonId
      ? await tx.memberProfile.findUnique({ where: { personId: first.soldByPersonId } })
      : null;

  if (
    customer.royaltyLinkFirstBookingId !== first.id ||
    customer.royaltyLinkedMemberId !== (linkedMember?.id ?? null)
  ) {
    await tx.customerProfile.update({
      where: { id: customer.id },
      data: { royaltyLinkFirstBookingId: first.id, royaltyLinkedMemberId: linkedMember?.id ?? null },
    });
    await tx.bookingEvent.create({
      data: {
        bookingId: first.id,
        actorRef,
        action: "ROYALTY_LINK_PROVISIONAL",
        reason: linkedMember
          ? `Provisional Royalty Linked Member — ${linkedMember.memberId}, Sold By Member on this first ` +
            `qualifying purchase. It becomes final when this purchase is paid in full (SSOT §68).`
          : `No Royalty Linked Member — this first qualifying purchase was ${
              first.soldByType === "CUSTOMER" ? "Sold By Customer" : "Sold By 3% CLUB"
            } (SSOT §71).`,
      },
    });
  }

  const route = await finalisationRoute(tx, first);
  if (!route) return linkedMember?.id ?? null;

  await tx.customerProfile.update({
    where: { id: customer.id },
    data: { royaltyLinkFinalAt: new Date(), royaltyLinkFinalRoute: route },
  });
  await tx.bookingEvent.create({
    data: {
      bookingId: first.id,
      actorRef,
      action: "ROYALTY_LINK_FINAL",
      reason: linkedMember
        ? `Royalty Linked Member final — ${linkedMember.memberId}, on ${
            route === "PAYMENT_100" ? "100% Payment Received" : "an Approved Buyback"
          } (SSOT §68).`
        : `No Royalty Linked Member, now final on ${
            route === "PAYMENT_100" ? "100% Payment Received" : "an Approved Buyback"
          }. No later sale can create one (SSOT §71).`,
    },
  });
  return linkedMember?.id ?? null;
}

/**
 * CP §59 — a Sold By Correction on the Customer's first qualifying purchase
 * re-links the relationship to the corrected closer, final or not. A Royalty
 * Credit not yet delivered moves with it: the old one is reversed and the
 * reward sync gives the corrected Member a new one under the same rules. A
 * delivered Gift stays consumed (SSOT §98); only the history changes.
 */
export async function relinkAfterSoldByCorrection(tx: Tx, bookingId: string, actorRef: string) {
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const customer = await tx.customerProfile.findFirst({ where: { royaltyLinkFirstBookingId: bookingId } });
  if (customer) {
    const member =
      booking.soldByType === "MEMBER" && booking.soldByPersonId
        ? await tx.memberProfile.findUnique({ where: { personId: booking.soldByPersonId } })
        : null;
    if (customer.royaltyLinkedMemberId !== (member?.id ?? null)) {
      await tx.customerProfile.update({ where: { id: customer.id }, data: { royaltyLinkedMemberId: member?.id ?? null } });
      await tx.bookingEvent.create({
        data: {
          bookingId,
          actorRef,
          action: "ROYALTY_LINK_CORRECTED",
          reason: member
            ? `Sold By corrected — Royalty Linked Member is now ${member.memberId} (CP §59).`
            : "Sold By corrected — this first purchase now has no Royalty Linked Member (CP §59).",
        },
      });
      await reverseUndeliveredCredit(tx, customer.id, actorRef, "Sold By corrected on the first purchase (CP §59).");
    }
    await syncRoyaltyReward(tx, customer.personId, actorRef);
  }
  // The corrected Booking may itself be a reward trigger (its Sold By moved).
  await syncRoyaltyLink(tx, booking.primaryPersonId, actorRef);
}

/**
 * prd-complete §7.1 — only Admin or MD may activate a Member. The Member ID becomes
 * active at activation, and activation cannot be backdated. The inviting Member
 * is recorded with it (v2.1 §26).
 */
export async function activateMember(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  personId: string;
  invitedByMemberId?: string | null;
  reraStatus?: "REGISTERED" | "PENDING" | "EXPIRED" | "NOT_APPLICABLE";
  reraNumber?: string | null;
  reraExpiryDate?: Date | null;
  reraNotApplicableReason?: string | null;
}) {
  if (args.actorRole !== "ADMIN" && args.actorRole !== "MD") {
    blocked("Only Admin or MD may activate a Member.");
  }

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "MEMBER_ACTIVATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { personId: args.personId, invitedByMemberId: args.invitedByMemberId ?? null },
    },
    async (tx) => {
      const person = await tx.person.findUniqueOrThrow({
        where: { id: args.personId },
        include: { memberProfile: true, customerProfile: { select: { id: true } } },
      });
      if (person.memberProfile?.activationDate) {
        blocked(`${person.fullName} is already an activated Member.`);
      }
      if (person.mergeStatus === "MERGED_AWAY") {
        blocked("This Person has been merged into another identity.");
      }

      const rera = args.reraStatus ?? "PENDING";
      if (rera === "NOT_APPLICABLE" && !args.reraNotApplicableReason?.trim()) {
        blocked("Not Applicable requires a compulsory reason.");
      }
      if (rera === "REGISTERED" && !args.reraNumber?.trim()) {
        blocked("A Registered RERA status requires the Registration Number.");
      }

      // v2.1 §26 — the inviter must be a real activated Member.
      if (args.invitedByMemberId) {
        const inviter = await tx.memberProfile.findUnique({ where: { id: args.invitedByMemberId } });
        if (!inviter?.activationDate) {
          blocked("The inviting Member is not activated, so they cannot be recorded as the inviter.");
        }
      }
      const invitedByMemberId = args.invitedByMemberId ?? null;

      // Activation is now; it cannot be backdated (prd-complete §7.1).
      const activationDate = new Date();
      const memberId =
        person.memberProfile?.memberId ?? (await nextReference(tx, "MEM", "Member"));

      const member = person.memberProfile
        ? await tx.memberProfile.update({
            where: { id: person.memberProfile.id },
            data: {
              activationDate,
              status: "ACTIVE",
              invitedByMemberId,
              reraStatus: rera,
              reraNumber: args.reraNumber?.trim() || null,
              reraExpiryDate: args.reraExpiryDate ?? null,
              reraNotApplicableReason: args.reraNotApplicableReason?.trim() || null,
            },
          })
        : await tx.memberProfile.create({
            data: {
              memberId,
              personId: person.id,
              activationDate,
              status: "ACTIVE",
              invitedByMemberId,
              reraStatus: rera,
              reraNumber: args.reraNumber?.trim() || null,
              reraExpiryDate: args.reraExpiryDate ?? null,
              reraNotApplicableReason: args.reraNotApplicableReason?.trim() || null,
            },
          });

      // CP §64 T43 — the Membership the Customer-closing limit asked for.
      if (person.customerProfile) {
        await closeTasksFor(
          tx,
          "Customer",
          person.customerProfile.id,
          args.actorRef,
          `Activated as Member ${member.memberId}.`,
          CLOSING_LIMIT_PURPOSE
        );
      }

      // Ensure PortalAccount exists so the Member can log into the Member Portal (PRD §17.1).
      const existingPortal = await tx.portalAccount.findUnique({
        where: { memberProfileId: member.id },
      });
      if (!existingPortal) {
        const defaultPasswordHash = hashPassword(INITIAL_PORTAL_PASSWORD);
        await tx.portalAccount.create({
          data: {
            memberProfileId: member.id,
            loginId: member.memberId,
            passwordHash: defaultPasswordHash,
            status: "ACTIVE",
          },
        });
      } else if (existingPortal.status !== "ACTIVE") {
        await tx.portalAccount.update({
          where: { id: existingPortal.id },
          data: { status: "ACTIVE" },
        });
      }

      return {
        result: {
          memberProfileId: member.id,
          memberId: member.memberId,
        },
        audit: {
          entity: "MemberProfile",
          entityId: member.id,
          action: "MEMBER_ACTIVATED",
          after: {
            memberId: member.memberId,
            invitedByMemberId,
          },
        },
      };
    }
  );
}

/**
 * PRD §13 — deactivation disables portal access immediately, stops new Member
 * activity, and puts every unpaid commission On Hold — Member Deactivated while
 * paid and Paid Early records remain historical. Reactivation rechecks unpaid eligibility rather than assuming it.
 */
export async function setMemberStatus(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  memberProfileId: string;
  active: boolean;
  reason: string;
}) {
  if (args.actorRole !== "ADMIN" && args.actorRole !== "MD") {
    blocked("Only Admin or MD may activate or deactivate a Member.");
  }
  if (!args.reason.trim()) blocked("A compulsory reason is required to change a Member status.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "MEMBER_SET_STATUS",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { memberProfileId: args.memberProfileId, active: args.active },
    },
    async (tx) => {
      const member = await tx.memberProfile.findUniqueOrThrow({
        where: { id: args.memberProfileId },
        include: { person: true, portalAccount: true },
      });
      if (!member.activationDate) blocked("This Member has not been activated yet.");

      const next = args.active ? "ACTIVE" : "DEACTIVATED";
      if (member.status === next) {
        blocked(`This Member is already ${next.toLowerCase()}.`);
      }

      await tx.memberProfile.update({
        where: { id: member.id },
        data: { status: next },
      });

      // Portal access is disabled immediately: bumping the session version
      // invalidates any session already signed in (PRD §13, §17.1).
      if (member.portalAccount) {
        await tx.portalAccount.update({
          where: { id: member.portalAccount.id },
          data: {
            status: args.active ? "ACTIVE" : "DISABLED",
            sessionVersion: member.portalAccount.sessionVersion + 1,
          },
        });
      }

      if (!args.active) {
        // Pending Member Hold Requests require CRM review; they are not closed
        // automatically, because CRM may still choose to honour them (PRD §13).
        const pending = await tx.holdRequest.count({
          where: { memberId: member.id, status: "PENDING" },
        });
        if (pending > 0) {
          await ensureTask(tx, {
            recordKind: "MemberProfile",
            recordId: member.id,
            recordName: `${member.memberId} · ${member.person.fullName}`,
            purpose: "DEACTIVATED_MEMBER_REQUEST_REVIEW",
            title: "Review Hold Requests of a deactivated Member",
            assigneeRole: "CRM",
            dueAt: new Date(),
            urgent: true,
            latestResult: `${pending} hold request${pending === 1 ? "" : "s"} waiting on CRM.`,
          });
        }
      } else {
        await closeTasksFor(
          tx,
          "MemberProfile",
          member.id,
          args.actorRef,
          `Member reactivated — ${args.reason}`,
          "DEACTIVATED_MEMBER_REQUEST_REVIEW"
        );
      }

      // Unpaid records move to or out of the hold; paid history is untouched.
      const affected = await tx.commissionRecord.findMany({
        where: {
          beneficiaryPersonId: member.personId,
          isCurrent: true,
          payment: { in: ["NOT_PAID", "ACCOUNTS_ADJUSTMENT_REQUIRED"] },
        },
        select: { bookingId: true },
        distinct: ["bookingId"],
      });
      for (const { bookingId } of affected) {
        // Buying Commission hangs off an Acquisition rather than a Booking.
        if (bookingId) await reassessCommission(tx, bookingId, args.actorRef);
      }
      // SSOT §82; CP §86 — the Member's Gift fulfilment holds or resumes too.
      await refreshCreditsOfMember(tx, member.personId, args.actorRef);

      return {
        result: { memberProfileId: member.id, status: next, reassessedBookings: affected.length },
        audit: {
          entity: "MemberProfile",
          entityId: member.id,
          action: args.active ? "MEMBER_REACTIVATED" : "MEMBER_DEACTIVATED",
          before: { status: member.status },
          after: { status: next },
          reason: args.reason,
        },
      };
    }
  );
}

/**
 * prd-complete §19.5 — Not Applicable always states why, Registered carries the
 * Registration Number, and Pending or Expired may hold commission. Changing the
 * status reassesses every unpaid record rather than waiting for the next event.
 */
export async function updateMemberRera(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  memberProfileId: string;
  status: "REGISTERED" | "PENDING" | "EXPIRED" | "NOT_APPLICABLE";
  reraNumber?: string | null;
  expiryDate?: Date | null;
  notApplicableReason?: string | null;
}) {
  if (args.status === "NOT_APPLICABLE" && !args.notApplicableReason?.trim()) {
    blocked("Not Applicable requires a compulsory reason.");
  }
  if (args.status === "REGISTERED" && !args.reraNumber?.trim()) {
    blocked("A Registered RERA status requires the Registration Number.");
  }

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "MEMBER_RERA_UPDATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { memberProfileId: args.memberProfileId, status: args.status },
    },
    async (tx) => {
      const member = await tx.memberProfile.findUniqueOrThrow({
        where: { id: args.memberProfileId },
      });

      await tx.memberProfile.update({
        where: { id: member.id },
        data: {
          reraStatus: args.status,
          reraNumber: args.reraNumber?.trim() || null,
          reraExpiryDate: args.expiryDate ?? null,
          reraNotApplicableReason: args.notApplicableReason?.trim() || null,
        },
      });

      const affected = await tx.commissionRecord.findMany({
        where: {
          beneficiaryPersonId: member.personId,
          isCurrent: true,
          payment: { in: ["NOT_PAID", "ACCOUNTS_ADJUSTMENT_REQUIRED"] },
        },
        select: { bookingId: true },
        distinct: ["bookingId"],
      });
      for (const { bookingId } of affected) {
        // Buying Commission hangs off an Acquisition rather than a Booking.
        if (bookingId) await reassessCommission(tx, bookingId, args.actorRef);
      }

      return {
        result: { memberProfileId: member.id, reraStatus: args.status },
        audit: {
          entity: "MemberProfile",
          entityId: member.id,
          action: "MEMBER_RERA_UPDATED",
          before: { reraStatus: member.reraStatus },
          after: { reraStatus: args.status },
        },
      };
    }
  );
}
