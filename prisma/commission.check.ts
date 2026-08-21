// Phase 4 service checks — PHASES.md Phase 4 "Tests", end to end against the
// real database and the real commands.
// Run: npm run commission:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
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
import {
  applyMemberCommissionHold,
  cancelCommissionForBooking,
  markCommissionPaid,
  memberCommissionView,
  reassessCommission,
} from "@/lib/services/commission-service";
import { decideBankDetails, enterBankDetails } from "@/lib/services/bank-service";
import { activateMember } from "@/lib/services/network-service";
import { encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();
const TAG = "ZZ-COMM";
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
      lifecycle: "AVAILABLE",
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
    where: { plcRuleVersions: { some: { isCurrent: true } } },
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
    accountNumber: "9988776655",
    ifsc: "hdfc0001234",
  });
  const pending = await db.bankDetail.findFirstOrThrow({
    where: { personId: banker.id, status: "PENDING" },
  });
  assert.equal(pending.accountLastFour, "6655");
  assert.ok(!pending.accountCipher.includes("9988776655"), "the account number is encrypted at rest");

  // PRD §3.3 — bank entry and verification are different staff accounts.
  await expectBlocked(/different staff account/, () =>
    decideBankDetails({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bankDetailId: pending.id,
      approve: true,
      note: "self verify",
    })
  );
  await decideBankDetails({
    idempotencyKey: key(),
    actorRef: ACC2,
    actorRole: "ACCOUNTS",
    bankDetailId: pending.id,
    approve: true,
    note: "Cheque verified.",
  });
  assert.equal(
    (await db.bankDetail.findUniqueOrThrow({ where: { id: pending.id } })).status,
    "VERIFIED"
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

  await cleanup();
  console.log("commission.check.ts OK");
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
    await cleanup().catch(() => {});
    await db.$disconnect();
    process.exit(1);
  });
