// Sales & Reference Trip Reward — SSOT §39–§66; Change Pack §7–§9, §22–§39,
// §65, §76; UAT TRP, REF, SET-09/10, BB-02/08, TSK-08/09/11, SYS-01/02 —
// against the real database and the real commands.
// Run: npm run trip:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived, correctPaymentReceived } from "@/lib/services/payment-service";
import {
  decideCommissionVersion,
  prepareCommissionDraft,
  recordEconomicsReview,
  sendCommissionVersion,
  type CommissionVersionInput,
} from "@/lib/services/commission-settings-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { cancelAcquisitionDeal, confirmPaymentGiven, createAcquisition, decideAcquisition } from "@/lib/services/acquisition-service";
import { setMemberStatus } from "@/lib/services/network-service";
import { bookTripReward, correctInviter, markTripTravelled, recordTripNominee } from "@/lib/services/trip-service";
import { runTripCreditExpiry, runTripWindDown } from "@/lib/jobs";
import { encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();
const TAG = "ZZ-TRIP";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;
const ADMIN = `${TAG}-ADMIN`;
const MD = `${TAG}-MD`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();
let mobile = 9800000000;

async function person(name: string) {
  return db.person.create({
    data: {
      fullName: `${TAG} ${name}`,
      primaryMobile: String(++mobile),
      aadhaarCipher: encryptSensitive(`4${mobile}0`.slice(0, 12)),
      aadhaarLastFour: String(mobile).slice(-4),
      aadhaarStatus: "AVAILABLE",
    },
  });
}

async function member(suffix: string, inviterId: string | null = null, status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") {
  const p = await person(`M-${suffix}`);
  const m = await db.memberProfile.create({
    data: {
      memberId: `${TAG}-M-${suffix}`,
      personId: p.id,
      activationDate: day(-300),
      inviterFrozenAt: day(-300),
      invitedByMemberId: inviterId,
      status,
      reraStatus: "REGISTERED",
      reraNumber: `RERA-${suffix}`,
    },
  });
  return { person: p, member: m };
}

async function project(code: string) {
  const seeded = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { status: "PUBLISHED" } } },
    include: { plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 } },
  });
  const p = await db.project.create({
    data: { projectCode: `ZZTRP${code}`, name: `${TAG} Project ${code}`, type: "RESIDENTIAL", status: "ACTIVE" },
  });
  await db.plcRuleVersion.create({
    data: {
      projectId: p.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: today,
      publishedAt: today,
      components: {
        create: seeded.plcRuleVersions[0].components.map((c) => ({ category: c.category, threshold: c.threshold, percent: c.percent })),
      },
    },
  });
  return p;
}

