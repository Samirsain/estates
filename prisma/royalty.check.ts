// Royalty Relationship Reward, Gift Programme and Stable Buyback Completion —
// SSOT §61, §62, §64, §67–§83, §98; Change Pack §40–§51, §59, §60, §65; UAT
// ROY-01..18, BB-05/06/09, COR-05/06, FRZ-08 — against the real database and
// the real commands.
// Run: npm run royalty:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  cancelBooking,
  decideBookingRequest,
  decidePrimaryCustomerChange,
  decideSoldByCorrection,
  requestPrimaryCustomerChange,
  requestSoldByCorrection,
  submitBookingRequest,
} from "@/lib/services/booking-service";
import { confirmPaymentReceived, correctPaymentReceived } from "@/lib/services/payment-service";
import { decideCancellation } from "@/lib/services/cancellation-service";
import {
  cancelAcquisitionDeal,
  confirmPaymentGiven,
  createAcquisition,
  decideAcquisition,
  recordBuybackDocumentsReturned,
} from "@/lib/services/acquisition-service";
import {
  decideRoyaltyProgramme,
  prepareRoyaltyProgramme,
  sendRoyaltyProgramme,
} from "@/lib/services/royalty-programme-service";
import {
  decideRoyaltyRecipient,
  deliverRoyaltyGift,
  orderRoyaltyGift,
  selectRoyaltyGift,
} from "@/lib/services/royalty-service";
import { setMemberStatus } from "@/lib/services/network-service";
import { encryptSensitive } from "@/lib/security/identity";
import { runReport } from "@/lib/services/report-service";

const db = new PrismaClient();
const TAG = "ZZ-ROY";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;
const ADMIN = `${TAG}-ADMIN`;
const MD = `${TAG}-MD`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();
let previousActiveProgramme: string | null = null;

async function cleanup() {
  await purgeCheckData(db, TAG);
  // The Programme Versions this run made, then whatever was live before it.
  const mine = await db.royaltyProgrammeVersion.findMany({ where: { preparedByRef: { startsWith: TAG } }, select: { id: true } });
  await db.task.deleteMany({ where: { recordId: { in: mine.map((m) => m.id) } } });
  await db.booking.updateMany({
    where: { royaltyProgrammeVersionId: { in: mine.map((m) => m.id) } },
    data: { royaltyProgrammeVersionId: null },
  });
  await db.royaltyProgrammeVersion.deleteMany({ where: { id: { in: mine.map((m) => m.id) } } });
  if (previousActiveProgramme) {
    await db.royaltyProgrammeVersion.update({
      where: { id: previousActiveProgramme },
      data: { status: "ACTIVE", effectiveTo: null },
    });
  }
}

async function person(name: string, mobile: string) {
  const p = await db.person.create({
    data: {
      fullName: `${TAG} ${name}`,
      primaryMobile: mobile,
      aadhaarCipher: encryptSensitive(`3${mobile}00`.slice(0, 12)),
      aadhaarLastFour: mobile.slice(-4),
      aadhaarStatus: "AVAILABLE",
    },
  });
  await db.bankDetail.create({
    data: {
      personId: p.id,
      accountHolder: name,
      bankName: "Test Bank",
      accountCipher: encryptSensitive(`55${mobile}`),
      accountLastFour: mobile.slice(-4),
      ifsc: "HDFC0001234",
      status: "VERIFIED",
      enteredByRef: CRM,
      verifiedByRef: ACC,
      verifiedAt: new Date(),
    },
  });
  return p;
}

const member = (suffix: string, personId: string) =>
  db.memberProfile.create({
    data: {
      memberId: `${TAG}-M-${suffix}`,
      personId,
      activationDate: day(-300),
      reraStatus: "REGISTERED",
      reraNumber: `RERA-${suffix}`,
    },
  });

let projectId = "";
const plot = (suffix: string) =>
  db.plot.create({
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

async function book(suffix: string, buyerId: string, soldByType: "THREE_PERCENT_CLUB" | "MEMBER", sellerId?: string) {
  const p = await plot(suffix);
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: p.id,
    parties: [{ personId: buyerId, role: "PRIMARY" }],
    soldByType,
    soldByPersonId: sellerId ?? null,
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
    bookingId: submitted.bookingId,
    approve: true,
    note: "Verified.",
  });
  return submitted.bookingId;
}

