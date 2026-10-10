// Person Merge — PRD §22.
//
// One surviving identity and MD approval on the decision. Nothing is deleted: the merged-away
// Person stays as a searchable historical reference and its old IDs move to the
// survivor's legacy list.

import { validateMergeRequest } from "@/lib/domain/completion";
import type { CustomerProfile, MemberProfile, TripCredit } from "@prisma/client";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { consumedClosingEvents } from "./commission-service";
import { refreshBenefitsOfPerson } from "./recovery-service";
import { reverseUndeliveredCredit } from "./royalty-service";
import { evaluateBuckets, invalidate } from "./trip-service";

const MERGE_REASON = "Person merge — one real person keeps one entitlement history (SSOT §100).";

/**
 * CP §87; SSOT §100; UAT COR-08 — after a merge nothing the two identities
 * earned separately is counted twice. The Customer-closing count already reads
 * both identities and Recovery follows the survivor; this removes the rest:
 * of two consumed Royalty or Reference opportunities the later unfulfilled one
 * is reversed, and an Own-Sale Credit for the same unit and programme is kept
 * once. Fulfilled rewards are final and never touched.
 */
async function dedupeAfterMerge(
  tx: Tx,
  survivor: { id: string; customerProfile: CustomerProfile | null; memberProfile: MemberProfile | null },
  merged: { id: string; customerProfile: CustomerProfile | null; memberProfile: MemberProfile | null },
  actorRef: string
) {
  const [sc, mc] = [survivor.customerProfile, merged.customerProfile];
  if (sc?.royaltyOpportunityConsumedAt && mc?.royaltyOpportunityConsumedAt) {
    const later = sc.royaltyOpportunityConsumedAt > mc.royaltyOpportunityConsumedAt ? sc : mc;
    await reverseUndeliveredCredit(tx, later.id, actorRef, MERGE_REASON);
  }

  const [sm, mm] = [survivor.memberProfile, merged.memberProfile];
  if (!sm || !mm) return;
  const reversed: TripCredit[] = [];
  const reverse = async (credit: TripCredit) => {
    await invalidate(tx, credit, actorRef, MERGE_REASON);
    reversed.push(credit);
  };

  const live = { state: { notIn: ["REVERSED" as const, "EXPIRED" as const] } };
  const [kept, theirs] = await Promise.all([
    tx.tripCredit.findMany({ where: { memberProfileId: sm.id, creditType: "OWN_SALE", ...live } }),
    tx.tripCredit.findMany({ where: { memberProfileId: mm.id, creditType: "OWN_SALE", ...live } }),
  ]);
  for (const credit of theirs) {
    const twin = kept.find(
      (k) => k.projectId === credit.projectId && k.programmeCode === credit.programmeCode && k.creditPlotId === credit.creditPlotId
    );
    if (!twin) continue;
    if (credit.state !== "USED") await reverse(credit);
    else if (twin.state !== "USED") await reverse(twin);
  }

  if (sm.referenceOpportunityConsumedAt && mm.referenceOpportunityConsumedAt) {
    const later = sm.referenceOpportunityConsumedAt > mm.referenceOpportunityConsumedAt ? sm : mm;
    const earlier = later === sm ? mm : sm;
    const credit = await tx.tripCredit.findFirst({
      where: { introducedMemberId: later.id, creditType: "REFERENCE", state: { notIn: ["REVERSED", "EXPIRED", "USED"] } },
    });
    if (credit) await reverse(credit);
    // The survivor carries the one opportunity that stands.
    await tx.memberProfile.update({
      where: { id: sm.id },
      data: {
        referenceOpportunityConsumedAt: earlier.referenceOpportunityConsumedAt,
        referenceWinningBookingId: earlier.referenceWinningBookingId,
      },
    });
  }

  for (const key of new Set(reversed.map((c) => `${c.memberProfileId}|${c.projectId}|${c.programmeCode}`))) {
    const [memberProfileId, projectId, programmeCode] = key.split("|");
    await evaluateBuckets(tx, memberProfileId, projectId, programmeCode, actorRef);
  }
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
};

/**
 * PRD §22 — MD approves or rejects. On approval the merged-away Person keeps
 * its row and points at the survivor, the old Customer/Member IDs stay
 * searchable. The Customer-closing Loyalty count reads both identities, so the
 * one real person keeps one consolidated history (v2.1 §77).
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

      if (survivor.customerProfile) {
        await tx.customerProfile.update({
          where: { id: survivor.customerProfile.id },
          data: {
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

      await dedupeAfterMerge(tx, survivor, merged, args.actorRef);
      // Holds, Recovery and the release controls now read the one identity.
      await refreshBenefitsOfPerson(tx, survivor.id, args.actorRef);
      await refreshBenefitsOfPerson(tx, merged.id, args.actorRef);

      await tx.personMergeRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          ...decision,
          // CP §87 — rebuilt from unique valid events, capped at three.
          loyaltyRebuiltTo: Math.min(3, await consumedClosingEvents(tx, survivor.id)),
        },
      });

      return {
        result: { requestId: request.id, status: "APPROVED" },
        audit: {
          entity: "Person",
          entityId: merged.id,
          action: "PERSON_MERGED",
          before: { mergeStatus: merged.mergeStatus },
          after: { mergeStatus: "MERGED_AWAY", survivingPersonId: survivor.id },
          reason: args.note,
        },
      };
    }
  );
}
