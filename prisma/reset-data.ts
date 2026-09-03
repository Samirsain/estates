// Clears the operating data and keeps the staff.
//
//   npm run data:reset
//
// What survives: StaffAccount and the Person rows those accounts sit on, so
// everyone can still sign in and the seeds have makers and checkers to act as.
// Everything else goes — Projects, Plots, PLC versions, Enquiries, Holds,
// Bookings, payments, commission, acquisitions, Members, Customers, portal
// accounts, tasks, land inquiries, references, idempotency keys and the audit
// trail of all of it.
//
// GUARDED. It refuses to run anywhere ALLOW_CHECK_WRITES is not "true", which
// is a development or staging database and never production.
//
// Order matters: a child row deleted after its parent is a foreign key error,
// and a task points at its record by id rather than by relation, so the tasks
// go before the records they name.
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();

const db = new PrismaClient();

async function main() {
  const staff = await db.staffAccount.findMany({ select: { id: true, personId: true } });
  const keepPersonIds = staff.map((s) => s.personId);

  // Leaves of the commission tree first.
  await db.commissionEvent.deleteMany({});
  await db.commissionRecord.deleteMany({});
  await db.commissionOpportunity.deleteMany({});
  await db.performanceCycle.deleteMany({});

  // Everything that hangs off a Booking.
  await db.bookingCompletion.deleteMany({});
  await db.bookingEvent.deleteMany({});
  await db.bookingParty.deleteMany({});
  await db.bookingReviewVersion.deleteMany({});
  await db.primaryCustomerChange.deleteMany({});
  await db.soldByCorrection.deleteMany({});
  await db.cancellationRequest.deleteMany({});
  await db.changePlotRequest.deleteMany({});
  await db.paymentReceivedEntry.deleteMany({});
  await db.paymentGivenEntry.deleteMany({});
  // The schedule version goes first and takes its instalments with it by
  // cascade. Removing the instalments on their own leaves a live schedule
  // totalling 0%, which is exactly what the database trigger exists to refuse.
  await db.paymentScheduleVersion.deleteMany({});

  await db.acquisitionEvent.deleteMany({});
  // A Buyback names its source Booking, so acquisitions leave before Bookings.
  await db.acquisition.deleteMany({});
  await db.booking.deleteMany({});

  await db.enquiryFollowUp.deleteMany({});
  await db.enquiry.deleteMany({});

  await db.holdExtensionRequest.deleteMany({});
  await db.hold.deleteMany({});
  await db.holdRequest.deleteMany({});

  await db.landInquiryOwner.deleteMany({});
  await db.landInquiryJamabandiEntry.deleteMany({});
  await db.landInquiry.deleteMany({});

  await db.taskEvent.deleteMany({});
  await db.task.deleteMany({});

  await db.plcSnapshot.deleteMany({});
  await db.plotBoundary.deleteMany({});
  await db.plotEvent.deleteMany({});
  await db.plot.deleteMany({});
  await db.plcComponent.deleteMany({});
  await db.plcRuleVersion.deleteMany({});
  await db.project.deleteMany({});

  await db.portalAccount.deleteMany({});
  await db.memberTermsAcceptance.deleteMany({});
  await db.personMergeRequest.deleteMany({});
  await db.memberProfile.deleteMany({});
  await db.customerProfile.deleteMany({});
  await db.bankDetail.deleteMany({});

  await db.externalReference.deleteMany({});
  await db.exportLog.deleteMany({});
  await db.scheduledJobRun.deleteMany({});
  await db.idempotencyRecord.deleteMany({});
  await db.auditEvent.deleteMany({});

  // The staff themselves, and only them, keep their Person.
  const removed = await db.person.deleteMany({ where: { id: { notIn: keepPersonIds } } });

  console.log(
    `data:reset — kept ${staff.length} staff account(s) and their people; removed ${removed.count} other Person record(s) and every Project, Plot, Enquiry, Hold, Booking, payment, commission, acquisition, Member, Customer, task and land inquiry.`
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