const pay = (bookingId: string, percent: string, ref: string) =>
  confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: today,
    reference: `${TAG} ${ref}`,
  });

const customerOf = (personId: string) => db.customerProfile.findUniqueOrThrow({ where: { personId } });
const creditOf = (customerProfileId: string) =>
  db.royaltyCredit.findFirst({ where: { customerProfileId }, orderBy: { createdAt: "desc" } });
const tasks = (recordId: string, purpose: string) =>
  db.task.findMany({ where: { recordId, purpose, status: "PENDING" } });

let arrangerId = "";
async function buyback(bookingId: string, sellerId: string, suffix: string) {
  const raised = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: bookingId,
    sellerPersonId: sellerId,
    arrangedByType: "MEMBER",
    arrangedByPersonId: arrangerId,
    purchaseDate: today,
    remark: "Buyback.",
    schedule: [
      { seq: 1, percent: "25", dueDate: today },
      { seq: 2, percent: "75", dueDate: day(30) },
    ],
  });
  await confirmPaymentGiven({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    acquisitionId: raised.acquisitionId,
    percent: "25",
    paidOn: today,
    reference: `${TAG} GIVEN ${suffix}`,
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

async function approveProgramme(ref: string) {
  const draft = await prepareRoyaltyProgramme({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    programmeRef: ref,
    catalogueVersion: `${ref}-CAT`,
    termsVersion: `${ref}-TERMS`,
    reason: "Launch catalogue",
  });
  await sendRoyaltyProgramme({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", versionId: draft.versionId });
  return draft.versionId;
}

async function main() {
  await cleanup();
  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { status: "PUBLISHED" } }, commissionVersions: { some: { status: "ACTIVE" } } },
  });
  projectId = project.id;
  previousActiveProgramme =
    (await db.royaltyProgrammeVersion.findFirst({ where: { status: "ACTIVE" }, select: { id: true } }))?.id ?? null;
  const arranger = await person("Arranger", "9700000001");
  await member("ARR", arranger.id);
  arrangerId = arranger.id;

  /* ===== SSOT §76, §101; CP §7.4, §65 NT07 — the Programme Version and its approval ===== */

  // No Programme live yet in this run's view: freeze one under test control.
  const p1 = await approveProgramme(`${TAG}-RGP-01`);
  assert.equal((await tasks(p1, "ROYALTY_PROGRAMME_APPROVAL"))[0]?.assigneeRole, "MD", "NT07 to MD");
  await assert.rejects(
    decideRoyaltyProgramme({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: p1, approve: true, note: "ok", economicsReviewed: false }),
    /economics were reviewed/,
    "UAT SET-10 — not without the economics review"
  );
  await assert.rejects(
    decideRoyaltyProgramme({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", versionId: p1, approve: true, note: "ok", economicsReviewed: true }),
    /Only MD/
  );
  const decided = await decideRoyaltyProgramme({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    versionId: p1,
    approve: true,
    note: "Catalogue and economics reviewed.",
    economicsReviewed: true,
  });
  assert.equal(decided.status, "ACTIVE");
  const p1Row = await db.royaltyProgrammeVersion.findUniqueOrThrow({ where: { id: p1 } });
  assert.ok(p1Row.economicsReviewedAt && p1Row.economicsReviewedByRef === MD, "the review is stored, not its numbers");
  assert.equal((await tasks(p1, "ROYALTY_PROGRAMME_APPROVAL")).length, 0, "NT07 closes");

  const sellerP = await person("Seller", "9700000002");
  const seller = await member("S", sellerP.id);
  const otherP = await person("OtherSeller", "9700000003");
  await member("O", otherP.id);

  /* ===== ROY-01, ROY-02, ROY-09 — first purchase Sold By Member, then Club-direct ===== */

  const c9 = await person("C9", "9700000009");
  const first9 = await book("C9A", c9.id, "MEMBER", sellerP.id);
  let profile9 = await customerOf(c9.id);
  assert.equal(profile9.royaltyLinkedMemberId, seller.id, "ROY-01 — Provisional Royalty Linked Member");
  assert.equal(profile9.royaltyLinkFinalAt, null);

  // A Club-direct repeat that qualifies before the relationship is final earns nothing yet.
  const repeat9 = await book("C9B", c9.id, "THREE_PERCENT_CLUB");
  const repeat9Row = await db.booking.findUniqueOrThrow({ where: { id: repeat9 } });
  assert.equal(repeat9Row.royaltyProgrammeVersionId, p1, "SSOT §76 — the Booking froze RGP-01");
  await pay(repeat9, "100", "C9B-100");
  assert.equal(await creditOf(profile9.id), null, "no Credit while the relationship is provisional");

  await pay(first9, "100", "C9A-100");
  profile9 = await customerOf(c9.id);
  assert.ok(profile9.royaltyLinkFinalAt, "ROY-02 — final at 100%");
  assert.equal(profile9.royaltyLinkFinalRoute, "PAYMENT_100");
  let credit9 = await creditOf(profile9.id);
  assert.ok(credit9, "ROY-09 — the already-qualified Club-direct purchase earns the Credit once final");
  assert.equal(`${credit9!.state}|${credit9!.qualificationRoute}`, "ELIGIBLE|PAYMENT_100");
  assert.equal(credit9!.triggerBookingId, repeat9);
  assert.equal(credit9!.programmeVersionId, p1);
  assert.equal(credit9!.memberProfileId, seller.id);
  assert.ok(profile9.royaltyOpportunityConsumedAt, "the one opportunity is consumed");
  assert.equal((await tasks(credit9!.id, "ROYALTY_GIFT_FULFILMENT")).length, 1, "TSK-10 — one NT06");

  // FRZ-08, ROY-14 — a later Programme Version leaves the frozen entitlement alone.
  const p2 = await approveProgramme(`${TAG}-RGP-02`);
  await decideRoyaltyProgramme({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: p2, approve: true, note: "v2", economicsReviewed: true });
  assert.equal((await creditOf(profile9.id))!.programmeVersionId, p1, "still RGP-01");

  // ROY-13 — no second Credit for the same Customer.
  const third9 = await book("C9C", c9.id, "THREE_PERCENT_CLUB");
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: third9 } })).royaltyProgrammeVersionId, p2);
  await pay(third9, "100", "C9C-100");
  assert.equal(await db.royaltyCredit.count({ where: { customerProfileId: profile9.id } }), 1, "one Credit for life");

  /* ===== ROY-18, TSK-12 — non-family recipient, then order and delivery ===== */

  await selectRoyaltyGift({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    creditId: credit9!.id,
    rewardRef: "RG-01",
    recipient: "NON_FAMILY",
    recipientName: "Family Friend",
  });
  credit9 = await creditOf(profile9.id);
  assert.equal(`${credit9!.state}|${credit9!.holdReason}`, "SELECTED|NOMINEE_APPROVAL_PENDING");
  assert.equal((await tasks(credit9!.id, "REWARD_NOMINEE_APPROVAL"))[0]?.assigneeRole, "MD", "NT10 to MD");
  await assert.rejects(
    orderRoyaltyGift({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", creditId: credit9!.id, orderReference: "PO-1", orderedOn: today }),
    /on hold/,
    "no fulfilment before MD approves the recipient"
  );
  await decideRoyaltyRecipient({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", creditId: credit9!.id, approve: true, note: "Approved." });
  assert.equal((await creditOf(profile9.id))!.holdReason, null);
  await orderRoyaltyGift({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", creditId: credit9!.id, orderReference: "PO-1", orderedOn: today });
  await deliverRoyaltyGift({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", creditId: credit9!.id, deliveredOn: today, deliveryReference: "DLV-1" });
  assert.equal((await creditOf(profile9.id))!.state, "DELIVERED");
  assert.equal((await tasks(credit9!.id, "ROYALTY_GIFT_FULFILMENT")).length, 0, "NT06 closes at delivery");

  // COR-05 — after delivery only MD may correct the attribution, and no second Gift follows.
  await requestSoldByCorrection({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: repeat9,
    toSoldByType: "MEMBER",
    toSoldByPersonId: otherP.id,
    reason: "The other Member closed it.",
    supportingNote: "Register.",
  });
  await assert.rejects(
    decideSoldByCorrection({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", bookingId: repeat9, approve: true, note: "ok" }),
    /only MD may approve/
  );
  await decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: repeat9, approve: true, note: "MD approves." });
  assert.equal((await creditOf(profile9.id))!.state, "DELIVERED", "the delivered Gift stays consumed");
  assert.equal(await db.royaltyCredit.count({ where: { customerProfileId: profile9.id } }), 1, "no second Gift");

  // ROY-17 — cancelling a purchase after delivery reopens nothing.
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: third9, reason: "Buyer withdrew." });
  await decideCancellation({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: third9,
    approve: true,
    note: "Refund outside the CRM.",
    reference: `${TAG} REFUND C9C`,
    actionDate: today,
  });
  assert.ok((await customerOf(c9.id)).royaltyOpportunityConsumedAt, "consumed forever");

  /* ===== ROY-03, ROY-10 — no Member relationship, and another Member's repeat sale ===== */

  const c10 = await person("C10", "9700000010");
  const first10 = await book("C10A", c10.id, "THREE_PERCENT_CLUB");
  await pay(first10, "100", "C10A-100");
  await book("C10B", c10.id, "MEMBER", sellerP.id);
  const profile10 = await customerOf(c10.id);
  assert.equal(profile10.royaltyLinkedMemberId, null, "ROY-03 — no relationship, and none retroactively");
  assert.ok(profile10.royaltyLinkFinalAt);

  const c11 = await person("C11", "9700000011");
  const first11 = await book("C11A", c11.id, "MEMBER", sellerP.id);
  await pay(first11, "100", "C11A-100");
  const memberRepeat = await book("C11B", c11.id, "MEMBER", otherP.id);
  await pay(memberRepeat, "100", "C11B-100");
  const profile11 = await customerOf(c11.id);
  assert.equal(await creditOf(profile11.id), null, "ROY-10 — a Member-closed repeat earns no Credit");
  assert.equal(profile11.royaltyOpportunityConsumedAt, null, "and the opportunity stays unused");

  /* ===== SSOT §99 — reversed by a correction, the same entitlement re-qualifies ===== */

  const clubRepeat11 = await book("C11C", c11.id, "THREE_PERCENT_CLUB");
  const entry = await pay(clubRepeat11, "100", "C11C-100");
  const credit11 = await creditOf(profile11.id);
  assert.equal(credit11?.state, "ELIGIBLE");
  const corrected = await correctPaymentReceived({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    entryId: entry.entryId,
    percent: "90",
    paidOn: today,
    reference: `${TAG} C11C-90`,
    reason: "Short credit.",
  });
  assert.equal((await creditOf(profile11.id))!.state, "REVERSED", "below 100% and no Buyback: reversed");
  assert.equal((await customerOf(c11.id)).royaltyOpportunityConsumedAt, null, "the opportunity reopens");
  await pay(clubRepeat11, "10", "C11C-10");
  void corrected;
  const back = await creditOf(profile11.id);
  assert.equal(`${back!.id}|${back!.state}`, `${credit11!.id}|ELIGIBLE`, "the same Credit comes back");

  // Deactivation holds fulfilment; reactivation releases it (SSOT §82).
  await setMemberStatus({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", memberProfileId: seller.id, active: false, reason: "Review." });
  assert.equal((await creditOf(profile11.id))!.holdReason, "MEMBER_DEACTIVATED");
  await setMemberStatus({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", memberProfileId: seller.id, active: true, reason: "Cleared." });
  assert.equal((await creditOf(profile11.id))!.holdReason, null);

  /* ===== ROY-15/16, BB-05/06 — Buyback eligibility waits for Stable Completion ===== */

  const c12 = await person("C12", "9700000012");
  const first12 = await book("C12A", c12.id, "MEMBER", sellerP.id);
  await pay(first12, "100", "C12A-100");
  const repeat12 = await book("C12B", c12.id, "THREE_PERCENT_CLUB");
  await pay(repeat12, "30", "C12B-30");
  const bb12 = await buyback(repeat12, c12.id, "C12");
  const profile12 = await customerOf(c12.id);
  let credit12 = await creditOf(profile12.id);
  assert.equal(`${credit12!.state}|${credit12!.qualificationRoute}|${credit12!.holdReason}`, "ELIGIBLE|APPROVED_BUYBACK|BUYBACK_STABLE_COMPLETION_PENDING");
  assert.equal((await tasks(credit12!.id, "ROYALTY_GIFT_FULFILMENT")).length, 0, "no fulfilment task while held");
  // BB-05 — papers required and not back: 100% Payment Given is not enough.
  await db.acquisition.update({ where: { id: bb12 }, data: { documentsReturnRequired: true } });
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: bb12, percent: "75", paidOn: today, reference: `${TAG} GIVEN C12B` });
  assert.equal((await db.acquisition.findUniqueOrThrow({ where: { id: bb12 } })).stableCompletedAt, null);
  assert.equal((await creditOf(profile12.id))!.holdReason, "BUYBACK_STABLE_COMPLETION_PENDING");
  // BB-06 — the papers come back: stable, and the hold releases once.
  await recordBuybackDocumentsReturned({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: bb12, returnedOn: today });
  assert.ok((await db.acquisition.findUniqueOrThrow({ where: { id: bb12 } })).stableCompletedAt, "Stable Buyback Completion");
  credit12 = await creditOf(profile12.id);
  assert.equal(credit12!.holdReason, null);
  assert.equal((await tasks(credit12!.id, "ROYALTY_GIFT_FULFILMENT")).length, 1, "NT06 once released");

  /* ===== BB-09 — Buyback unwinds before fulfilment: the Buyback-only Credit reverses ===== */

  const c13 = await person("C13", "9700000013");
  const first13 = await book("C13A", c13.id, "MEMBER", sellerP.id);
  await pay(first13, "100", "C13A-100");
  const repeat13 = await book("C13B", c13.id, "THREE_PERCENT_CLUB");
  await pay(repeat13, "30", "C13B-30");
  const bb13 = await buyback(repeat13, c13.id, "C13");
  const profile13 = await customerOf(c13.id);
  assert.equal((await creditOf(profile13.id))?.state, "ELIGIBLE");
  await cancelAcquisitionDeal({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: bb13, reason: "Seller withdrew." });
  assert.equal((await creditOf(profile13.id))!.state, "REVERSED");
  assert.equal(await db.royaltyCredit.count({ where: { customerProfileId: profile13.id, state: { not: "REVERSED" } } }), 0, "no replacement");

  /* ===== ROY-07, ROY-08, SSOT §62 — a first purchase finalised by Buyback ===== */

  const c14 = await person("C14", "9700000014");
  const first14 = await book("C14A", c14.id, "MEMBER", sellerP.id);
  await pay(first14, "20", "C14A-20");
  await buyback(first14, c14.id, "C14");
  assert.equal((await customerOf(c14.id)).royaltyLinkFinalAt, null, "ROY-08 — at 20% the Buyback does not finalise");

  const c15 = await person("C15", "9700000015");
  const first15 = await book("C15A", c15.id, "MEMBER", sellerP.id);
  await pay(first15, "25", "C15A-25");
  const bb15 = await buyback(first15, c15.id, "C15");
  let profile15 = await customerOf(c15.id);
  assert.equal(profile15.royaltyLinkFinalRoute, "APPROVED_BUYBACK", "ROY-07 — final via Buyback at 25%");
  await cancelAcquisitionDeal({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: bb15, reason: "Unwound." });
  profile15 = await customerOf(c15.id);
  assert.equal(profile15.royaltyLinkFinalAt, null, "SSOT §62 — provisional again after the unwind");
  assert.equal(profile15.royaltyLinkedMemberId, seller.id);

  /* ===== COR-06, RISK-03 — a Primary Customer Change creates no relationship ===== */

  const c16 = await person("C16", "9700000016");
  const c17 = await person("C17", "9700000017");
  const sold16 = await book("C16A", c16.id, "MEMBER", sellerP.id);
  await requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: sold16, toPersonId: c17.id, reason: "Transfer." });
  await decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: sold16, approve: true, note: "ok" });
  const profile17 = await db.customerProfile.findUnique({ where: { personId: c17.id } });
  assert.equal(profile17?.royaltyLinkedMemberId ?? null, null, "the incoming Customer gets no relationship from the transfer");
  assert.equal((await customerOf(c16.id)).royaltyLinkedMemberId, seller.id, "and the original one keeps theirs");

  // UAT VIS-10 — the Royalty report: relationship, opportunity and Gift, no cash.
  const report = await runReport("ROYALTY");
  const row9 = report.find((r) => r.customer === c9.fullName)!;
  assert.equal(`${row9.relationship}|${row9.opportunity}|${row9.giftState}`, "Final|Consumed|DELIVERED");
  assert.ok(!Object.keys(row9).some((k) => /percent|amount|rate/i.test(k)), "no cash column");

  await cleanup();
  console.log("royalty.check.ts OK");
}

main().then(
  () => db.$disconnect(),
  async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    await db.$disconnect();
    process.exit(1);
  }
);
