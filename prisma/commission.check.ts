// Phase 4 service checks — PHASES.md Phase 4 "Tests", end to end against the
// real database and the real commands.
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
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import {
  applyMemberCommissionHold,
  approveCommissionPaidEarly,
  cancelCommissionForBooking,
  generateForBooking,
  markCommissionPaid,
  memberCommissionView,
  reassessCommission,
} from "@/lib/services/commission-service";
import {
  recordCompletion,
  recordFinalBuyers,
  reopenDelivered,
} from "@/lib/services/completion-service";
import { businessState } from "@/lib/services/report-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { activateMember } from "@/lib/services/network-service";
import { encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();
const Decimal = Prisma.Decimal;
const TAG = "ZZ-COMM";
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

/** Submits and approves a Booking, returning its id. */
async function bookAndApprove(args: {
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

async function main() {
  await cleanup();

  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { status: "PUBLISHED" } } },
  });

  const inviter = await makeEligiblePerson("Inviter", "9600000001");
  const seller = await makeEligiblePerson("Seller", "9600000002");
  const buyer = await makeEligiblePerson("Buyer", "9600000003");
  const buyerTwo = await makeEligiblePerson("BuyerTwo", "9600000004");

  const inviterMember = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M1`,
      personId: inviter.id,
      activationDate: day(-400),
      reraStatus: "NOT_APPLICABLE",
      reraNotApplicableReason: "Individual referrer",
    },
  });
  // Position 2 sits in the 1–3 band, so the Invite rate is 1%.
  const sellerMember = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M2`,
      personId: seller.id,
      activationDate: day(-200),
      invitedByMemberId: inviterMember.id,
      invitePosition: 2,
      inviteRatePercent: "1",
      reraStatus: "REGISTERED",
      reraNumber: "RERA-TEST-1",
    },
  });

  /* ------------------------------------ Direct 3% at 25% + Invite 1% at 100% */

  const plotA = await makePlot(project.id, "A");
  const bookingA = await bookAndApprove({
    plotId: plotA.id,
    buyerPersonId: buyer.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });

  let records = await currentRecords(bookingA);
  assert.deepEqual(
    records.map((r) => `${r.type}:${r.percent.toFixed(2)}@${r.milestonePercent.toFixed(0)}`),
    ["DIRECT:3.00@25", "INVITE:1.00@100"],
    "the engine starts on approval"
  );
  assert.ok(
    records.every((r) => r.eligibility === "MILESTONE_PENDING"),
    "nothing is eligible before the milestone"
  );

  // 40% clears the Direct milestone but not the Invite one.
  await pay(bookingA, "40", `${TAG} UTR A1`);
  records = await currentRecords(bookingA);
  const direct = records.find((r) => r.type === "DIRECT")!;
  const invite = records.find((r) => r.type === "INVITE")!;
  assert.equal(direct.eligibility, "READY", "Direct is Ready at 25%");
  assert.equal(invite.eligibility, "MILESTONE_PENDING", "Invite waits for 100%");
  assert.equal(direct.opportunityId, null, "Direct consumes no entitlement");
  assert.ok(
    await db.task.findFirst({
      where: { recordId: direct.id, purpose: "COMMISSION_PAYMENT", status: "PENDING" },
    }),
    "a Ready record raises one Accounts commission task"
  );

  /* -------------------------- the Invite entitlement is the SELLING Member's */

  await pay(bookingA, "60", `${TAG} UTR A2`);
  records = await currentRecords(bookingA);
  const consumed = records.find((r) => r.type === "INVITE")!;
  assert.ok(consumed.opportunityId, "Invite consumes its entitlement at 100%");
  assert.equal(consumed.eligibility, "READY");

  const slot = await db.commissionOpportunity.findUniqueOrThrow({
    where: { id: consumed.opportunityId! },
  });
  assert.equal(
    slot.subjectPersonId,
    seller.id,
    "the Invite slot belongs to the invited (selling) Member, not the inviter who is paid"
  );
  assert.equal(slot.beneficiaryPersonId, inviter.id);
  assert.equal(slot.status, "CONSUMED");

  /* ------- regenerating must not read this Booking's own slot as taken (bug) */

  await reassessCommission_(bookingA);
  const afterReassess = await currentRecords(bookingA);
  assert.ok(
    afterReassess.some((r) => r.type === "INVITE" && r.payment !== "CANCELLED"),
    "a Booking never loses the Invite it already earned"
  );

  /* ------------- a second sale by the same Member earns Direct but no Invite */

  const plotB = await makePlot(project.id, "B");
  const bookingB = await bookAndApprove({
    plotId: plotB.id,
    buyerPersonId: buyerTwo.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  const bRecords = await currentRecords(bookingB);
  assert.deepEqual(
    bRecords.map((r) => r.type),
    ["DIRECT"],
    "the Invite opportunity is consumed once per invited Member (PRD §6.1)"
  );

  /* ---------------------------------------------- Paid and Paid Early rules */

  // PRD §6.11 — Paid Early needs compulsory remarks.
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

  // Not Ready yet, so an ordinary Paid is refused but Paid Early is allowed.
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
  // AC-03 supersedes PRD §6.11 on this point: Paid Early now needs a recorded
  // MD approval first, and Accounts alone can no longer process it.
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
  await approveCommissionPaidEarly({
    idempotencyKey: key(),
    actorRef: `${TAG}-MD`,
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
  assert.ok(early.earlyApprovedAt, "and the approval that unlocked it is stored on the record");
  assert.ok(early.externalReferenceId, "Paid Early records its reference");

  // It can never be marked Paid again, and the normal milestone raises no
  // second payment task (PRD §6.11).
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
    await db.task.count({
      where: { recordId: bRecords[0].id, purpose: "COMMISSION_PAYMENT", status: "PENDING" },
    }),
    0,
    "no second commission-payment task after Paid Early"
  );

  /* --------------------- a Member hold stops unpaid work, keeps paid history */

  await applyMemberCommissionHold({
    idempotencyKey: key(),
    actorRef: `${TAG}-ADMIN`,
    actorRole: "ADMIN",
    memberProfileId: sellerMember.id,
    hold: true,
    reason: "Documents under review.",
  });
  const held = await db.commissionRecord.findFirstOrThrow({
    where: { bookingId: bookingA, type: "DIRECT", isCurrent: true },
  });
  assert.equal(held.eligibility, "ON_HOLD");
  assert.equal(held.holdReason, "MEMBER_COMMISSION_HOLD");
  assert.equal(
    (await db.commissionRecord.findUniqueOrThrow({ where: { id: bRecords[0].id } })).payment,
    "PAID_EARLY",
    "a hold never rewrites paid history"
  );

  await applyMemberCommissionHold({
    idempotencyKey: key(),
    actorRef: `${TAG}-ADMIN`,
    actorRole: "ADMIN",
    memberProfileId: sellerMember.id,
    hold: false,
    reason: "Documents verified.",
  });
  assert.equal(
    (await db.commissionRecord.findUniqueOrThrow({ where: { id: held.id } })).eligibility,
    "READY",
    "removing the hold reassesses rather than leaving it stuck"
  );

  /* ------------- cancellation before legal completion reopens the slot */

  await cancelCommissionForBooking(db as never, bookingA, `${TAG}-ADMIN`, {
    legallyCompleted: false,
    reason: "Cancelled before legal completion.",
  });
  const reopened = await db.commissionOpportunity.findUniqueOrThrow({ where: { id: slot.id } });
  assert.equal(reopened.status, "OPEN", "the Invite slot reopens (PRD §6.1)");
  assert.equal(reopened.consumedByBookingId, null);
  assert.ok(reopened.reopenedReason);

  const afterCancel = await db.commissionRecord.findUniqueOrThrow({ where: { id: held.id } });
  assert.equal(afterCancel.payment, "CANCELLED", "an unpaid record is cancelled, never deleted");
  const paidAfterCancel = await db.commissionRecord.findUniqueOrThrow({
    where: { id: bRecords[0].id },
  });
  assert.equal(paidAfterCancel.payment, "PAID_EARLY", "a different Booking is untouched");

  /* ---------------------------------- PRD §6.10 Sold By correction */

  // A 3% Club direct sale that should have been attributed to the Member.
  const correctionBuyer = await makeEligiblePerson("CorrBuyer", "9600000031");
  const correctionPlot = await makePlot(project.id, "K1");
  const correctionBooking = await bookAndApprove({
    plotId: correctionPlot.id,
    buyerPersonId: correctionBuyer.id,
    soldByType: "THREE_PERCENT_CLUB",
  });

  // A first direct purchase earns nothing at all (main-PRD §25).
  assert.deepEqual(
    (await currentRecords(correctionBooking)).map((r) => r.type),
    [],
    "3% Club direct, first purchase, generates no commission"
  );
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

  const underCorrection = await db.booking.findUniqueOrThrow({ where: { id: correctionBooking } });
  assert.equal(underCorrection.activeProcess, "SOLD_BY_CORRECTION_UNDER_REVIEW");
  assert.equal(
    underCorrection.soldByType,
    "THREE_PERCENT_CLUB",
    "nothing changes until Admin or MD approves"
  );

  // ARCHITECTURE §6.3 — only one major process at a time.
  await expectBlocked(/already under Sold By Correction Under Review/, () =>
    cancelBooking({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: correctionBooking,
      reason: "Trying to cancel mid-correction.",
    })
  );

  // PRD §6.10 — the attribution correction needs Admin or MD, not Accounts.
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
    actorRef: `${TAG}-ADMIN`,
    actorRole: "ADMIN",
    bookingId: correctionBooking,
    approve: true,
    note: "Evidence verified.",
  });

  const corrected = await db.booking.findUniqueOrThrow({ where: { id: correctionBooking } });
  assert.equal(corrected.soldByType, "MEMBER", "the attribution moves on approval");
  assert.equal(corrected.soldByPersonId, seller.id);
  assert.equal(corrected.activeProcess, "NONE");
  assert.equal(
    corrected.paymentReceivedPercent.toFixed(0),
    "40",
    "Booking and Payment history are untouched (PRD §6.10 step 8)"
  );

  // New valid records exist, and Direct is already past its 25% milestone.
  const correctedRecords = await currentRecords(correctionBooking);
  assert.ok(
    correctedRecords.some((r) => r.type === "DIRECT" && r.beneficiaryPersonId === seller.id),
    "a Direct record is created for the corrected closer"
  );
  assert.equal(
    correctedRecords.find((r) => r.type === "DIRECT")!.eligibility,
    "READY",
    "the 25% milestone is already met"
  );

  // PRD §6.10 step 4 — Accounts reviews the commission impact.
  assert.ok(
    await db.task.findFirst({
      where: {
        recordId: correctionBooking,
        purpose: "SOLD_BY_COMMISSION_IMPACT",
        status: "PENDING",
      },
    }),
    "Accounts receives the commission impact review"
  );

  /* ------------------------- RD-02 network positions are actually assigned */

  const anchor = await makeEligiblePerson("Anchor", "9600000021");
  const anchorMember = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M9`,
      personId: anchor.id,
      // Activated on 29 February, so the anniversary falls back in a non-leap year.
      activationDate: new Date("2024-02-29T06:00:00Z"),
      reraStatus: "NOT_APPLICABLE",
      reraNotApplicableReason: "Individual referrer",
    },
  });

  // Positions run 1, 2, 3 in order and each freezes its band with it.
  const invited: Array<{ position: number | null; rate: string | null }> = [];
  for (let i = 1; i <= 4; i++) {
    const person = await db.person.create({
      data: { fullName: `${TAG} Invited ${i}`, primaryMobile: `96000001${30 + i}` },
    });
    const activated = await activateMember({
      idempotencyKey: key(),
      actorRef: `${TAG}-ADMIN`,
      actorRole: "ADMIN",
      personId: person.id,
      invitedByMemberId: anchorMember.id,
      reraStatus: "NOT_APPLICABLE",
      reraNotApplicableReason: "Individual",
    });
    invited.push({ position: activated.invitePosition, rate: activated.inviteRatePercent });
  }
  assert.deepEqual(
    invited.map((i) => `${i.position}:${i.rate}`),
    ["1:1", "2:1", "3:1", "4:0.5"],
    "positions 1-3 take the 1% band and position 4 drops to 0.5% (PRD §6.2)"
  );

  // Activation cannot be backdated, and only Admin or MD may activate.
  const stored = await db.memberProfile.findFirstOrThrow({
    where: { person: { fullName: `${TAG} Invited 1` } },
  });
  assert.ok(stored.activationDate! <= new Date(), "activation is now, never backdated");
  assert.ok(stored.memberId.startsWith("MEM-"), "the Member ID is issued at activation");
  assert.equal(
    stored.inviteYearStart!.toISOString().slice(0, 10),
    // 2026 is not a leap year, so the 29 February anniversary falls on the 28th.
    "2026-02-27",
    "the counter year starts on the fallback anniversary in IST"
  );

  const notForCrm = await db.person.create({
    data: { fullName: `${TAG} Invited 9`, primaryMobile: "9600000199" },
  });
  await expectBlocked(/Only Admin or MD/, () =>
    activateMember({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: notForCrm.id,
      invitedByMemberId: anchorMember.id,
    })
  );

  /* ------------------------------------------- bank verification workflow */

  const banker = await db.person.create({
    data: { fullName: `${TAG} Banker`, primaryMobile: "9600000005" },
  });
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
  // Saving is the whole of it — the Accounts verification step was removed, so
  // the entry is active the moment it is written and no task is raised for it.
  const saved = await db.bankDetail.findFirstOrThrow({
    where: { personId: banker.id, status: "VERIFIED" },
  });
  assert.equal(saved.accountLastFour, "6655");
  assert.ok(!saved.accountCipher.includes("9988776655"), "the account number is encrypted at rest");
  assert.equal(saved.verifiedByRef, CRM, "the account records who put it there");
  assert.ok(saved.verifiedAt, "and when");
  assert.equal(
    await db.bankDetail.count({ where: { personId: banker.id, status: "PENDING" } }),
    0,
    "nothing waits on an Accounts decision any more"
  );
  assert.equal(
    await db.task.count({ where: { recordId: banker.id, purpose: "BANK_VERIFICATION" } }),
    0,
    "and no bank verification task is raised"
  );

  // Entering a second account supersedes the first rather than overwriting it:
  // what was paid to before stays on file.
  await enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: banker.id,
    accountHolder: "Test Holder",
    bankName: "Second Bank",
    branchName: "Second Branch",
    accountNumber: "1122334455",
    ifsc: "hdfc0009999",
  });
  assert.equal(
    (await db.bankDetail.findUniqueOrThrow({ where: { id: saved.id } })).status,
    "SUPERSEDED"
  );
  assert.equal(
    (
      await db.bankDetail.findFirstOrThrow({
        where: { personId: banker.id, status: "VERIFIED" },
      })
    ).accountLastFour,
    "4455"
  );

  /* ------------- concurrent milestones cannot consume the same slot twice */

  // PHASES Phase 4 — two qualifying Bookings under one invited Member both
  // generate an Invite record at approval, because neither has consumed the
  // entitlement yet. They then reach 100% at the same instant: exactly one may
  // take it, and the loser is closed rather than paid a second time (PRD §6.8).
  const raceInviter = await makeEligiblePerson("RaceInviter", "9600000011");
  const raceSeller = await makeEligiblePerson("RaceSeller", "9600000012");
  const raceBuyerA = await makeEligiblePerson("RaceBuyerA", "9600000013");
  const raceBuyerB = await makeEligiblePerson("RaceBuyerB", "9600000014");

  const raceInviterMember = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M3`,
      personId: raceInviter.id,
      activationDate: day(-400),
      reraStatus: "NOT_APPLICABLE",
      reraNotApplicableReason: "Individual referrer",
    },
  });
  await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M4`,
      personId: raceSeller.id,
      activationDate: day(-200),
      invitedByMemberId: raceInviterMember.id,
      invitePosition: 1,
      inviteRatePercent: "1",
      reraStatus: "REGISTERED",
      reraNumber: "RERA-TEST-2",
    },
  });

  const raceBookings: string[] = [];
  for (const [suffix, raceBuyer] of [
    ["R1", raceBuyerA],
    ["R2", raceBuyerB],
  ] as const) {
    const plot = await makePlot(project.id, suffix);
    raceBookings.push(
      await bookAndApprove({
        plotId: plot.id,
        buyerPersonId: raceBuyer.id,
        soldByType: "MEMBER",
        soldByPersonId: raceSeller.id,
      })
    );
  }

  for (const bookingId of raceBookings) {
    const generated = await currentRecords(bookingId);
    assert.ok(
      generated.some((r) => r.type === "INVITE"),
      "both Bookings generate an Invite while the entitlement is still open"
    );
    // Take each to 40% first, so the concurrent step is only the last payment.
    await pay(bookingId, "40", `${TAG} UTR ${bookingId.slice(0, 6)}-1`);
  }

  // The real contest: both cross 100% at the same time.
  const settled = await Promise.allSettled(
    raceBookings.map((bookingId, index) =>
      pay(bookingId, "60", `${TAG} UTR RACE-${index}`)
    )
  );
  assert.ok(
    settled.every((s) => s.status === "fulfilled"),
    `both payments must succeed; the contest is settled inside the engine — ` +
      settled.map((s) => (s.status === "rejected" ? String(s.reason) : "ok")).join(" | ")
  );

  const raceRecords = await db.commissionRecord.findMany({
    where: { bookingId: { in: raceBookings }, type: "INVITE", isCurrent: true },
  });
  assert.equal(raceRecords.length, 2, "both Invite records still exist — nothing is deleted");

  const winners = raceRecords.filter((r) => r.opportunityId !== null);
  const losers = raceRecords.filter((r) => r.opportunityId === null);
  assert.equal(winners.length, 1, "exactly one Booking consumed the Invite entitlement");
  assert.equal(losers.length, 1);
  assert.equal(losers[0].payment, "CANCELLED", "the loser is closed, never silently paid");
  assert.ok(losers[0].closedReason, "and it says why");

  assert.equal(
    await db.commissionOpportunity.count({
      where: { kind: "INVITE", subjectPersonId: raceSeller.id, status: "CONSUMED" },
    }),
    1,
    "one consumed slot exists for the invited Member, not two"
  );

  /* --------------------------- the Member portal never reveals the buyer */

  const view = await memberCommissionView(inviter.id);
  const serialised = JSON.stringify(view);
  assert.ok(view.length > 0, "the inviter sees their own commission");
  assert.ok(!serialised.includes(buyer.id), "no buyer identifier");
  assert.ok(!serialised.includes(`${TAG} Buyer`), "no buyer name");
  assert.ok(!serialised.includes("9600000003"), "no buyer mobile");
  assert.ok(serialised.includes("INVITE"), "type, percentage and status are shown");

  /* ============================ Approved Changes pack ============================ */

  /* AC-01 — a Customer who later becomes a Member keeps their Customer Bookings */

  const convert = await makeEligiblePerson("Converter", "9600000021");
  const plotAC1 = await makePlot(project.id, "AC1");
  const bookingAC1 = await bookAndApprove({
    plotId: plotAC1.id,
    buyerPersonId: convert.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });

  const frozen = await db.booking.findUniqueOrThrow({ where: { id: bookingAC1 } });
  assert.equal(
    frozen.originalClassification,
    "CUSTOMER",
    "the buyer was not a Member at approval, so this is Customer business"
  );
  const beforeConversion = (await currentRecords(bookingAC1)).map(
    (r) => `${r.type}:${r.beneficiaryPersonId}:${r.percent.toFixed(2)}@${r.milestonePercent.toFixed(0)}`
  );
  assert.deepEqual(
    beforeConversion,
    [`DIRECT:${seller.id}:3.00@25`, `INVITE:${inviter.id}:1.00@100`],
    "a third-party Member close: Direct at 25% to the seller, Invite at 100% to the inviter"
  );

  // The same person is now activated as a Member.
  await activateMember({
    idempotencyKey: key(),
    actorRef: `${TAG}-ADMIN`,
    actorRole: "ADMIN",
    personId: convert.id,
  });

  // Anything that regenerates commission on the old Booking must leave the
  // classification, the beneficiaries and the milestones exactly as they were.
  // Without the freeze this would become a Member self-purchase: Direct 3% at
  // 100% to the buyer, and the inviter's 1% would vanish.
  // Regeneration is what would rewrite the classification if the freeze were
  // not there: it is the same call Accounts approval, a Change Plot approval and
  // a Sold By Correction approval all make.
  await generateForBooking_(bookingAC1);

  const afterConversion = await db.booking.findUniqueOrThrow({ where: { id: bookingAC1 } });
  assert.equal(
    afterConversion.originalClassification,
    "CUSTOMER",
    "Member activation never rewrites the historical classification"
  );
  assert.deepEqual(
    (await currentRecords(bookingAC1)).map(
      (r) => `${r.type}:${r.beneficiaryPersonId}:${r.percent.toFixed(2)}@${r.milestonePercent.toFixed(0)}`
    ),
    beforeConversion,
    "regeneration after activation reproduces the Customer-business components exactly"
  );
  assert.ok(
    await db.bookingEvent.findFirst({
      where: { bookingId: bookingAC1, action: "CLASSIFICATION_FROZEN" },
    }),
    "the freeze is on the record's own history, so a report can explain the split"
  );

  /* AC-02 — Royalty waits for a COMPLETED performance cycle, and completion is
     legal completion, not the payment milestone (PRD §6.3; Approved Changes §1
     "not simply by recording a transaction"). */

  const royaltyBuyer = await makeEligiblePerson("RoyaltyBuyer", "9600000022");
  // CR-002 — a Royalty link that has already gone final, which is what a
  // Customer whose first qualifying purchase completed under this Member looks
  // like. How the link is *established* is AC-06's subject, below; this block
  // is about what a final link then earns.
  await db.customerProfile.create({
    data: {
      customerId: `${TAG}-C-ROY`,
      personId: royaltyBuyer.id,
      royaltyLinkedMemberId: inviterMember.id,
      royaltyLinkFinalAt: day(-30),
      royaltyPosition: 1,
      royaltyRatePercent: "1",
      royaltyYearStart: day(-30),
    },
  });

  // A first 3% Club direct purchase earns nothing; the repeat one earns
  // Loyalty for the buyer and Royalty for the Member who introduced them.
  const plotAC2a = await makePlot(project.id, "AC2A");
  const firstPurchase = await bookAndApprove({
    plotId: plotAC2a.id,
    buyerPersonId: royaltyBuyer.id,
    soldByType: "THREE_PERCENT_CLUB",
  });
  assert.equal((await currentRecords(firstPurchase)).length, 0, "a first direct purchase earns nothing");

  const plotAC2b = await makePlot(project.id, "AC2B");
  const repeatPurchase = await bookAndApprove({
    plotId: plotAC2b.id,
    buyerPersonId: royaltyBuyer.id,
    soldByType: "THREE_PERCENT_CLUB",
  });
  const royalty = () =>
    db.commissionRecord.findFirstOrThrow({
      where: { bookingId: repeatPurchase, type: "ROYALTY", isCurrent: true },
    });

  assert.equal((await royalty()).eligibility, "MILESTONE_PENDING", "no cycle before the milestone");
  assert.equal(
    await db.performanceCycle.count({ where: { memberProfileId: inviterMember.id } }),
    0,
    "a cycle is created by a qualifying transaction, not in advance"
  );

  /* TC-ROY-002 — the milestone alone is a *recorded* transaction, not completed
     qualifying activity. The cycle stays pending and no royalty is recognised. */

  await pay(repeatPurchase, "100", `${TAG} UTR AC2`);

  const cycle = await db.performanceCycle.findFirstOrThrow({
    where: { memberProfileId: inviterMember.id },
  });
  assert.equal(cycle.qualifyingCount, 1, "the qualifying transaction is recorded in the cycle");
  assert.equal(cycle.completedCount, 0, "but nothing in it is legally completed yet");
  assert.equal(cycle.status, "IN_PROGRESS", "a partial cycle is never marked completed");
  assert.equal(cycle.completedAt, null, "and carries no achievement timestamp");
  assert.equal(cycle.entitlement, null, "and confers no entitlement yet");
  assert.ok(cycle.cycleStart < cycle.cycleEnd, "the window has start and end dates");

  const recorded = await royalty();
  assert.equal(recorded.performanceCycleId, cycle.id, "the record names the cycle it entered");
  assert.equal(recorded.cycleCompletedAt, null, "its qualifying activity is not complete");
  assert.equal(recorded.eligibility, "ON_HOLD", "100% payment alone does not earn Royalty");
  assert.equal(recorded.holdReason, "PERFORMANCE_CYCLE_INCOMPLETE");

  // A repeated reassessment must not change any of that, or double-count.
  await reassessCommission_(repeatPurchase);
  const afterRepeat = await db.performanceCycle.findUniqueOrThrow({ where: { id: cycle.id } });
  assert.equal(afterRepeat.qualifyingCount, 1, "a repeated reassessment never double-counts");
  assert.equal(afterRepeat.status, "IN_PROGRESS", "and never completes a partial cycle");

  /* TC-ROY-001 — legal completion completes the qualifying activity. */

  await recordFinalBuyers({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: repeatPurchase,
    buyers: [{ personId: royaltyBuyer.id, dateOfBirth: day(-14000), address: "9 Cycle Road" }],
  });
  await recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: repeatPurchase,
    completion: { route: "REGISTRY", advocateName: "S. Menon", registryDate: today },
  });

  const completedCycle = await db.performanceCycle.findUniqueOrThrow({ where: { id: cycle.id } });
  assert.equal(completedCycle.completedCount, 1, "the qualifying transaction is now complete");
  assert.equal(completedCycle.status, "COMPLETED", "so the cycle is achieved");
  assert.ok(completedCycle.completedAt, "the achievement carries its timestamp");
  assert.match(
    completedCycle.entitlement ?? "",
    /ROYALTY 1\.00%/,
    "and the entitlement it confers is the actual Royalty, not a fixed label"
  );

  const earned = await royalty();
  assert.ok(earned.cycleCompletedAt, "the record's own qualifying activity is complete");
  assert.equal(earned.eligibility, "READY", "a completed cycle releases the Royalty");

  /* A delivery recorded in error and reopened takes the completion back. */

  await reopenDelivered({
    idempotencyKey: key(),
    actorRef: `${TAG}-MD`,
    actorRole: "MD",
    bookingId: repeatPurchase,
    reason: "Registry papers were filed against the wrong Plot.",
  });
  const reopenedCycle = await db.performanceCycle.findUniqueOrThrow({ where: { id: cycle.id } });
  assert.equal(reopenedCycle.status, "IN_PROGRESS", "reopening the delivery un-completes the cycle");
  assert.equal(reopenedCycle.completedCount, 0);
  assert.equal(reopenedCycle.completedAt, null);
  assert.equal(reopenedCycle.entitlement, null);
  assert.equal(
    (await royalty()).holdReason,
    "PERFORMANCE_CYCLE_INCOMPLETE",
    "and the Royalty goes back on hold"
  );

  // Complete it again so the Buyback case below starts from a real completion.
  await recordCompletion({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: repeatPurchase,
    completion: { route: "REGISTRY", advocateName: "S. Menon", registryDate: today },
  });
  assert.equal(
    (await db.performanceCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status,
    "COMPLETED",
    "re-completing the delivery re-achieves the cycle"
  );

  /* PRD §6.3, §6.5, main-PRD §14.12 — a Buyback AFTER legal completion keeps
     what was earned. The cycle must not be un-completed by it. */

  const beforeUnwind = await royalty();
  await cancelCommissionForBooking_(repeatPurchase, {
    legallyCompleted: true,
    unwind: "BUYBACK",
    reason: `${TAG} Buyback after legal completion`,
  });

  const afterBuyback = await db.performanceCycle.findUniqueOrThrow({ where: { id: cycle.id } });
  assert.equal(
    afterBuyback.status,
    "COMPLETED",
    "a Buyback after legal completion never un-completes an achieved cycle"
  );
  assert.equal(afterBuyback.completedCount, 1, "and its qualifying transaction stays counted");
  assert.ok(afterBuyback.entitlement, "and its entitlement stands");

  // main-PRD §14.12 — "Original sale commission normally remains earned".
  const afterUnwind = await royalty();
  assert.equal(
    afterUnwind.payment,
    beforeUnwind.payment,
    "a Buyback after legal completion leaves the commission earned, not Cancelled"
  );
  assert.ok(afterUnwind.opportunityId, "and its consumed entitlement stays consumed");
  assert.ok(
    await db.commissionEvent.findFirst({
      where: { recordId: afterUnwind.id, action: "BUYBACK_AFTER_COMPLETION" },
    }),
    "the Buyback is on the record's history even though nothing about it moved"
  );
  assert.ok(
    await db.task.findFirst({
      where: { recordId: repeatPurchase, purpose: "BUYBACK_COMMISSION_REVIEW" },
    }),
    "and Accounts are asked to confirm it against the written arrangement"
  );

  /* A Buyback BEFORE legal completion is the other §14.12 case: the records
     step back, and the CRM/management decision is raised rather than skipped. */

  const plotAC5 = await makePlot(project.id, "AC5");
  const earlyBuyback = await bookAndApprove({
    plotId: plotAC5.id,
    buyerPersonId: buyerTwo.id,
    soldByType: "MEMBER",
    soldByPersonId: seller.id,
  });
  await pay(earlyBuyback, "30", `${TAG} UTR AC5`);
  await cancelCommissionForBooking_(earlyBuyback, {
    legallyCompleted: false,
    unwind: "BUYBACK",
    reason: `${TAG} Buyback before legal completion`,
  });
  const steppedBack = await db.commissionRecord.findFirstOrThrow({
    where: { bookingId: earlyBuyback, type: "DIRECT", isCurrent: true },
  });
  assert.equal(
    steppedBack.payment,
    "CANCELLED",
    "an unpaid old-sale commission steps back when the sale had not completed"
  );
  assert.ok(
    await db.task.findFirst({
      where: { recordId: earlyBuyback, purpose: "BUYBACK_COMMISSION_REVIEW" },
    }),
    "and §14.12's CRM/management decision is raised for Accounts"
  );

  /* ======= AC-06 — Royalty ownership: CR-001 – CR-004, acceptance 1 – 6 =======

     The Enquiry no longer decides anything. Royalty belongs to the Member who
     was Sold By on the Customer's first qualifying purchase, it is provisional
     until that purchase reaches 100% Payment Received or an Approved Buyback,
     and only then does it take a position. */

  const royMemAPerson = await makeEligiblePerson("RoyMemA", "9600000041");
  const royMemBPerson = await makeEligiblePerson("RoyMemB", "9600000042");
  const royMemCPerson = await makeEligiblePerson("RoyMemC", "9600000045");
  const makeMember = (suffix: string, personId: string, activatedDaysAgo: number) =>
    db.memberProfile.create({
      data: {
        memberId: `${TAG}-M-${suffix}`,
        personId,
        activationDate: day(-activatedDaysAgo),
        reraStatus: "NOT_APPLICABLE",
        reraNotApplicableReason: "Individual referrer",
      },
    });
  const royMemA = await makeMember("A", royMemAPerson.id, 400);
  const royMemB = await makeMember("B", royMemBPerson.id, 300);
  const royMemC = await makeMember("C", royMemCPerson.id, 250);

  const linkOf = (personId: string) => db.customerProfile.findFirstOrThrow({ where: { personId } });

  /* Acceptance 1, 2 — "Enquiry by Member A + first qualifying sale by Member B
     = future Royalty belongs to B." */

  const linkBuyer = await makeEligiblePerson("LinkBuyer", "9600000043");
  await db.enquiry.create({
    data: {
      enquiryNo: `${TAG}-ENQ-ROY`,
      personId: linkBuyer.id,
      projectId: project.id,
      source: "BY_MEMBER",
      sourceMemberId: royMemA.id,
      remark: "Member A sourced the Enquiry and closes nothing.",
    },
  });

  const plotR1 = await makePlot(project.id, "ROY1");
  const firstSale = await bookAndApprove({
    plotId: plotR1.id,
    buyerPersonId: linkBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: royMemBPerson.id,
  });

  let link = await linkOf(linkBuyer.id);
  assert.equal(
    link.royaltyLinkedMemberId,
    royMemB.id,
    "acceptance 1, 2 — the Sold By Member of the first approved Booking is the Royalty Linked Member, not the Enquiry Member"
  );
  assert.equal(link.royaltyLinkFinalAt, null, "and it is provisional until the milestone");
  assert.equal(link.royaltyPosition, null, "a provisional link takes no Royalty position");
  assert.ok(
    await db.bookingEvent.findFirst({
      where: { bookingId: firstSale, action: "ROYALTY_LINK_PROVISIONAL" },
    }),
    "the link is on the Booking's own history"
  );

  await pay(firstSale, "100", `${TAG} UTR ROY1`);
  link = await linkOf(linkBuyer.id);
  assert.ok(link.royaltyLinkFinalAt, "100% verified Payment Received makes the link final");
  assert.equal(link.royaltyPosition, 1, "and that is when the Royalty position is taken");
  assert.equal(link.royaltyRatePercent?.toFixed(2), "1.00", "at the band rate of the position it took");

  // The future qualifying purchase: same Customer, direct, Sold By 3% CLUB.
  const plotR2 = await makePlot(project.id, "ROY2");
  const royaltyRepeat = await bookAndApprove({
    plotId: plotR2.id,
    buyerPersonId: linkBuyer.id,
    soldByType: "THREE_PERCENT_CLUB",
  });
  const repeatRoyalty = await db.commissionRecord.findFirst({
    where: { bookingId: royaltyRepeat, type: "ROYALTY", isCurrent: true },
  });
  assert.equal(
    repeatRoyalty?.beneficiaryPersonId,
    royMemBPerson.id,
    "acceptance 2 — the future direct purchase pays Royalty to the Member who closed the first sale"
  );
  assert.equal(
    await db.commissionRecord.count({
      where: { bookingId: royaltyRepeat, type: "ROYALTY", beneficiaryPersonId: royMemAPerson.id },
    }),
    0,
    "acceptance 1 — the Enquiry Member earns nothing from having sourced the Enquiry"
  );

  /* Acceptance 6 — a Member-closed repeat purchase does not consume Royalty. */

  const plotR3 = await makePlot(project.id, "ROY3");
  const memberClosedRepeat = await bookAndApprove({
    plotId: plotR3.id,
    buyerPersonId: linkBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: royMemCPerson.id,
  });
  assert.equal(
    await db.commissionRecord.count({
      where: {
        bookingId: memberClosedRepeat,
        type: { in: ["ROYALTY", "LOYALTY"] },
        isCurrent: true,
      },
    }),
    0,
    "acceptance 6 — a Member-closed repeat purchase creates no Royalty and no Loyalty"
  );
  assert.equal(
    await db.commissionOpportunity.count({
      where: { kind: "ROYALTY", subjectPersonId: linkBuyer.id, status: "CONSUMED" },
    }),
    0,
    "and leaves the unused Royalty available"
  );

  /* Acceptance 3 — a first Booking cancelled before its milestone consumes no
     Royalty position, and a later valid first purchase may establish a new
     link. */

  const cancelBuyer = await makeEligiblePerson("CancelBuyer", "9600000044");
  const plotR4 = await makePlot(project.id, "ROY4");
  const cancelledFirst = await bookAndApprove({
    plotId: plotR4.id,
    buyerPersonId: cancelBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: royMemBPerson.id,
  });
  assert.equal(
    (await linkOf(cancelBuyer.id)).royaltyLinkedMemberId,
    royMemB.id,
    "the cancelled Booking held a provisional link while it stood"
  );

  await cancelBooking({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: cancelledFirst,
    reason: "Buyer withdrew before any payment.",
  });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: cancelledFirst,
    approve: true,
    note: "No payment was received.",
  });

  const afterCancelledFirst = await linkOf(cancelBuyer.id);
  assert.equal(
    afterCancelledFirst.royaltyLinkedMemberId,
    null,
    "acceptance 3 — the provisional link goes with the cancelled first Booking"
  );
  assert.equal(afterCancelledFirst.royaltyLinkFinalAt, null, "nothing became final");
  assert.equal(afterCancelledFirst.royaltyPosition, null, "and no Royalty position was consumed");

  const plotR5 = await makePlot(project.id, "ROY5");
  await bookAndApprove({
    plotId: plotR5.id,
    buyerPersonId: cancelBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: royMemCPerson.id,
  });
  assert.equal(
    (await linkOf(cancelBuyer.id)).royaltyLinkedMemberId,
    royMemC.id,
    "a later valid first purchase establishes a new link"
  );

  /* Acceptance 4 — a first purchase Sold By 3% CLUB never gains a Royalty
     Member, however many Members sell to that Customer afterwards. */

  const clubBuyer = await makeEligiblePerson("ClubBuyer", "9600000046");
  const plotR6 = await makePlot(project.id, "ROY6");
  const clubFirst = await bookAndApprove({
    plotId: plotR6.id,
    buyerPersonId: clubBuyer.id,
    soldByType: "THREE_PERCENT_CLUB",
  });
  await pay(clubFirst, "100", `${TAG} UTR ROY6`);
  assert.equal(
    (await linkOf(clubBuyer.id)).royaltyLinkedMemberId,
    null,
    "Sold By 3% CLUB creates no Royalty Linked Member"
  );
  assert.ok(
    (await linkOf(clubBuyer.id)).royaltyLinkFinalAt,
    "and at the milestone that answer is itself final"
  );

  const plotR7 = await makePlot(project.id, "ROY7");
  await bookAndApprove({
    plotId: plotR7.id,
    buyerPersonId: clubBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: royMemBPerson.id,
  });
  assert.equal(
    (await linkOf(clubBuyer.id)).royaltyLinkedMemberId,
    null,
    "acceptance 4 — a Member selling later acquires no Royalty ownership"
  );

  /* Acceptance 5 — the same, for a first purchase Sold By Customer. */

  const custBuyer = await makeEligiblePerson("CustBuyer", "9600000047");
  const plotR8 = await makePlot(project.id, "ROY8");
  const custFirst = await bookAndApprove({
    plotId: plotR8.id,
    buyerPersonId: custBuyer.id,
    soldByType: "CUSTOMER",
    soldByPersonId: linkBuyer.id,
  });
  await pay(custFirst, "100", `${TAG} UTR ROY8`);
  const custLink = await linkOf(custBuyer.id);
  assert.equal(
    custLink.royaltyLinkedMemberId,
    null,
    "acceptance 5 — Sold By Customer creates no Royalty Linked Member"
  );
  assert.ok(custLink.royaltyLinkFinalAt, "and that is final at the milestone too");

  /* ===== AC-07 — CR-013: position 10+ is visible at 0% and consumes ==========

     The band table has always returned 0% past the ninth position. What used to
     happen with that 0% was nothing at all: the component was dropped, so the
     Booking never showed who was in the position, and the invited Member's
     one-time Invite opportunity stayed open for some later sale to take at 1%.
     The pack closes both halves — the line is created and visible, and it
     consumes the opportunity. */

  const tenthInviterPerson = await makeEligiblePerson("TenthInviter", "9600000051");
  const tenthSellerPerson = await makeEligiblePerson("TenthSeller", "9600000052");
  const tenthInviter = await makeMember("TENTH-I", tenthInviterPerson.id, 500);
  const tenthSeller = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M-TENTH-S`,
      personId: tenthSellerPerson.id,
      activationDate: day(-120),
      // Position 10 sits past the last band, so the frozen rate is 0%.
      invitedByMemberId: tenthInviter.id,
      invitePosition: 10,
      inviteRatePercent: "0",
      reraStatus: "NOT_APPLICABLE",
      reraNotApplicableReason: "Individual referrer",
    },
  });

  const tenthBuyer = await makeEligiblePerson("TenthBuyer", "9600000053");
  const plotAC7 = await makePlot(project.id, "AC7A");
  const tenthSale = await bookAndApprove({
    plotId: plotAC7.id,
    buyerPersonId: tenthBuyer.id,
    soldByType: "MEMBER",
    soldByPersonId: tenthSellerPerson.id,
  });

  const tenthInvite = () =>
    db.commissionRecord.findFirstOrThrow({
      where: { bookingId: tenthSale, type: "INVITE", isCurrent: true },
    });

  const created = await tenthInvite();
  assert.equal(
    created.percent.toFixed(2),
    "0.00",
    "acceptance 7 — the record exists and its rate is 0%"
  );
  assert.equal(
    created.ruleVersion,
    "INVITE/POSITION_10/0%@100",
    "and it carries the position, which is what keeps the position visible"
  );
  assert.equal(created.beneficiaryPersonId, tenthInviterPerson.id);
  assert.equal(
    created.eligibility,
    "NO_BENEFIT",
    "settled at zero — not Milestone Pending, and not a hold that could later lift"
  );
  assert.equal(created.holdReason, null);
  assert.deepEqual(
    (await currentRecords(tenthSale)).map((r) => `${r.type}:${r.percent.toFixed(2)}`),
    ["DIRECT:3.00", "INVITE:0.00"],
    "the 0% line stands beside the Direct one rather than replacing or trimming it"
  );

  /* The milestone consumes the opportunity, exactly as a paying band would. */

  assert.equal(
    await db.commissionOpportunity.count({
      where: { kind: "INVITE", subjectPersonId: tenthSellerPerson.id, status: "CONSUMED" },
    }),
    0,
    "nothing is consumed before the milestone"
  );

  await pay(tenthSale, "100", `${TAG} UTR AC7`);

  const zeroBand = await tenthInvite();
  assert.ok(
    zeroBand.opportunityId,
    "acceptance 7 — 0% still consumes that person's one-time opportunity"
  );
  assert.equal(
    await db.commissionOpportunity.count({
      where: { kind: "INVITE", subjectPersonId: tenthSellerPerson.id, status: "CONSUMED" },
    }),
    1
  );
  assert.equal(
    zeroBand.eligibility,
    "NO_BENEFIT",
    "and reaching the milestone does not make a 0% band payable"
  );
  assert.equal(
    await db.task.count({
      where: { recordKind: "Commission", recordId: zeroBand.id, status: "PENDING" },
    }),
    0,
    "no Accounts payment task is raised for an amount that does not exist"
  );

  /* "no payable amount is created" — by either route. */

  await expectBlocked(/no amount to pay/, () =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: zeroBand.id,
      early: false,
      paidOn: today,
      reference: `${TAG} UTR AC7-PAY`,
      remarks: "Trying to pay a zero band.",
    })
  );
  // Paid Early is the route around an unready record, so MD approval must not
  // become a way to pay a band that never earned anything.
  await approveCommissionPaidEarly({
    idempotencyKey: key(),
    actorRef: `${TAG}-MD`,
    actorRole: "MD",
    recordId: zeroBand.id,
    note: "Testing that approval alone cannot create an amount.",
  });
  await expectBlocked(/no amount to pay/, () =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: zeroBand.id,
      early: true,
      paidOn: today,
      reference: `${TAG} UTR AC7-EARLY`,
      remarks: "Trying to process a zero band early.",
    })
  );

  /* "That person never moves into a later 1% cycle." The opportunity is gone,
     so a second sale by the same Member earns their inviter nothing. */

  const tenthBuyerTwo = await makeEligiblePerson("TenthBuyer2", "9600000054");
  const plotAC7b = await makePlot(project.id, "AC7B");
  const secondSale = await bookAndApprove({
    plotId: plotAC7b.id,
    buyerPersonId: tenthBuyerTwo.id,
    soldByType: "MEMBER",
    soldByPersonId: tenthSellerPerson.id,
  });
  assert.deepEqual(
    (await currentRecords(secondSale)).map((r) => r.type),
    ["DIRECT"],
    "acceptance 7 — the consumed opportunity means no second Invite at any rate"
  );
  assert.equal(
    (await db.memberProfile.findUniqueOrThrow({ where: { id: tenthSeller.id } })).inviteRatePercent?.toFixed(2),
    "0.00",
    "and the position never re-rates"
  );

  /* AC-03 — Paid Early needs a recorded MD approval */

  await expectBlocked(/requires a recorded MD approval/, () =>
    markCommissionPaid({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: earned.id,
      early: true,
      paidOn: today,
      reference: `${TAG} UTR EARLY-NO`,
      remarks: "Processing ahead of the conditions.",
    })
  );

  const heldRecord = await db.commissionRecord.findFirstOrThrow({
    where: { bookingId: bookingAC1, type: "INVITE", isCurrent: true },
  });
  await expectBlocked(/Only MD may approve/, () =>
    approveCommissionPaidEarly({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      recordId: heldRecord.id,
      note: "Approving my own early payment.",
    })
  );
  await expectBlocked(/Only MD may approve/, () =>
    approveCommissionPaidEarly({
      idempotencyKey: key(),
      actorRef: `${TAG}-ADMIN`,
      actorRole: "ADMIN",
      recordId: heldRecord.id,
      note: "Admin is not MD.",
    })
  );

  await approveCommissionPaidEarly({
    idempotencyKey: key(),
    actorRef: `${TAG}-MD`,
    actorRole: "MD",
    recordId: heldRecord.id,
    note: "Approved ahead of the milestone for the quarter close.",
  });
  const approved = await db.commissionRecord.findUniqueOrThrow({ where: { id: heldRecord.id } });
  assert.equal(approved.earlyApprovedByRef, `${TAG}-MD`, "the approver is stored");
  assert.ok(approved.earlyApprovedAt, "with the date and time");
  assert.ok(approved.earlyApprovalNote, "and the compulsory note");
  assert.ok(
    await db.commissionEvent.findFirst({
      where: { recordId: heldRecord.id, action: "PAID_EARLY_APPROVED" },
    }),
    "the approval is on the record's own timeline"
  );

  await markCommissionPaid({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    recordId: heldRecord.id,
    early: true,
    paidOn: today,
    reference: `${TAG} UTR EARLY-YES`,
    remarks: "Processed on MD approval.",
  });
  assert.equal(
    (await db.commissionRecord.findUniqueOrThrow({ where: { id: heldRecord.id } })).payment,
    "PAID_EARLY",
    "an approved Paid Early goes through"
  );

  /* ===== Test plan §11 TC-CM-002 — duplicate Member activation is refused === */

  await expectBlocked(/already an activated Member/, () =>
    activateMember({
      idempotencyKey: key(),
      actorRef: `${TAG}-ADMIN`,
      actorRole: "ADMIN",
      personId: convert.id,
    })
  );
  assert.equal(
    await db.memberProfile.count({ where: { personId: convert.id } }),
    1,
    "one Person never holds two Member profiles"
  );

  /* ===== Test plan §18 — every Dashboard figure reconciles to the records ===

     Approved Changes §5: "Dashboard totals agree with transaction-level
     records", and §6: the business logic must be what produces them.

     Each figure is re-derived here with its own explicit query rather than by
     calling the same helper twice. That is the whole point: businessState()
     could drop an `isCurrent`, count a cancelled record or read a payment state
     where it means to read an achievement, and only an independent derivation
     notices. */

  const state = await businessState();

  const approvedOnly = { bookingNumber: { not: null } } as const;

  assert.equal(
    state.business.customer,
    await db.booking.count({ where: { ...approvedOnly, originalClassification: "CUSTOMER" } }),
    "Customer business matches the frozen classification on the Bookings"
  );
  assert.equal(
    state.business.member,
    await db.booking.count({ where: { ...approvedOnly, originalClassification: "MEMBER" } }),
    "Member business matches"
  );
  assert.equal(
    state.business.unclassified,
    await db.booking.count({ where: { ...approvedOnly, originalClassification: null } }),
    "and so does the unclassified remainder"
  );
  assert.equal(
    state.volumes.approvedBookings,
    state.business.customer + state.business.member + state.business.unclassified,
    "the split reconciles to the total, which is what makes the panel checkable"
  );
  assert.equal(
    state.volumes.approvedBookings,
    await db.booking.count({ where: approvedOnly }),
    "and the total is the number of approved Bookings"
  );

  assert.equal(
    state.transactions.unwound,
    await db.booking.count({ where: { status: "BUYBACK_COMPLETED" } }),
    "unwound transactions"
  );
  assert.equal(
    state.transactions.completed,
    await db.booking.count({ where: { status: "DELIVERED" } }),
    "completed transactions"
  );

  /* Royalty. TC-ROY-001 requires the Dashboard to count a completed cycle as
     earned, and TC-ROY-002 requires an incomplete one not to be counted —
     whatever its payment state. */
  assert.equal(
    state.royalty.earned,
    await db.commissionRecord.count({
      where: { type: "ROYALTY", isCurrent: true, cycleCompletedAt: { not: null } },
    }),
    "earned Royalty is the completed qualifying activity, not the paid records"
  );
  assert.ok(
    state.royalty.earned >= 1,
    "TC-ROY-001 — the Royalty completed above is counted as earned on the Dashboard"
  );
  assert.equal(
    state.cycles.completed,
    await db.performanceCycle.count({ where: { status: "COMPLETED" } }),
    "completed cycles"
  );
  assert.equal(
    state.cycles.inProgress,
    await db.performanceCycle.count({ where: { status: "IN_PROGRESS" } }),
    "and cycles still in progress"
  );
  assert.equal(
    state.cycles.qualifyingTransactions,
    await db.commissionRecord.count({ where: { performanceCycleId: { not: null } } }),
    "qualifying transactions counted into cycles"
  );

  /* Buying Commission. TC-BC-002: "Dashboard must not report an amount above
     the approved cap." */
  const buyingRows = await db.commissionRecord.findMany({
    where: { type: "BUYING", isCurrent: true },
    select: { percent: true },
  });
  assert.equal(state.buying.records, buyingRows.length, "Buying Commission record count");
  assert.equal(
    state.buying.totalPercent,
    buyingRows.reduce((sum, r) => sum.add(r.percent), new Decimal(0)).toFixed(2),
    "and the total is summed on exact decimals"
  );
  assert.equal(
    state.buying.overCapExceptions,
    buyingRows.filter((r) => r.percent.gt(5)).length,
    "cap exceptions are the records actually above 5%"
  );
  assert.equal(
    state.buying.overCapExceptions,
    0,
    "TC-BC-002 — nothing above the approved cap is reportable, because entry refuses it"
  );

  /* Paid Early. */
  assert.equal(
    state.paidEarly.processed,
    await db.commissionRecord.count({ where: { payment: "PAID_EARLY" } }),
    "processed Paid Early records"
  );
  assert.ok(
    state.paidEarly.processed >= 1,
    "the Paid Early processed above is visible on the Dashboard"
  );
  assert.equal(
    state.paidEarly.approvedAwaitingPayment,
    await db.commissionRecord.count({
      where: { isCurrent: true, payment: "NOT_PAID", earlyApprovedAt: { not: null } },
    }),
    "approved but not yet paid"
  );

  assert.equal(
    state.conflicts.aboveCap,
    await db.commissionRecord.count({
      where: { isCurrent: true, holdReason: "COMMISSION_CONFLICT_ABOVE_4" },
    }),
    "4% conflicts"
  );
  assert.equal(
    state.audit.supersededRecords,
    await db.commissionRecord.count({ where: { isCurrent: false } }),
    "superseded records — nothing is deleted, so they stay countable"
  );
  assert.equal(
    state.conversions.customersActivatedAsMembers,
    await db.booking.count({
      where: {
        ...approvedOnly,
        originalClassification: "CUSTOMER",
        primaryPerson: { memberProfile: { activationDate: { not: null } } },
      },
    }),
    "Customer → Member conversions, explained by the frozen classification"
  );
  assert.ok(
    state.conversions.customersActivatedAsMembers >= 1,
    "the conversion built above is visible, which is what §4 asks reports to explain"
  );

  assert.equal(state.volumes.enquiries, await db.enquiry.count(), "enquiries");
  assert.equal(state.volumes.holds, await db.hold.count(), "holds");
  assert.equal(
    state.volumes.paymentsReceived,
    await db.paymentReceivedEntry.count({ where: { status: "CONFIRMED" } }),
    "confirmed payment entries"
  );

  await cleanup();
  console.log("commission.check.ts OK");
}

/**
 * A Buyback's commission reversal, outside a command. The real Buyback path
 * needs an approved acquisition; this drives the same reversal function with the
 * legally-completed flag the acquisition service would pass.
 */
async function cancelCommissionForBooking_(
  bookingId: string,
  args: { legallyCompleted: boolean; reason: string; unwind?: "CANCELLATION" | "BUYBACK" }
) {
  await db.$transaction(
    async (tx) => {
      await cancelCommissionForBooking(tx, bookingId, `${TAG}-SYSTEM`, args);
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    },
    { maxWait: 10_000, timeout: Number(process.env.COMMAND_TIMEOUT_MS ?? 20_000) }
  );
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

/** Reassessment outside a command, for the regeneration check. */
async function reassessCommission_(bookingId: string) {
  await db.$transaction(
    async (tx) => {
      await reassessCommission(tx, bookingId, `${TAG}-SYSTEM`);
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    },
    // Same ceiling the real commands use — this database is remote.
    { maxWait: 10_000, timeout: Number(process.env.COMMAND_TIMEOUT_MS ?? 20_000) }
  );
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
