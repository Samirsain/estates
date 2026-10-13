// Royalty Tokens — docss/11 (owner-approved handoff, 12 Oct 2026) §5 acceptance
// checks 1–7, plus the Royalty relationship rules that stay (SSOT §67–§74, §99;
// UAT ROY-01/02/03/07/08/09/10/13, BB-05/06/09, COR-06) — against the real
// database and the real commands.
// Run: npm run royalty:check   (requires a seeded database)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  reviseBookingRequest,
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
import { createCommissionVersion } from "@/lib/services/commission-settings-service";
import * as royalty from "@/lib/services/royalty-service";
import {
  correctTokenRedemption,
  decideTokenRedemption,
  memberTokenView,
  recordTokenRedemption,
  refreshAward,
  syncRoyaltyReward,
  tokenPosition,
} from "@/lib/services/royalty-service";
import { setMemberStatus } from "@/lib/services/network-service";
import { decidePersonMerge, requestPersonMerge } from "@/lib/services/merge-service";
import { encryptSensitive } from "@/lib/security/identity";
import { runReport } from "@/lib/services/report-service";
import { tokenFigures } from "@/lib/domain/tokens";
import { istDay } from "@/lib/tasks";

const db = new PrismaClient();
const TAG = "ZZ-ROY";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;
const MD2 = `${TAG}-MD2`;
const MD = `${TAG}-MD`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();
const todayIst = istDay(today);
let mobileSeq = 0;
const mobile = () => `97${String(10_000_000 + ++mobileSeq).slice(-8)}`;

async function person(name: string) {
  const m = mobile();
  const p = await db.person.create({
    data: {
      fullName: `${TAG} ${name}`,
      primaryMobile: m,
      aadhaarCipher: encryptSensitive(`3${m}00`.slice(0, 12)),
      aadhaarLastFour: m.slice(-4),
      aadhaarStatus: "AVAILABLE",
    },
  });
  await db.bankDetail.create({
    data: {
      personId: p.id,
      accountHolder: name,
      bankName: "Test Bank",
      accountCipher: encryptSensitive(`55${m}`),
      accountLastFour: m.slice(-4),
      ifsc: "HDFC0001234",
      status: "VERIFIED",
      enteredByRef: CRM,
      verifiedByRef: ACC,
      verifiedAt: new Date(),
    },
  });
  return p;
}

let memberSeq = 0;
async function member(name: string) {
  const p = await person(name);
  const profile = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M-${++memberSeq}`,
      personId: p.id,
      activationDate: day(-300),
      reraStatus: "REGISTERED",
      reraNumber: `RERA-${memberSeq}`,
    },
  });
  return { personId: p.id, id: profile.id };
}

/** docss/11 §1 — a Project's token rate is a new approved settings version. */
async function setRate(projectId: string, tokens: number) {
  await createCommissionVersion({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    projectId,
    directEnabled: true,
    directPercent: "3",
    loyaltyEnabled: true,
    loyaltyPercent: "1",
    loyaltyExceptionReason: null,
    reason: `${TAG} rate ${tokens}`,
    royaltyTokensPerAward: tokens,
  });
}

async function project(code: string, tokens: number) {
  const created = await db.project.create({
    data: { projectCode: `${TAG}${code}`, name: `${TAG} ${code}`, type: "RESIDENTIAL", status: "ACTIVE" },
  });
  await db.plcRuleVersion.create({
    data: { projectId: created.id, version: 1, status: "PUBLISHED", effectiveFrom: day(-30), publishedAt: day(-30), reason: "check PLC" },
  });
  await setRate(created.id, tokens);
  return created.id;
}

let plotSeq = 0;
const plot = (projectId: string) =>
  db.plot.create({
    data: {
      projectId,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-${++plotSeq}`,
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.419",
      status: "AVAILABLE",
      restriction: "NONE",
    },
  });

async function submit(projectId: string, buyerId: string, sellerId?: string) {
  const p = await plot(projectId);
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: p.id,
    parties: [{ personId: buyerId, role: "PRIMARY" }],
    soldByType: sellerId ? "MEMBER" : "THREE_PERCENT_CLUB",
    soldByPersonId: sellerId ?? null,
    bookingDate: today,
    schedule: [
      { seq: 1, percent: "40", dueDate: today },
      { seq: 2, percent: "60", dueDate: day(30) },
    ],
  });
  return submitted.bookingId;
}

const approve = (bookingId: string) =>
  decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId, approve: true, note: "Verified." });

async function book(projectId: string, buyerId: string, sellerId?: string) {
  const bookingId = await submit(projectId, buyerId, sellerId);
  await approve(bookingId);
  return bookingId;
}

