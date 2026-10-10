// The one purge the check scripts share.
//
// Each check used to carry its own copy, so every new table meant patching
// three near-identical functions — and a missed one leaves rows behind that
// surface as real operating data. This is dependency-ordered and captures every
// id before deleting anything, because a task points at its record by id: erase
// the record first and the task can never be found again.

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * What one purge removes. The check scripts build it from their TAG; the mock
 * dataset (prisma/mock-v2-seed.ts) builds it from its own Projects and mobile
 * prefix, because its People carry real-looking names.
 */
export type PurgeScope = {
  /** Prefix on actor refs, task numbers and task names the run wrote; null when it acted as real staff. */
  tag: string | null;
  bookings: Prisma.BookingWhereInput;
  persons: Prisma.PersonWhereInput;
  plots: Prisma.PlotWhereInput;
  projects: Prisma.ProjectWhereInput;
  acquisitions: Prisma.AcquisitionWhereInput;
  references: Prisma.ExternalReferenceWhereInput;
};

/**
 * Removes everything a check run created, identified by its TAG.
 *
 * Conventions the checks follow so this can find their rows:
 *   Person.fullName        starts with TAG
 *   Plot.plotNumber        starts with TAG
 *   Project.projectCode    starts with TAG, or Project.name does
 *                          (the code is generated now, so it may not carry the TAG)
 *   Booking.submittedByRef starts with TAG
 *   ExternalReference.actorRef starts with TAG
 *   Task.recordName        contains TAG
 */
export async function purgeCheckData(
  db: PrismaClient,
  tag: string,
  options: { extraPlotWhere?: { restrictionReason?: string } } = {}
) {
  const projects = { OR: [{ projectCode: { startsWith: tag } }, { name: { startsWith: tag } }] };
  return purgeScope(db, {
    tag,
    bookings: { submittedByRef: { startsWith: tag } },
    persons: { fullName: { startsWith: tag } },
    plots: {
      OR: [
        { plotNumber: { startsWith: tag } },
        // A Plot the application itself created inside a tagged Project —
        // an approved Purchase for Resale names it after the property, not
        // after the tag.
        { project: projects },
        ...(options.extraPlotWhere?.restrictionReason
          ? [{ restrictionReason: options.extraPlotWhere.restrictionReason }]
          : []),
      ],
    },
    projects,
    acquisitions: { submittedByRef: { startsWith: tag } },
    references: { actorRef: { startsWith: tag } },
  });
}

