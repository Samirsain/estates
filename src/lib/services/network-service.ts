// Member activation and the two annual network counters.
// PRD.md RD-02, §6.2, §6.3, §6.4; main-PRD §7.1, §14.3, §14.4.
//
// A position is assigned once, at activation or at the first valid
// introduction, and is then permanently fixed with the band rate it earned.
// Existing positions never reset, renumber or move; at each anniversary only
// newly introduced Members or Customers enter the new annual counter.

import { db } from "@/lib/db";
import { bandRate, counterYearStart, nextNetworkPosition } from "@/lib/domain/commission";
import { hashPassword } from "@/lib/security/auth";
import { istDay, istInstant } from "@/lib/tasks";
import { blocked, lockKey, nextReference, runCommand, type Tx } from "./command";
import { reassessCommission } from "./commission-service";
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
 * RD-02, PRD §6.4 — the introduced Customer takes the next free position in the
 * introducing Member's separate annual Introduced Customer Counter. Called when
 * Original Introduced By Member freezes, and again after an authorised
 * correction, where the Customer receives the next available position under the
 * corrected Member and the old one stays historical.
 */
export async function assignIntroducedPosition(
  tx: Tx,
  args: { customerProfileId: string; introducingMemberId: string; at?: Date }
) {
  const at = args.at ?? new Date();
  const introducer = await tx.memberProfile.findUniqueOrThrow({
    where: { id: args.introducingMemberId },
  });
  if (!introducer.activationDate) {
    blocked("The introducing Member is not activated, so no Network position can be assigned.");
  }

  const yearStart = yearStartInstant(introducer.activationDate, at);
  await lockKey(tx, `introduced-counter:${introducer.id}:${istDay(yearStart)}`);

  const taken = await tx.customerProfile.findMany({
    where: {
      originalIntroducedByMemberId: introducer.id,
      introducedYearStart: yearStart,
      introducedPosition: { not: null },
    },
    select: { introducedPosition: true },
  });
  const position = nextNetworkPosition(taken.map((t) => t.introducedPosition!));
  const ratePercent = bandRate(position);

  await tx.customerProfile.update({
    where: { id: args.customerProfileId },
    data: {
      originalIntroducedByMemberId: introducer.id,
      introducedPosition: position,
      introducedRatePercent: ratePercent,
      introducedYearStart: yearStart,
    },
  });
  return { position, ratePercent, yearStart };
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