let refSeq = 0;
const pay = (bookingId: string, percent: string) =>
  confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: today,
    reference: `${TAG} PAY ${++refSeq}`,
  });

/** A Customer whose first purchase, Sold By the Member, is paid in full: a final relationship. */
async function linkedCustomer(name: string, projectId: string, seller: { personId: string }) {
  const c = await person(name);
  await pay(await book(projectId, c.id, seller.personId), "100");
  return c;
}

/** The linked Customer's Club-direct repeat purchase, paid in full: the qualifying event. */
async function qualify(projectId: string, customerId: string) {
  const bookingId = await book(projectId, customerId);
  const entry = await pay(bookingId, "100");
  return { bookingId, entryId: entry.entryId };
}

let arrangerId = "";
async function buyback(bookingId: string, sellerId: string) {
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
    reference: `${TAG} GIVEN ${++refSeq}`,
  });
  await decideAcquisition({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: raised.acquisitionId, approve: true, note: "Buyback approved." });
  return raised.acquisitionId;
}

const customerOf = (personId: string) => db.customerProfile.findUniqueOrThrow({ where: { personId } });
const awardOf = (bookingId: string) => db.royaltyAward.findUnique({ where: { triggerBookingId: bookingId } });
const figures = async (memberProfileId: string) => (await memberTokenView(memberProfileId, "MEMBER")).figures;
const position = (memberProfileId: string) => db.$transaction((tx) => tokenPosition(tx, memberProfileId));
const entries = (where: object) => db.tokenLedgerEntry.count({ where });

function redeem(memberProfileId: string, tokens: number, extra: Partial<Parameters<typeof recordTokenRedemption>[0]> = {}) {
  return recordTokenRedemption({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    memberProfileId,
    tokens,
    redeemedOn: todayIst,
    recipient: "SELF",
    recipientName: "",
    reference: `${TAG} voucher`,
    ...extra,
  });
}

/** The ledger and the allocations agree, and nothing is double-counted or overspent. */
async function invariants(memberProfileId: string, label: string) {
  const awards = await db.royaltyAward.findMany({
    where: { memberProfileId },
    include: { allocations: { where: { voidedAt: null } }, ledger: true },
  });
  for (const a of awards) {
    const used = a.allocations.reduce((n, x) => n + x.tokens, 0);
    assert.ok(used <= a.tokens, `${label}: an award never funds more than it holds`);
    const posted = a.ledger.filter((e) => e.kind === "AWARD_POSTED").length;
    const reversed = a.ledger.filter((e) => e.kind === "AWARD_REVERSED").length;
    assert.equal(posted, a.postings, `${label}: one AWARD_POSTED per posting`);
    assert.equal(reversed, posted - (a.state === "RELEASED" ? 1 : 0), `${label}: each posting reverses at most once`);
    if (a.state !== "RELEASED") assert.equal(used, 0, `${label}: only a released award funds anything`);
  }
  const redemptions = await db.tokenRedemption.findMany({ where: { memberProfileId }, include: { allocations: { where: { voidedAt: null } } } });
  for (const r of redemptions) {
    const funded = r.allocations.reduce((n, x) => n + x.tokens, 0);
    assert.ok(funded <= r.tokens, `${label}: a redemption is never over-funded`);
    if (r.state !== "RECORDED") assert.equal(funded, 0, `${label}: only a recorded redemption is funded`);
  }
  const ledger = await db.tokenLedgerEntry.findMany({ where: { memberProfileId } });
  const f = tokenFigures(ledger);
  assert.equal(f.balance, ledger.reduce((n, e) => n + e.tokens, 0), `${label}: balance is the ledger total`);
  const p = await position(memberProfileId);
  assert.deepEqual([p.earned, p.spent, p.balance], [f.earned, f.spent, f.balance], `${label}: position agrees with the ledger`);
  const freeEligible = awards
    .filter((a) => a.state === "RELEASED" && a.holdReason === null)
    .reduce((n, a) => n + a.tokens - a.allocations.reduce((m, x) => m + x.tokens, 0), 0);
  const unfunded = redemptions
    .filter((r) => r.state === "RECORDED")
    .reduce((n, r) => n + r.tokens - r.allocations.reduce((m, x) => m + x.tokens, 0), 0);
  assert.ok(freeEligible === 0 || unfunded === 0, `${label}: a deficit is cleared before tokens sit free`);
}

