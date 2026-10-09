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
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import {
  applyMemberCommissionHold,
  approveCommissionPaidEarly,
  generateForBooking,
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
import { businessState } from "@/lib/services/report-service";
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
    const generated = await recordOf(bookingId, "LOYALTY");
    assert.equal(generated.ruleVersion, `LOYALTY/INTRODUCED_BUYER/${V}/1%@100`);
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

  // The closer's own KYC and Customer Terms hold the Loyalty until recorded.
  const newCloser = await makeCloser(project.id, "NewCloser", "9600000091", false);
  const plotHold = await makePlot(project.id, "HOLD");
  const holdBuyer = await makeEligiblePerson("HoldBuyer", "9600000092");
  const heldClose = await bookAndApprove({
    plotId: plotHold.id,
    buyerPersonId: holdBuyer.id,
    soldByType: "CUSTOMER",
    soldByPersonId: newCloser.id,
  });
  await pay(heldClose, "100", `${TAG}-HOLD`);
  assert.equal((await recordOf(heldClose, "LOYALTY")).holdReason, "CLOSER_KYC_PENDING", "Aadhaar not Verified yet");
  await expectBlocked(/Only Accounts, Admin or MD/, () =>
    verifyAadhaar({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: newCloser.id })
  );
  await verifyAadhaar({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: newCloser.id });
  assert.equal(
    (await recordOf(heldClose, "LOYALTY")).holdReason,
    "CUSTOMER_TERMS_PENDING",
    "verifying the Aadhaar reassesses at once"
  );
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
  assert.equal((await recordOf(heldClose, "LOYALTY")).eligibility, "READY", "and so does recording the Terms");

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
  await bookAndApprove({ plotId: plotBB4a.id, buyerPersonId: bbLowBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  const plotBB4b = await makePlot(project.id, "BB4B");
  const bookingLow = await bookAndApprove({ plotId: plotBB4b.id, buyerPersonId: bbLowBuyer.id, soldByType: "THREE_PERCENT_CLUB" });
  await pay(bookingLow, "20", `${TAG} UTR BB4`);
  await approveBuybackOn(bookingLow, bbLowBuyer.id, "BB4");
  const lowLoyalty = await recordOf(bookingLow, "LOYALTY");
  assert.equal(lowLoyalty.payment, "CANCELLED", "at 20% received the Buyback is not a Loyalty milestone (v2.1 §41)");
  assert.equal(lowLoyalty.qualifiedAt, null);

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
