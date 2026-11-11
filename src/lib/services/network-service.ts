// Member activation, who invited whom, and the Royalty relationship.
// SSOT §37, §67–§71; prd-complete §7.1, §14.3.
//
// The Invite and Royalty positions, bands and cycles are gone (Removal Audit
// OL-02 to OL-14). What stays is the relationship itself: the inviting Member
// (Part 3, Reference Credit) and the Royalty Linked Member (Royalty Tokens, docss/11).

import type { Prisma } from "@prisma/client";
import { BUYBACK_MIN_SOURCE_PAYMENT } from "@/lib/domain/commission";
import { blocked, nextReference, runCommand, type Tx } from "./command";
import { CLOSING_LIMIT_PURPOSE, reassessCommission } from "./commission-service";
import {
  originalPurchasesOf,
  refreshAwardsOfMember,
  reverseLiveAward,
  syncRoyaltyReward,
} from "./royalty-service";
import { refreshTripOfMember, refuseInviteLoop } from "./trip-service";
import { closeTasksFor, ensureTask } from "./task-service";
import { linkOrCreatePerson } from "./enquiry-service";
import { recordAadhaar, recordPan } from "./completion-service";
import { blindIndex, normaliseAadhaar, normalisePan } from "@/lib/security/identity";
import { normaliseMobile } from "@/lib/domain/land-inquiry";

/** Add Member's Person, made inside the activation so a refused activation leaves nothing behind. */
export type NewMemberPerson = {
  fullName: string;
  mobile: string;
  city: string;
  email: string | null;
  firmName: string | null;
  dealsIn: string[];
  businessExperience: string | null;
  aadhaar: string | null;
  pan: string | null;
  altMobile: string | null;
  addressLine: string | null;
};

/**
 * The same Person typed again is matched on name and mobile; only blanks are
 * filled, nothing is overwritten. A typed value that differs from what is on
 * file is refused by name — it used to be dropped while Add Member said it worked.
 */
async function addMemberPerson(tx: Tx, input: NewMemberPerson) {
  // linkOrCreatePerson refuses an alternate mobile that is not ten digits.
  const found = await linkOrCreatePerson(tx, { fullName: input.fullName, mobile: input.mobile, altMobile: input.altMobile ?? undefined, city: input.city });
  const differs = (onFile: string | null, typed: string | null) =>
    !!onFile?.trim() && !!typed?.trim() && onFile.trim().toLowerCase() !== typed.trim().toLowerCase();
  const typedAadhaar = input.aadhaar?.trim();
  const typedPan = input.pan?.trim();
  const altMobile = input.altMobile?.trim() ? normaliseMobile(input.altMobile) : null;
  const clashes = [
    differs(found.email, input.email) && "Email",
    differs(found.altMobile, altMobile) && "Alternate Mobile",
    differs(found.addressLine, input.addressLine) && "Address",
    typedAadhaar &&
      found.aadhaarStatus !== "PENDING" &&
      found.aadhaarBlindIndex !== blindIndex(normaliseAadhaar(typedAadhaar)) &&
      "Aadhaar Number",
    typedPan &&
      found.panStatus !== "NOT_AVAILABLE" &&
      found.panBlindIndex !== blindIndex(normalisePan(typedPan)) &&
      "PAN Number",
    differs(found.firmName, input.firmName) && "Firm Name",
    found.dealsIn.length > 0 &&
      input.dealsIn.length > 0 &&
      [...found.dealsIn].sort().join() !== [...input.dealsIn].sort().join() &&
      "Deals In",
    differs(found.businessExperience, input.businessExperience) && "Experience",
  ].filter(Boolean);
  if (clashes.length > 0) {
    blocked(
      `${found.fullName} (${found.primaryMobile}) is already on file with a different ${clashes.join(", ")}. ` +
        `Leave ${clashes.length > 1 ? "those fields" : "it"} blank to keep what is on file, or change it first with Edit details on their profile.`
    );
  }
  await tx.person.update({
    where: { id: found.id },
    data: {
      city: found.city ?? input.city,
      email: found.email ?? input.email,
      altMobile: found.altMobile ?? altMobile,
      addressLine: found.addressLine ?? input.addressLine,
      firmName: found.firmName ?? input.firmName,
      dealsIn: found.dealsIn.length ? found.dealsIn : input.dealsIn,
      businessExperience: found.businessExperience ?? input.businessExperience,
    },
  });
  await recordAadhaar(tx, found.id, input.aadhaar);
  await recordPan(tx, found.id, input.pan);
  return found.id;
}