async function main() {
  await purgeCheckData(db, TAG);
  const A = await project("A", 10);
  const B = await project("B", 20);
  const arranger = await member("Arranger");
  arrangerId = arranger.personId;
  const seller = await member("Seller");
  const other = await member("Other");

  /* ===== ROY-01, ROY-02, ROY-09 — provisional, final, then the award ===== */

  const c9 = await person("C9");
  const first9 = await book(A, c9.id, seller.personId);
  assert.equal((await customerOf(c9.id)).royaltyLinkedMemberId, seller.id, "ROY-01 — provisional Royalty Linked Member");
  const repeat9 = await qualify(A, c9.id);
  assert.equal(await awardOf(repeat9.bookingId), null, "no award while the relationship is provisional");
  await pay(first9, "100");
  const award9 = (await awardOf(repeat9.bookingId))!;
  assert.ok(award9, "ROY-09 — the already-qualified Club-direct purchase earns once final");
  assert.equal(`${award9.state}|${award9.tokens}|${award9.memberProfileId}|${award9.projectId}`, `RELEASED|10|${seller.id}|${A}`);
  assert.ok((await customerOf(c9.id)).royaltyOpportunityConsumedAt, "the one opportunity is taken");
  assert.deepEqual(await figures(seller.id), { earned: 10, spent: 0, balance: 10 });

  // ROY-13 — no second award for the same Customer, in any Project.
  await qualify(B, c9.id);
  assert.equal(await db.royaltyAward.count({ where: { customerProfileId: (await customerOf(c9.id)).id } }), 1, "one award for life");

  // ROY-03 — a first purchase Sold By 3% Club: no Member relationship, ever.
  const c10 = await person("C10");
  await pay(await book(A, c10.id), "100");
  await book(A, c10.id, seller.personId);
  assert.equal((await customerOf(c10.id)).royaltyLinkedMemberId, null, "ROY-03");

  // ROY-10 — a Member-closed repeat earns nothing and leaves the opportunity open.
  const c11 = await person("C11");
  await pay(await book(A, c11.id, seller.personId), "100");
  await pay(await book(A, c11.id, other.personId), "100");
  assert.equal(await db.royaltyAward.count({ where: { customerProfileId: (await customerOf(c11.id)).id } }), 0, "ROY-10");
  assert.equal((await customerOf(c11.id)).royaltyOpportunityConsumedAt, null);

  // Joining, inviting or an ordinary sale earns nothing.
  assert.deepEqual(await figures(other.id), { earned: 0, spent: 0, balance: 0 });
  console.log("  ✓ ROY-01/02/03/09/10/13 — the relationship and its one award");

  /* ===== §5 (1) — pooling across Projects, partial spending, a dated entry ===== */

  const pool = await member("Pool");
  const ca = await linkedCustomer("CA", A, pool);
  const cb = await linkedCustomer("CB", B, pool);
  const qa = await qualify(A, ca.id);
  const qb = await qualify(B, cb.id);
  assert.deepEqual(await figures(pool.id), { earned: 30, spent: 0, balance: 30 }, "10 from A + 20 from B, no pooling step");
  const spent12 = await redeem(pool.id, 12);
  assert.equal(spent12.state, "RECORDED");
  assert.deepEqual(await figures(pool.id), { earned: 30, spent: 12, balance: 18 });
  const poolView = await memberTokenView(pool.id, "MEMBER");
  assert.deepEqual(poolView.redemptions, [{ tokens: 12, redeemedOn: todayIst }], "each redemption's amount and date");
  const allocs = await db.tokenAllocation.findMany({ where: { redemptionId: spent12.redemptionId }, include: { award: true } });
  const by = Object.fromEntries(allocs.map((a) => [a.award.triggerBookingId, a.tokens]));
  assert.deepEqual(by, { [qa.bookingId]: 10, [qb.bookingId]: 2 }, "oldest released tokens first");
  await invariants(pool.id, "pool");
  console.log("  ✓ §5(1) — 10 + 20 = 30 pooled; spending 12 leaves 18");

  /* ===== §5 (2) — the rate frozen on the request version ===== */

  const F = await project("F", 10);
  const frozenSeller = await member("Frozen");
  const cf = await linkedCustomer("CF", F, frozenSeller);
  const waiting = await submit(F, cf.id);
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: waiting } })).royaltyTokensPerAward, 10);
  await setRate(F, 20);
  await approve(waiting);
  await pay(waiting, "100");
  assert.equal((await awardOf(waiting))!.tokens, 10, "a submitted 10-token request still earns 10");
  const fresh = await submit(F, (await person("CF2")).id);
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: fresh } })).royaltyTokensPerAward, 20, "a new request uses 20");
  await setRate(F, 25);
  await reviseBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: fresh,
    parties: [{ personId: (await db.booking.findUniqueOrThrow({ where: { id: fresh } })).primaryPersonId, role: "PRIMARY" }],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: today,
    schedule: [
      { seq: 1, percent: "50", dueDate: today },
      { seq: 2, percent: "50", dueDate: day(30) },
    ],
    reason: "Corrected schedule.",
  });
  const versions = await db.bookingReviewVersion.findMany({ where: { bookingId: fresh }, orderBy: { version: "asc" } });
  assert.deepEqual(
    versions.map((v) => (v.snapshot as { royaltyTokensPerAward: number }).royaltyTokensPerAward),
    [20, 25],
    "an explicit resubmission is a new version at the then-current rate; the old one is unchanged"
  );
  console.log("  ✓ §5(2) — rate frozen per request version");

  /* ===== §5 (3), BB-05/06 — Buyback-pending awards, holds, release once ===== */

  const held = await member("Held");
  const cbb = await linkedCustomer("CBB", A, held);
  const repeatBb = await book(A, cbb.id);
  await pay(repeatBb, "30");
  const bb = await buyback(repeatBb, cbb.id);
  let awardBb = (await awardOf(repeatBb))!;
  assert.equal(`${awardBb.state}|${awardBb.qualificationRoute}|${awardBb.holdReason}`, "PENDING|APPROVED_BUYBACK|BUYBACK_STABLE_COMPLETION_PENDING");
  assert.deepEqual(await figures(held.id), { earned: 0, spent: 0, balance: 0 }, "a pending award never inflates the figures");
  await db.acquisition.update({ where: { id: bb }, data: { documentsReturnRequired: true } });
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: bb, percent: "75", paidOn: today, reference: `${TAG} GIVEN BB` });
  assert.equal((await awardOf(repeatBb))!.state, "PENDING", "BB-05 — papers still out: not released");
  await recordBuybackDocumentsReturned({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", acquisitionId: bb, returnedOn: today });
  awardBb = (await awardOf(repeatBb))!;
  assert.equal(`${awardBb.state}|${awardBb.holdReason}`, "RELEASED|null", "BB-06 — stable: released");
  assert.deepEqual(await figures(held.id), { earned: 10, spent: 0, balance: 10 });
  for (let i = 0; i < 3; i++) await db.$transaction((tx) => refreshAward(tx, awardBb.id, CRM));
  assert.equal(await entries({ awardId: awardBb.id, kind: "AWARD_POSTED" }), 1, "released once, however often it is rechecked");

  // A hold before release keeps the award pending; clearing it posts once.
  const ch = await linkedCustomer("CH", A, held);
  await setMemberStatus({ idempotencyKey: key(), actorRef: MD2, actorRole: "MD", memberProfileId: held.id, active: false, reason: "Review." });
  const qh = await qualify(A, ch.id);
  assert.equal(`${(await awardOf(qh.bookingId))!.state}|${(await awardOf(qh.bookingId))!.holdReason}`, "PENDING|MEMBER_DEACTIVATED");
  await assert.rejects(redeem(held.id, 1), /inactive|Deactivated/i, "a Member-level hold blocks spending");
  assert.deepEqual(await figures(held.id), { earned: 10, spent: 0, balance: 10 }, "a hold never deletes earned tokens");
  await setMemberStatus({ idempotencyKey: key(), actorRef: MD2, actorRole: "MD", memberProfileId: held.id, active: true, reason: "Cleared." });
  assert.equal((await awardOf(qh.bookingId))!.state, "RELEASED", "reactivation releases it");
  assert.equal(await entries({ awardId: (await awardOf(qh.bookingId))!.id, kind: "AWARD_POSTED" }), 1);
  assert.deepEqual(await figures(held.id), { earned: 20, spent: 0, balance: 20 });

  // An outstanding Recovery blocks spending, and removing it duplicates nothing.
  const direct = await db.commissionRecord.findFirstOrThrow({ where: { beneficiaryPersonId: held.personId, type: "DIRECT" } });
  const rec = await db.recovery.create({
    data: {
      recoveryNo: `${TAG}-REC-1`,
      personId: held.personId,
      commissionRecordId: direct.id,
      noticeOn: today,
      dueOn: new Date(today.getTime() + 15 * 86_400_000),
      reference: `${TAG} REC`,
      reason: "Check.",
      openedByRef: ACC,
    },
  });
  const before = await entries({ memberProfileId: held.id });
  await assert.rejects(redeem(held.id, 5), /Recovery/, "a Recovery blocks spending");
  await db.recovery.delete({ where: { id: rec.id } });
  await redeem(held.id, 5);
  assert.equal(await entries({ memberProfileId: held.id }), before + 1, "only the redemption was added");
  await invariants(held.id, "held");
  console.log("  ✓ §5(3) — pending awards uncounted; holds block release and spending; release once");

  /* ===== §5 (4) — idempotency, reruns and races ===== */

  const k = key();
  const once = await recordTokenRedemption({ idempotencyKey: k, actorRef: CRM, actorRole: "CRM", memberProfileId: held.id, tokens: 1, redeemedOn: todayIst, recipient: "SELF", recipientName: "", reference: "" });
  const twice = await recordTokenRedemption({ idempotencyKey: k, actorRef: CRM, actorRole: "CRM", memberProfileId: held.id, tokens: 1, redeemedOn: todayIst, recipient: "SELF", recipientName: "", reference: "" });
  assert.equal(once.redemptionId, twice.redemptionId, "a retried submission is not a second redemption");
  assert.equal(await db.tokenRedemption.count({ where: { requestKey: k } }), 1);
  const k2 = key();
  const sameInstant = await Promise.allSettled([redeem(held.id, 1, { idempotencyKey: k2 }), redeem(held.id, 1, { idempotencyKey: k2 })]);
  assert.equal(await db.tokenRedemption.count({ where: { requestKey: k2 } }), 1, "a double-click at the same instant is one redemption");
  assert.ok(sameInstant.every((r) => r.status === "fulfilled"), "and neither click errors");
  const ledgerBefore = await entries({});
  for (let i = 0; i < 5; i++) {
    await db.$transaction((tx) => syncRoyaltyReward(tx, cbb.id, CRM));
    await db.$transaction((tx) => refreshAward(tx, awardBb.id, CRM));
  }
  assert.equal(await entries({}), ledgerBefore, "re-running the sync and the release changes nothing");

  const racer = await member("Racer");
  const cr = await linkedCustomer("CR", B, racer);
  await qualify(B, cr.id);
  const raced = await Promise.allSettled([redeem(racer.id, 20), redeem(racer.id, 20)]);
  assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1, "two simultaneous redemptions cannot overspend");
  assert.deepEqual(await figures(racer.id), { earned: 20, spent: 20, balance: 0 });
  await invariants(racer.id, "racer");

  const racer2 = await member("Racer2");
  const cr2 = await linkedCustomer("CR2", B, racer2);
  const q2 = await qualify(B, cr2.id);
  await cancelBooking({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: q2.bookingId, reason: "Buyer withdrew." });
  await Promise.allSettled([
    redeem(racer2.id, 20),
    decideCancellation({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId: q2.bookingId,
      approve: true,
      note: "Refund outside the CRM.",
      reference: `${TAG} REFUND R2`,
      actionDate: today,
    }),
  ]);
  const award2 = (await awardOf(q2.bookingId))!;
  assert.equal(award2.state, "REVERSED", "the cancellation reversed it");
  assert.equal(await entries({ awardId: award2.id, kind: "AWARD_REVERSED" }), 1, "exactly once, whichever won");
  await invariants(racer2.id, "racer2");
  console.log("  ✓ §5(4) — retries, reruns and races change the result once");

  /* ===== §5 (5) — cancellation before release, after release, partial, full ===== */

  // Before release: a Buyback-pending award whose Buyback is cancelled.
  const early = await member("Early");
  const ce = await linkedCustomer("CE", A, early);
  const repeatE = await book(A, ce.id);
  await pay(repeatE, "30");
  const bbE = await buyback(repeatE, ce.id);
  await cancelAcquisitionDeal({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: bbE, reason: "Seller withdrew." });
  const awardE = (await awardOf(repeatE))!;
  assert.equal(awardE.state, "REVERSED", "BB-09 — the Buyback-only award reverses");
  assert.equal(await entries({ awardId: awardE.id }), 0, "nothing was ever posted");
  assert.equal((await customerOf(ce.id)).royaltyOpportunityConsumedAt, null, "the unused opportunity reopens");

  // After release, before spending: below 100% and no Buyback.
  const mid = await member("Mid");
  const cm = await linkedCustomer("CM", A, mid);
  const qm = await qualify(A, cm.id);
  const awardM = (await awardOf(qm.bookingId))!;
  await correctPaymentReceived({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", entryId: qm.entryId, percent: "90", paidOn: today, reference: `${TAG} SHORT`, reason: "Short credit." });
  assert.equal((await awardOf(qm.bookingId))!.state, "REVERSED");
  assert.equal(await entries({ awardId: awardM.id, kind: "AWARD_REVERSED" }), 1);
  assert.deepEqual(await figures(mid.id), { earned: 0, spent: 0, balance: 0 });
  assert.equal((await customerOf(cm.id)).royaltyOpportunityConsumedAt, null, "unused, so it reopens");
  // §5 (6) — the same award requalifies: same row, same saved rate, a second posting.
  await pay(qm.bookingId, "10");
  const backM = (await awardOf(qm.bookingId))!;
  assert.equal(`${backM.id}|${backM.state}|${backM.tokens}|${backM.postings}`, `${awardM.id}|RELEASED|10|2`, "restored, not duplicated");
  assert.deepEqual(await figures(mid.id), { earned: 10, spent: 0, balance: 10 });
  await invariants(mid.id, "mid");

  // The spec's example: earn 30, spend 25, invalidate the 10 → 20 / 25 / −5; earn 20 → 15.
  const ex = await member("Example");
  const cx1 = await linkedCustomer("CX1", A, ex);
  const cx2 = await linkedCustomer("CX2", B, ex);
  const qx1 = await qualify(A, cx1.id);
  const qx2 = await qualify(B, cx2.id);
  const spent25 = await redeem(ex.id, 25);
  const recoveriesBefore = await db.recovery.count();
  await correctPaymentReceived({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", entryId: qx1.entryId, percent: "80", paidOn: today, reference: `${TAG} SHORT X1`, reason: "Short credit." });
  assert.deepEqual(await figures(ex.id), { earned: 20, spent: 25, balance: -5 }, "the handoff's example");
  const award10 = (await awardOf(qx1.bookingId))!;
  assert.ok(award10.consumedAt, "the partly-spent award was consumed");
  assert.ok((await customerOf(cx1.id)).royaltyOpportunityConsumedAt, "a consumed award keeps the opportunity consumed");
  assert.equal(await db.recovery.count(), recoveriesBefore, "§5 (7) — a deficit creates no cash debt");
  assert.equal((await position(ex.id)).available, -5);
  await assert.rejects(redeem(ex.id, 1), /below zero|not enough/i, "no spending while in deficit");
  const cx3 = await linkedCustomer("CX3", B, ex);
  const qx3 = await qualify(B, cx3.id);
  assert.deepEqual(await figures(ex.id), { earned: 40, spent: 25, balance: 15 }, "future earnings clear the deficit first");
  const deficitFund = await db.tokenAllocation.findFirstOrThrow({ where: { redemptionId: spent25.redemptionId, award: { triggerBookingId: qx3.bookingId }, voidedAt: null } });
  assert.equal(deficitFund.tokens, 5, "the same attribution clears the deficit");
  assert.ok((await awardOf(qx3.bookingId))!.consumedAt, "used toward the deficit: consumed");
  await invariants(ex.id, "example");

  // §5 (6) — a consumed, reversed award may only come back itself.
  await pay(qx1.bookingId, "20");
  const back10 = (await awardOf(qx1.bookingId))!;
  assert.equal(`${back10.id}|${back10.state}|${back10.postings}`, `${award10.id}|RELEASED|2`);
  assert.deepEqual(await figures(ex.id), { earned: 50, spent: 25, balance: 25 });
  // A corrected erroneous redemption gives back exactly its tokens; consumption stays.
  await assert.rejects(
    correctTokenRedemption({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", redemptionId: spent25.redemptionId, reason: "Wrong Member." }),
    /Only MD/
  );
  await correctTokenRedemption({ idempotencyKey: key(), actorRef: MD2, actorRole: "MD", redemptionId: spent25.redemptionId, reason: "Recorded against the wrong Member." });
  assert.deepEqual(await figures(ex.id), { earned: 50, spent: 0, balance: 50 });
  assert.ok((await awardOf(qx1.bookingId))!.consumedAt, "correcting spending never reopens a consumed reward");
  await invariants(ex.id, "example corrected");

  // After full spending.
  const full = await member("Full");
  const cfu = await linkedCustomer("CFU", A, full);
  const qfu = await qualify(A, cfu.id);
  await redeem(full.id, 10);
  await correctPaymentReceived({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", entryId: qfu.entryId, percent: "50", paidOn: today, reference: `${TAG} SHORT FU`, reason: "Short credit." });
  assert.deepEqual(await figures(full.id), { earned: 0, spent: 10, balance: -10 });
  assert.equal(await entries({ awardId: (await awardOf(qfu.bookingId))!.id, kind: "AWARD_REVERSED" }), 1);
  await invariants(full.id, "full");
  console.log("  ✓ §5(5) — cancellation before release, after release, partial and full spending");

  /* ===== §5 (6) — relinking and merges cannot duplicate or transfer ===== */

  // COR-05 — a Sold By Correction on the first purchase after the award was used.
  const relinked = await member("Relink");
  const crl = await linkedCustomer("CRL", A, relinked);
  const firstRl = (await customerOf(crl.id)).royaltyLinkFirstBookingId!;
  const qrl = await qualify(A, crl.id);
  await redeem(relinked.id, 4);
  await requestSoldByCorrection({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: firstRl,
    toSoldByType: "MEMBER",
    toSoldByPersonId: other.personId,
    reason: "The other Member closed it.",
    supportingNote: "Register.",
  });
  await assert.rejects(
    decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD2, actorRole: "CRM", bookingId: firstRl, approve: true, note: "ok" }),
    /Only MD may approve/,
    "a correction touching consumed tokens needs MD"
  );
  await decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: firstRl, approve: true, note: "MD approves." });
  assert.equal((await awardOf(qrl.bookingId))!.state, "REVERSED", "the old Member's award is reversed");
  assert.equal(await db.royaltyAward.count({ where: { memberProfileId: other.id } }), 0, "nothing transfers to the corrected Member");
  assert.ok((await customerOf(crl.id)).royaltyOpportunityConsumedAt, "a consumed opportunity stays consumed after relinking");
  assert.deepEqual(await figures(relinked.id), { earned: 0, spent: 4, balance: -4 });

  // CP §59 — the same correction before any token was used: the unused award
  // moves to the corrected Member as the same row, at its saved rate.
  const early2 = await member("Relink2");
  const crl2 = await linkedCustomer("CRL2", A, early2);
  const firstRl2 = (await customerOf(crl2.id)).royaltyLinkFirstBookingId!;
  const qrl2 = await qualify(A, crl2.id);
  const before2 = (await awardOf(qrl2.bookingId))!;
  await requestSoldByCorrection({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    bookingId: firstRl2,
    toSoldByType: "MEMBER",
    toSoldByPersonId: other.personId,
    reason: "The other Member closed it.",
    supportingNote: "Register.",
  });
  await decideSoldByCorrection({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", bookingId: firstRl2, approve: true, note: "ok" });
  const after2 = (await awardOf(qrl2.bookingId))!;
  assert.equal(`${after2.id}|${after2.memberProfileId}|${after2.state}|${after2.tokens}`, `${before2.id}|${other.id}|RELEASED|10`, "unused: it moves");
  assert.deepEqual(await figures(early2.id), { earned: 0, spent: 0, balance: 0 }, "and leaves the old Member at zero");
  assert.deepEqual(await figures(other.id), { earned: 10, spent: 0, balance: 10 });
  await invariants(early2.id, "relink2 old");
  await invariants(other.id, "relink2 new");

  // COR-08 — merging two Customers who each used their opportunity.
  const merger = await member("Merger");
  const cm1 = await linkedCustomer("CM1", A, merger);
  const cm2 = await linkedCustomer("CM2", B, merger);
  await qualify(A, cm1.id);
  const qm2 = await qualify(B, cm2.id);
  const req = await requestPersonMerge({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", survivingPersonId: cm1.id, mergedPersonId: cm2.id, reason: "Same person." });
  await decidePersonMerge({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", requestId: req.requestId, approve: true, note: "Confirmed." });
  assert.equal((await awardOf(qm2.bookingId))!.state, "REVERSED", "the later duplicate is reversed");
  assert.equal(await entries({ award: { triggerBookingId: qm2.bookingId }, kind: "AWARD_REVERSED" }), 1);
  assert.deepEqual(await figures(merger.id), { earned: 10, spent: 0, balance: 10 }, "one real person, one award");
  await invariants(merger.id, "merger");
  console.log("  ✓ §5(6) — requalification restores; corrections, relinking and merges never duplicate");

  /* ===== §5 (7) — boundaries ===== */

  for (const bad of [0, -1, 2.5, 10_000_000]) {
    await assert.rejects(redeem(pool.id, bad), /whole number|more than/, `refuses ${bad}`);
  }
  for (const bad of [istDay(day(1)), "2026-02-30", ""]) {
    await assert.rejects(redeem(pool.id, 1, { redeemedOn: bad }), /date/, `refuses ${bad || "an empty date"}`);
  }
  for (const role of ["ACCOUNTS", "MIS", "MEMBER", "PC"]) {
    await assert.rejects(redeem(pool.id, 1, { actorRole: role, actorRef: `${TAG}-${role}` }), /Only CRM or MD/, role);
  }
  assert.ok(
    !Object.keys(royalty).some((name) => /transfer|withdraw|expire/i.test(name)),
    "no transfer, cash withdrawal or expiry exists for tokens"
  );
  assert.ok(!/token/i.test(readFileSync("src/lib/jobs.ts", "utf8")), "no scheduled job touches tokens (no expiry)");
  const poolOnly = await memberTokenView(pool.id, "STAFF");
  assert.ok(poolOnly.staff!.redemptions.every((r) => r.memberProfileId === pool.id), "one Member's view holds only their own rows");

  // Non-family recipient: waits for MD, posts on approval, never before.
  const nonFamily = await redeem(pool.id, 3, { recipient: "NON_FAMILY", recipientName: "Family Friend" });
  assert.equal(nonFamily.state, "AWAITING_MD");
  assert.deepEqual(await figures(pool.id), { earned: 30, spent: 12, balance: 18 }, "not spent until MD approves");
  assert.equal((await db.task.findFirst({ where: { recordId: nonFamily.redemptionId, purpose: "REWARD_NOMINEE_APPROVAL", status: "PENDING" } }))?.assigneeRole, "MD");
  await assert.rejects(decideTokenRedemption({ idempotencyKey: key(), actorRef: MD2, actorRole: "CRM", redemptionId: nonFamily.redemptionId, approve: true, note: "ok" }), /Only MD/);
  await decideTokenRedemption({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", redemptionId: nonFamily.redemptionId, approve: true, note: "Approved." });
  assert.deepEqual(await figures(pool.id), { earned: 30, spent: 15, balance: 15 });
  const rejected = await redeem(pool.id, 2, { recipient: "NON_FAMILY", recipientName: "Neighbour" });
  await decideTokenRedemption({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", redemptionId: rejected.redemptionId, approve: false, note: "No." });
  assert.deepEqual(await figures(pool.id), { earned: 30, spent: 15, balance: 15 }, "a rejected one spends nothing");
  // MD recording a non-family recipient is the approval: spent at once, no NT10 task.
  const byMd = await redeem(pool.id, 1, { recipient: "NON_FAMILY", recipientName: "Old Friend", actorRole: "MD", actorRef: MD });
  assert.equal(byMd.state, "RECORDED", "MD's own non-family redemption needs no second approval");
  assert.equal(await db.task.count({ where: { recordId: byMd.redemptionId } }), 0, "and raises no MD task");
  assert.deepEqual(await figures(pool.id), { earned: 30, spent: 16, balance: 14 });
  await invariants(pool.id, "pool after nominee");
  console.log("  ✓ §5(7) — bounds, roles, no transfer/expiry/cash, nominee safeguard");

  /* ===== ROY-07, ROY-08, SSOT §62, COR-06 — the relationship rules that stay ===== */

  const c14 = await person("C14");
  const first14 = await book(A, c14.id, seller.personId);
  await pay(first14, "20");
  await buyback(first14, c14.id);
  assert.equal((await customerOf(c14.id)).royaltyLinkFinalAt, null, "ROY-08 — at 20% the Buyback does not finalise");
  const c15 = await person("C15");
  const first15 = await book(A, c15.id, seller.personId);
  await pay(first15, "25");
  const bb15 = await buyback(first15, c15.id);
  assert.equal((await customerOf(c15.id)).royaltyLinkFinalRoute, "APPROVED_BUYBACK", "ROY-07 — final via Buyback at 25%");
  await cancelAcquisitionDeal({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: bb15, reason: "Unwound." });
  assert.equal((await customerOf(c15.id)).royaltyLinkFinalAt, null, "SSOT §62 — provisional again after the unwind");

  const c16 = await person("C16");
  const c17 = await person("C17");
  const sold16 = await book(A, c16.id, seller.personId);
  await requestPrimaryCustomerChange({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: sold16, toPersonId: c17.id, reason: "Transfer." });
  await decidePrimaryCustomerChange({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: sold16, approve: true, note: "ok" });
  assert.equal((await db.customerProfile.findUnique({ where: { personId: c17.id } }))?.royaltyLinkedMemberId ?? null, null, "COR-06");

  // UAT VIS-10 — the Royalty report: relationship, opportunity and tokens; no cash.
  const report = await runReport("ROYALTY");
  const row9 = report.find((r) => r.customer === c9.fullName)!;
  assert.equal(`${row9.relationship}|${row9.opportunity}|${row9.awardState}|${row9.awardTokens}`, "Final|Consumed|RELEASED|10");
  assert.ok(!Object.keys(row9).some((k) => /percent|amount|rate|rupee/i.test(k)), "no cash column");

  await purgeCheckData(db, TAG);
  console.log("royalty.check.ts OK");
}

main().then(
  () => db.$disconnect(),
  async (error) => {
    console.error(error);
    await purgeCheckData(db, TAG).catch(() => {});
    await db.$disconnect();
    process.exit(1);
  }
);
