// Commission service checks — Business Model v2.1 §11–§25, end to end against
// the real database and the real commands.
// Run: npm run commission:check   (requires a seeded database)
import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  cancelBooking,
  decideBookingRequest,
  decideSoldByCorrection,
  requestSoldByCorrection,
  reviseBookingRequest,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { confirmPaymentReceived, correctPaymentReceived } from "@/lib/services/payment-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import {
  approveBeforeOldRecovery,
  clearRecovery,
  closeAdjustmentWithoutRecovery,
  openRecovery,
  setOffRecovery,
} from "@/lib/services/recovery-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import {
  applyMemberCommissionHold,
  approveCommissionPaidEarly,
  generateForBooking,
  rejectCommissionPaidEarly,
  requestCommissionPaidEarly,
  markCommissionPaid,
  memberCommissionView,
  reassessCommission,
} from "@/lib/services/commission-service";
import {
  decideCommissionVersion,
  prepareCommissionDraft,
  sendCommissionVersion,
} from "@/lib/services/commission-settings-service";
import { recordCustomerTermsAcceptance, verifyAadhaar } from "@/lib/services/customer-closer-service";
import {
  cancelAcquisitionDeal,
  confirmPaymentGiven,
  createAcquisition,
  decideAcquisition,
} from "@/lib/services/acquisition-service";
import { businessState, runReport } from "@/lib/services/report-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { activateMember } from "@/lib/services/network-service";
import { encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();
const Decimal = Prisma.Decimal;
const TAG = "ZZ-COMM";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;
const ADMIN = `${TAG}-ADMIN`;
const MD = `${TAG}-MD`;

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

/** A commission beneficiary needs Aadhaar available and a Verified bank. */
async function makeEligiblePerson(name: string, mobile: string) {
  const person = await db.person.create({
    data: {
      fullName: `${TAG} ${name}`,
      primaryMobile: mobile,
      aadhaarCipher: encryptSensitive(`2${mobile}00`.slice(0, 12)),
      aadhaarLastFour: mobile.slice(-4),
      aadhaarStatus: "AVAILABLE",
    },
  });
  await db.bankDetail.create({
    data: {
      personId: person.id,
      accountHolder: name,
      bankName: "Test Bank",
      accountCipher: encryptSensitive("123456789012"),
      accountLastFour: "9012",
      ifsc: "HDFC0001234",
      status: "VERIFIED",
      enteredByRef: CRM,
      verifiedByRef: ACC,
      verifiedAt: new Date(),
    },
  });
  return person;
}

const makeMember = (suffix: string, personId: string, activatedDaysAgo: number, invitedByMemberId?: string) =>
  db.memberProfile.create({
    data: {
      memberId: `${TAG}-M-${suffix}`,
      personId,
      activationDate: day(-activatedDaysAgo),
      invitedByMemberId: invitedByMemberId ?? null,
      reraStatus: "REGISTERED",
      reraNumber: `RERA-${suffix}`,
    },
  });

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

const SCHEDULE = [
  { seq: 1, percent: "40", dueDate: today },
  { seq: 2, percent: "60", dueDate: day(30) },
];

async function submit(args: {
  plotId: string;
  buyerPersonId: string;
  soldByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId?: string | null;
}) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: args.plotId,
    parties: [{ personId: args.buyerPersonId, role: "PRIMARY" }],
    soldByType: args.soldByType,
    soldByPersonId: args.soldByPersonId ?? null,
    bookingDate: today,
    schedule: SCHEDULE,
  });
  return submitted.bookingId;
}

const approve = (bookingId: string) =>
  decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    approve: true,
    note: "Verified.",
  });

/** Submits and approves a Booking, returning its id. */
async function bookAndApprove(args: Parameters<typeof submit>[0]) {
  const bookingId = await submit(args);
  await approve(bookingId);
  return bookingId;
}

const pay = (bookingId: string, percent: string, reference: string) =>
  confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: today,
    reference,
  });

const currentRecords = (bookingId: string) =>
  db.commissionRecord.findMany({
    where: { bookingId, isCurrent: true },
    orderBy: { type: "asc" },
  });

const recordOf = (bookingId: string, type: "DIRECT" | "LOYALTY") =>
  db.commissionRecord.findFirstOrThrow({ where: { bookingId, type, isCurrent: true } });

const shape = (r: { type: string; percent: Prisma.Decimal; milestonePercent: Prisma.Decimal }) =>
  `${r.type}:${r.percent.toFixed(2)}@${r.milestonePercent.toFixed(0)}`;