/** Dependency-ordered removal of one scope; ids are captured before anything goes. */
export async function purgeScope(db: PrismaClient, scope: PurgeScope) {
  const tag = scope.tag;
  const bookingIds = (await db.booking.findMany({ where: scope.bookings, select: { id: true } })).map((b) => b.id);
  const personIds = (await db.person.findMany({ where: scope.persons, select: { id: true } })).map((p) => p.id);
  const plotIds = (await db.plot.findMany({ where: scope.plots, select: { id: true } })).map((p) => p.id);
  const projectIds = (await db.project.findMany({ where: scope.projects, select: { id: true } })).map((p) => p.id);

  const commissionIds = (
    await db.commissionRecord.findMany({
      where: {
        OR: [{ bookingId: { in: bookingIds } }, { beneficiaryPersonId: { in: personIds } }],
      },
      select: { id: true },
    })
  ).map((r) => r.id);

  const acquisitionIds = (
    await db.acquisition.findMany({
      where: {
        OR: [scope.acquisitions, { plotId: { in: plotIds } }, { sellerPersonId: { in: personIds } }],
      },
      select: { id: true },
    })
  ).map((a) => a.id);

  // Tasks first: they reference records by id, not by relation — the reward
  // records and the Project's settings versions included.
  const memberIds = (await db.memberProfile.findMany({ where: { personId: { in: personIds } }, select: { id: true } })).map((m) => m.id);
  const customerIds = (await db.customerProfile.findMany({ where: { personId: { in: personIds } }, select: { id: true } })).map((c) => c.id);
  const rewardIds = [
    ...(await db.royaltyCredit.findMany({ where: { OR: [{ triggerBookingId: { in: bookingIds } }, { memberProfileId: { in: memberIds } }] }, select: { id: true } })),
    ...(await db.tripReward.findMany({ where: { memberProfileId: { in: memberIds } }, select: { id: true } })),
    ...(await db.tripBucket.findMany({ where: { memberProfileId: { in: memberIds } }, select: { id: true } })),
    ...(await db.projectCommissionVersion.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })),
  ].map((r) => r.id);
  const taskIds = (
    await db.task.findMany({
      where: {
        OR: [
          {
            recordId: {
              in: [...bookingIds, ...plotIds, ...personIds, ...commissionIds, ...acquisitionIds, ...projectIds, ...memberIds, ...customerIds, ...rewardIds],
            },
          },
          ...(tag ? [{ taskNo: { startsWith: tag } }, { recordName: { contains: tag } }] : []),
        ],
      },
      select: { id: true },
    })
  ).map((t) => t.id);
  await db.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
  await db.task.deleteMany({ where: { id: { in: taskIds } } });

  // CP §55, §58 — release-control reviews and declarations, with their tasks.
  const recoveryScope = { OR: [{ commissionRecordId: { in: commissionIds } }, { setOffRecordId: { in: commissionIds } }, { personId: { in: personIds } }] };
  const conflictIds = (await db.staffConflictReview.findMany({ where: { personId: { in: personIds } }, select: { id: true } })).map((r) => r.id);
  const circumventionIds = (
    await db.circumventionReview.findMany({
      where: { OR: [{ subjectPersonId: { in: personIds } }, { recovery: recoveryScope }] },
      select: { id: true },
    })
  ).map((r) => r.id);
  const reviewTaskIds = (
    await db.task.findMany({ where: { recordId: { in: [...conflictIds, ...circumventionIds] } }, select: { id: true } })
  ).map((t) => t.id);
  await db.taskEvent.deleteMany({ where: { taskId: { in: reviewTaskIds } } });
  await db.task.deleteMany({ where: { id: { in: reviewTaskIds } } });
  await db.staffConflictReview.deleteMany({ where: { id: { in: conflictIds } } });
  await db.circumventionReview.deleteMany({ where: { id: { in: circumventionIds } } });
  await db.staffRelative.deleteMany({
    where: { OR: [{ staffPersonId: { in: personIds } }, { relativePersonId: { in: personIds } }] },
  });

  await db.recovery.deleteMany({ where: recoveryScope });
  // Royalty Credits hang off a Booking, a Customer and a Member.
  const creditScope = {
    OR: [
      { triggerBookingId: { in: bookingIds } },
      { customerProfile: { personId: { in: personIds } } },
      { memberProfileId: { in: memberIds } },
    ],
  };
  await db.royaltyCreditEvent.deleteMany({ where: { credit: creditScope } });
  await db.royaltyCredit.deleteMany({ where: creditScope });
  // Trip: credits before buckets, buckets after their rewards.
  const tripMembers = { memberProfile: { personId: { in: personIds } } };
  await db.tripEvent.deleteMany({ where: { memberProfileId: { in: memberIds } } });
  await db.tripCredit.deleteMany({ where: { OR: [{ sourceBookingId: { in: bookingIds } }, tripMembers] } });
  await db.tripReward.deleteMany({ where: tripMembers });
  await db.tripBucket.deleteMany({ where: tripMembers });
  await db.commissionEvent.deleteMany({ where: { recordId: { in: commissionIds } } });
  await db.commissionRecord.deleteMany({ where: { id: { in: commissionIds } } });

  // Acquisition side.
  await db.acquisitionEvent.deleteMany({ where: { acquisitionId: { in: acquisitionIds } } });
  await db.paymentGivenEntry.deleteMany({ where: { acquisitionId: { in: acquisitionIds } } });
  await db.paymentScheduleVersion.deleteMany({ where: { acquisitionId: { in: acquisitionIds } } });
  await db.acquisition.deleteMany({ where: { id: { in: acquisitionIds } } });

  // Booking side, children before the Booking itself.
  await db.changePlotRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.cancellationRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.soldByCorrection.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.primaryCustomerChange.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.paymentScheduleVersion.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.paymentReceivedEntry.updateMany({
    where: { bookingId: { in: bookingIds } },
    data: { correctsEntryId: null },
  });
  await db.paymentReceivedEntry.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.bookingCompletion.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.bookingParty.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.bookingReviewVersion.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.bookingEvent.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.booking.deleteMany({ where: { id: { in: bookingIds } } });

  await db.externalReference.updateMany({ where: scope.references, data: { replacesId: null } });
  await db.externalReference.deleteMany({ where: scope.references });

  // Pre-sales.
  const preSales = { OR: [{ personId: { in: personIds } }, { plotId: { in: plotIds } }] };
  await db.holdExtensionRequest.deleteMany({ where: { hold: preSales } });
  await db.holdRequest.deleteMany({ where: preSales });
  await db.hold.deleteMany({ where: preSales });
  await db.enquiryFollowUp.deleteMany({
    where: { enquiry: { OR: [{ personId: { in: personIds } }, { plotId: { in: plotIds } }] } },
  });
  await db.enquiry.deleteMany({
    where: { OR: [{ personId: { in: personIds } }, { plotId: { in: plotIds } }] },
  });

  // Inventory.
  await db.plcSnapshot.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.plotEvent.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.plotBoundary.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.plot.deleteMany({ where: { id: { in: plotIds } } });

  // A PLC version chain points at itself, so the links go before the rows.
  // Components cascade with their version.
  await db.plcRuleVersion.updateMany({
    where: { projectId: { in: projectIds } },
    data: { supersededById: null },
  });
  await db.plcRuleVersion.deleteMany({ where: { projectId: { in: projectIds } } });
  // v2.1 §15 — a Booking keeps its frozen version id, and the tagged Bookings
  // are already gone, so the versions can follow.
  await db.projectCommissionVersion.deleteMany({ where: { projectId: { in: projectIds } } });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });

  // Identity last: everything above referenced it.
  await db.bankDetail.deleteMany({ where: { personId: { in: personIds } } });
  await db.portalAccount.deleteMany({
    where: { memberProfile: { personId: { in: personIds } } },
  });
  await db.memberProfile.updateMany({
    where: { personId: { in: personIds } },
    data: { invitedByMemberId: null },
  });
  await db.memberProfile.deleteMany({ where: { personId: { in: personIds } } });
  await db.customerProfile.deleteMany({ where: { personId: { in: personIds } } });
  await db.personMergeRequest.deleteMany({
    where: {
      OR: [{ survivingPersonId: { in: personIds } }, { mergedPersonId: { in: personIds } }],
    },
  });
  // A merged-away Person points at its survivor, so the link goes before the rows.
  await db.person.updateMany({
    where: { id: { in: personIds } },
    data: { survivingPersonId: null, mergeStatus: "NONE" },
  });
  await db.person.deleteMany({ where: { id: { in: personIds } } });

  // Scratch rows from the run itself, not real operating history.
  if (tag) {
    await db.idempotencyRecord.deleteMany({ where: { key: { startsWith: tag } } });
    await db.auditEvent.deleteMany({ where: { actorRef: { startsWith: tag } } });
    await db.exportLog.deleteMany({ where: { actorRef: { startsWith: tag } } });
  }

  return { bookings: bookingIds.length, persons: personIds.length, plots: plotIds.length };
}
