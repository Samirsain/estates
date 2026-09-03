// Enquiry service — PRD.md §6.4, §7; DESIGN.md §8.

import type { EnquirySource, FollowUpOutcome } from "@prisma/client";
import { db } from "@/lib/db";
import { validateSource } from "@/lib/domain/enquiry";
import { blocked, nextReference, runCommand, type Tx } from "./command";
import { completeTask, ensureTask, reviseTask } from "./task-service";

export const ENQUIRY_FOLLOW_UP_PURPOSE = "ENQUIRY_FOLLOW_UP";

/**
 * PRD §23.2 — the Person duplicate check runs, but an existing Person's
 * details are never exposed to the Member. The Enquiry links to the existing
 * Person silently, or creates a new one. A shared mobile alone does not merge
 * two Persons, so the match is on name and mobile together (PRD §17.1).
 */
export async function linkOrCreatePerson(
  tx: Tx,
  input: { fullName: string; mobile: string; city?: string }
) {
  const fullName = input.fullName.trim();
  const primaryMobile = input.mobile.replace(/\s/g, "");
  if (!fullName || !primaryMobile) blocked("Enter the buyer's name and mobile number.");

  const existing = await tx.person.findFirst({
    where: {
      primaryMobile,
      fullName: { equals: fullName, mode: "insensitive" },
      mergeStatus: { not: "MERGED_AWAY" },
    },
  });
  if (existing) return existing;

  return tx.person.create({
    data: { fullName, primaryMobile, city: input.city?.trim() || null },
  });
}

/**
 * PRD §5.2 — the Customer ID is permanent, never reused, and retained even if
 * whatever created it is later rejected. It is issued at the first moment the
 * company commits inventory to a Person: a Hold, or a Booking Request where no
 * Hold came first.
 *
 * It sits here rather than in booking-service because hold-service needs it and
 * cannot import that module — booking-service already imports hold-service.
 */
export async function ensureCustomerProfile(tx: Tx, personId: string) {
  const existing = await tx.customerProfile.findUnique({ where: { personId } });
  if (existing) return existing;

  // CR-001 — nothing about Royalty happens here any more. The Royalty Linked
  // Member comes from the Sold By Member of the first qualifying purchase
  // (`syncRoyaltyLink`), so a Customer created by a Hold, a Booking Request or
  // a Primary Customer change starts with no earning relationship at all.
  return tx.customerProfile.create({
    data: { personId, customerId: await nextReference(tx, "CUS", "Customer") },
  });
}

/** PRD §23.2 — a Member-submitted Enquiry is assigned to CRM, never to the Member. */
export async function defaultCrmAssignee(tx: Tx) {
  // ponytail: first active CRM account. Swap for a real round-robin or a
  // configured relationship-CRM when Admin defines the assignment policy.
  const staff = await tx.staffAccount.findFirst({
    where: { role: "CRM", status: "ACTIVE" },
    orderBy: { staffAccountId: "asc" },
  });
  if (!staff) blocked("No active CRM user is available to receive this Enquiry.");
  return staff;
}

export type CreateEnquiryInput = {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  /** An existing Person, or blank when `newPerson` carries a first-time caller. */
  personId?: string | null;
  /**
   * DESIGN §8.2 — the form asks for a name, a mobile and a city, so an Enquiry
   * can be taken from someone who is not in the system yet. Resolved inside the
   * transaction, exactly as a Booking resolves a first-time buyer: a retried
   * idempotency key replays before this runs twice, and primaryMobile is
   * deliberately not unique.
   */
  newPerson?: { fullName: string; mobile: string; city?: string } | null;
  projectId: string;
  plotId?: string | null;
  /**
   * What they asked for when inventory holds nothing like it. Free text, and
   * only meaningful without a plotId — a named Plot says it already.
   */
  plotRequirement?: string | null;
  source: EnquirySource;
  sourceMemberId?: string | null;
  sourceCustomerId?: string | null;
  assignedStaffId: string;
  assigneeRole: "CRM" | "ADMIN" | "MD";
  nextFollowUpAt: Date;
  remark?: string;
};

