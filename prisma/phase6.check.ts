// Phase 6 service checks — PHASES.md Phase 6 "Tests", end to end against the
// real database and the real commands.
// Run: npm run phase6:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { purgeCheckData } from "./check-cleanup.ts";
import {
  decideBookingRequest,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import {
  recordCompletion,
  recordFinalBuyers,
  reopenDelivered,
} from "@/lib/services/completion-service";
import { confirmPaymentReceived, correctPaymentReceived } from "@/lib/services/payment-service";
import { disableStaffAccount, reassignWork, unassignedReviewQueue } from "@/lib/services/admin-service";
import { decidePersonMerge, requestPersonMerge } from "@/lib/services/merge-service";
import { exportReport, runReport } from "@/lib/services/report-service";
import { encryptSensitive } from "@/lib/security/identity";
import { hashPassword } from "@/lib/security/auth";

const db = new PrismaClient();
const TAG = "ZZ-P6";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;
const MD = `${TAG}-MD`;
const ADMIN = `${TAG}-ADMIN`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();

async function expectBlocked(pattern: RegExp, fn: () => Promise<unknown>) {
  await assert.rejects(fn, pattern);
}

async function cleanup() {
  await db.staffAccount.deleteMany({ where: { staffAccountId: { startsWith: TAG } } });
  await purgeCheckData(db, TAG);
}

async function makePlot(projectId: string, suffix: string) {
  return db.plot.create({
    data: {
      projectId,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-${suffix}`,
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.419",
      lifecycle: "AVAILABLE",
    },
  });
}

async function makePerson(name: string, mobile: string, aadhaar: string | null) {
  return db.person.create({
    data: {
      fullName: `${TAG} ${name}`,
      primaryMobile: mobile,
      ...(aadhaar
        ? {
            aadhaarCipher: encryptSensitive(aadhaar),
            aadhaarLastFour: aadhaar.slice(-4),
            aadhaarStatus: "AVAILABLE" as const,
          }
        : {}),
    },
  });
}

const SCHEDULE = [
  { seq: 1, percent: "40", dueDate: today },
  { seq: 2, percent: "60", dueDate: day(30) },
];

async function bookApproveAndPay(plotId: string, buyerPersonId: string, ref: string) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId,
    parties: [{ personId: buyerPersonId, role: "PRIMARY" }],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: today,
    schedule: SCHEDULE,
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    approve: true,
    note: "Verified.",
  });
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    percent: "100",
    paidOn: today,
    reference: ref,
  });
  return submitted.bookingId;
}

async function main() {
  await cleanup();

  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { isCurrent: true } } },
  });
  const buyer = await makePerson("Buyer", "9500000601", "260000000601");

  /* ================================ 100% creates the completion work once == */

  const plotA = await makePlot(project.id, "A");
  const bookingA = await bookApproveAndPay(plotA.id, buyer.id, `${TAG} UTR A1`);

  const pending = await db.task.findMany({
    where: { recordId: bookingA, status: "PENDING" },
    select: { purpose: true },
  });
  const purposes = pending.map((t) => t.purpose).sort();
  assert.deepEqual(
    purposes,
    ["ALLOTMENT_REGISTRY", "FINAL_BUYER_DETAILS"],
    "100% creates the final-buyer and Allotment/Registry work, and closes the payment follow-up"
  );

  /* ============================== delivery is blocked until details exist == */

  await expectBlocked(/Final buyer details are not complete/, () =>
    recordCompletion({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingA,
      completion: { route: "REGISTRY", advocateName: "S. Menon", registryDate: today },
    })
  );

  // main-PRD §18.6 — Aadhaar must be on record for every final buyer.
  const noAadhaar = await makePerson("No Aadhaar", "9500000602", null);
  await recordFinalBuyers({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingA,
    buyers: [
      { personId: buyer.id, sharePercent: "50", dateOfBirth: day(-14000), address: "12 Lake Road" },
      { personId: noAadhaar.id, sharePercent: "50", dateOfBirth: day(-13000), address: "12 Lake Road" },
    ],
  });
  await expectBlocked(/Aadhaar/, () =>
    recordCompletion({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingA,
      completion: { route: "REGISTRY", advocateName: "S. Menon", registryDate: today },
    })
  );

  // Shares must total 100% across the final buyers (PRD §12.1).
  await recordFinalBuyers({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingA,
    buyers: [{ personId: buyer.id, dateOfBirth: day(-14000), address: "12 Lake Road" }],
  });
  assert.equal(
    await db.task.count({
      where: { recordId: bookingA, purpose: "FINAL_BUYER_DETAILS", status: "PENDING" },
    }),
    0,
    "complete final buyer details close their own task"
  );
  assert.equal(
    await db.bookingParty.count({
      where: { bookingId: bookingA, kind: "FINAL_REGISTRATION" },
    }),
    3,
    "superseded final-buyer rows stay in History"
  );

  /* ========================================= one route, Delivered once ==== */

  await expectBlocked(/Advocate Name is required/, () =>
    recordCompletion({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingA,
      completion: { route: "REGISTRY", advocateName: "  ", registryDate: today },
    })
  );

  await recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingA,
    completion: { route: "REGISTRY", advocateName: "S. Menon", registryDate: today },
  });

  let state = await db.booking.findUniqueOrThrow({ where: { id: bookingA } });
  assert.equal(state.status, "DELIVERED");
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: plotA.id } })).lifecycle,
    "DELIVERED"
  );
  const completion = await db.bookingCompletion.findFirstOrThrow({
    where: { bookingId: bookingA, reopenedAt: null },
  });
  assert.equal(completion.route, "REGISTRY");
  assert.equal(completion.papersLegallyTransferred, true, "Papers Legally Transferred is automatic");
  assert.equal(completion.allotmentNumber, null, "the unused route stays empty");
  assert.equal(
    await db.bookingEvent.count({ where: { bookingId: bookingA, action: "DELIVERED" } }),
    1,
    "the Delivered event happens once"
  );
  assert.equal(
    await db.task.count({ where: { recordId: bookingA, status: "PENDING" } }),
    0,
    "completion closes the Allotment/Registry work"
  );

  // A second route on the same Booking is refused (PRD §4.1).
  await expectBlocked(/already Delivered/, () =>
    recordCompletion({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingA,
      completion: {
        route: "ALLOTMENT",
        allotmentGiven: true,
        allotmentDate: today,
        allotmentNumber: `${TAG}-ALT-1`,
        allotmentGivenTo: `${TAG} Buyer`,
        pattaStatus: "DONT_KNOW",
        pattaDate: null,
      },
    })
  );

  /* ================================ exceptional reopen preserves history == */

  await expectBlocked(/Only MD or Admin/, () =>
    reopenDelivered({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingA,
      reason: "Wrong Plot.",
    })
  );
  await expectBlocked(/compulsory reason/, () =>
    reopenDelivered({
      idempotencyKey: key(),
      actorRef: MD,
      actorRole: "MD",
      bookingId: bookingA,
      reason: "   ",
    })
  );

  await reopenDelivered({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    bookingId: bookingA,
    reason: "Registry recorded against the wrong Booking.",
  });

  state = await db.booking.findUniqueOrThrow({ where: { id: bookingA } });
  assert.equal(state.status, "PAYMENT_COMPLETED", "the prior state is restored");
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: plotA.id } })).lifecycle,
    "PAYMENT_COMPLETED"
  );
  assert.equal(
    await db.bookingCompletion.count({ where: { bookingId: bookingA } }),
    1,
    "the reopened completion is kept, not deleted"
  );
  assert.ok(
    (await db.bookingCompletion.findFirstOrThrow({ where: { bookingId: bookingA } })).reopenedAt,
    "the completion row records the reopen"
  );
  assert.equal(
    await db.task.count({ where: { recordId: bookingA, status: "PENDING" } }),
    2,
    "the completion tasks return to the queue"
  );

  // The corrected route may now be recorded on the freed Booking.
  await recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingA,
    completion: {
      route: "ALLOTMENT",
      allotmentGiven: true,
      allotmentDate: today,
      allotmentNumber: `${TAG}-ALT-1`,
      allotmentGivenTo: `${TAG} Buyer`,
      pattaStatus: "YES",
      pattaDate: today,
    },
  });
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingA } })).status,
    "DELIVERED"
  );
  assert.equal(
    await db.bookingCompletion.count({ where: { bookingId: bookingA, reopenedAt: null } }),
    1,
    "exactly one live completion per Booking"
  );

  /* ===================== a reversal below 100% pauses the completion work == */

  const plotB = await makePlot(project.id, "B");
  const buyerB = await makePerson("Buyer B", "9500000603", "260000000603");
  const bookingB = await bookApproveAndPay(plotB.id, buyerB.id, `${TAG} UTR B1`);
  const entryB = await db.paymentReceivedEntry.findFirstOrThrow({
    where: { bookingId: bookingB, status: "CONFIRMED" },
  });

  await correctPaymentReceived({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    entryId: entryB.id,
    percent: "60",
    paidOn: today,
    reference: `${TAG} UTR B2`,
    reason: "Bank reversed part of the transfer.",
  });

  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingB } })).status,
    "BOOKED",
    "a reversal below 100% returns the Booking to Booked"
  );
  assert.equal(
    await db.task.count({
      where: {
        recordId: bookingB,
        purpose: { in: ["FINAL_BUYER_DETAILS", "ALLOTMENT_REGISTRY"] },
        status: "PENDING",
      },
    }),
    0,
    "the completion work pauses below 100%"
  );

  /* ============================================ masked export and its log == */

  const rows = await runReport("BOOKINGS", { projectId: project.id });
  assert.ok(rows.length > 0, "the report is live");

  const exported = await exportReport({
    actorRef: `${TAG}-MIS`,
    actorRole: "MIS",
    report: "BOOKINGS",
    filters: { projectId: project.id },
  });
  assert.ok(
    exported.rows.every((row) => row.primaryMobile === "••••"),
    "exports stay masked (PRD §21)"
  );
  const log = await db.exportLog.findUniqueOrThrow({ where: { id: exported.exportId } });
  assert.equal(log.report, "BOOKINGS");
  assert.equal(log.rowCount, exported.rows.length, "the log stores the row count");
  assert.ok(log.contentHash, "the optional integrity hash is stored");

  // PRD §1.2, §21 — Payment Received and Payment Given never share a dataset.
  const received = await runReport("PAYMENTS_RECEIVED", { projectId: project.id });
  assert.ok(received.every((row) => row.dataset === "PAYMENT_RECEIVED"));
  const given = await runReport("PAYMENTS_GIVEN");
  assert.ok(given.every((row) => row.dataset === "PAYMENT_GIVEN"));

  /* ================================ emergency disable and reassignment ==== */

  const crmPerson = await makePerson("CRM Staff", "9500000604", null);
  const crmStaff = await db.staffAccount.create({
    data: {
      staffAccountId: `${TAG}-STAFF-1`,
      personId: crmPerson.id,
      role: "CRM",
      passwordHash: hashPassword("check-password-1"),
    },
  });
  const successorPerson = await makePerson("CRM Successor", "9500000605", null);
  const successor = await db.staffAccount.create({
    data: {
      staffAccountId: `${TAG}-STAFF-2`,
      personId: successorPerson.id,
      role: "CRM",
      passwordHash: hashPassword("check-password-2"),
    },
  });

  const openTask = await db.task.findFirstOrThrow({
    where: { recordId: bookingB, status: "PENDING" },
  });
  await db.task.update({
    where: { id: openTask.id },
    data: { assigneeStaffId: crmStaff.id },
  });

  // The planned path refuses to strand open work.
  await expectBlocked(/Reassign them first/, () =>
    disableStaffAccount({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      staffAccountId: crmStaff.id,
      reason: "Resigned.",
      emergency: false,
    })
  );

  const disabled = await disableStaffAccount({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    staffAccountId: crmStaff.id,
    reason: "Suspected credential compromise.",
    emergency: true,
  });
  assert.equal(disabled.queuedForReassignment, 1);

  const after = await db.staffAccount.findUniqueOrThrow({ where: { id: crmStaff.id } });
  assert.equal(after.status, "DISABLED");
  assert.ok(
    after.sessionVersion > crmStaff.sessionVersion,
    "every existing session is invalidated immediately"
  );

  const queue = await unassignedReviewQueue(db);
  assert.ok(
    queue.tasks.some((t) => t.id === openTask.id),
    "open work enters the Unassigned Review queue"
  );

  await reassignWork({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    toStaffAccountId: successor.id,
    taskIds: [openTask.id],
  });
  const reassigned = await db.task.findUniqueOrThrow({ where: { id: openTask.id } });
  assert.equal(reassigned.assigneeStaffId, successor.id);
  assert.equal(reassigned.needsReassignment, false);

  /* ================================================== Person Merge ======== */

  const survivorPerson = await makePerson("Merge Survivor", "9500000606", null);
  const duplicatePerson = await makePerson("Merge Duplicate", "9500000606", null);

  const survivorMember = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-MEM-1`,
      personId: survivorPerson.id,
      status: "ACTIVE",
      activationDate: day(-400),
    },
  });
  const duplicateMember = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-MEM-2`,
      personId: duplicatePerson.id,
      status: "ACTIVE",
      activationDate: day(-300),
    },
  });
  await db.customerProfile.create({
    data: { customerId: `${TAG}-CUS-1`, personId: survivorPerson.id, loyaltySlotsConsumed: 2 },
  });
  await db.customerProfile.create({
    data: { customerId: `${TAG}-CUS-2`, personId: duplicatePerson.id, loyaltySlotsConsumed: 2 },
  });

  // PRD §22 — two Active Members cannot merge through ordinary merge.
  await expectBlocked(/Deactivate one Member first/, () =>
    requestPersonMerge({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      survivingPersonId: survivorPerson.id,
      mergedPersonId: duplicatePerson.id,
      reason: "Same person registered twice.",
    })
  );

  await db.memberProfile.update({
    where: { id: duplicateMember.id },
    data: { status: "DEACTIVATED" },
  });

  // Both identities recorded the same two qualifying Bookings: four consumed
  // slots, two unique qualifying events (PRD §22).
  const consumed = (personId: string, slotIndex: number, bookingId: string) => ({
    kind: "LOYALTY" as const,
    subjectPersonId: personId,
    slotIndex,
    status: "CONSUMED" as const,
    consumedByBookingId: bookingId,
    consumedAt: today,
  });
  await db.commissionOpportunity.createMany({
    data: [
      consumed(survivorPerson.id, 1, bookingA),
      consumed(survivorPerson.id, 2, bookingB),
      consumed(duplicatePerson.id, 1, bookingA),
      consumed(duplicatePerson.id, 2, bookingB),
    ],
  });

  const request = await requestPersonMerge({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    survivingPersonId: survivorPerson.id,
    mergedPersonId: duplicatePerson.id,
    reason: "Same person registered twice.",
  });

  // PRD §22 — network migration requires MD approval.
  await expectBlocked(/Only the MD/, () =>
    decidePersonMerge({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      requestId: request.requestId,
      approve: true,
      note: "self approve",
    })
  );

  const decided = await decidePersonMerge({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    requestId: request.requestId,
    approve: true,
    note: "Verified as one Person.",
  });
  assert.equal(
    decided.loyaltyRebuiltTo,
    2,
    "the Loyalty count is rebuilt from unique qualifying events: not 2 + 2, and not 3"
  );

  const survivorCustomer = await db.customerProfile.findUniqueOrThrow({
    where: { personId: survivorPerson.id },
  });
  assert.equal(survivorCustomer.loyaltySlotsConsumed, 2);
  assert.ok(
    survivorCustomer.legacyCustomerIds.includes(`${TAG}-CUS-2`),
    "old Customer IDs stay searchable"
  );
  const survivorMemberAfter = await db.memberProfile.findUniqueOrThrow({
    where: { id: survivorMember.id },
  });
  assert.ok(
    survivorMemberAfter.legacyMemberIds.includes(`${TAG}-MEM-2`),
    "old Member IDs stay searchable"
  );
  const mergedAway = await db.person.findUniqueOrThrow({ where: { id: duplicatePerson.id } });
  assert.equal(mergedAway.mergeStatus, "MERGED_AWAY", "the merged Person is kept, never deleted");
  assert.equal(mergedAway.survivingPersonId, survivorPerson.id);

  // PRD §21 — a merged-away Person is not counted twice in reports.
  const commissionRows = await runReport("COMMISSION");
  assert.equal(
    commissionRows.filter((row) => row.beneficiary === `${TAG} Merge Duplicate`).length,
    0
  );

  await cleanup();
  console.log("phase6.check.ts OK");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    await db.$disconnect();
    process.exit(1);
  });
