// Phase 3 service checks — PHASES.md Phase 3 "Tests", end to end against the
// real database and the real commands.
// Run: npm run booking:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  cancelBooking,
  changeOwnershipShares,
  decideBookingRequest,
  decidePrimaryCustomerChange,
  requestPrimaryCustomerChange,
  reviseBookingRequest,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { cancelHold, createHold, requestHoldExtension } from "@/lib/services/hold-service";
import {
  confirmPaymentReceived,
  correctPaymentReceived,
  decideScheduleRevision,
  reviseSchedule,
} from "@/lib/services/payment-service";

const db = new PrismaClient();
const TAG = "ZZ-BOOK";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;

let keySeq = 0;
const key = () => `${TAG}-${Date.now()}-${keySeq++}`;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
/** Today in IST, so a Booking Date is never accidentally backdated or future. */
const today = new Date();

async function expectBlocked(pattern: RegExp, fn: () => Promise<unknown>) {
  await assert.rejects(fn, pattern);
}

/** Idempotent, so a crashed run never blocks the next one. */
async function cleanup() {
  await purgeCheckData(db, TAG, { extraPlotWhere: { restrictionReason: TAG } });
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
      restriction: "NONE",
    },
  });
}

/** 30 / 70 across today and next month, totalling exactly 100%. */
const SCHEDULE = [
  { seq: 1, percent: "30", dueDate: today },
  { seq: 2, percent: "70", dueDate: day(30) },
];

