// Member activation and the two network counters.
// PRD.md RD-02, §6.2, §6.3, §6.4; main-PRD §7.1, §14.3, §14.4;
// Approved Changes (2) CR-001 – CR-004.
//
// An Invite position is assigned once, at activation. A Royalty position is
// assigned once, when the Customer's first qualifying purchase reaches its
// milestone — never from an Enquiry (CR-001). Both are then permanently fixed
// with the band rate they earned: existing positions never reset, renumber or
// move.

import { db } from "@/lib/db";
import { bandRate, counterYearStart, nextNetworkPosition } from "@/lib/domain/commission";
import { hashPassword } from "@/lib/security/auth";
import { istDay, istInstant } from "@/lib/tasks";
import { blocked, lockKey, nextReference, runCommand, type Tx } from "./command";
import { generateForBooking, reassessCommission } from "./commission-service";
import { closeTasksFor, ensureTask } from "./task-service";

/** The counter year as an instant, so it can be stored and compared. */
function yearStartInstant(activationDate: Date, at: Date): Date {
  return new Date(istInstant(counterYearStart(activationDate, at), "00:00"));
}

/**
 * RD-02 — the next free position in the inviting Member's current annual
 * Invited Member Counter. Serialised on the counter so two activations in the
 * same year cannot take the same position.
 */
export async function assignInvitePosition(
  tx: Tx,
  args: { invitedMemberId: string; invitingMemberId: string; at?: Date }
) {
  const at = args.at ?? new Date();
  const inviter = await tx.memberProfile.findUniqueOrThrow({
    where: { id: args.invitingMemberId },
  });
  if (!inviter.activationDate) {
    blocked("The inviting Member is not activated, so no Network position can be assigned.");
  }

  const yearStart = yearStartInstant(inviter.activationDate, at);
  await lockKey(tx, `invite-counter:${inviter.id}:${istDay(yearStart)}`);

  const taken = await tx.memberProfile.findMany({
    where: { invitedByMemberId: inviter.id, inviteYearStart: yearStart, invitePosition: { not: null } },
    select: { invitePosition: true },
  });
  const position = nextNetworkPosition(taken.map((t) => t.invitePosition!));
  const ratePercent = bandRate(position);

  await tx.memberProfile.update({
    where: { id: args.invitedMemberId },
    data: {
      invitedByMemberId: inviter.id,
      invitePosition: position,
      inviteRatePercent: ratePercent,
      inviteYearStart: yearStart,
    },
  });
  return { position, ratePercent, yearStart };
}

/**
 * CR-002 — the Customer takes the next free position in the Royalty Linked
 * Member's Royalty counter. Called only when the link becomes final, because
 * that is the moment the pack says the position is taken: a provisional link
 * consumes nothing.
 */
async function assignRoyaltyPosition(
  tx: Tx,
  args: { customerProfileId: string; royaltyMemberId: string; at: Date }
) {
  const member = await tx.memberProfile.findUniqueOrThrow({ where: { id: args.royaltyMemberId } });
  if (!member.activationDate) {
    blocked("The Royalty Linked Member is not activated, so no Royalty position can be assigned.");
  }

  const yearStart = yearStartInstant(member.activationDate, args.at);
  await lockKey(tx, `royalty-counter:${member.id}:${istDay(yearStart)}`);

  const taken = await tx.customerProfile.findMany({
    where: {
      royaltyLinkedMemberId: member.id,
      royaltyYearStart: yearStart,
      royaltyPosition: { not: null },
    },
    select: { royaltyPosition: true },
  });
  const position = nextNetworkPosition(taken.map((t) => t.royaltyPosition!));
  return { position, ratePercent: bandRate(position), yearStart };
}

