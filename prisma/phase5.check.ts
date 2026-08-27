// Phase 5 service checks — PHASES.md Phase 5 "Tests", end to end against the
// real database and the real commands.
// Run: npm run phase5:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  cancelBooking,
  decideBookingRequest,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();
const TAG = "ZZ-P5";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();

async function expectBlocked(pattern: RegExp, fn: () => Promise<unknown>) {
  await assert.rejects(fn, pattern);
}

/** Idempotent, so a crashed run never blocks the next one. */
async function cleanup() {
  await purgeCheckData(db, TAG);
}

async function makePlot(projectId: string, suffix: string, restriction?: "NOT_FOR_SALE") {
  return db.plot.create({
    data: {
      projectId,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-${suffix}`,
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.419",
      status: "AVAILABLE",
      restriction: restriction ?? "NONE",
      restrictionReason: restriction ? "Owner instruction" : null,
    },
  });
}

const SCHEDULE = [
  { seq: 1, percent: "40", dueDate: today },
  { seq: 2, percent: "60", dueDate: day(30) },
];

async function bookAndApprove(plotId: string, buyerPersonId: string, enquiryId?: string) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId,
    enquiryId: enquiryId ?? null,
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
  return submitted.bookingId;
}

async function main() {
  await cleanup();

  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { status: "PUBLISHED" } } },
  });
  const otherProject = await db.project.create({
    data: {
      projectCode: `${TAG}-P2`,
      name: `${TAG} Other Project`,
      type: "RESIDENTIAL",
      status: "ACTIVE",
    },
  });

  const buyer = await db.person.create({
    data: {
      fullName: `${TAG} Buyer`,
      primaryMobile: "9500000001",
      aadhaarCipher: encryptSensitive("250000000101"),
      aadhaarLastFour: "0101",
      aadhaarStatus: "AVAILABLE",
    },
  });

  /* ========================== cancellation: rejection restores exactly ==== */

  const plotA = await makePlot(project.id, "A");
  const enquiry = await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: buyer.id,
    projectId: project.id,
    plotId: plotA.id,
    source: "DIRECT",
    assignedStaffId: (await db.staffAccount.findFirstOrThrow({ where: { role: "CRM" } })).id,
    assigneeRole: "CRM",
    nextFollowUpAt: day(1),
  });
  const bookingA = await bookAndApprove(plotA.id, buyer.id, enquiry.enquiryId);
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingA,
    percent: "40",
    paidOn: today,
    reference: `${TAG} UTR A1`,
  });

  assert.equal(
    (await db.enquiry.findUniqueOrThrow({ where: { id: enquiry.enquiryId } })).status,
    "BOOKED"
  );

  await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingA,
    reason: "Loan Denied",
  });

  let state = await db.booking.findUniqueOrThrow({ where: { id: bookingA } });
  assert.equal(state.status, "REFUND_PENDING");
  assert.equal(state.activeProcess, "REFUND_PENDING");
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotA.id } })).status, "REFUND_PENDING");
  assert.equal(
    await db.task.count({ where: { recordId: bookingA, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" } }),
    0,
    "payment follow-up pauses while Refund Pending"
  );

  // PRD §3.3 — the account that raised it may not decide it.
  await expectBlocked(/different staff account/, () =>
    decideCancellation({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingA,
      approve: true,
      note: "self approve",
    })
  );

  // main-PRD §15.4 — No Payment Received cannot be used when payment exists.
  await expectBlocked(/No Payment Received cannot be used/, () =>
    decideCancellation({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId: bookingA,
      approve: true,
      note: "wrong path",
      noPaymentReceived: true,
    })
  );

  // Rejection restores the exact previous state.
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingA,
    approve: false,
    note: "Buyer reconsidered.",
  });

  state = await db.booking.findUniqueOrThrow({ where: { id: bookingA } });
  assert.equal(state.status, "BOOKED", "the Booking returns to its exact previous status");
  assert.equal(state.activeProcess, "NONE");
  assert.equal(state.closeReason, null);
  assert.equal(state.paymentReceivedPercent.toFixed(0), "40", "payment is untouched");
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotA.id } })).status, "BOOKED");
  assert.ok(
    await db.task.findFirst({
      where: { recordId: bookingA, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" },
    }),
    "the rolling follow-up resumes"
  );

  /* ========================== cancellation: approval returns the Plot ===== */

  await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingA,
    reason: "Loan Denied",
  });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingA,
    approve: true,
    note: "Refund processed outside the CRM.",
    reference: `${TAG} REFUND 1`,
    actionDate: today,
  });

  state = await db.booking.findUniqueOrThrow({ where: { id: bookingA } });
  assert.equal(state.status, "CANCELLED");
  const cancelledPlot = await db.plot.findUniqueOrThrow({ where: { id: plotA.id } });
  assert.equal(cancelledPlot.status, "AVAILABLE");
  assert.equal(cancelledPlot.isResale, false, "Booking cancellation adds no RESALE tag (PRD §15)");
  assert.equal(
    (await db.enquiry.findUniqueOrThrow({ where: { id: enquiry.enquiryId } })).status,
    "ACTIVE",
    "the Enquiry never stays Booked once its only Booking is cancelled (PRD §7.2)"
  );
  const refundRef = await db.externalReference.findFirstOrThrow({
    where: { purpose: "REFUND", actorRef: ACC },
  });
  assert.equal(refundRef.status, "ACTIVE");

  // A restricted Plot still comes back Not Available (PRD §15).
  const plotR = await makePlot(project.id, "R");
  const bookingR = await bookAndApprove(plotR.id, buyer.id);
  await db.plot.update({
    where: { id: plotR.id },
    data: { restriction: "PLEDGE", restrictionReason: "Bank pledge" },
  });
  await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingR,
    reason: "Other",
    remark: "Restriction applied after the Booking.",
  });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingR,
    approve: true,
    note: "No payment was ever received.",
    noPaymentReceived: true,
  });
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: plotR.id } })).status,
    "NOT_AVAILABLE",
    "an active restriction keeps a returning Plot Not Available"
  );

  /* ================================================== Change Plot ======== */

  const plotB = await makePlot(project.id, "B");
  const plotC = await makePlot(project.id, "C");
  const plotOther = await makePlot(otherProject.id, "X");
  const bookingB = await bookAndApprove(plotB.id, buyer.id);
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingB,
    percent: "40",
    paidOn: today,
    reference: `${TAG} UTR B1`,
  });

  // PRD §5.3 — same Project only.
  await expectBlocked(/same Project only/, () =>
    submitChangePlot({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingB,
      toPlotId: plotOther.id,
      remark: "Cross-project move.",
    })
  );
  await expectBlocked(/compulsory remark/, () =>
    submitChangePlot({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingB,
      toPlotId: plotC.id,
      remark: "   ",
    })
  );

  await submitChangePlot({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingB,
    toPlotId: plotC.id,
    remark: "Buyer prefers the corner plot.",
  });

  const pendingChange = await db.changePlotRequest.findFirstOrThrow({
    where: { bookingId: bookingB, status: "PENDING" },
  });
  assert.ok(pendingChange.replacementPlcSnapshotId, "the replacement PLC is frozen at submission");
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingB } })).activeProcess,
    "CHANGE_PLOT_PENDING"
  );
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: plotC.id } })).status,
    "WAITING_FOR_BOOKING_APPROVAL",
    "the replacement is transactionally blocked while under review"
  );
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: plotB.id } })).status,
    "BOOKED",
    "the old Plot stays allocated"
  );

  // Only one major process at a time (ARCHITECTURE §6.3).
  await expectBlocked(/already under Change Plot Pending/, () =>
    cancelBooking({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: bookingB,
      reason: "Loan Denied",
    })
  );

  // Rejection restores both Plots and keeps the temporary PLC snapshot in History.
  const rejectedSnapshotId = pendingChange.replacementPlcSnapshotId!;
  await decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingB,
    approve: false,
    note: "Replacement not verified.",
  });

  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotC.id } })).status, "AVAILABLE");
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotB.id } })).status, "BOOKED");
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingB } })).activeProcess,
    "NONE"
  );
  const rejectedSnapshot = await db.plcSnapshot.findUniqueOrThrow({
    where: { id: rejectedSnapshotId },
  });
  assert.equal(
    rejectedSnapshot.isCurrent,
    false,
    "the rejected replacement PLC snapshot leaves current use (PLC §10.3)"
  );
  assert.equal(
    (await db.changePlotRequest.findUniqueOrThrow({ where: { id: pendingChange.id } }))
      .replacementPlcSnapshotId,
    rejectedSnapshotId,
    "the rejected request stays linked to its temporary snapshot (PLC §10.3)"
  );

  // Approval: same Booking Number, Accounts records the applicable percentage.
  const beforeNumber = (await db.booking.findUniqueOrThrow({ where: { id: bookingB } })).bookingNumber;
  await submitChangePlot({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingB,
    toPlotId: plotC.id,
    remark: "Buyer prefers the corner plot.",
  });
  await expectBlocked(/must record the Payment Received percentage/, () =>
    decideChangePlot({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId: bookingB,
      approve: true,
      note: "Missing the percentage.",
    })
  );

  await decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingB,
    approve: true,
    note: "Verified against the agreement.",
    appliedPercent: "35",
    schedule: [
      { seq: 1, percent: "35", dueDate: today },
      { seq: 2, percent: "65", dueDate: day(45) },
    ],
  });

  const moved = await db.booking.findUniqueOrThrow({ where: { id: bookingB } });
  assert.equal(moved.plotId, plotC.id, "the Booking moved to the replacement Plot");
  assert.equal(moved.bookingNumber, beforeNumber, "the same Booking Number continues (PRD §5.3)");
  assert.equal(moved.primaryPersonId, buyer.id, "the same Primary Customer continues");
  assert.equal(moved.paymentReceivedPercent.toFixed(0), "35", "Accounts recorded the applicable %");
  assert.equal(moved.activeProcess, "NONE");
  assert.equal(moved.status, "BOOKED");

  const oldPlot = await db.plot.findUniqueOrThrow({ where: { id: plotB.id } });
  assert.equal(oldPlot.status, "AVAILABLE");
  assert.equal(oldPlot.isResale, false, "Change Plot adds no RESALE tag (PRD §5.3)");
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotC.id } })).status, "BOOKED");

  const live = await db.paymentScheduleVersion.findFirstOrThrow({
    where: { bookingId: bookingB, status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
  assert.equal(live.instalments[0].receivedPercent.toFixed(0), "35", "the verified % is allocated");
  assert.equal(live.instalments[1].receivedPercent.toFixed(0), "0");

  // PRD §5.3 — existing Payment Reference Numbers remain linked to the Booking.
  assert.equal(
    await db.paymentReceivedEntry.count({ where: { bookingId: bookingB, status: "CONFIRMED" } }),
    1,
    "the original payment entry and its reference stay with the same Booking"
  );

  await cleanup();
  console.log("phase5.check.ts OK");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((purgeError) => {
      // A swallowed purge failure is why a later check script fails on data
      // this one left behind. Say so here, where it happened.
      console.error("Cleanup failed — tagged rows may remain:", purgeError);
    });
    await db.$disconnect();
    process.exit(1);
  });