async function main() {
  await cleanup();

  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { isCurrent: true } } },
  });
  const buyer = await db.person.create({
    data: { fullName: `${TAG} Buyer One`, primaryMobile: "9800000001" },
  });
  const coBuyer = await db.person.create({
    data: { fullName: `${TAG} Buyer Two`, primaryMobile: "9800000002" },
  });
  const newBuyer = await db.person.create({
    data: { fullName: `${TAG} Buyer Three`, primaryMobile: "9800000003" },
  });

  /* ------------------------ a Project in Setup accepts no Hold or Booking */

  // PRD §16.1 — however Available the Plot looks.
  const setupProject = await db.project.create({
    data: {
      projectCode: `${TAG}-SETUP`,
      name: `${TAG} Setup Project`,
      type: "RESIDENTIAL",
      lifecycle: "SETUP_NOT_ACTIVE",
    },
  });
  const setupPlot = await db.plot.create({
    data: {
      projectId: setupProject.id,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-S1`,
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.419",
      lifecycle: "AVAILABLE",
      restriction: "NONE",
    },
  });
  await expectBlocked(/Setup \/ Not Active/, () =>
    createHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: setupPlot.id,
      personId: buyer.id,
    })
  );
  await expectBlocked(/Setup \/ Not Active/, () =>
    submitBookingRequest({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: setupPlot.id,
      parties: [{ personId: buyer.id, role: "PRIMARY" }],
      soldByType: "THREE_PERCENT_CLUB",
      bookingDate: today,
      schedule: SCHEDULE,
    })
  );
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: setupPlot.id } })).lifecycle,
    "AVAILABLE",
    "a blocked attempt leaves the Plot untouched"
  );

  /* ------------------------------- submit, approve at 0%, idempotent retry */

  const plotA = await makePlot(project.id, "A1");
  const submitKey = key();
  const submitArgs = {
    idempotencyKey: submitKey,
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotA.id,
    parties: [{ personId: buyer.id, role: "PRIMARY" as const }],
    soldByType: "THREE_PERCENT_CLUB" as const,
    bookingDate: today,
    schedule: SCHEDULE,
  };
  const submitted = await submitBookingRequest(submitArgs);
  // PRD §19 — a repeated key returns the original result, never a second request.
  const replay = await submitBookingRequest(submitArgs);
  assert.equal(replay.bookingId, submitted.bookingId, "a repeated submit returns the original request");
  assert.equal(await db.booking.count({ where: { plotId: plotA.id } }), 1);

  // PRD §5.2 — the Customer ID is created at the first Booking Request.
  assert.ok(await db.customerProfile.findUnique({ where: { personId: buyer.id } }), "Customer ID created");

  let plot = await db.plot.findUniqueOrThrow({ where: { id: plotA.id } });
  assert.equal(plot.lifecycle, "WAITING_FOR_BOOKING_APPROVAL");
  assert.ok(
    await db.task.findFirst({
      where: { recordId: submitted.bookingId, purpose: "BOOKING_REVIEW", status: "PENDING" },
    }),
    "Accounts Verification — Booking task created"
  );

  // ARCHITECTURE §7.1 — the Plot is committed; a second request is refused.
  await expectBlocked(/not Available|already/i, () =>
    submitBookingRequest({ ...submitArgs, idempotencyKey: key(), parties: [{ personId: coBuyer.id, role: "PRIMARY" }] })
  );

  // PRD §3.3 — the submitting account may not decide its own request.
  await expectBlocked(/different staff account/, () =>
    decideBookingRequest({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: submitted.bookingId,
      approve: true,
      note: "self approval",
    })
  );

  // PRD §9.4 — Payment Not Received is invalid merely because payment is 0%.
  await expectBlocked(/Incomplete Details or Other/, () =>
    decideBookingRequest({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId: submitted.bookingId,
      approve: false,
      rejectReason: "PAYMENT_NOT_RECEIVED",
      requestClaimedPayment: false,
      note: "nothing received",
    })
  );

  // RD-04 — Accounts may approve at 0% Payment Received.
  const approveKey = key();
  const approveArgs = {
    idempotencyKey: approveKey,
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    approve: true,
    note: "Verified at 0% Payment Received.",
  };
  const approved = await decideBookingRequest(approveArgs);
  assert.ok(approved.bookingNumber?.startsWith("BKG-"), "permanent Booking Number issued on approval");
  const reapproved = await decideBookingRequest(approveArgs);
  assert.equal(reapproved.bookingNumber, approved.bookingNumber, "double approve yields one Booking Number");
  assert.equal(
    await db.booking.count({ where: { bookingNumber: approved.bookingNumber } }),
    1,
    "one Booking Number exists"
  );

  plot = await db.plot.findUniqueOrThrow({ where: { id: plotA.id } });
  assert.equal(plot.lifecycle, "BOOKED");
  assert.ok(
    await db.task.findFirst({
      where: { recordId: submitted.bookingId, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" },
    }),
    "the rolling Payment Follow-up task opens on approval"
  );

  /* --------------------------- rejection restores the exact Hold remainder */

  const plotB = await makePlot(project.id, "B1");
  const hold = await createHold({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotB.id,
    personId: coBuyer.id,
  });
  const heldBefore = await db.hold.findUniqueOrThrow({ where: { id: hold.holdId } });

  const fromHold = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotB.id,
    holdId: hold.holdId,
    parties: [{ personId: coBuyer.id, role: "PRIMARY" }],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: today,
    schedule: SCHEDULE,
  });

  // PRD §10.5 — the remaining Hold time freezes; it does not keep running.
  const frozen = await db.hold.findUniqueOrThrow({ where: { id: hold.holdId } });
  assert.equal(frozen.status, "FROZEN");
  assert.ok(frozen.frozenRemainingMs && frozen.frozenRemainingMs > 0, "the remainder is stored");

  // A frozen Hold is owned by the Booking Request. Acting on it directly would
  // otherwise report success while doing nothing, or set an expiry that the
  // rejection then overwrites.
  await expectBlocked(/frozen behind a Booking Request/, () =>
    cancelHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      holdId: hold.holdId,
      reason: "Trying to cancel a frozen Hold.",
    })
  );
  await expectBlocked(/timer is not running|nothing to extend/, () =>
    requestHoldExtension({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      holdId: hold.holdId,
      reason: "Trying to extend a frozen Hold.",
      requestedHours: 24,
    })
  );

  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: fromHold.bookingId,
    approve: false,
    rejectReason: "INCOMPLETE_DETAILS",
    note: "Customer details incomplete.",
  });

  const restored = await db.hold.findUniqueOrThrow({ where: { id: hold.holdId } });
  assert.equal(restored.status, "ACTIVE", "rejection restores the Hold");
  assert.equal(restored.frozenRemainingMs, null);
  const drift = Math.abs(restored.expiresAt.getTime() - (Date.now() + (frozen.frozenRemainingMs ?? 0)));
  assert.ok(drift < 60_000, `the frozen remainder is restored exactly (drift ${drift}ms)`);
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: plotB.id } })).lifecycle,
    "HOLD",
    "the Plot returns to Hold, not Available"
  );
  const rejectedBooking = await db.booking.findUniqueOrThrow({ where: { id: fromHold.bookingId } });
  assert.equal(rejectedBooking.status, "REQUEST_REJECTED");
  assert.equal(rejectedBooking.bookingNumber, null, "a rejected request never consumes a Booking Number");

  /* ------------------------ shares: two buyers must total exactly 100% */

  const plotC = await makePlot(project.id, "C1");
  await expectBlocked(/exactly 100%/, () =>
    submitBookingRequest({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: plotC.id,
      parties: [
        { personId: buyer.id, role: "PRIMARY", sharePercent: "60" },
        { personId: coBuyer.id, role: "ADDITIONAL", sharePercent: "30" },
      ],
      soldByType: "THREE_PERCENT_CLUB",
      bookingDate: today,
      schedule: SCHEDULE,
    })
  );
  // A blocked submit leaves the Plot untouched.
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotC.id } })).lifecycle, "AVAILABLE");

  const shared = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotC.id,
    parties: [
      { personId: buyer.id, role: "PRIMARY", sharePercent: "60" },
      { personId: coBuyer.id, role: "ADDITIONAL", sharePercent: "40" },
    ],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: today,
    schedule: SCHEDULE,
  });

  /* -------------- the pending review snapshot cannot be silently edited */

  const pendingBefore = await db.bookingReviewVersion.findFirstOrThrow({
    where: { bookingId: shared.bookingId, status: "PENDING" },
  });
  await reviseBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: shared.bookingId,
    parties: [
      { personId: buyer.id, role: "PRIMARY", sharePercent: "70" },
      { personId: coBuyer.id, role: "ADDITIONAL", sharePercent: "30" },
    ],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: today,
    schedule: SCHEDULE,
    reason: "Buyers agreed a different split.",
  });
  const versions = await db.bookingReviewVersion.findMany({
    where: { bookingId: shared.bookingId },
    orderBy: { version: "asc" },
  });
  assert.equal(versions.length, 2, "a changed frozen field creates a new review version");
  assert.equal(versions[0].status, "CANCELLED", "the superseded version stays in History");
  assert.deepEqual(versions[0].snapshot, pendingBefore.snapshot, "the old snapshot is preserved unchanged");
  assert.equal(versions[1].status, "PENDING");
  assert.equal(
    await db.bookingReviewVersion.count({ where: { bookingId: shared.bookingId, status: "PENDING" } }),
    1,
    "only one version is ever pending"
  );

  /* ---------------- cancel before approval never enters Refund Pending */

  const cancelledRequest = await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: shared.bookingId,
    reason: "Buyer withdrew before the Accounts decision.",
  });
  assert.equal(cancelledRequest.status, "REQUEST_CANCELLED");
  assert.equal(cancelledRequest.refundPending, false, "a pre-approval cancel does not enter Refund Pending");
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotC.id } })).lifecycle, "AVAILABLE");

  /* ------------------------------ Payment Received, 100%, and correction */

  const bookingId = submitted.bookingId;
  const first = await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent: "30",
    paidOn: today,
    reference: `${TAG} UTR 0001`,
  });
  assert.equal(first.progressPercent, "30.0000");
  assert.equal(first.paymentCompleted, false);

  // PRD §10.3 — one active reference globally, normalised for spaces and case.
  await expectBlocked(/already recorded against another entry/, () =>
    confirmPaymentReceived({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId,
      percent: "10",
      paidOn: today,
      reference: `${TAG.toLowerCase()}utr0001`,
    })
  );

  // PRD §10.4 — progress can never exceed 100%.
  await expectBlocked(/cannot go above 100%|exceeds the outstanding schedule/, () =>
    confirmPaymentReceived({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId,
      percent: "71",
      paidOn: today,
      reference: `${TAG} UTR 9999`,
    })
  );

  const second = await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent: "70",
    paidOn: today,
    reference: `${TAG} UTR 0002`,
  });
  assert.equal(second.progressPercent, "100.0000");
  assert.equal(second.paymentCompleted, true);
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotA.id } })).lifecycle, "PAYMENT_COMPLETED");
  assert.equal(
    await db.task.count({ where: { recordId: bookingId, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" } }),
    0,
    "the rolling follow-up closes at 100%"
  );

  // PRD §12.6 — the correction preserves the original and links the replacement.
  const corrected = await correctPaymentReceived({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    entryId: second.entryId,
    percent: "40",
    paidOn: today,
    reference: `${TAG} UTR 0003`,
    reason: "Bank confirmed a lower credit.",
  });
  assert.equal(corrected.progressPercent, "70.0000");

  const original = await db.paymentReceivedEntry.findUniqueOrThrow({
    where: { id: second.entryId },
    include: { externalReference: true },
  });
  const replacement = await db.paymentReceivedEntry.findUniqueOrThrow({
    where: { id: corrected.replacementEntryId },
    include: { externalReference: true },
  });
  assert.equal(original.status, "SUPERSEDED", "the original entry is never deleted");
  assert.equal(replacement.correctsEntryId, original.id, "the replacement links to the original");
  assert.equal(original.externalReference.status, "SUPERSEDED");
  assert.equal(
    replacement.externalReference.replacesId,
    original.externalReferenceId,
    "the reference supersession chain is preserved"
  );

  // PRD §12.7 — a reversal below 100% returns Payment Completed to Booked.
  const afterCorrection = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assert.equal(afterCorrection.status, "BOOKED", "the completion workflow pauses below 100%");
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotA.id } })).lifecycle, "BOOKED");
  assert.ok(
    await db.task.findFirst({ where: { recordId: bookingId, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" } }),
    "the rolling follow-up reopens below 100%"
  );

  /* -------------------------------------------- schedule revision workflow */

  // PRD §10.2 — a receipt can never be dropped out of the schedule.
  await expectBlocked(/cannot be removed/, () =>
    reviseSchedule({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId,
      lines: [
        { seq: 2, percent: "60", dueDate: day(45) },
        { seq: 3, percent: "40", dueDate: day(75) },
      ],
      reason: "Drop the received instalment.",
    })
  );

  await reviseSchedule({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    lines: [
      { seq: 1, percent: "30", dueDate: today },
      { seq: 2, percent: "40", dueDate: day(45) },
      { seq: 3, percent: "30", dueDate: day(75) },
    ],
    reason: "Buyer requested a longer runway on the unpaid portion.",
  });
  await decideScheduleRevision({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    approve: true,
    note: "Verified against the agreement.",
  });
  const live = await db.paymentScheduleVersion.findFirstOrThrow({
    where: { bookingId, status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
  assert.equal(live.version, 2);
  assert.equal(live.instalments[0].receivedPercent.toFixed(0), "30", "received portions carry forward locked");
  assert.equal(live.instalments[1].receivedPercent.toFixed(0), "40", "the corrected receipt stays allocated");
  assert.equal(
    await db.paymentScheduleVersion.count({ where: { bookingId, status: "SUPERSEDED" } }),
    1,
    "the old schedule stays in History"
  );

  /* --------------------- Primary Customer change stays pending until approved */

  const changeRequest = await requestPrimaryCustomerChange({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    toPersonId: newBuyer.id,
    reason: "The commercial buyer changed before registration.",
  });
  let underReview = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assert.equal(underReview.primaryPersonId, buyer.id, "the old Customer stays official while under review");
  assert.equal(underReview.activeProcess, "PRIMARY_CUSTOMER_CHANGE_UNDER_REVIEW");

  // ARCHITECTURE §6.3 — only one major conflicting process at a time.
  await expectBlocked(/already under Primary Customer Change Under Review/, () =>
    cancelBooking({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId,
      reason: "Trying to cancel mid-review.",
    })
  );
  await expectBlocked(/already under Primary Customer Change Under Review/, () =>
    reviseSchedule({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId,
      lines: [
        { seq: 1, percent: "30", dueDate: today },
        { seq: 2, percent: "40", dueDate: day(45) },
        { seq: 3, percent: "30", dueDate: day(90) },
      ],
      reason: "Trying to reschedule mid-review.",
    })
  );

  await decidePrimaryCustomerChange({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    approve: true,
    note: "Identity and payment impact verified.",
  });
  underReview = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assert.equal(underReview.primaryPersonId, newBuyer.id, "the new Customer becomes official on approval");
  assert.equal(underReview.activeProcess, "NONE");
  assert.equal(underReview.bookingNumber, approved.bookingNumber, "the Booking Number is unchanged");
  assert.equal(
    underReview.paymentReceivedPercent.toFixed(4),
    "70.0000",
    "the Payment Received percentage carries forward unchanged"
  );
  assert.equal(changeRequest.requestId.length > 0, true);
  const partyHistory = await db.bookingParty.findMany({ where: { bookingId }, orderBy: { effectiveFrom: "asc" } });
  assert.ok(
    partyHistory.some((p) => p.personId === buyer.id && p.effectiveTo !== null),
    "the outgoing Customer stays permanently visible in History"
  );

  /* --------------------------- ownership share change on an approved Booking */

  await changeOwnershipShares({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    parties: [
      { personId: newBuyer.id, role: "PRIMARY", sharePercent: "55" },
      { personId: coBuyer.id, role: "ADDITIONAL", sharePercent: "45" },
    ],
    reason: "Buyers recorded their agreed split.",
  });
  const currentShares = await db.bookingParty.findMany({ where: { bookingId, effectiveTo: null } });
  const total = currentShares.reduce((sum, p) => sum + Number(p.sharePercent ?? 0), 0);
  assert.equal(total, 100, "current shares total exactly 100%");

  /* ------------------- cancel after approval enters formal Refund Pending */

  const formal = await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId,
    reason: "Loan Denied",
  });
  assert.equal(formal.status, "REFUND_PENDING");
  assert.equal(formal.refundPending, true, "a post-approval cancel takes the formal path");
  assert.equal((await db.plot.findUniqueOrThrow({ where: { id: plotA.id } })).lifecycle, "REFUND_PENDING");
  assert.ok(
    await db.task.findFirst({ where: { recordId: bookingId, purpose: "REFUND_REVIEW", status: "PENDING" } }),
    "Accounts Verification — Refund task created"
  );
  assert.equal(
    await db.task.count({ where: { recordId: bookingId, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" } }),
    0,
    "payment follow-up pauses while Refund Pending"
  );
  // Payment confirmation is blocked while a major process is active.
  await expectBlocked(/refund pending/i, () =>
    confirmPaymentReceived({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId,
      percent: "5",
      paidOn: today,
      reference: `${TAG} UTR 0004`,
    })
  );

  await cleanup();
  console.log("booking.check.ts OK");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    await db.$disconnect();
    process.exit(1);
  });