export async function createEnquiry(input: CreateEnquiryInput) {
  const sourceError = validateSource(
    input.source,
    input.sourceMemberId ?? null,
    input.sourceCustomerId ?? null
  );
  if (sourceError) blocked(sourceError);

  return runCommand(
    {
      idempotencyKey: input.idempotencyKey,
      operation: "ENQUIRY_CREATE",
      actorRef: input.actorRef,
      actorRole: input.actorRole,
      payload: {
        personId: input.personId ?? null,
        newPerson: input.newPerson?.mobile ?? null,
        projectId: input.projectId,
        plotId: input.plotId ?? null,
      },
    },
    async (tx) => {
      if (!input.personId && !input.newPerson) blocked("Select a Person, or enter a name and mobile.");
      const personId = input.personId
        ? input.personId
        : (await linkOrCreatePerson(tx, input.newPerson!)).id;

      // PRD §7.1 — one Active Enquiry per Person + Project + Plot, and one
      // Active general Enquiry per Person + Project.
      const duplicate = await tx.enquiry.findFirst({
        where: {
          personId,
          projectId: input.projectId,
          plotId: input.plotId ?? null,
          status: "ACTIVE",
        },
      });
      if (duplicate) {
        blocked(
          `An Active Enquiry (${duplicate.enquiryNo}) already exists for this Person, Project and Plot. ` +
            `Open that Enquiry and use Follow-up instead of creating another.`
        );
      }

      const enquiryNo = await nextReference(tx, "ENQ", "Enquiry");
      const person = await tx.person.findUniqueOrThrow({ where: { id: personId } });
      const project = await tx.project.findUniqueOrThrow({ where: { id: input.projectId } });

      const enquiry = await tx.enquiry.create({
        data: {
          enquiryNo,
          personId,
          projectId: input.projectId,
          plotId: input.plotId ?? null,
          plotRequirement: input.plotId ? null : (input.plotRequirement?.trim() || null),
          source: input.source,
          sourceMemberId: input.sourceMemberId ?? null,
          sourceCustomerId: input.sourceCustomerId ?? null,
          assignedStaffId: input.assignedStaffId,
          remark: input.remark,
        },
      });

      // CR-001 — the Enquiry Source is history and follow-up. It decides no
      // Direct, Invite, Royalty or Loyalty, so nothing is frozen here.

      // Each Active Enquiry carries exactly one Pending follow-up task.
      await ensureTask(tx, {
        recordKind: "Enquiry",
        recordId: enquiry.id,
        recordName: `${person.fullName} — ${project.name}`,
        purpose: ENQUIRY_FOLLOW_UP_PURPOSE,
        title: "Enquiry Follow-up",
        assigneeRole: input.assigneeRole,
        assigneeStaffId: input.assignedStaffId,
        dueAt: input.nextFollowUpAt,
        latestResult: input.remark ?? "New Enquiry",
      });

      return {
        result: { enquiryId: enquiry.id, enquiryNo },
        audit: {
          entity: "Enquiry",
          entityId: enquiry.id,
          action: "ENQUIRY_CREATED",
          after: { enquiryNo, source: input.source, projectId: input.projectId },
          reason: input.remark,
        },
      };
    }
  );
}

/** Revise reuses the same Pending task for that Enquiry (PRD §7.1). */
export async function recordFollowUp(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  enquiryId: string;
  outcome: FollowUpOutcome;
  remark?: string;
  nextAt: Date;
}) {
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ENQUIRY_FOLLOW_UP",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { enquiryId: args.enquiryId, outcome: args.outcome, nextAt: args.nextAt.toISOString() },
    },
    async (tx) => {
      const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: args.enquiryId } });
      if (enquiry.status !== "ACTIVE") blocked("Follow-up applies only to an Active Enquiry.");

      await tx.enquiryFollowUp.create({
        data: {
          enquiryId: args.enquiryId,
          actorRef: args.actorRef,
          outcome: args.outcome,
          remark: args.remark,
          nextAt: args.nextAt,
        },
      });

      const task = await tx.task.findFirst({
        where: { recordKind: "Enquiry", recordId: args.enquiryId, purpose: ENQUIRY_FOLLOW_UP_PURPOSE, status: "PENDING" },
      });
      if (task) {
        await reviseTask(
          tx,
          task.id,
          args.actorRef,
          args.nextAt,
          args.outcome.replaceAll("_", " ").toLowerCase(),
          args.remark
        );
      }

      return {
        result: { enquiryId: args.enquiryId, nextAt: args.nextAt.toISOString() },
        audit: {
          entity: "Enquiry",
          entityId: args.enquiryId,
          action: "FOLLOW_UP_RECORDED",
          after: { outcome: args.outcome, nextAt: args.nextAt },
          reason: args.remark,
        },
      };
    }
  );
}

export async function closeEnquiry(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  enquiryId: string;
  closeReason: string;
}) {
  if (!args.closeReason.trim()) blocked("A Close reason is compulsory.");
  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "ENQUIRY_CLOSE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { enquiryId: args.enquiryId },
    },
    async (tx) => {
      await tx.enquiry.update({
        where: { id: args.enquiryId },
        data: { status: "CLOSED", closeReason: args.closeReason },
      });
      const task = await tx.task.findFirst({
        where: { recordKind: "Enquiry", recordId: args.enquiryId, status: "PENDING" },
      });
      if (task) await completeTask(tx, task.id, args.actorRef, `Enquiry closed — ${args.closeReason}`);

      return {
        result: { enquiryId: args.enquiryId },
        audit: {
          entity: "Enquiry",
          entityId: args.enquiryId,
          action: "ENQUIRY_CLOSED",
          reason: args.closeReason,
        },
      };
    }
  );
}

export function listEnquiries() {
  return db.enquiry.findMany({
    include: { person: true, project: true, plot: true, sourceMember: true, assignedStaff: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
