// The one purge the check scripts share.
//
// Each check used to carry its own copy, so every new table meant patching
// three near-identical functions — and a missed one leaves rows behind that
// surface as real operating data. This is dependency-ordered and captures every
// id before deleting anything, because a task points at its record by id: erase
// the record first and the task can never be found again.

import type { PrismaClient } from "@prisma/client";

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
  const bookingIds = (
    await db.booking.findMany({
      where: { submittedByRef: { startsWith: tag } },
      select: { id: true },
    })
  ).map((b) => b.id);

  const personIds = (
    await db.person.findMany({ where: { fullName: { startsWith: tag } }, select: { id: true } })
  ).map((p) => p.id);

  const plotIds = (
    await db.plot.findMany({
      where: {
        OR: [
          { plotNumber: { startsWith: tag } },
          // A Plot the application itself created inside a tagged Project —
          // an approved Purchase for Resale names it after the property, not
          // after the tag.
          { project: { OR: [{ projectCode: { startsWith: tag } }, { name: { startsWith: tag } }] } },
          ...(options.extraPlotWhere?.restrictionReason
            ? [{ restrictionReason: options.extraPlotWhere.restrictionReason }]
            : []),
        ],
      },
      select: { id: true },
    })
  ).map((p) => p.id);

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
        OR: [
          { submittedByRef: { startsWith: tag } },
          { plotId: { in: plotIds } },
          { sellerPersonId: { in: personIds } },
        ],
      },
      select: { id: true },
    })
  ).map((a) => a.id);

  // Tasks first: they reference records by id, not by relation.
  const taskIds = (
    await db.task.findMany({
      where: {
        OR: [
          { recordId: { in: [...bookingIds, ...plotIds, ...personIds, ...commissionIds, ...acquisitionIds] } },
          { taskNo: { startsWith: tag } },
          { recordName: { contains: tag } },
        ],
      },
      select: { id: true },
    })
  ).map((t) => t.id);
  await db.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
  await db.task.deleteMany({ where: { id: { in: taskIds } } });

  // Commission, then the entitlements it consumed.
  await db.commissionEvent.deleteMany({ where: { recordId: { in: commissionIds } } });
  await db.commissionRecord.deleteMany({ where: { id: { in: commissionIds } } });
  await db.commissionOpportunity.deleteMany({
    where: {
      OR: [{ consumedByBookingId: { in: bookingIds } }, { subjectPersonId: { in: personIds } }],
    },
  });

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

  await db.externalReference.updateMany({
    where: { actorRef: { startsWith: tag } },
    data: { replacesId: null },
  });
  await db.externalReference.deleteMany({ where: { actorRef: { startsWith: tag } } });

  // Pre-sales.
  const scope = { OR: [{ personId: { in: personIds } }, { plotId: { in: plotIds } }] };
  await db.holdExtensionRequest.deleteMany({ where: { hold: scope } });
  await db.holdRequest.deleteMany({ where: scope });
  await db.hold.deleteMany({ where: scope });
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
  const projectIds = (
    await db.project.findMany({
      where: { OR: [{ projectCode: { startsWith: tag } }, { name: { startsWith: tag } }] },
      select: { id: true },
    })
  ).map((p) => p.id);
  await db.plcRuleVersion.updateMany({
    where: { projectId: { in: projectIds } },
    data: { supersededById: null },
  });
  await db.plcRuleVersion.deleteMany({ where: { projectId: { in: projectIds } } });
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
  // CR-014 — a Member's performance cycles hold a foreign key to the profile,
  // and each position holds one back to the cycle, so the position links are
  // cleared first and the cycles go before the profiles. Missing this is exactly
  // the failure mode this file's header warns about: the profile delete fails,
  // cleanup aborts, and the run's rows stay behind looking like real data.
  await db.memberProfile.updateMany({
    where: { personId: { in: personIds } },
    data: { inviteCycleId: null },
  });
  await db.customerProfile.updateMany({
    where: { personId: { in: personIds } },
    data: { royaltyCycleId: null },
  });
  await db.performanceCycle.deleteMany({
    where: { memberProfile: { personId: { in: personIds } } },
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
  await db.idempotencyRecord.deleteMany({ where: { key: { startsWith: tag } } });
  await db.auditEvent.deleteMany({ where: { actorRef: { startsWith: tag } } });
  await db.exportLog.deleteMany({ where: { actorRef: { startsWith: tag } } });

  return { bookings: bookingIds.length, persons: personIds.length, plots: plotIds.length };
}