/**
 * The Royalty relationship — SSOT §67–§71; CP §40–§42 — recomputed from the
 * Bookings themselves, then the Royalty Award (tokens) it may lead to (SSOT §72).
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
 * re-links the relationship to the corrected closer, final or not. The old
 * Member's live Royalty award is reversed. An unused one reopens the
 * opportunity, so the reward sync gives the corrected Member the award under
 * the same rules; a consumed one keeps it consumed (SSOT §98; docss/11), so
 * nothing transfers.
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
      await reverseLiveAward(tx, customer.id, actorRef, "Sold By corrected on the first purchase (CP §59).");
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
  /** An existing Person — or `newPerson` for Add Member, never both. */
  personId?: string;
  newPerson?: NewMemberPerson;
  invitedByMemberId?: string | null;
  reraStatus?: "REGISTERED" | "PENDING" | "EXPIRED" | "NOT_APPLICABLE";
  reraNumber?: string | null;
  reraExpiryDate?: Date | null;
  reraNotApplicableReason?: string | null;
  /** Add Member's "Photo Received" tick; left out, the profile keeps its own. */
  photoReceived?: boolean;
}) {
  if (args.actorRole !== "MD") {
    blocked("Only MD may activate a Member.");
  }
  if (!args.personId === !args.newPerson) blocked("Choose the Person to activate.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "MEMBER_ACTIVATE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: {
        personId: args.personId ?? null,
        newPerson: args.newPerson ?? null,
        invitedByMemberId: args.invitedByMemberId ?? null,
      },
    },
    async (tx) => {
      // Inside the command: any refusal below rolls the new Person and its
      // write-once Aadhaar back with it.
      const personId = args.newPerson ? await addMemberPerson(tx, args.newPerson) : args.personId!;
      const person = await tx.person.findUniqueOrThrow({
        where: { id: personId },
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

      // docss/11 §3 — never their own inviter, never a loop.
      if (args.invitedByMemberId && person.memberProfile) {
        await refuseInviteLoop(tx, person.memberProfile.id, args.invitedByMemberId);
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
        person.memberProfile?.memberId ?? (await nextReference(tx, "MM", "Member"));

      const member = person.memberProfile
        ? await tx.memberProfile.update({
            where: { id: person.memberProfile.id },
            data: {
              activationDate,
              status: "ACTIVE",
              invitedByMemberId,
              inviterFrozenAt: activationDate,
              reraStatus: rera,
              reraNumber: args.reraNumber?.trim() || null,
              reraExpiryDate: args.reraExpiryDate ?? null,
              reraNotApplicableReason: args.reraNotApplicableReason?.trim() || null,
              photoReceived: args.photoReceived,
            },
          })
        : await tx.memberProfile.create({
            data: {
              memberId,
              personId: person.id,
              activationDate,
              status: "ACTIVE",
              invitedByMemberId,
              // SSOT §37 — activation is the Membership application in this CRM.
              inviterFrozenAt: activationDate,
              reraStatus: rera,
              reraNumber: args.reraNumber?.trim() || null,
              reraExpiryDate: args.reraExpiryDate ?? null,
              reraNotApplicableReason: args.reraNotApplicableReason?.trim() || null,
              photoReceived: args.photoReceived,
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
 * PRD §13 — deactivation stops new Member activity and puts every unpaid
 * commission On Hold — Member Deactivated while
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
  if (args.actorRole !== "MD") {
    blocked("Only MD may activate or deactivate a Member.");
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
        include: { person: true },
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
            title: "Plot Hold by Deactivated Member",
            assigneeRole: "CRM",
            dueAt: new Date(),
            urgent: true,
            latestResult: `Member deactivated. ${pending} Hold Request${pending === 1 ? "" : "s"} to decide.`,
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
      // SSOT §66, §82; CP §86 — the Member's Royalty awards and Trip fulfilment hold or resume too.
      await refreshAwardsOfMember(tx, member.personId, args.actorRef);
      await refreshTripOfMember(tx, member.personId, args.actorRef);

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
      // PRD §26 — the RERA reminder completes on an update. If the new expiry is
      // still within seven days, the next reminder run raises it again.
      await closeTasksFor(tx, "Member", member.id, args.actorRef, "RERA updated.", "RERA_EXPIRY");

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
