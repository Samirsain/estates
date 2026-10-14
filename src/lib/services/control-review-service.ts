// Release-control decisions — Change Pack §55, §58, §65 (NT08, NT09), §78,
// §79; SSOT §92, §95. Detection lives in benefit-control-service; this is the
// human side: MD declares staff relatives (they keep a staff member from
// processing a relative's benefit), and Accounts/MD clears or restricts a
// circumvention review. Every decision re-runs the benefits it holds.

import { blocked, lockKey, runCommand } from "./command";
import { refreshBenefitsOfPerson } from "./recovery-service";
import { closeTasksFor } from "./task-service";
import { CIRCUMVENTION_KIND, CIRCUMVENTION_PURPOSE } from "./benefit-control-service";

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };
type CloseRelation = "SPOUSE" | "PARENT" | "CHILD" | "SIBLING";

/** CP §58 — the conflict disclosure: a staff Person's close relative, recorded by Admin/MD. */
export async function declareStaffRelative(
  args: Actor & { staffPersonId: string; relativePersonId: string; relation: CloseRelation }
) {
  if (args.actorRole !== "MD") blocked("Only MD records a staff relative.");
  if (args.staffPersonId === args.relativePersonId) blocked("A Person cannot be their own relative.");
  return runCommand<{ declarationId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "STAFF_RELATIVE_DECLARE", actorRef: args.actorRef, actorRole: args.actorRole, payload: args },
    async (tx) => {
      await lockKey(tx, `staff-relative:${args.staffPersonId}:${args.relativePersonId}`);
      const staff = await tx.staffAccount.findUnique({ where: { personId: args.staffPersonId } });
      if (!staff) blocked("The first Person has no staff account.");
      const live = await tx.staffRelative.findFirst({
        where: { staffPersonId: args.staffPersonId, relativePersonId: args.relativePersonId, endedAt: null },
      });
      if (live) blocked("This relative is already declared.");
      const declaration = await tx.staffRelative.create({
        data: { staffPersonId: args.staffPersonId, relativePersonId: args.relativePersonId, relation: args.relation, declaredByRef: args.actorRef },
      });
      // The relative's unreleased benefits now wait for MD (CP §58).
      await refreshBenefitsOfPerson(tx, args.relativePersonId, args.actorRef);
      return {
        result: { declarationId: declaration.id },
        audit: { entity: "Person", entityId: args.relativePersonId, action: "STAFF_RELATIVE_DECLARED", after: { staffAccountId: staff.staffAccountId, relation: args.relation } },
      };
    }
  );
}

/** Ended, never deleted; what MD already approved stays approved. */
export async function endStaffRelative(args: Actor & { declarationId: string; reason: string }) {
  if (args.actorRole !== "MD") blocked("Only MD ends a staff relative declaration.");
  if (!args.reason.trim()) blocked("A reason is required.");
  return runCommand<{ declarationId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "STAFF_RELATIVE_END", actorRef: args.actorRef, actorRole: args.actorRole, payload: { declarationId: args.declarationId } },
    async (tx) => {
      const declaration = await tx.staffRelative.findUniqueOrThrow({ where: { id: args.declarationId } });
      if (declaration.endedAt) blocked("This declaration has already ended.");
      await tx.staffRelative.update({
        where: { id: declaration.id },
        data: { endedAt: new Date(), endedByRef: args.actorRef, endReason: args.reason.trim() },
      });
      await refreshBenefitsOfPerson(tx, declaration.relativePersonId, args.actorRef);
      return {
        result: { declarationId: declaration.id },
        audit: { entity: "Person", entityId: declaration.relativePersonId, action: "STAFF_RELATIVE_ENDED", reason: args.reason.trim() },
      };
    }
  );
}

/**
 * CP §55, NT08 — Accounts or MD clears the review (the hold goes if nothing
 * else holds) or restricts it (benefits stay held while the Recovery is
 * outstanding). Always with a reason; never an automatic denial.
 */
export async function decideCircumvention(args: Actor & { reviewId: string; clear: boolean; reason: string }) {
  if (args.actorRole !== "ACCOUNTS" && args.actorRole !== "MD") blocked("Only Accounts or MD decides a Recovery Circumvention Review.");
  if (!args.reason.trim()) blocked("A reason is required on the decision.");
  return runCommand<{ reviewId: string }>(
    { idempotencyKey: args.idempotencyKey, operation: "CIRCUMVENTION_DECIDE", actorRef: args.actorRef, actorRole: args.actorRole, payload: { reviewId: args.reviewId, clear: args.clear } },
    async (tx) => {
      await lockKey(tx, `circumvention:${args.reviewId}`);
      const review = await tx.circumventionReview.findUniqueOrThrow({ where: { id: args.reviewId } });
      if (review.status !== "PENDING_REVIEW") blocked(`This review is already ${review.status.toLowerCase()}.`);
      await tx.circumventionReview.update({
        where: { id: review.id },
        data: { status: args.clear ? "CLEARED" : "RESTRICTED", decidedByRef: args.actorRef, decidedAt: new Date(), reason: args.reason.trim() },
      });
      await closeTasksFor(tx, CIRCUMVENTION_KIND, review.id, args.actorRef, `${args.clear ? "Cleared" : "Restricted"} — ${args.reason.trim()}`, CIRCUMVENTION_PURPOSE);
      await refreshBenefitsOfPerson(tx, review.subjectPersonId, args.actorRef);
      return {
        result: { reviewId: review.id },
        audit: {
          entity: "Person",
          entityId: review.subjectPersonId,
          action: args.clear ? "CIRCUMVENTION_CLEARED" : "CIRCUMVENTION_RESTRICTED",
          after: { recoveryId: review.recoveryId, indicators: review.indicators },
          reason: args.reason.trim(),
        },
      };
    }
  );
}