/**
 * CR-001 – CR-004 — the Royalty Linked Member, recomputed from the Bookings
 * themselves.
 *
 * One idempotent function rather than an establish/finalise/remove trio: every
 * event that could move the link (approval, a payment reaching 100%, an
 * approved Buyback, a cancellation) just calls this, and the answer is derived
 * from current state. That is what makes "a cancelled first Booking consumes no
 * position, and a later valid first purchase may establish a new link" fall out
 * rather than needing its own path.
 *
 * The rules, in the order they apply:
 *
 * - the first qualifying purchase is the Customer's earliest approved Booking
 *   as Primary Customer; an exact tie goes to the lower Booking Number;
 * - Sold By Member on it stores that Member as the provisional link; Sold By
 *   3% CLUB or Sold By Customer stores no Member at all (CR-003);
 * - the link becomes final — and only then takes a Royalty position — at 100%
 *   verified Payment Received or an Approved Buyback on that same Booking;
 * - a final link is never recomputed. Not by a later sale, not by a later
 *   cancellation: CR-003's "no Royalty Member" is as final as a named one.
 */
export async function syncRoyaltyLink(tx: Tx, personId: string, actorRef: string) {
  const customer = await tx.customerProfile.findUnique({ where: { personId } });
  if (!customer) return null;
  if (customer.royaltyLinkFinalAt) return customer.royaltyLinkedMemberId;

  const first = await tx.booking.findFirst({
    where: {
      primaryPersonId: personId,
      bookingNumber: { not: null },
      approvedAt: { not: null },
      status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
    },
    // CR-002 — "if qualifying timestamps are equal, lower permanent Booking
    // Number wins".
    orderBy: [{ approvedAt: "asc" }, { bookingNumber: "asc" }],
  });

  if (!first) {
    // Every candidate is gone, so the provisional link goes with them. History
    // stays on the Booking events; nothing was ever consumed.
    if (customer.royaltyLinkFirstBookingId) {
      await tx.bookingEvent.create({
        data: {
          bookingId: customer.royaltyLinkFirstBookingId,
          actorRef,
          action: "ROYALTY_LINK_REMOVED",
          reason:
            "The Booking that held the provisional Royalty link is no longer a qualifying first " +
            "purchase. No Royalty position was consumed (CR-002).",
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
          ? `Provisional Royalty Linked Member — ${linkedMember.memberId}, Sold By Member on this ` +
            `first qualifying purchase (CR-002).`
          : `No Royalty Linked Member — this first qualifying purchase was ${
              first.soldByType === "CUSTOMER" ? "Sold By Customer" : "Sold By 3% CLUB"
            } (CR-003).`,
      },
    });
  }

  // CR-002 — the two milestones that make the link final.
  const paidInFull = first.paymentReceivedPercent.gte(100);
  const approvedBuyback = paidInFull
    ? 0
    : await tx.acquisition.count({
        where: { sourceBookingId: first.id, type: "BUYBACK", status: "APPROVED" },
      });
  if (!paidInFull && approvedBuyback === 0) return linkedMember?.id ?? null;

  const at = new Date();
  const position = linkedMember
    ? await assignRoyaltyPosition(tx, {
        customerProfileId: customer.id,
        royaltyMemberId: linkedMember.id,
        at,
      })
    : null;

  await tx.customerProfile.update({
    where: { id: customer.id },
    data: {
      royaltyLinkFinalAt: at,
      royaltyPosition: position?.position ?? null,
      royaltyRatePercent: position?.ratePercent ?? null,
      royaltyYearStart: position?.yearStart ?? null,
    },
  });
  await tx.bookingEvent.create({
    data: {
      bookingId: first.id,
      actorRef,
      action: "ROYALTY_LINK_FINAL",
      reason: linkedMember
        ? `Royalty Linked Member final — ${linkedMember.memberId} at Royalty position ` +
          `${position!.position} (${position!.ratePercent}%), on ${
            paidInFull ? "100% Payment Received" : "an Approved Buyback"
          } (CR-002).`
        : `No Royalty Linked Member, now final on ${
            paidInFull ? "100% Payment Received" : "an Approved Buyback"
          }. No later sale can create one (CR-003).`,
    },
  });

  // The link can go final after a later purchase was already approved — a first
  // Booking still being paid off while a second one is booked is ordinary. That
  // later Booking's commission was generated when there was no final link, so
  // without this its Royalty would never be created by anything.
  if (linkedMember) {
    const later = await tx.booking.findMany({
      where: {
        primaryPersonId: personId,
        id: { not: first.id },
        bookingNumber: { not: null },
        approvedAt: { not: null },
        status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
      },
      select: { id: true },
    });
    for (const booking of later) {
      await generateForBooking(tx, booking.id, actorRef);
      await reassessCommission(tx, booking.id, actorRef);
    }
  }
  return linkedMember?.id ?? null;
}

/**
 * main-PRD §7.1 — only Admin or MD may activate a Member. The Member ID and the
 * Network position become active at activation, and activation cannot be
 * backdated.
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
        include: { memberProfile: true },
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

      // Activation is now; it cannot be backdated (main-PRD §7.1).
      const activationDate = new Date();
      const memberId =
        person.memberProfile?.memberId ?? (await nextReference(tx, "MEM", "Member"));

      const member = person.memberProfile
        ? await tx.memberProfile.update({
            where: { id: person.memberProfile.id },
            data: {
              activationDate,
              status: "ACTIVE",
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
              reraStatus: rera,
              reraNumber: args.reraNumber?.trim() || null,
              reraExpiryDate: args.reraExpiryDate ?? null,
              reraNotApplicableReason: args.reraNotApplicableReason?.trim() || null,
            },
          });

      // Ensure PortalAccount exists so the Member can log into the Member Portal (PRD §17.1).
      const existingPortal = await tx.portalAccount.findUnique({
        where: { memberProfileId: member.id },
      });
      if (!existingPortal) {
        const defaultPasswordHash = hashPassword("ChangeMe#2026");
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

      let position: { position: number; ratePercent: string } | null = null;
      if (args.invitedByMemberId) {
        position = await assignInvitePosition(tx, {
          invitedMemberId: member.id,
          invitingMemberId: args.invitedByMemberId,
          at: activationDate,
        });
      }

      return {
        result: {
          memberProfileId: member.id,
          memberId: member.memberId,
          invitePosition: position?.position ?? null,
          inviteRatePercent: position?.ratePercent ?? null,
        },
        audit: {
          entity: "MemberProfile",
          entityId: member.id,
          action: "MEMBER_ACTIVATED",
          after: {
            memberId: member.memberId,
            invitedByMemberId: args.invitedByMemberId ?? null,
            invitePosition: position?.position ?? null,
            inviteRatePercent: position?.ratePercent ?? null,
          },
        },
      };
    }
  );
}

/**
 * RD-02 — the anniversary job. Nothing is renumbered: the counter year is
 * derived per Member from their activation date, so a new year simply means the
 * next introduction records a new `yearStart` and starts again at position 1.
 * This exists to make the roll observable rather than to mutate anything.
 */
export function membersRollingToday(at: Date = new Date()) {
  return db.memberProfile.findMany({
    where: { status: "ACTIVE", activationDate: { not: null } },
    select: { id: true, memberId: true, activationDate: true },
  }).then((members) =>
    members.filter((m) => counterYearStart(m.activationDate!, at) === istDay(at))
  );
}

/**
 * PRD §13 — deactivation disables portal access immediately, stops new Member
 * activity, and puts every unpaid commission On Hold — Member Deactivated while
 * paid and Paid Early records remain historical. Network positions stay exactly
 * as they are. Reactivation rechecks unpaid eligibility rather than assuming it.
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
            latestResult: `${pending} Pending Hold Request(s) need a CRM decision.`,
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
 * main-PRD §19.5 — Not Applicable always states why, Registered carries the
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