/** Admin prepares and sends, MD approves — the whole v2.1 §14 flow. */
async function approveVersion(
  projectId: string,
  o: Partial<{
    directEnabled: boolean;
    directPercent: string | null;
    loyaltyEnabled: boolean;
    loyaltyPercent: string | null;
    loyaltyExceptionReason: string | null;
  }>
) {
  const draft = await prepareCommissionDraft({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId,
    directEnabled: true,
    directPercent: "3",
    loyaltyEnabled: true,
    loyaltyPercent: "1",
    loyaltyExceptionReason: null,
    reason: `${TAG} settings`,
    ...o,
  });
  await sendCommissionVersion({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", versionId: draft.versionId });
  await decideCommissionVersion({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    versionId: draft.versionId,
    approve: true,
    note: "ok",
  });
  return draft.version;
}

/**
 * v2.1 §22 — a real Customer closer: their own approved purchase, Aadhaar
 * Verified, and accepted Customer Terms.
 */
async function makeCloser(projectId: string, name: string, mobile: string, ready = true) {
  const closer = await makeEligiblePerson(name, mobile);
  const own = await makePlot(projectId, `OWN-${name}`);
  await bookAndApprove({ plotId: own.id, buyerPersonId: closer.id, soldByType: "THREE_PERCENT_CLUB" });
  if (ready) {
    await verifyAadhaar({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: closer.id });
    const profile = await db.customerProfile.findUniqueOrThrow({ where: { personId: closer.id } });
    await recordCustomerTermsAcceptance({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      customerProfileId: profile.id,
      termsVersion: "CT-TEST",
      acceptedOn: today,
    });
  }
  return closer;
}

async function main() {
  await cleanup();

  // The seeded Project, approved at Direct 3% and Loyalty 1% (seed-commission.ts).
  const project = await db.project.findFirstOrThrow({
    where: {
      plcRuleVersions: { some: { status: "PUBLISHED" } },
      commissionVersions: { some: { status: "ACTIVE" } },
    },
    include: { commissionVersions: { where: { status: "ACTIVE" } } },
  });
  const V = `V${project.commissionVersions[0].version}`;
  assert.equal(project.commissionVersions[0].directPercent?.toString(), "3", "the seed approves Direct 3%");

  const inviter = await makeEligiblePerson("Inviter", "9600000001");
  const seller = await makeEligiblePerson("Seller", "9600000002");
  const buyer = await makeEligiblePerson("Buyer", "9600000003");
  const buyerTwo = await makeEligiblePerson("BuyerTwo", "9600000004");
  const inviterMember = await makeMember("I", inviter.id, 400);
  const sellerMember = await makeMember("S", seller.id, 200, inviterMember.id);

  /* ------------------------------------- Direct at 25%, and nothing else */

  const plotA = await makePlot(project.id, "A");
  const bookingA = await bookAndApprove({
    plotId: plotA.id,
    buyerPersonId: buyer.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });

  let records = await currentRecords(bookingA);
  assert.deepEqual(records.map(shape), ["DIRECT:3.00@25"], "a Member sale earns Direct only — no Invite (v2.1 §1)");
  assert.equal(records[0].ruleVersion, `DIRECT/THIRD_PARTY/${V}/3%@25`, "the rule names the Project version");
  assert.equal(records[0].eligibility, "MILESTONE_PENDING", "nothing is eligible before the milestone");

  await pay(bookingA, "40", `${TAG} UTR A1`);
  const direct = await recordOf(bookingA, "DIRECT");
  assert.equal(direct.eligibility, "READY", "full Direct at 25% (v2.1 §19)");
  assert.equal(direct.qualifiedAt, null, "Direct carries no Loyalty qualification");
  assert.ok(
    await db.task.findFirst({ where: { recordId: direct.id, purpose: "COMMISSION_PAYMENT", status: "PENDING" } }),
    "a Ready record raises one Accounts commission task"
  );

  /* ---------------------------------------------- Paid and Paid Early rules */

  const plotB = await makePlot(project.id, "B");
  const bookingB = await bookAndApprove({
    plotId: plotB.id,
    buyerPersonId: buyerTwo.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  const bRecords = await currentRecords(bookingB);
  assert.deepEqual(bRecords.map((r) => r.type), ["DIRECT"], "Direct is earned on every qualifying sale (v2.1 §19)");

  await expectBlocked(/compulsory remarks/, () =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: bRecords[0].id,
      early: true,
      paidOn: today,
      reference: `${TAG} UTR X`,
      remarks: "   ",
    })
  );
  await expectBlocked(/Eligibility is not Ready/, () =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: bRecords[0].id,
      early: false,
      paidOn: today,
      reference: `${TAG} UTR B1`,
      remarks: "",
    })
  );
  // AC-03 — Paid Early needs a recorded MD approval first.
  await expectBlocked(/requires a recorded MD approval/, () =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: bRecords[0].id,
      early: true,
      paidOn: today,
      reference: `${TAG} UTR B1`,
      remarks: "Advance settled with the Member.",
    })
  );
  for (const [actorRole, actorRef] of [
    ["ACCOUNTS", ACC],
    ["ADMIN", ADMIN],
  ] as const) {
    await expectBlocked(/Only MD may approve/, () =>
      approveCommissionPaidEarly({ idempotencyKey: key(), actorRef, actorRole, recordId: bRecords[0].id, note: "x" })
    );
  }
  // CP §53, UAT BUY-07 — Accounts asks first; MD decides on the T20 task.
  await expectBlocked(/has not requested Paid Early/, () =>
    approveCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: bRecords[0].id, note: "x" })
  );
  await expectBlocked(/Only Accounts may request/, () =>
    requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", recordId: bRecords[0].id, reason: "x" })
  );
  await expectBlocked(/compulsory reason/, () =>
    requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: bRecords[0].id, reason: " " })
  );
  const t20 = () =>
    db.task.findMany({ where: { recordId: bRecords[0].id, purpose: "PAID_EARLY_APPROVAL" }, orderBy: { createdAt: "asc" } });
  await requestCommissionPaidEarly({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: bRecords[0].id,
    reason: "Member needs the advance before quarter close.",
  });
  let t20s = await t20();
  assert.equal(t20s.length, 1, "one T20 task");
  assert.equal(`${t20s[0].assigneeRole}|${t20s[0].status}`, "MD|PENDING");
  await expectBlocked(/already requested/, () =>
    requestCommissionPaidEarly({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: bRecords[0].id, reason: "again" })
  );
  await rejectCommissionPaidEarly({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    recordId: bRecords[0].id,
    note: "Wait for the 25% milestone.",
  });
  const rejectedEarly = await db.commissionRecord.findUniqueOrThrow({ where: { id: bRecords[0].id } });
  assert.equal(rejectedEarly.earlyRequestedAt, null, "a rejection clears the request");
  assert.equal((await t20())[0].status, "COMPLETED", "and closes T20");
  await expectBlocked(/has not requested Paid Early/, () =>
    approveCommissionPaidEarly({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: bRecords[0].id, note: "x" })
  );
  await requestCommissionPaidEarly({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: bRecords[0].id,
    reason: "Asked again with the Member's undertaking.",
  });
  await approveCommissionPaidEarly({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    recordId: bRecords[0].id,
    note: "Advance approved for the quarter close.",
  });
  await markCommissionPaid({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: bRecords[0].id,
    early: true,
    paidOn: today,
    reference: `${TAG} UTR B1`,
    remarks: "Advance settled with the Member.",
  });
  const early = await db.commissionRecord.findUniqueOrThrow({ where: { id: bRecords[0].id } });
  assert.equal(early.payment, "PAID_EARLY");
  assert.equal(early.earlyApprovedByRef, MD, "the approver is stored on the record");
  assert.equal(early.earlyRequestedByRef, ACC, "and so is who asked");
  t20s = await t20();
  assert.deepEqual(t20s.map((t) => t.status), ["COMPLETED", "COMPLETED"], "the approval closes the second T20");
  assert.ok(early.externalReferenceId, "Paid Early records its reference");
  await expectBlocked(/cannot be marked Paid again/, () =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: bRecords[0].id,
      early: false,
      paidOn: today,
      reference: `${TAG} UTR B2`,
      remarks: "",
    })
  );
  await pay(bookingB, "40", `${TAG} UTR B3`);
  assert.equal(
    await db.task.count({ where: { recordId: bRecords[0].id, purpose: "COMMISSION_PAYMENT", status: "PENDING" } }),
    0,
    "no second commission-payment task after Paid Early"
  );

  /* --------------------- a Member hold stops unpaid work, keeps paid history */

  await applyMemberCommissionHold({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    memberProfileId: sellerMember.id,
    hold: true,
    reason: "Documents under review.",
  });
  const held = await recordOf(bookingA, "DIRECT");
  assert.equal(held.eligibility, "ON_HOLD");
  assert.equal(held.holdReason, "MEMBER_COMMISSION_HOLD");
  assert.equal(
    (await db.commissionRecord.findUniqueOrThrow({ where: { id: bRecords[0].id } })).payment,
    "PAID_EARLY",
    "a hold never rewrites paid history"
  );
  await applyMemberCommissionHold({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    memberProfileId: sellerMember.id,
    hold: false,
    reason: "Documents verified.",
  });
  assert.equal((await recordOf(bookingA, "DIRECT")).eligibility, "READY", "removing the hold reassesses");

  /* ------------------------------------------ cancellation before completion */

  await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: bookingA,
    reason: "Buyer withdrew.",
  });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: bookingA,
    approve: true,
    note: "Refund handled outside the CRM.",
    reference: `${TAG} REFUND A`,
    actionDate: today,
  });
  const afterCancel = await db.commissionRecord.findUniqueOrThrow({ where: { id: held.id } });
  assert.equal(afterCancel.payment, "CANCELLED", "an unpaid record is cancelled, never deleted");
  assert.equal(
    (await db.commissionRecord.findUniqueOrThrow({ where: { id: bRecords[0].id } })).payment,
    "PAID_EARLY",
    "a different Booking is untouched"
  );

  /* ---------------------------------- PRD §6.10, v2.1 §75 Sold By correction */

  const correctionBuyer = await makeEligiblePerson("CorrBuyer", "9600000031");
  const correctionPlot = await makePlot(project.id, "K1");
  const correctionBooking = await bookAndApprove({
    plotId: correctionPlot.id,
    buyerPersonId: correctionBuyer.id,
    soldByType: "THREE_PERCENT_CLUB",
  });
  assert.equal((await currentRecords(correctionBooking)).length, 0, "a first 3% Club purchase earns nothing");
  await pay(correctionBooking, "40", `${TAG} UTR K1`);

  await expectBlocked(/compulsory supporting remark/, () =>
    requestSoldByCorrection({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: correctionBooking,
      toSoldByType: "MEMBER",
      toSoldByPersonId: seller.id,
      reason: "Wrong attribution.",
      supportingNote: "  ",
    })
  );
  await requestSoldByCorrection({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: correctionBooking,
    toSoldByType: "MEMBER",
    toSoldByPersonId: seller.id,
    reason: "Member closed the deal.",
    supportingNote: "Site visit log and call records confirm the Member closed it.",
  });
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: correctionBooking } })).activeProcess,
    "SOLD_BY_CORRECTION_UNDER_REVIEW"
  );
  await expectBlocked(/already under Sold By Correction Under Review/, () =>
    cancelBooking({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: correctionBooking,
      reason: "Trying to cancel mid-correction.",
    })
  );
  await expectBlocked(/Only Admin or MD/, () =>
    decideSoldByCorrection({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId: correctionBooking,
      approve: true,
      note: "Accounts trying to approve.",
    })
  );
  await decideSoldByCorrection({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    bookingId: correctionBooking,
    approve: true,
    note: "Evidence verified.",
  });
  const corrected = await db.booking.findUniqueOrThrow({ where: { id: correctionBooking } });
  assert.equal(corrected.soldByType, "MEMBER");
  assert.equal(corrected.paymentReceivedPercent.toFixed(0), "40", "Payment history is untouched");
  const correctedDirect = await recordOf(correctionBooking, "DIRECT");
  assert.equal(correctedDirect.beneficiaryPersonId, seller.id, "Direct is created for the corrected closer");
  assert.equal(correctedDirect.eligibility, "READY", "the 25% milestone is already met");
  assert.ok(
    await db.task.findFirst({
      where: { recordId: correctionBooking, purpose: "SOLD_BY_COMMISSION_IMPACT", status: "PENDING" },
    }),
    "Accounts receives the commission impact review"
  );

  /* -------------------------------- activation records who invited whom */

  const invitee = await db.person.create({ data: { fullName: `${TAG} Invitee`, primaryMobile: "9600000131" } });
  const activated = await activateMember({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    personId: invitee.id,
    invitedByMemberId: inviterMember.id,
    reraStatus: "NOT_APPLICABLE",
    reraNotApplicableReason: "Individual",
  });
  const inviteeProfile = await db.memberProfile.findUniqueOrThrow({ where: { id: activated.memberProfileId } });
  assert.equal(inviteeProfile.invitedByMemberId, inviterMember.id, "the inviter is recorded (v2.1 §26)");
  assert.ok(inviteeProfile.activationDate! <= new Date(), "activation is now, never backdated");
  await expectBlocked(/already an activated Member/, () =>
    activateMember({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", personId: invitee.id })
  );
  const notForCrm = await db.person.create({ data: { fullName: `${TAG} NotForCrm`, primaryMobile: "9600000199" } });
  await expectBlocked(/Only Admin or MD/, () =>
    activateMember({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: notForCrm.id })
  );

  /* ------------------------------------------- bank verification workflow */

  const banker = await db.person.create({ data: { fullName: `${TAG} Banker`, primaryMobile: "9600000005" } });
  await enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: banker.id,
    accountHolder: "Test Holder",
    bankName: "Test Bank",
    branchName: "Test Branch",
    accountNumber: "9988776655",
    ifsc: "hdfc0001234",
  });
  const saved = await db.bankDetail.findFirstOrThrow({ where: { personId: banker.id, status: "VERIFIED" } });
  assert.equal(saved.accountLastFour, "6655");
  assert.ok(!saved.accountCipher.includes("9988776655"), "the account number is encrypted at rest");

  /* --------------------------- the Member portal never reveals the buyer */

  const view = await memberCommissionView(seller.id);
  const serialised = JSON.stringify(view);
  assert.ok(view.length > 0, "the seller sees their own commission");
  assert.ok(!serialised.includes(buyer.id), "no buyer identifier");
  assert.ok(!serialised.includes(`${TAG} Buyer`), "no buyer name");
  assert.ok(!serialised.includes("9600000003"), "no buyer mobile");
  assert.ok(serialised.includes("DIRECT"), "type, percentage and status are shown");

  /* ========== AC-01, v2.1 §20 — classification frozen with the request ========== */

  const convert = await makeEligiblePerson("Converter", "9600000021");
  const plotAC1 = await makePlot(project.id, "AC1");
  const pendingAC1 = await submit({
    plotId: plotAC1.id,
    buyerPersonId: convert.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: pendingAC1 } })).originalClassification,
    "CUSTOMER",
    "the classification is frozen at submission now, not at approval"
  );
  await approve(pendingAC1);
  const beforeConversion = (await currentRecords(pendingAC1)).map(shape);
  await activateMember({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", personId: convert.id });
  await generateForBooking_(pendingAC1);
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: pendingAC1 } })).originalClassification,
    "CUSTOMER",
    "Member activation never rewrites the historical classification"
  );
  assert.deepEqual((await currentRecords(pendingAC1)).map(shape), beforeConversion, "regeneration is stable");

  /* ======================= v2.1 §15–§17 — the freeze ======================= */

  // A tagged Project of its own, so changing its version never disturbs the seed.
  const v2Project = await db.project.create({
    data: { projectCode: "ZZCOMMV2", name: `${TAG} v2 Project`, type: "RESIDENTIAL", status: "ACTIVE" },
  });
  const grnPlc = await db.plcRuleVersion.findFirstOrThrow({
    where: { projectId: project.id, status: "PUBLISHED" },
    include: { components: true },
  });
  await db.plcRuleVersion.create({
    data: {
      projectId: v2Project.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: today,
      publishedAt: today,
      components: {
        create: grnPlc.components.map((c) => ({ category: c.category, threshold: c.threshold, percent: c.percent })),
      },
    },
  });

  const plotNoVersion = await makePlot(v2Project.id, "NV");
  await expectBlocked(/This Project has no approved commission settings\./, () =>
    submit({ plotId: plotNoVersion.id, buyerPersonId: buyer.id, soldByType: "MEMBER", soldByPersonId: seller.id })
  );

  const ver1 = await approveVersion(v2Project.id, {});
  // Submitted under version 1, version 2 approved, then Accounts approves → version 1.
  const plotFreeze = await makePlot(v2Project.id, "FZ");
  const frozenOn1 = await submit({
    plotId: plotFreeze.id,
    buyerPersonId: buyer.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  await approveVersion(v2Project.id, { directPercent: "4" });
  await approve(frozenOn1);
  assert.deepEqual(
    (await currentRecords(frozenOn1)).map((r) => r.ruleVersion),
    [`DIRECT/THIRD_PARTY/V${ver1}/3%@25`],
    "a later version never changes a frozen request (v2.1 §17)"
  );
  const review = await db.bookingReviewVersion.findFirstOrThrow({ where: { bookingId: frozenOn1 } });
  assert.equal(
    (review.snapshot as { commissionTerms?: { version: number } }).commissionTerms?.version,
    ver1,
    "the request version Accounts approved carries the frozen version (v2.1 §16)"
  );

  // A corrected request sent after version 3 freezes version 3.
  const plotRevise = await makePlot(v2Project.id, "RV");
  const toRevise = await submit({
    plotId: plotRevise.id,
    buyerPersonId: buyerTwo.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  const ver3 = await approveVersion(v2Project.id, { directPercent: "5" });
  await reviseBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: toRevise,
    parties: [{ personId: buyerTwo.id, role: "PRIMARY" }],
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
    bookingDate: today,
    schedule: SCHEDULE,
    reason: "Corrected",
  });
  await approve(toRevise);
  assert.deepEqual(
    (await currentRecords(toRevise)).map((r) => r.ruleVersion),
    [`DIRECT/THIRD_PARTY/V${ver3}/5%@25`],
    "the corrected submission is the one that freezes"
  );

  // Sold By Correction recalculates on the frozen version, not today's (v2.1 §75).
  await approveVersion(v2Project.id, { directPercent: "2" });
  await requestSoldByCorrection({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: frozenOn1,
    toSoldByType: "MEMBER",
    toSoldByPersonId: inviter.id,
    reason: "Wrong Member",
    supportingNote: "The inviter closed it.",
  });
  await decideSoldByCorrection({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    bookingId: frozenOn1,
    approve: true,
    note: "Corrected",
  });
  const recalculated = await recordOf(frozenOn1, "DIRECT");
  assert.equal(recalculated.beneficiaryPersonId, inviter.id);
  assert.equal(recalculated.ruleVersion, `DIRECT/THIRD_PARTY/V${ver1}/3%@25`, "still version 1's 3%, not today's 2%");

  // Review Focus 3 — both benefits Disabled: approved normally, nothing generated.
  await approveVersion(v2Project.id, {
    directEnabled: false,
    directPercent: null,
    loyaltyEnabled: false,
    loyaltyPercent: null,
  });
  const plotNone = await makePlot(v2Project.id, "NO");
  const none = await bookAndApprove({
    plotId: plotNone.id,
    buyerPersonId: buyer.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  assert.equal((await currentRecords(none)).length, 0, "no records and no conflict");
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: none } })).status, "BOOKED");

  /* ====== v2.1 §21, §22, §25 — Customer-closing Loyalty: three for life ====== */

  // A closer who has bought nothing is not a Customer closer.
  const stranger = await makeEligiblePerson("Stranger", "9600000080");
  await db.customerProfile.create({ data: { customerId: `${TAG}-C-STR`, personId: stranger.id } });
  const plotStranger = await makePlot(project.id, "STR");
  await expectBlocked(/existing Customer with their own approved purchase/, () =>
    submit({ plotId: plotStranger.id, buyerPersonId: buyer.id, soldByType: "CUSTOMER", soldByPersonId: stranger.id })
  );

  const closer = await makeCloser(project.id, "Closer", "9600000090");
  // CP §17 — the limit is checked when the closer is selected, so all five
  // requests are sent while none has qualified yet (UAT LOY-08: a request sent
  // before the third event qualifies may continue; its Loyalty does not).
  const closings: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const plot = await makePlot(project.id, `L${i}`);
    const closedFor = await makeEligiblePerson(`LoyaltyBuyer${i}`, `96000001${i}0`);
    const bookingId = await bookAndApprove({
      plotId: plot.id,
      buyerPersonId: closedFor.id,
      soldByType: "CUSTOMER",
      soldByPersonId: closer.id,
    });
    closings.push(bookingId);
    assert.equal((await recordOf(bookingId, "LOYALTY")).ruleVersion, `LOYALTY/INTRODUCED_BUYER/${V}/1%@100`);
  }
  for (const [index, bookingId] of closings.entries()) {
    const i = index + 1;
    await pay(bookingId, "100", `${TAG}-LOY-${i}`);
    const after = await recordOf(bookingId, "LOYALTY");
    if (i <= 3) {
      assert.equal(`${after.eligibility}|${after.payment}`, "READY|NOT_PAID", `closing ${i} qualifies`);
      assert.ok(after.qualifiedAt, `closing ${i} is counted`);
    } else {
      assert.equal(after.payment, "CANCELLED", `closing ${i} is past the lifetime three`);
      assert.match(after.closedReason ?? "", /Membership activation is required/);
      assert.ok(
        await db.commissionEvent.findFirst({ where: { recordId: after.id, action: "LIMIT_REACHED" } }),
        "and the record says why"
      );
    }
  }
  // UAT LOY-07, TSK-05 — one T43 task, raised on the third event only.
  const closerProfile = await db.customerProfile.findUniqueOrThrow({ where: { personId: closer.id } });
  const limitTasks = await db.task.findMany({
    where: { recordId: closerProfile.id, purpose: "CUSTOMER_CLOSING_LIMIT" },
  });
  assert.equal(limitTasks.length, 1, "one Customer-closing limit task");
  assert.equal(limitTasks[0].assigneeRole, "CRM");
  assert.match(limitTasks[0].latestResult ?? "", /Repeat-purchase Loyalty remains separately eligible/);
  // UAT LOY-08 — with three consumed, the closer can no longer be selected.
  const plotSixth = await makePlot(project.id, "L6");
  const sixthBuyer = await makeEligiblePerson("LoyaltyBuyer6", "9600000160");
  await expectBlocked(/three Customer-closing Loyalty events/, () =>
    submit({ plotId: plotSixth.id, buyerPersonId: sixthBuyer.id, soldByType: "CUSTOMER", soldByPersonId: closer.id })
  );
  // Becoming a Member is what the task asked for, so activation closes it.
  await activateMember({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", personId: closer.id });
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: limitTasks[0].id } })).status,
    "COMPLETED",
    "Member activation closes the Customer-closing limit task"
  );
  // At most one current Loyalty per Booking — the database refuses a second.
  await assert.rejects(
    db.commissionRecord.create({
      data: {
        bookingId: closings[0],
        type: "LOYALTY",
        beneficiaryRole: "REPEAT_PURCHASE_CUSTOMER",
        beneficiaryPersonId: closer.id,
        percent: "1",
        milestonePercent: "100",
        ruleVersion: "x",
      },
    }),
    /one_current_loyalty_per_booking|Unique constraint/
  );

  // UAT LOY-02, LOY-03 — no verified KYC, or no accepted Customer Terms, and
  // the Customer cannot be selected as the closer at all (CP §17).
  const newCloser = await makeCloser(project.id, "NewCloser", "9600000091", false);
  const plotHold = await makePlot(project.id, "HOLD");
  const holdBuyer = await makeEligiblePerson("HoldBuyer", "9600000092");
  const closeFor = () =>
    submit({ plotId: plotHold.id, buyerPersonId: holdBuyer.id, soldByType: "CUSTOMER", soldByPersonId: newCloser.id });
  await expectBlocked(/needs verified KYC/, closeFor);
  await expectBlocked(/Only Accounts, Admin or MD/, () =>
    verifyAadhaar({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: newCloser.id })
  );
  await verifyAadhaar({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: newCloser.id });
  await expectBlocked(/accepted Customer Terms/, closeFor);
  const newCloserProfile = await db.customerProfile.findUniqueOrThrow({ where: { personId: newCloser.id } });
  await expectBlocked(/future date/, () =>
    recordCustomerTermsAcceptance({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      customerProfileId: newCloserProfile.id,
      termsVersion: "CT-TEST",
      acceptedOn: day(5),
    })
  );
  await recordCustomerTermsAcceptance({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    customerProfileId: newCloserProfile.id,
    termsVersion: "CT-TEST",
    acceptedOn: today,
  });
  const heldClose = await closeFor();
  await approve(heldClose);
  await pay(heldClose, "100", `${TAG}-HOLD`);
  assert.equal((await recordOf(heldClose, "LOYALTY")).eligibility, "READY", "with both recorded the closer earns");

  /* ============ v2.1 §21, §23 — repeat-purchase Loyalty is unlimited ============ */

  const repeater = await makeEligiblePerson("Repeater", "9600000093");
  for (let i = 1; i <= 5; i++) {
    const plot = await makePlot(project.id, `RP${i}`);
    const bookingId = await bookAndApprove({ plotId: plot.id, buyerPersonId: repeater.id, soldByType: "THREE_PERCENT_CLUB" });
    const recs = await currentRecords(bookingId);
    if (i === 1) {
      assert.equal(recs.length, 0, "the first personal purchase is not a repeat");
      continue;
    }
    assert.deepEqual(recs.map(shape), ["LOYALTY:1.00@100"], `repeat ${i} earns Loyalty`);
    await pay(bookingId, "100", `${TAG}-RP-${i}`);
    assert.equal((await recordOf(bookingId, "LOYALTY")).eligibility, "READY", `repeat ${i} is paid — no lifetime cap`);
  }

  // CP §73.5, UAT VIS-07 — the Loyalty report keeps the two routes apart.
  const loyaltyRows = await runReport("LOYALTY");
  const closerRows = loyaltyRows.filter((r) => r.customer === closer.fullName);
  assert.ok(
    closerRows.every((r) => r.route === "Customer-closing Loyalty" && r.customerClosingUsed === "3 of 3"),
    "the closer's rows read 3 of 3, closing route only"
  );
  const repeaterRows = loyaltyRows.filter((r) => r.customer === repeater.fullName);
  assert.equal(repeaterRows.length, 4);
  assert.ok(
    repeaterRows.every((r) => r.route === "Repeat-purchase Loyalty" && r.repeatPurchaseEvents === 4 && r.customerClosingUsed === null),
    "the repeat buyer counts four, with no closing count"
  );

  // v2.1 §23 — a Member-closed repeat purchase earns Direct and no Loyalty.
  const plotMemberRepeat = await makePlot(project.id, "RPM");
  const memberRepeat = await bookAndApprove({
    plotId: plotMemberRepeat.id,
    buyerPersonId: repeater.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  assert.deepEqual((await currentRecords(memberRepeat)).map((r) => r.type), ["DIRECT"]);

  /* ===================== CR-002 – CR-004 — the Royalty link ======================
     The link itself stays for part 2's Royalty Gift; it no longer takes a
     position or pays a percentage (v2.1 §48). */

  const royMemBPerson = await makeEligiblePerson("RoyMemB", "9600000042");
  const royMemCPerson = await makeEligiblePerson("RoyMemC", "9600000045");
  const royMemB = await makeMember("B", royMemBPerson.id, 300);
  const royMemC = await makeMember("C", royMemCPerson.id, 250);
  const linkOf = (personId: string) => db.customerProfile.findFirstOrThrow({ where: { personId } });

  const linkBuyer = await makeEligiblePerson("LinkBuyer", "9600000043");
  const plotR1 = await makePlot(project.id, "ROY1");
  const firstSale = await bookAndApprove({
    plotId: plotR1.id,
    buyerPersonId: linkBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: royMemBPerson.id,
  });
  let link = await linkOf(linkBuyer.id);
  assert.equal(link.royaltyLinkedMemberId, royMemB.id, "the first sale's Member is the Royalty Linked Member");
  assert.equal(link.royaltyLinkFinalAt, null, "provisional until the milestone");
  await pay(firstSale, "100", `${TAG} UTR ROY1`);
  link = await linkOf(linkBuyer.id);
  assert.ok(link.royaltyLinkFinalAt, "100% verified Payment Received makes the link final");

  const plotR2 = await makePlot(project.id, "ROY2");
  const royaltyRepeat = await bookAndApprove({ plotId: plotR2.id, buyerPersonId: linkBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  assert.deepEqual(
    (await currentRecords(royaltyRepeat)).map((r) => r.type),
    ["LOYALTY"],
    "the Club-direct repeat earns the buyer's Loyalty and no monetary Royalty"
  );

  // A first Booking cancelled before its milestone leaves no link behind.
  const cancelBuyer = await makeEligiblePerson("CancelBuyer", "9600000044");
  const plotR4 = await makePlot(project.id, "ROY4");
  const cancelledFirst = await bookAndApprove({
    plotId: plotR4.id,
    buyerPersonId: cancelBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: royMemBPerson.id,
  });
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: cancelledFirst, reason: "Withdrew." });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: cancelledFirst,
    approve: true,
    note: "No payment was received.",
  });
  assert.equal((await linkOf(cancelBuyer.id)).royaltyLinkedMemberId, null, "the provisional link goes with it");
  const plotR5 = await makePlot(project.id, "ROY5");
  await bookAndApprove({ plotId: plotR5.id, buyerPersonId: cancelBuyer.id, soldByType: "MEMBER", soldByPersonId: royMemCPerson.id });
  assert.equal((await linkOf(cancelBuyer.id)).royaltyLinkedMemberId, royMemC.id, "a later first purchase links anew");

  // Sold By 3% CLUB on the first purchase never gains a Royalty Member.
  const clubBuyer = await makeEligiblePerson("ClubBuyer", "9600000046");
  const plotR6 = await makePlot(project.id, "ROY6");
  const clubFirst = await bookAndApprove({ plotId: plotR6.id, buyerPersonId: clubBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  await pay(clubFirst, "100", `${TAG} UTR ROY6`);
  assert.equal((await linkOf(clubBuyer.id)).royaltyLinkedMemberId, null);
  assert.ok((await linkOf(clubBuyer.id)).royaltyLinkFinalAt, "and that answer is itself final");

  /* ========== Test plan §18 — every Dashboard figure reconciles to records ========== */

  const state = await businessState();
  const approvedOnly = { bookingNumber: { not: null } } as const;
  assert.equal(
    state.business.customer,
    await db.booking.count({ where: { ...approvedOnly, originalClassification: "CUSTOMER" } })
  );
  assert.equal(
    state.business.member,
    await db.booking.count({ where: { ...approvedOnly, originalClassification: "MEMBER" } })
  );
  assert.equal(
    state.volumes.approvedBookings,
    await db.booking.count({ where: approvedOnly }),
    "the total is the number of approved Bookings"
  );
  const buyingRows = await db.commissionRecord.findMany({ where: { type: "BUYING", isCurrent: true }, select: { percent: true } });
  assert.equal(state.buying.records, buyingRows.length);
  assert.equal(
    state.buying.totalPercent,
    buyingRows.reduce((sum, r) => sum.add(r.percent), new Decimal(0)).toFixed(2)
  );
  assert.equal(state.paidEarly.processed, await db.commissionRecord.count({ where: { payment: "PAID_EARLY" } }));
  assert.ok(state.paidEarly.processed >= 1, "the Paid Early above is visible");
  assert.equal(state.audit.supersededRecords, await db.commissionRecord.count({ where: { isCurrent: false } }));
  assert.ok(state.conversions.customersActivatedAsMembers >= 1, "the conversion built above is visible");
  assert.equal(state.volumes.holds, await db.hold.count());

  /* ====== v2.1 §20, §41, §44 — the Buyback as an alternative milestone ====== */

  const GIVEN = [
    { seq: 1, percent: "25", dueDate: today },
    { seq: 2, percent: "75", dueDate: day(30) },
  ];
  const arranger = await makeEligiblePerson("Arranger", "9600000081");
  await makeMember("ARR", arranger.id, 800);

  /** Raises a Buyback on a Booking, funds it past 20% and approves it. */
  async function approveBuybackOn(bookingId: string, sellerPersonId: string, tagSuffix: string) {
    const raised = await createAcquisition({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      type: "BUYBACK",
      sourceBookingId: bookingId,
      sellerPersonId,
      arrangedByType: "MEMBER",
      arrangedByPersonId: arranger.id,
      purchaseDate: today,
      remark: "Buyback before legal completion.",
      schedule: GIVEN,
    });
    await confirmPaymentGiven({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      acquisitionId: raised.acquisitionId,
      percent: "25",
      paidOn: today,
      reference: `${TAG} GIVEN ${tagSuffix}`,
    });
    await decideAcquisition({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      acquisitionId: raised.acquisitionId,
      approve: true,
      note: "Buyback approved.",
    });
    return raised.acquisitionId;
  }

  // An earned Direct survives; an unearned one is never accelerated.
  const bbBuyer = await makeEligiblePerson("BBBuyer", "9600000083");
  const plotBB1 = await makePlot(project.id, "BB1");
  const bookingBB1 = await bookAndApprove({ plotId: plotBB1.id, buyerPersonId: bbBuyer.id, soldByType: "MEMBER", soldByPersonId: seller.id });
  await pay(bookingBB1, "40", `${TAG} UTR BB1`);
  await approveBuybackOn(bookingBB1, bbBuyer.id, "BB1");
  const bb1Direct = await recordOf(bookingBB1, "DIRECT");
  assert.equal(`${bb1Direct.eligibility}|${bb1Direct.payment}`, "READY|NOT_PAID", "a Direct earned at 25% stands");

  const bbBuyer3 = await makeEligiblePerson("BBBuyer3", "9600000087");
  const plotBB3 = await makePlot(project.id, "BB3");
  const bookingBB3 = await bookAndApprove({ plotId: plotBB3.id, buyerPersonId: bbBuyer3.id, soldByType: "MEMBER", soldByPersonId: seller.id });
  await approveBuybackOn(bookingBB3, bbBuyer3.id, "BB3");
  assert.equal((await recordOf(bookingBB3, "DIRECT")).payment, "CANCELLED", "a Buyback never accelerates Direct");

  // Loyalty below the 25% source-payment minimum: the Buyback does not qualify it.
  const plotBB4a = await makePlot(project.id, "BB4A");
  const bbLowBuyer = await makeEligiblePerson("BBLow", "9600000088");
  const firstLow = await bookAndApprove({ plotId: plotBB4a.id, buyerPersonId: bbLowBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  const plotBB4b = await makePlot(project.id, "BB4B");
  const bookingLow = await bookAndApprove({ plotId: plotBB4b.id, buyerPersonId: bbLowBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  await pay(bookingLow, "20", `${TAG} UTR BB4`);
  await approveBuybackOn(bookingLow, bbLowBuyer.id, "BB4");
  const lowLoyalty = await recordOf(bookingLow, "LOYALTY");
  assert.equal(lowLoyalty.payment, "CANCELLED", "at 20% received the Buyback is not a Loyalty milestone (v2.1 §41)");
  assert.equal(lowLoyalty.qualifiedAt, null);

  // CP §64 T24 — the reward review is raised and stays open, with the gate result.
  const reviewOf = (bookingId: string, purpose: string) =>
    db.task.findMany({ where: { recordKind: "Booking", recordId: bookingId, purpose } });
  const lowReview = await reviewOf(bookingLow, "BUYBACK_COMMISSION_REVIEW");
  assert.equal(lowReview.length, 1, "one T24");
  assert.equal(`${lowReview[0].title}|${lowReview[0].status}`, "Reward Review — Approved Buyback|PENDING");
  assert.match(lowReview[0].latestResult ?? "", /20\.00% — 25% reward gate not met/);
  // Review Focus 5 — a first purchase carrying no commission still gets the review (UAT BB-01).
  await approveBuybackOn(firstLow, bbLowBuyer.id, "BB4F");
  assert.equal((await reviewOf(firstLow, "BUYBACK_COMMISSION_REVIEW")).length, 1, "T24 with no commission records");

  // At 30% received it is — and unwinding the Buyback takes the qualification back.
  const plotBB5a = await makePlot(project.id, "BB5A");
  const bbHighBuyer = await makeEligiblePerson("BBHigh", "9600000089");
  await bookAndApprove({ plotId: plotBB5a.id, buyerPersonId: bbHighBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  const plotBB5b = await makePlot(project.id, "BB5B");
  const bookingHigh = await bookAndApprove({ plotId: plotBB5b.id, buyerPersonId: bbHighBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  await pay(bookingHigh, "30", `${TAG} UTR BB5`);
  const bb5 = await approveBuybackOn(bookingHigh, bbHighBuyer.id, "BB5");
  const highLoyalty = await recordOf(bookingHigh, "LOYALTY");
  assert.equal(highLoyalty.eligibility, "READY", "at 30% received the Approved Buyback earns the Loyalty");
  assert.ok(highLoyalty.qualifiedAt, "and qualifies it");
  assert.ok(
    await db.commissionEvent.findFirst({ where: { recordId: highLoyalty.id, action: "QUALIFIED_BY_BUYBACK" } })
  );

  await cancelAcquisitionDeal({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: bb5, reason: "Seller withdrew." });
  const unwound = await recordOf(bookingHigh, "LOYALTY");
  assert.equal(unwound.eligibility, "MILESTONE_PENDING", "the unwind reverses the Buyback-created qualification (v2.1 §44)");
  assert.equal(unwound.qualifiedAt, null);
  // CP §64 T25 — the approval's review closes and the unwind review opens.
  assert.match((await reviewOf(bookingHigh, "BUYBACK_COMMISSION_REVIEW"))[0].latestResult ?? "", /Buyback unwound/);
  const unwindReview = await reviewOf(bookingHigh, "BUYBACK_UNWIND_REVIEW");
  assert.equal(unwindReview.length, 1, "one T25");
  assert.equal(`${unwindReview[0].title}|${unwindReview[0].status}`, "Reward Review — Buyback Unwind|PENDING");


  /* ====== SSOT §22, §91; CP §54, §61, §64 — Accounts adjustment and Recovery ====== */

  const recSeller = await makeEligiblePerson("RecSeller", "9600000201");
  await makeMember("REC", recSeller.id, 100);
  const memberSale = async (suffix: string, mobile: string) => {
    const plot = await makePlot(project.id, suffix);
    const buyerPerson = await makeEligiblePerson(`RecBuyer${suffix}`, mobile);
    return bookAndApprove({ plotId: plot.id, buyerPersonId: buyerPerson.id, soldByType: "MEMBER", soldByPersonId: recSeller.id });
  };
  const payDirect = (recordId: string, reference: string) =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId,
      early: false,
      paidOn: today,
      reference,
      remarks: "",
    });
  const tasksOn = (recordId: string, purpose: string, status: "PENDING" | "COMPLETED" = "PENDING") =>
    db.task.findMany({ where: { recordKind: "Commission", recordId, purpose, status } });

  // UAT DIR-08 — Direct paid at 25%, then the payment is corrected below it.
  const saleR1 = await memberSale("REC1", "9600000202");
  const r1Entry = await pay(saleR1, "30", `${TAG} UTR R1`);
  const directR1 = await recordOf(saleR1, "DIRECT");
  await payDirect(directR1.id, `${TAG} PAID R1`);
  await correctPaymentReceived({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    entryId: r1Entry.entryId,
    percent: "20",
    paidOn: today,
    reference: `${TAG} UTR R1C`,
    reason: "Cheque bounced in part.",
  });
  assert.equal((await recordOf(saleR1, "DIRECT")).payment, "ACCOUNTS_ADJUSTMENT_REQUIRED", "paid Direct below 25%");
  const t21 = await tasksOn(directR1.id, "ACCOUNTS_ADJUSTMENT");
  assert.equal(t21.length, 1, "one T21");
  assert.equal(`${t21[0].title}|${t21[0].assigneeRole}`, "Accounts Adjustment Required|ACCOUNTS");

  // Only Accounts opens a Recovery; it answers T21 and raises T22, due in 15 days.
  await expectBlocked(/Only Accounts handles Recovery/, () =>
    openRecovery({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", recordId: directR1.id, noticeOn: today, reference: "x", reason: "x" })
  );
  await expectBlocked(/future date/, () =>
    openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: directR1.id, noticeOn: day(2), reference: "x", reason: "x" })
  );
  const opened = await openRecovery({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: directR1.id,
    noticeOn: today,
    reference: `${TAG} ACC-REC-1`,
    reason: "Direct paid on a sale that fell below 25%.",
  });
  assert.equal(opened.dueOn.getTime() - today.getTime(), 15 * 86_400_000, "due 15 calendar days after notice");
  assert.equal((await tasksOn(directR1.id, "ACCOUNTS_ADJUSTMENT")).length, 0, "T21 answered");
  const t22 = await tasksOn(directR1.id, "RECOVERY_FOLLOW_UP");
  assert.equal(t22.length, 1, "one T22");
  assert.equal(t22[0].dueAt.getTime(), opened.dueOn.getTime());
  await expectBlocked(/already outstanding/, () =>
    openRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: directR1.id, noticeOn: today, reference: "y", reason: "y" })
  );

  // UAT CTL-01 — a new Direct is recorded and reaches its milestone, but waits.
  const saleR2 = await memberSale("REC2", "9600000203");
  const r2Entry = await pay(saleR2, "30", `${TAG} UTR R2`);
  const directR2 = await recordOf(saleR2, "DIRECT");
  assert.equal(`${directR2.eligibility}|${directR2.holdReason}`, "ON_HOLD|RECOVERY_OUTSTANDING");
  await expectBlocked(/Recovery REC-\d+ outstanding/, () => payDirect(directR2.id, `${TAG} PAID R2`));

  // Set off in part: R2's Direct settles some of it; the Recovery stays open.
  await setOffRecovery({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recoveryId: opened.recoveryId,
    recordId: directR2.id,
    reference: `${TAG} SETOFF R2`,
    setOffOn: today,
    note: "R2 Direct withheld against the R1 overpayment.",
    clearsRecovery: false,
  });
  const setOff = await db.commissionRecord.findUniqueOrThrow({ where: { id: directR2.id } });
  assert.equal(setOff.payment, "PAID", "the set-off benefit is Paid");
  assert.match(setOff.paymentRemarks ?? "", /Set off against Recovery REC-/);
  assert.equal((await db.recovery.findUniqueOrThrow({ where: { id: opened.recoveryId } })).status, "OUTSTANDING");

  // UAT CTL-03 — cleared as repaid: what it held is released, T22 closes.
  const saleR3 = await memberSale("REC3", "9600000204");
  await pay(saleR3, "30", `${TAG} UTR R3`);
  assert.equal((await recordOf(saleR3, "DIRECT")).holdReason, "RECOVERY_OUTSTANDING");
  await clearRecovery({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recoveryId: opened.recoveryId,
    note: "Member repaid the balance.",
  });
  const cleared = await db.recovery.findUniqueOrThrow({ where: { id: opened.recoveryId } });
  assert.equal(`${cleared.status}|${cleared.clearedHow}`, "CLEARED|REPAID");
  assert.equal((await recordOf(saleR3, "DIRECT")).eligibility, "READY", "the hold lifts at once");
  assert.equal((await tasksOn(directR1.id, "RECOVERY_FOLLOW_UP")).length, 0, "T22 closes");
  await expectBlocked(/already cleared/, () =>
    clearRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recoveryId: opened.recoveryId, note: "x" })
  );

  // SSOT §99 — the set-off R2 sale is corrected below 25%; Accounts decides no
  // Recovery is needed and says why.
  await correctPaymentReceived({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    entryId: r2Entry.entryId,
    percent: "10",
    paidOn: today,
    reference: `${TAG} UTR R2C`,
    reason: "Wrong amount keyed.",
  });
  assert.equal((await tasksOn(directR2.id, "ACCOUNTS_ADJUSTMENT")).length, 1);
  await closeAdjustmentWithoutRecovery({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: directR2.id,
    reason: "The balance is being received this week; nothing to recover.",
  });
  assert.equal((await tasksOn(directR2.id, "ACCOUNTS_ADJUSTMENT")).length, 0, "T21 closed without a Recovery");
  await expectBlocked(/No Accounts adjustment is waiting/, () =>
    closeAdjustmentWithoutRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: directR2.id, reason: "x" })
  );

  // UAT DIR-11, COR-07 — a paid Direct moves to another Plot: T21 for Accounts.
  const directR3 = await recordOf(saleR3, "DIRECT");
  await payDirect(directR3.id, `${TAG} PAID R3`);
  const plotMove = await makePlot(project.id, "RMOVE");
  await submitChangePlot({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: saleR3,
    toPlotId: plotMove.id,
    remark: "Buyer moved to a smaller plot.",
  });
  await decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: saleR3,
    approve: true,
    appliedPercent: "30",
    note: "Verified.",
    schedule: [
      { seq: 1, percent: "30", dueDate: today },
      { seq: 2, percent: "70", dueDate: day(30) },
    ],
  });
  const directAfterMove = await recordOf(saleR3, "DIRECT");
  assert.equal(directAfterMove.payment, "PAID", "the paid record itself is unchanged");
  assert.equal((await tasksOn(directAfterMove.id, "ACCOUNTS_ADJUSTMENT")).length, 1, "Accounts checks the amount");

  // UAT COR-02, CP §64 T23 — Sold By corrected after the old Direct was paid:
  // the old one needs adjusting, and the corrected Member waits for MD.
  const saleT = await memberSale("RECT", "9600000205");
  await pay(saleT, "30", `${TAG} UTR RECT`);
  const oldDirect = await recordOf(saleT, "DIRECT");
  await payDirect(oldDirect.id, `${TAG} PAID RECT`);
  await requestSoldByCorrection({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: saleT,
    toSoldByType: "MEMBER",
    toSoldByPersonId: seller.id,
    reason: "The other Member closed it.",
    supportingNote: "Site visit register.",
  });
  await decideSoldByCorrection({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    bookingId: saleT,
    approve: true,
    note: "Register confirms it.",
  });
  const supersededOld = await db.commissionRecord.findUniqueOrThrow({ where: { id: oldDirect.id } });
  assert.equal(`${supersededOld.isCurrent}|${supersededOld.payment}`, "false|ACCOUNTS_ADJUSTMENT_REQUIRED");
  assert.equal((await tasksOn(oldDirect.id, "ACCOUNTS_ADJUSTMENT")).length, 1, "T21 for the old beneficiary");
  const t23Direct = await recordOf(saleT, "DIRECT");
  assert.equal(t23Direct.beneficiaryPersonId, seller.id);
  assert.equal(`${t23Direct.eligibility}|${t23Direct.holdReason}`, "ON_HOLD|OLD_RECOVERY_PENDING");
  const t23 = await tasksOn(t23Direct.id, "BENEFICIARY_BEFORE_RECOVERY");
  assert.equal(t23.length, 1, "one T23");
  assert.equal(`${t23[0].title}|${t23[0].assigneeRole}`, "Correct Beneficiary Before Old Recovery — MD Approval|MD");
  await openRecovery({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: oldDirect.id,
    noticeOn: today,
    reference: `${TAG} ACC-REC-T`,
    reason: "Paid to the wrong Member.",
  });
  assert.equal((await recordOf(saleT, "DIRECT")).holdReason, "OLD_RECOVERY_PENDING", "still waiting while outstanding");
  await expectBlocked(/Only MD may approve paying/, () =>
    approveBeforeOldRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recordId: t23Direct.id, note: "x" })
  );
  await approveBeforeOldRecovery({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    recordId: t23Direct.id,
    note: "Pay the right Member now; recover from the other in parallel.",
  });
  assert.equal((await recordOf(saleT, "DIRECT")).eligibility, "READY", "MD's approval releases it");
  assert.equal((await tasksOn(t23Direct.id, "BENEFICIARY_BEFORE_RECOVERY")).length, 0, "T23 closes");

  await cleanup();
  console.log("commission.check.ts OK");
}

/** Regeneration outside a command — the call every approval path makes. */
async function generateForBooking_(bookingId: string) {
  await db.$transaction(
    async (tx) => {
      await generateForBooking(tx, bookingId, `${TAG}-SYSTEM`);
      await reassessCommission(tx, bookingId, `${TAG}-SYSTEM`);
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    },
    { maxWait: 10_000, timeout: Number(process.env.COMMAND_TIMEOUT_MS ?? 20_000) }
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((purgeError) => {
      console.error("Cleanup failed — tagged rows may remain:", purgeError);
    });
    await db.$disconnect();
    process.exit(1);
  });