const plots = new Map<string, string>();
async function plot(projectId: string, label: string) {
  const p = await db.plot.create({
    data: {
      projectId,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-${label}`,
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.419",
      status: "AVAILABLE",
      restriction: "NONE",
    },
  });
  plots.set(label, p.id);
  return p.id;
}

const terms = (trip: Partial<NonNullable<CommissionVersionInput["trip"]>>): CommissionVersionInput => ({
  directEnabled: true,
  directPercent: "3",
  loyaltyEnabled: true,
  loyaltyPercent: "1",
  loyaltyExceptionReason: null,
  reason: "Trip launch",
  trip: {
    tripEnabled: true,
    tripTotalTarget: 5,
    tripMinOwnCredits: 3,
    tripMaxReferenceCredits: 2,
    tripProgrammeCode: "TRIP-A",
    tripProgrammeVersionRef: "TRIP-A v1",
    tripTermsVersionRef: "TRIP-A-1",
    tripCutOffAt: null,
    tripWindDownAt: null,
    excludedPlotIds: [],
    sharedPools: [],
    ...trip,
  },
});

async function approveTrip(projectId: string, input: CommissionVersionInput) {
  const draft = await prepareCommissionDraft({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", projectId, ...input });
  await sendCommissionVersion({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", versionId: draft.versionId });
  await recordEconomicsReview({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: draft.versionId, note: "Reviewed." });
  await decideCommissionVersion({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: draft.versionId, approve: true, note: "ok" });
  return draft.versionId;
}

async function sell(label: string, buyerId: string, sellerPersonId: string | null, approve = true) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plots.get(label)!,
    parties: [{ personId: buyerId, role: "PRIMARY" }],
    soldByType: sellerPersonId ? "MEMBER" : "THREE_PERCENT_CLUB",
    soldByPersonId: sellerPersonId,
    bookingDate: today,
    schedule: [
      { seq: 1, percent: "40", dueDate: today },
      { seq: 2, percent: "60", dueDate: day(30) },
    ],
  });
  await decideBookingRequest(
    approve
      ? { idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: submitted.bookingId, approve: true, note: "ok" }
      : {
          idempotencyKey: key(),
          actorRef: ACC,
          actorRole: "ACCOUNTS",
          bookingId: submitted.bookingId,
          approve: false,
          rejectReason: "INCOMPLETE_DETAILS",
          note: "Details missing.",
        }
  );
  return submitted.bookingId;
}

const pay = (bookingId: string, percent: string, ref: string) =>
  confirmPaymentReceived({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId, percent, paidOn: today, reference: `${TAG} ${ref}` });

const ownOf = (bookingId: string) =>
  db.tripCredit.findFirst({ where: { sourceBookingId: bookingId, creditType: "OWN_SALE" }, orderBy: { createdAt: "desc" } });
const refOf = (bookingId: string) =>
  db.tripCredit.findFirst({ where: { sourceBookingId: bookingId, creditType: "REFERENCE" }, orderBy: { createdAt: "desc" } });

async function main() {
  await purgeCheckData(db, TAG);

  /* ===== SET-09, SET-10, TSK-08 — the Trip Programme and its economics review ===== */

  const A = await project("A");
  for (const label of ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10A", "A10B", "A10C", "A11", "A12"]) {
    await plot(A.id, label);
  }
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", projectId: A.id, ...terms({ tripMinOwnCredits: 6 }) }),
    /Minimum Own-Sale Credits/,
    "SET-09"
  );
  const draftA = await prepareCommissionDraft({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId: A.id,
    ...terms({
      excludedPlotIds: [plots.get("A09")!],
      sharedPools: [
        { plotId: plots.get("A10B")!, parentPlotId: plots.get("A10A")! },
        { plotId: plots.get("A10C")!, parentPlotId: plots.get("A10A")! },
      ],
    }),
  });
  await sendCommissionVersion({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", versionId: draftA.versionId });
  const nt02 = await db.task.findFirst({ where: { recordId: A.id, purpose: "PROJECT_ECONOMICS_REVIEW", status: "PENDING" } });
  assert.equal(nt02?.assigneeRole, "MD", "NT02 to MD");
  await assert.rejects(
    decideCommissionVersion({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: draftA.versionId, approve: true, note: "ok" }),
    /economics review/,
    "SET-10 — not before the review"
  );
  await recordEconomicsReview({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: draftA.versionId, note: "Trip cost reviewed." });
  await decideCommissionVersion({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", versionId: draftA.versionId, approve: true, note: "ok" });
  const vA = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: draftA.versionId } });
  assert.equal(vA.status, "ACTIVE");
  assert.ok(vA.economicsReviewedAt, "only the fact and date of the review are kept");

  const m1 = await member("1");
  const m2 = await member("2", m1.member.id);
  const m3 = await member("3", m2.member.id);
  const m4 = await member("4", m1.member.id);
  const m7 = await member("7");
  const m9 = await member("9", m1.member.id);
  const buyer = async (n: string) => (await person(`Buyer-${n}`)).id;

  /* ===== TRP-01, TRP-02, TRP-09, TRP-14 — Pending, rejected, excluded, qualified ===== */

  const a01 = await sell("A01", await buyer("A01"), m1.person.id);
  let own = await ownOf(a01);
  assert.equal(own?.state, "PENDING", "TRP-01 — Pending on approval");
  const bucket1 = await db.tripBucket.findFirstOrThrow({ where: { memberProfileId: m1.member.id, state: "OPEN" } });
  assert.equal(`${bucket1.totalTarget}/${bucket1.minOwnCredits}/${bucket1.maxReferenceCredits}|${bucket1.termsVersionRef}`, "5/3/2|TRIP-A-1");
  assert.equal(await db.task.count({ where: { recordId: own!.id } }), 0, "TSK-02 — no task for a Pending credit");

  await sell("A08", await buyer("A08R"), m7.person.id, false);
  assert.equal(await db.tripCredit.count({ where: { memberProfileId: m7.member.id } }), 0, "TRP-02 — a rejected request creates nothing");
  assert.equal(await db.tripBucket.count({ where: { memberProfileId: m7.member.id } }), 0, "and opens no bucket");

  const a09 = await sell("A09", await buyer("A09"), m7.person.id);
  assert.equal(await ownOf(a09), null, "TRP-09 — the excluded unit earns nothing");

  await pay(a01, "40", "A01-40");
  assert.equal((await ownOf(a01))!.state, "PENDING");
  await pay(a01, "60", "A01-60");
  own = await ownOf(a01);
  assert.equal(`${own!.state}|${own!.qualificationRoute}`, "QUALIFIED|PAYMENT_100", "TRP-14 — Qualified at 100%");
  assert.equal(own!.expiresAt!.getFullYear(), own!.qualifiedAt!.getFullYear() + 1, "expires 12 months on");

  /* ===== TRP-12, TRP-06 — a subdivided unit shares one pool per Member ===== */

  const a10a = await sell("A10A", await buyer("A10A"), m1.person.id);
  assert.ok(await ownOf(a10a));
  const a10b = await sell("A10B", await buyer("A10B"), m1.person.id);
  assert.equal(await ownOf(a10b), null, "TRP-12 — the child shares the parent's pool: no second credit for M1");
  const a10c = await sell("A10C", await buyer("A10C"), m7.person.id);
  assert.ok(await ownOf(a10c), "TRP-06 — a different Member earns on the same unit");
  await pay(a10a, "100", "A10A-100");

  /* ===== REF-01, REF-05, REF-06, REF-03 — the one lifetime Reference Credit ===== */

  const a02 = await sell("A02", await buyer("A02"), m2.person.id);
  await pay(a02, "100", "A02-100");
  const ref1 = await refOf(a02);
  assert.equal(`${ref1?.memberProfileId}|${ref1?.state}`, `${m1.member.id}|QUALIFIED`, "REF-01 — the inviter's Reference Credit");
  const m2Row = await db.memberProfile.findUniqueOrThrow({ where: { id: m2.member.id } });
  assert.equal(m2Row.referenceWinningBookingId, a02, "the winning Booking is kept");
  assert.ok(m2Row.referenceOpportunityConsumedAt);

  const a03 = await sell("A03", await buyer("A03"), m2.person.id);
  await pay(a03, "100", "A03-100");
  assert.equal(await refOf(a03), null, "REF-05 — no second Reference Credit");

  const a04 = await sell("A04", await buyer("A04"), m3.person.id);
  await pay(a04, "100", "A04-100");
  assert.equal((await refOf(a04))?.memberProfileId, m2.member.id, "REF-06 — immediate inviter only");

  const a05 = await sell("A05", m4.person.id, m4.person.id);
  await pay(a05, "100", "A05-100");
  assert.equal((await ownOf(a05))?.state, "QUALIFIED", "TRP-07 — a self-purchase earns an Own-Sale Credit");
  assert.equal(await refOf(a05), null, "REF-03 — but no Reference Credit");
  assert.equal((await db.memberProfile.findUniqueOrThrow({ where: { id: m4.member.id } })).referenceOpportunityConsumedAt, null);

  /* ===== TRP-15, TSK-09 — 3 Own + 2 Reference earns the Trip ===== */

  const a11 = await sell("A11", await buyer("A11"), m9.person.id);
  await pay(a11, "100", "A11-100");
  assert.equal((await refOf(a11))?.memberProfileId, m1.member.id, "a second introduced Member gives M1 a second Reference");
  let reward = await db.tripReward.findFirst({ where: { memberProfileId: m1.member.id } });
  assert.equal(reward, null, "2 Own + 2 Reference is not enough");
  const a06 = await sell("A06", await buyer("A06"), m1.person.id);
  await pay(a06, "100", "A06-100");
  reward = await db.tripReward.findFirstOrThrow({ where: { memberProfileId: m1.member.id } });
  assert.equal(reward.state, "EARNED", "TRP-15 — Earned");
  const allocated = await db.tripCredit.findMany({ where: { bucketId: reward.bucketId } });
  assert.deepEqual(
    allocated.map((c) => `${c.creditType}:${c.state}`).sort(),
    ["OWN_SALE:ALLOCATED", "OWN_SALE:ALLOCATED", "OWN_SALE:ALLOCATED", "REFERENCE:ALLOCATED", "REFERENCE:ALLOCATED"]
  );
  assert.equal(await db.task.count({ where: { recordId: reward.id, purpose: "TRIP_REWARD_FULFILMENT", status: "PENDING" } }), 1, "TSK-09 — one NT03");

  // Fulfilment to Travelled; the credits are then Used forever (TRP-19, TRP-26).
  await assert.rejects(
    bookTripReward({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: reward.id, bookingReference: "TRV-1", bookedOn: today }),
    /Record who travels/
  );
  await recordTripNominee({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: reward.id, recipient: "SPOUSE", recipientName: "Spouse" });
  await bookTripReward({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: reward.id, bookingReference: "TRV-1", bookedOn: today });
  await markTripTravelled({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", rewardId: reward.id, travelledOn: today });
  assert.equal((await db.tripReward.findUniqueOrThrow({ where: { id: reward.id } })).state, "TRAVELLED");
  assert.equal(await db.tripCredit.count({ where: { bucketId: reward.bucketId, state: "USED" } }), 5, "TRP-19 — Used, never reused");

  /* ===== REF-09, REF-10 — a Deactivated inviter's credit is created Held ===== */

  const m8 = await member("8", null, "DEACTIVATED");
  const m5 = await member("5", m8.member.id);
  const a12 = await sell("A12", await buyer("A12"), m5.person.id);
  await pay(a12, "100", "A12-100");
  assert.equal((await refOf(a12))?.state, "HELD", "REF-09 — consumed, created and held");
  await setMemberStatus({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", memberProfileId: m8.member.id, active: true, reason: "Reinstated." });
  assert.equal((await refOf(a12))?.state, "QUALIFIED", "REF-10 — released on reactivation");

  /* ===== REF-11, REF-12 — inviter correction before and after the cut-off ===== */

  await assert.rejects(
    correctInviter({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", memberProfileId: m9.member.id, invitedByMemberId: m7.member.id, reason: "x" }),
    /can no longer be changed/,
    "REF-11"
  );
  assert.ok(await db.auditEvent.findFirst({ where: { entityId: m9.member.id, action: "INVITER_CORRECTION_DENIED" } }), "the refusal is audited");
  const m11 = await member("11", m1.member.id);
  await correctInviter({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", memberProfileId: m11.member.id, invitedByMemberId: m7.member.id, reason: "Wrong inviter keyed." });
  assert.equal((await db.memberProfile.findUniqueOrThrow({ where: { id: m11.member.id } })).invitedByMemberId, m7.member.id, "REF-12");

  /* ===== Project D (3/2/1): backfill, deficiency, Buyback, Change Plot, jobs ===== */

  const D = await project("D");
  for (const label of ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09"]) await plot(D.id, label);
  const vD1 = await approveTrip(
    D.id,
    terms({ tripTotalTarget: 3, tripMinOwnCredits: 2, tripMaxReferenceCredits: 1, tripProgrammeCode: "TRIP-D", tripTermsVersionRef: "TRIP-D-1", excludedPlotIds: [plots.get("D09")!] })
  );
  void vD1;
  const x = await member("X");
  const entries: Record<string, string> = {};
  for (const label of ["D01", "D02", "D03", "D04"]) {
    const id = await sell(label, await buyer(label), x.person.id);
    entries[label] = (await pay(id, "100", `${label}-100`)).entryId;
    entries[`${label}:booking`] = id;
  }
  const rewardX = await db.tripReward.findFirstOrThrow({ where: { memberProfileId: x.member.id } });
  assert.equal(rewardX.state, "EARNED");
  assert.equal((await ownOf(entries["D04:booking"]))?.bucketId, null, "D04 is banked, not allocated");

  // TRP-24 — a used credit loses its qualification; the spare backfills it.
  await correctPaymentReceived({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", entryId: entries.D01, percent: "90", paidOn: today, reference: `${TAG} D01-90`, reason: "Short." });
  assert.equal((await ownOf(entries["D01:booking"]))?.state, "PENDING", "SSOT §99 — back to Pending");
  assert.equal((await db.tripReward.findUniqueOrThrow({ where: { id: rewardX.id } })).state, "EARNED", "backfilled");
  assert.equal((await ownOf(entries["D04:booking"]))?.bucketId, rewardX.bucketId, "with the banked D04");

  // TRP-25 — another one goes and nothing is left: Deficient, NT04.
  await correctPaymentReceived({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", entryId: entries.D02, percent: "90", paidOn: today, reference: `${TAG} D02-90`, reason: "Short." });
  assert.equal((await db.tripReward.findUniqueOrThrow({ where: { id: rewardX.id } })).state, "DEFICIENT");
  assert.equal(await db.task.count({ where: { recordId: rewardX.id, purpose: "TRIP_REWARD_DEFICIENCY", status: "PENDING" } }), 1, "NT04");
  await pay(entries["D02:booking"], "10", "D02-10");
  assert.equal((await db.tripReward.findUniqueOrThrow({ where: { id: rewardX.id } })).state, "EARNED", "whole again once it re-qualifies");

  // BB-02, BB-08 — an Approved Buyback after 25% qualifies; its unwind takes it back.
  const y = await member("Y");
  const yBuyer = await person("Buyer-D05");
  const d05 = await sell("D05", yBuyer.id, y.person.id);
  await pay(d05, "30", "D05-30");
  const arranger = await member("ARR");
  const acq = await createAcquisition({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    type: "BUYBACK",
    sourceBookingId: d05,
    sellerPersonId: yBuyer.id,
    arrangedByType: "MEMBER",
    arrangedByPersonId: arranger.person.id,
    purchaseDate: today,
    remark: "Buyback.",
    schedule: [
      { seq: 1, percent: "25", dueDate: today },
      { seq: 2, percent: "75", dueDate: day(30) },
    ],
  });
  await confirmPaymentGiven({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: acq.acquisitionId, percent: "25", paidOn: today, reference: `${TAG} GIVEN D05` });
  await decideAcquisition({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: acq.acquisitionId, approve: true, note: "ok" });
  assert.equal(`${(await ownOf(d05))!.state}|${(await ownOf(d05))!.qualificationRoute}`, "QUALIFIED|APPROVED_BUYBACK", "BB-02");
  await cancelAcquisitionDeal({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", acquisitionId: acq.acquisitionId, reason: "Unwound." });
  assert.equal((await ownOf(d05))!.state, "PENDING", "BB-08 — the Buyback-only qualification reverses");

  // TRP-10, TRP-22 — Change Plot to an excluded unit reverses the only credit; the empty bucket closes.
  const z = await member("Z");
  const d06 = await sell("D06", await buyer("D06"), z.person.id);
  assert.equal((await db.tripBucket.findFirstOrThrow({ where: { memberProfileId: z.member.id } })).state, "OPEN");
  await submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: d06, toPlotId: plots.get("D09")!, remark: "Moved." });
  await decideChangePlot({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: d06,
    approve: true,
    appliedPercent: "0",
    note: "ok",
    schedule: [
      { seq: 1, percent: "40", dueDate: today },
      { seq: 2, percent: "60", dueDate: day(30) },
    ],
  });
  assert.equal((await ownOf(d06))?.state, "REVERSED", "TRP-10");
  assert.equal((await db.tripBucket.findFirstOrThrow({ where: { memberProfileId: z.member.id } })).state, "CLOSED", "TRP-22");

  // TRP-20, SYS-01 — expiry at 12 months, exactly once.
  const spare = await sell("D07", await buyer("D07"), y.person.id);
  await pay(spare, "100", "D07-100");
  const spareCredit = (await ownOf(spare))!;
  await db.tripCredit.update({ where: { id: spareCredit.id }, data: { expiresAt: day(-1) } });
  await runTripCreditExpiry();
  await runTripCreditExpiry();
  assert.equal((await ownOf(spare))!.state, "EXPIRED", "TRP-20");
  assert.equal(await db.tripEvent.count({ where: { creditId: spareCredit.id, action: "CREDIT_EXPIRED" } }), 1, "SYS-01 — once");

  // TRP-23, TSK-11, SYS-02 — the programme closes: no post-cut-off credit, one NT05, expiry at the deadline.
  await approveTrip(
    D.id,
    terms({ tripTotalTarget: 3, tripMinOwnCredits: 2, tripMaxReferenceCredits: 1, tripProgrammeCode: "TRIP-D", tripTermsVersionRef: "TRIP-D-2", tripCutOffAt: day(-1), tripWindDownAt: day(5) })
  );
  const late = await sell("D08", await buyer("D08"), z.person.id);
  assert.equal(await ownOf(late), null, "TRP-23 — approved after the cut-off: no credit");
  const yBucket = await db.tripBucket.findFirstOrThrow({ where: { memberProfileId: y.member.id, state: "OPEN" } });
  await runTripWindDown();
  await runTripWindDown();
  assert.equal(await db.task.count({ where: { recordId: yBucket.id, purpose: "TRIP_BUCKET_WIND_DOWN" } }), 1, "SYS-02 — one NT05");
  await db.projectCommissionVersion.updateMany({ where: { projectId: D.id, status: "ACTIVE" }, data: { tripWindDownAt: day(-1) } });
  await runTripWindDown();
  assert.equal((await db.tripBucket.findUniqueOrThrow({ where: { id: yBucket.id } })).state, "EXPIRED", "past the deadline");

  await purgeCheckData(db, TAG);
  console.log("trip.check.ts OK");
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
