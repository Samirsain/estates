// Acquisition, Payment Given and Buying Commission checks — PHASES.md Phase 5
// "Tests"; PRD §11; main-PRD §17.
// Run: npm run acquisition:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  cancelAcquisitionDeal,
  confirmPaymentGiven,
  correctPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuyingCommission,
} from "@/lib/services/acquisition-service";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";

const db = new PrismaClient();
const TAG = "ZZ-ACQ";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;
const ACC2 = `${TAG}-ACC2`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();

async function expectBlocked(pattern: RegExp, fn: () => Promise<unknown>) {
  await assert.rejects(fn, pattern);
}

async function cleanup() {
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
      status: "AVAILABLE",
      restriction: "NONE",
    },
  });
}

const GIVEN_SCHEDULE = [
  { seq: 1, percent: "25", dueDate: today },
  { seq: 2, percent: "75", dueDate: day(30) },
];

async function main() {
  await cleanup();

  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { status: "PUBLISHED" } } },
  });
  const seller = await db.person.create({
    data: { fullName: `${TAG} Seller`, primaryMobile: "9500000801" },
  });
  const arranger = await db.person.create({
    data: { fullName: `${TAG} Arranger`, primaryMobile: "9500000802" },
  });

  /* ==================================== approval needs 20% Payment Given == */

  const plotA = await makePlot(project.id, "A");
  const bookingA = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotA.id,
    parties: [{ personId: seller.id, role: "PRIMARY" }],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: today,
    schedule: [
      { seq: 1, percent: "40", dueDate: today },
      { seq: 2, percent: "60", dueDate: day(30) },
    ],
  });
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingA.bookingId,
    approve: true,
    note: "Verified.",
  });
  await confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingA.bookingId,
    percent: "40",
    paidOn: today,
    reference: `${TAG} UTR A1`,
  });

  const buyback = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: bookingA.bookingId,
    sellerPersonId: seller.id,
    arrangedByType: "MEMBER",
    arrangedByPersonId: arranger.id,
    purchaseDate: today,
    remark: "Owner wants to exit.",
    schedule: GIVEN_SCHEDULE,
  });

  // ARCHITECTURE §6.3 — the Booking is now under one major process.
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingA.bookingId } })).activeProcess,
    "BUYBACK_PENDING"
  );

  // ARCHITECTURE §6.3 catches a second Buyback first, at the Booking. The
  // one-acquisition-per-Plot guard behind it covers the paths that reach a Plot
  // without a Booking.
  await expectBlocked(/already under buyback pending/, () =>
    createAcquisition({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      type: "BUYBACK",
      sourceBookingId: bookingA.bookingId,
      sellerPersonId: seller.id,
      arrangedByType: "THREE_PERCENT_CLUB",
      purchaseDate: today,
      remark: "duplicate attempt",
      schedule: GIVEN_SCHEDULE,
    })
  );

  // PRD §11.3 — below 20% Payment Given, Accounts cannot approve.
  await expectBlocked(/at least 20% Payment Given/, () =>
    decideAcquisition({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      acquisitionId: buyback.acquisitionId,
      approve: true,
      note: "too early",
    })
  );

  await confirmPaymentGiven({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: buyback.acquisitionId,
    percent: "25",
    paidOn: today,
    reference: `${TAG} UTR GIVEN 1`,
  });

  // PRD §10.3 — one reference value across both payment datasets.
  await expectBlocked(/already recorded against another entry/, () =>
    confirmPaymentGiven({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      acquisitionId: buyback.acquisitionId,
      percent: "5",
      paidOn: today,
      reference: `${TAG} UTR A1`,
    })
  );

  // PRD §3.3 — the account that raised it may not decide it.
  await expectBlocked(/different staff account/, () =>
    decideAcquisition({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      acquisitionId: buyback.acquisitionId,
      approve: true,
      note: "self approve",
    })
  );

  const approved = await decideAcquisition({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: buyback.acquisitionId,
    approve: true,
    note: "Verified 25% Payment Given.",
  });
  assert.equal(approved.status, "APPROVED");

  // main-PRD §17.6 — back in inventory as RESALE, and Payment Pending below 100%.
  const returnedPlot = await db.plot.findUniqueOrThrow({ where: { id: plotA.id } });
  assert.equal(returnedPlot.status, "AVAILABLE");
  assert.equal(returnedPlot.isResale, true, "an acquisition adds the RESALE tag");
  assert.equal(approved.plotMessage, "Payment Pending");

  /* ============================================= Buying Commission rules == */

  // PRD §11.7 — the seller can never earn it for their own property.
  await expectBlocked(/seller or previous owner cannot receive/, () =>
    recordBuyingCommission({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      acquisitionId: buyback.acquisitionId,
      beneficiaryPersonId: seller.id,
      percent: "1",
    })
  );

  const commission = await recordBuyingCommission({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    acquisitionId: buyback.acquisitionId,
    beneficiaryPersonId: arranger.id,
    percent: "1",
  });
  assert.equal(
    commission.eligibility,
    "MILESTONE_PENDING",
    "the Buying Commission milestone is 100% Payment Given, not the sale side"
  );

  await confirmPaymentGiven({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: buyback.acquisitionId,
    percent: "75",
    paidOn: today,
    reference: `${TAG} UTR GIVEN 2`,
  });
  assert.equal(
    (await db.commissionRecord.findUniqueOrThrow({ where: { id: commission.recordId } })).eligibility,
    "READY",
    "100% Payment Given makes the Buying Commission Ready"
  );
  assert.equal(
    await db.task.count({
      where: { recordId: buyback.acquisitionId, purpose: "PAYMENT_GIVEN_FOLLOW_UP", status: "PENDING" },
    }),
    0,
    "the Payment Given follow-up closes at 100%"
  );

  /* ================================ correction below 100% steps back ====== */

  const lastEntry = await db.paymentGivenEntry.findFirstOrThrow({
    where: { acquisitionId: buyback.acquisitionId, status: "CONFIRMED", percent: "75" },
  });

  // PRD §11.2 — maker and checker must differ on a money correction.
  await expectBlocked(/different staff account/, () =>
    correctPaymentGiven({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      entryId: lastEntry.id,
      percent: "50",
      paidOn: today,
      reference: `${TAG} UTR GIVEN 2C`,
      reason: "Bank reversed part of it.",
    })
  );

  const corrected = await correctPaymentGiven({
    idempotencyKey: key(),
    actorRef: ACC2,
    actorRole: "ACCOUNTS",
    entryId: lastEntry.id,
    percent: "50",
    paidOn: today,
    reference: `${TAG} UTR GIVEN 2C`,
    reason: "Bank reversed part of it.",
  });
  assert.equal(corrected.progressPercent, "75.0000");
  assert.equal(
    (await db.commissionRecord.findUniqueOrThrow({ where: { id: commission.recordId } })).eligibility,
    "MILESTONE_PENDING",
    "falling below 100% steps the Buying Commission back (PRD §11.3)"
  );
  assert.equal(
    (await db.paymentGivenEntry.findUniqueOrThrow({ where: { id: lastEntry.id } })).status,
    "SUPERSEDED",
    "the original entry is superseded, never deleted"
  );

  /* ======================== a deal cannot be cancelled under a buyer ======= */

  await db.hold.create({
    data: {
      plotId: plotA.id,
      personId: arranger.id,
      startsAt: today,
      expiresAt: day(1),
      status: "ACTIVE",
    },
  });
  await expectBlocked(/cannot be cancelled while a new buyer process is active/, () =>
    cancelAcquisitionDeal({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      acquisitionId: buyback.acquisitionId,
      reason: "changed mind",
    })
  );
  await db.hold.updateMany({ where: { plotId: plotA.id }, data: { status: "CANCELLED" } });

  await cancelAcquisitionDeal({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: buyback.acquisitionId,
    reason: "Seller withdrew.",
  });
  const cancelledPlot = await db.plot.findUniqueOrThrow({ where: { id: plotA.id } });
  assert.equal(cancelledPlot.status, "NOT_AVAILABLE", "a cancelled deal is not sellable (PRD §11.4)");
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingA.bookingId } })).activeProcess,
    "NONE",
    "the Booking is released from Buyback Pending"
  );

  /* ============================ Purchase for Resale duplicate detection === */

  const resaleGroup = await db.project.create({
    data: {
      projectCode: `${TAG}-EXT`,
      name: `${TAG} External Resale Group`,
      type: "MIXED",
      status: "ACTIVE",
    },
  });

  const property = {
    propertyName: `${TAG} Green Valley`,
    location: "Outer Ring Road",
    propertyNumber: "P-12",
    resaleGroupId: resaleGroup.id,
    areaSqFt: "1800",
  };

  const external = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "PURCHASE_FOR_RESALE",
    sellerPersonId: seller.id,
    arrangedByType: "THREE_PERCENT_CLUB",
    purchaseDate: today,
    remark: "Outside purchase for resale.",
    schedule: GIVEN_SCHEDULE,
    property,
  });

  // PRD §11.5 — the exact active duplicate is hard-blocked.
  await expectBlocked(/already exists for this property/, () =>
    createAcquisition({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      type: "PURCHASE_FOR_RESALE",
      sellerPersonId: seller.id,
      arrangedByType: "THREE_PERCENT_CLUB",
      purchaseDate: today,
      remark: "same property again",
      schedule: GIVEN_SCHEDULE,
      property: { ...property, propertyName: `${TAG} green  valley`, propertyNumber: "p-12" },
    })
  );

  await confirmPaymentGiven({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: external.acquisitionId,
    percent: "25",
    paidOn: today,
    reference: `${TAG} UTR EXT 1`,
  });

  const externalApproved = await decideAcquisition({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: external.acquisitionId,
    approve: true,
    note: "Verified.",
  });

  // main-PRD §17.4 — the outside property enters inventory on approval.
  assert.ok(externalApproved.plotId, "an approved Purchase for Resale creates its Plot");
  const externalPlot = await db.plot.findUniqueOrThrow({ where: { id: externalApproved.plotId! } });
  assert.equal(externalPlot.projectId, resaleGroup.id, "it lands in the External Resale Property Group");
  assert.equal(externalPlot.isResale, true);

  // PRD §1.2, §21 — the two payment datasets never mix.
  const givenRefs = await db.externalReference.count({
    where: { actorRef: { startsWith: TAG }, purpose: "PAYMENT_GIVEN" },
  });
  const receivedRefs = await db.externalReference.count({
    where: { actorRef: { startsWith: TAG }, purpose: "PAYMENT_RECEIVED" },
  });
  assert.ok(givenRefs >= 4 && receivedRefs >= 1, "both datasets recorded their own references");
  assert.equal(
    await db.paymentReceivedEntry.count({ where: { booking: { submittedByRef: { startsWith: TAG } } } }),
    1,
    "the sale side is untouched by acquisition activity"
  );

  await cleanup();
  console.log("acquisition.check.ts OK");
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
