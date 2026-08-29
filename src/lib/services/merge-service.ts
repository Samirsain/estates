// Person Merge — PRD §22.
//
// One surviving identity, MD approval on the decision, and a Loyalty count
// rebuilt from unique qualifying events. Nothing is deleted: the merged-away
// Person stays as a searchable historical reference and its old IDs move to the
// survivor's legacy list.

import { rebuildLoyaltyCount, validateMergeRequest } from "@/lib/domain/completion";
import { blocked, lockKey, runCommand, type Tx } from "./command";

/**
 * PRD §22 — the qualifying events behind the Loyalty count. Two identities that
 * both recorded the same qualifying Booking produce one event, which is why the
 * counts are never added and never maximised.
 */
async function loyaltyEvents(tx: Tx, personIds: string[]) {
  // A consumed opportunity always names its Booking (constraints.sql), and that
  // Booking is the qualifying event — the slot index only orders it.
  const opportunities = await tx.commissionOpportunity.findMany({
    where: { kind: "LOYALTY", subjectPersonId: { in: personIds }, status: "CONSUMED" },
    select: { consumedByBookingId: true },
  });
  return opportunities.map((o) => ({ qualifyingKey: o.consumedByBookingId! }));
}

/** PRD §22 — MD approval is required, so a request is raised first. */
export async function requestPersonMerge(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  survivingPersonId: string;
  mergedPersonId: string;
  reason: string;
}) {
  if (!args.reason.trim()) blocked("A compulsory reason is required to merge two Persons.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PERSON_MERGE_REQUEST",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { survivingPersonId: args.survivingPersonId, mergedPersonId: args.mergedPersonId },
    },
    async (tx) => {
      const [survivor, merged] = await Promise.all([
        tx.person.findUniqueOrThrow({
          where: { id: args.survivingPersonId },
          include: { memberProfile: true },
        }),
        tx.person.findUniqueOrThrow({
          where: { id: args.mergedPersonId },
          include: { memberProfile: true },
        }),
      ]);

      const check = validateMergeRequest(
        { personId: survivor.id, memberStatus: survivor.memberProfile?.status ?? null },
        { personId: merged.id, memberStatus: merged.memberProfile?.status ?? null }
      );
      if (!check.ok) blocked(check.reason);

      if (survivor.mergeStatus === "MERGED_AWAY" || merged.mergeStatus === "MERGED_AWAY") {
        blocked("One of these Persons has already been merged into another identity.");
      }

      const pending = await tx.personMergeRequest.findFirst({
        where: { mergedPersonId: args.mergedPersonId, status: "PENDING" },
      });
      if (pending) blocked("A merge is already waiting for the MD decision for this Person.");

      const request = await tx.personMergeRequest.create({
        data: {
          survivingPersonId: args.survivingPersonId,
          mergedPersonId: args.mergedPersonId,
          reason: args.reason,
          requestedByRef: args.actorRef,
        },
      });

      return {
        result: { requestId: request.id, status: "PENDING" },
        audit: {
          entity: "Person",
          entityId: args.mergedPersonId,
          action: "PERSON_MERGE_REQUESTED",
          after: { survivingPersonId: args.survivingPersonId },
          reason: args.reason,
        },
      };
    }
  );
}

export type MergeDecisionResult = {
  requestId: string;
  status: "APPROVED" | "REJECTED";
  loyaltyRebuiltTo?: number;
};

/**
 * PRD §22 — MD approves or rejects. On approval the merged-away Person keeps
 * its row and points at the survivor, the old Customer/Member IDs stay
 * searchable, and the Loyalty count is rebuilt from unique qualifying events
 * and capped at three.
 */
export async function decidePersonMerge(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  requestId: string;
  approve: boolean;
  note: string;
}) {
  if (args.actorRole !== "MD") blocked("Only the MD may decide a Person Merge.");
  if (!args.note.trim()) blocked("A compulsory remark is required on the merge decision.");

  return runCommand<MergeDecisionResult>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "PERSON_MERGE_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { requestId: args.requestId, approve: args.approve },
    },
    async (tx) => {
      const request = await tx.personMergeRequest.findUniqueOrThrow({
        where: { id: args.requestId },
      });
      if (request.status !== "PENDING") blocked("This merge has already been decided.");
      if (request.requestedByRef === args.actorRef) {
        blocked("A merge must be decided by a different account from the one that raised it.");
      }

      const decision = { decidedByRef: args.actorRef, decidedAt: new Date(), decisionNote: args.note };

      if (!args.approve) {
        await tx.personMergeRequest.update({
          where: { id: request.id },
          data: { status: "REJECTED", ...decision },
        });
        return {
          result: { requestId: request.id, status: "REJECTED" },
          audit: {
            entity: "Person",
            entityId: request.mergedPersonId,
            action: "PERSON_MERGE_REJECTED",
            reason: args.note,
          },
        };
      }

      // Both identities and their entitlement counters change together.
      await lockKey(tx, `person-merge:${request.survivingPersonId}`);
      await lockKey(tx, `person-merge:${request.mergedPersonId}`);

      const [survivor, merged] = await Promise.all([
        tx.person.findUniqueOrThrow({
          where: { id: request.survivingPersonId },
          include: { memberProfile: true, customerProfile: true },
        }),
        tx.person.findUniqueOrThrow({
          where: { id: request.mergedPersonId },
          include: { memberProfile: true, customerProfile: true },
        }),
      ]);

      const recheck = validateMergeRequest(
        { personId: survivor.id, memberStatus: survivor.memberProfile?.status ?? null },
        { personId: merged.id, memberStatus: merged.memberProfile?.status ?? null }
      );
      if (!recheck.ok) blocked(recheck.reason);

      // PRD §22 — rebuilt from unique qualifying events, never added or maximised.
      const loyalty = rebuildLoyaltyCount(await loyaltyEvents(tx, [survivor.id, merged.id]));

      if (survivor.customerProfile) {
        await tx.customerProfile.update({
          where: { id: survivor.customerProfile.id },
          data: {
            loyaltySlotsConsumed: loyalty,
            legacyCustomerIds: [
              ...survivor.customerProfile.legacyCustomerIds,
              ...(merged.customerProfile ? [merged.customerProfile.customerId] : []),
              ...(merged.customerProfile?.legacyCustomerIds ?? []),
            ],
          },
        });
      }
      if (survivor.memberProfile && merged.memberProfile) {
        await tx.memberProfile.update({
          where: { id: survivor.memberProfile.id },
          data: {
            legacyMemberIds: [
              ...survivor.memberProfile.legacyMemberIds,
              merged.memberProfile.memberId,
              ...merged.memberProfile.legacyMemberIds,
            ],
          },
        });
      }

      // The merged-away Person is kept and pointed at the survivor; its own
      // records stay attached to it so history reads exactly as it happened.
      await tx.person.update({
        where: { id: merged.id },
        data: { mergeStatus: "MERGED_AWAY", survivingPersonId: survivor.id },
      });
      await tx.person.update({
        where: { id: survivor.id },
        data: { mergeStatus: "SURVIVOR" },
      });

      await tx.personMergeRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", loyaltyRebuiltTo: loyalty, ...decision },
      });

      return {
        result: { requestId: request.id, status: "APPROVED", loyaltyRebuiltTo: loyalty },
        audit: {
          entity: "Person",
          entityId: merged.id,
          action: "PERSON_MERGED",
          before: { mergeStatus: merged.mergeStatus },
          after: { mergeStatus: "MERGED_AWAY", survivingPersonId: survivor.id, loyaltySlotsConsumed: loyalty },
          reason: args.note,
        },
      };
    }
  );
}
