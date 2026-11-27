// Confidential payment trial — service checks against the LOCAL trial database (revised brief §9).
// Every record is tagged ZZ-PCT and purged again. Run: npm run trial:check
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { purgeCheckData } from "./check-cleanup.ts";
import { ensureActiveCommissionVersion } from "./seed-commission.ts";
import { can } from "@/lib/security/permissions";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { decideChangePlot, submitChangePlot } from "@/lib/services/change-plot-service";
import { correctPaymentReceived, reversePaymentReceived } from "@/lib/services/payment-service";
import { fromUnits, openingBalance } from "@/lib/domain/payment-percent";
import { formatIstDate } from "@/lib/tasks";
import { reconcile } from "@/lib/migration/reconcile";
import {
  approveVerifiedPayment,
  rejectPaymentVerification,
  requestPaymentVerification,
} from "@/lib/services/payment-verification-service";

assertCheckDatabase();
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "")) throw new Error("Local trial database only.");

const db = new PrismaClient();
const TAG = "ZZ-PCT";
const CRM = `${TAG}-CRM`;
const MD = `${TAG}-MD`;
const key = () => crypto.randomUUID();
const ref = () => `PV-${crypto.randomUUID()}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const md = { actorRef: MD, actorRole: "MD" };

async function booking(id: string) {
  return db.booking.findUniqueOrThrow({
    where: { id },
    include: { commissions: { where: { isCurrent: true } }, paymentEntries: true },
  });
}
const received = async (id: string) => (await booking(id)).paymentReceivedPercent.toString();
const approve = async (bookingId: string, percent: string, expectedReceived: string, extra: { requestId?: string; reference?: string; idempotencyKey?: string; plotId?: string } = {}) =>
  approveVerifiedPayment({ ...md, plotId: extra.plotId ?? (await booking(bookingId)).plotId, idempotencyKey: extra.idempotencyKey ?? key(), bookingId, percent, paidOn: new Date(), reference: extra.reference ?? ref(), expectedReceived, requestId: extra.requestId ?? null });
const claim = (bookingId: string, reference = ref(), note?: string) =>
  requestPaymentVerification({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId, claimedPaidOn: new Date(), mode: "UPI", reference, note });

/** A fresh approved 4 × 25 Booking, due today, +30, +60, +90 days (or `dues`), sold by the seeded Member. */
async function makeBooking(projectId: string, memberPersonId: string, n: number, opts: { dues?: number[]; bookedDaysAgo?: number } = {}) {
  const plot = await db.plot.create({
    data: { projectId, plotType: "RESIDENTIAL", plotNumber: `${TAG}-${n}`, areaSqFt: "1350", areaSqYd: "150", areaSqM: "125.419", status: "AVAILABLE", restriction: "NONE" },
  });
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plot.id,
    parties: [{ personId: "", role: "PRIMARY", fullName: `${TAG} Buyer ${n}`, mobile: `91000009${String(n).padStart(2, "0")}` }],
    soldByType: "MEMBER",
    soldByPersonId: memberPersonId,
    bookingDate: day(-(opts.bookedDaysAgo ?? 0)),
    bookingDateReason: opts.bookedDaysAgo ? "check: booked earlier" : undefined,
    schedule: (opts.dues ?? [0, 30, 60, 90]).map((d, i) => ({ seq: i + 1, percent: "25", dueDate: day(d) })),
  });
  await decideBookingRequest({ ...md, idempotencyKey: key(), bookingId: submitted.bookingId, approve: true, note: "check" });
  return submitted.bookingId;
}
const followUpOf = (bookingId: string) =>
  db.task.findFirst({ where: { recordId: bookingId, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" } });
const instalments = async (bookingId: string) =>
  (await db.paymentInstalment.findMany({
    where: { scheduleVersion: { bookingId, status: "ACTIVE" } },
    orderBy: { seq: "asc" },
  })).map((i) => i.receivedPercent.toString());

async function main() {
  await purgeCheckData(db, TAG);

  // --- authorisation: the calculator / approval is MD's alone, even if ticked
  for (const role of ["ACCOUNTS", "CRM", "PC"] as const) {
    assert.equal(can(role, "PAYMENT_CALCULATOR_APPROVE", ["PAYMENT_CALCULATOR_APPROVE"]), false, role);
  }
  assert.equal(can("MD", "PAYMENT_CALCULATOR_APPROVE", []), true);
  assert.equal(can("PC", "PAYMENT_VERIFICATION_REQUEST", []), false);

  // --- a 4 × 25 Booking under a Member, so a 25% commission milestone exists
  const project = await db.project.create({ data: { projectCode: `${TAG}-P`, name: `${TAG} Project`, type: "RESIDENTIAL", status: "ACTIVE" } });
  await ensureActiveCommissionVersion(db, project.id, MD);
  const member = await db.memberProfile.findUniqueOrThrow({ where: { memberId: "MM0217" } });
  const plot = await db.plot.create({
    data: { projectId: project.id, plotType: "RESIDENTIAL", plotNumber: `${TAG}-1`, areaSqFt: "1350", areaSqYd: "150", areaSqM: "125.419", status: "AVAILABLE", restriction: "NONE" },
  });
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plot.id,
    parties: [{ personId: "", role: "PRIMARY", fullName: `${TAG} Buyer`, mobile: "9100000901" }],
    soldByType: "MEMBER",
    soldByPersonId: member.personId,
    bookingDate: new Date(),
    schedule: [0, 30, 60, 90].map((d, i) => ({ seq: i + 1, percent: "25", dueDate: day(d) })),
  });
  const id = submitted.bookingId;
  await decideBookingRequest({ ...md, idempotencyKey: key(), bookingId: id, approve: true, note: "check" });
  assert.equal(await received(id), "0");

  // --- a claim is not a payment: nothing moves, MD gets one task
  await assert.rejects(claim(id, ref(), "paid 50,000 by UPI"), /don't write any rupee amount/);
  const reference = ref();
  const first = await claim(id, reference, "Customer says paid by UPI");
  await assert.rejects(claim(id, reference), /already waiting for MD/);
  assert.equal(await received(id), "0");
  const pendingCommission = (await booking(id)).commissions.find((c) => c.type === "DIRECT")!;
  assert.equal(pendingCommission.eligibility, "MILESTONE_PENDING");
  const mdTask = () => db.task.findFirst({ where: { recordId: id, purpose: "PAYMENT_VERIFICATION", status: "PENDING" } });
  assert.ok(await mdTask(), "MD verification task raised");

  // --- only MD approves
  await assert.rejects(
    approveVerifiedPayment({ plotId: plot.id, actorRef: CRM, actorRole: "CRM", idempotencyKey: key(), bookingId: id, percent: "10", paidOn: new Date(), reference: ref(), expectedReceived: "0" }),
    /Only MD/
  );

  await assert.rejects(approve(id, "1", "0", { plotId: "wrong" }), /plot changed/);
  await assert.rejects(approve(id, "1", "0", { reference: "Rs 90000" }), /tracking ID/);
  await assert.rejects(approve(id, "1", "10"), /changed since you opened/);
  // --- 24.9999 never qualifies for the 25% milestone
  await approve(id, "24.9999", "0", { requestId: first.requestId, reference });
  assert.equal(await received(id), "24.9999");
  const linked = await db.paymentVerificationRequest.findUniqueOrThrow({ where: { id: first.requestId } });
  assert.equal(linked.status, "APPROVED");
  assert.ok(linked.paymentEntryId);
  assert.equal(await mdTask(), null, "MD task closed once nothing waits");
  assert.equal((await booking(id)).commissions.find((c) => c.type === "DIRECT")!.eligibility, "MILESTONE_PENDING");

  // --- approving the same claim again replays; it never credits twice
  await approve(id, "24.9999", "0", { requestId: first.requestId, reference });
  assert.equal(await received(id), "24.9999");
  assert.equal((await booking(id)).paymentEntries.length, 1);

  // --- stale: the calculator worked from 0, but 24.9999 is verified now
  await assert.rejects(approve(id, "1", "0"), /changed since you opened it/);

  // --- two approvals at once from the same starting point: one lands
  const race = await Promise.allSettled([approve(id, "0.0001", "24.9999"), approve(id, "0.0001", "24.9999")]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await received(id), "25");
  // Exactly 25: the milestone is reached; what follows is the engine's own rule.
  const at25 = (await booking(id)).commissions.find((c) => c.type === "DIRECT")!;
  assert.notEqual(at25.eligibility, "MILESTONE_PENDING");

  // --- a rejected claim moves nothing and cannot be approved later
  const second = await claim(id);
  await assert.rejects(rejectPaymentVerification({ ...md, idempotencyKey: key(), requestId: second.requestId, reason: "Rs 5000 short" }), /don't write any rupee amount/);
  await assert.rejects(rejectPaymentVerification({ actorRef: CRM, actorRole: "CRM", idempotencyKey: key(), requestId: second.requestId, reason: "no" }), /Only MD/);
  await rejectPaymentVerification({ ...md, idempotencyKey: key(), requestId: second.requestId, reason: "Not in the bank statement" });
  assert.equal(await received(id), "25");
  await assert.rejects(approve(id, "5", "25", { requestId: second.requestId, reference: `PV-${second.requestId}` }), /already rejected/);

  const raceBooking = await makeBooking(project.id, member.personId, 20);
  const raceRef = ref();
  const raceClaim = await claim(raceBooking, raceRef);
  const decisions = await Promise.allSettled([
    approve(raceBooking, "5", "0", { requestId: raceClaim.requestId, reference: raceRef }),
    rejectPaymentVerification({ ...md, idempotencyKey: key(), requestId: raceClaim.requestId, reason: "Receipt not verified" }),
  ]);
  assert.equal(decisions.filter((d) => d.status === "fulfilled").length, 1);
  const decision = await db.paymentVerificationRequest.findUniqueOrThrow({ where: { id: raceClaim.requestId } });
  assert.equal(await received(raceBooking), decision.status === "APPROVED" ? "5" : "0");
  assert.equal(Boolean(decision.paymentEntryId), decision.status === "APPROVED");

  // --- one credit crossing instalments: 30 lands as 25 on #2 and 5 on #3
  await approve(id, "30", "25");
  const crossing = (await booking(id)).paymentEntries.find((e) => e.percent.eq(30))!;
  assert.deepEqual(crossing.allocations, [{ seq: 2, percent: "25.00000000" }, { seq: 3, percent: "5.00000000" }]);

  // --- past 100 is refused; nothing is capped
  await assert.rejects(approve(id, "46", "55"), /cannot go above 100%/);
  assert.equal(await received(id), "55");

  // --- reversal: the correction keeps the original, lowers progress, reopens follow-up
  const followUp = () => db.task.findFirst({ where: { recordId: id, purpose: "PAYMENT_FOLLOW_UP", status: "PENDING" } });
  await approve(id, "45", "55");
  assert.equal((await booking(id)).status, "PAYMENT_COMPLETED");
  assert.equal(await followUp(), null, "follow-up closed at 100");
  await assert.rejects(claim(id), /100% paid|fully paid/);
  const last = (await booking(id)).paymentEntries.find((e) => e.percent.eq(45))!;
  await correctPaymentReceived({ ...md, idempotencyKey: key(), entryId: last.id, percent: "40", paidOn: new Date(), reference: ref(), reason: "Cheque returned in part" });
  const after = await booking(id);
  assert.equal(after.paymentReceivedPercent.toString(), "95");
  assert.equal(after.status, "BOOKED");
  assert.equal(after.paymentEntries.find((e) => e.id === last.id)!.status, "SUPERSEDED", "original kept, marked corrected");
  assert.ok(await followUp(), "follow-up reopened after the reversal");

  // --- audit 3: the follow-up is raised at approval, in percentages, on instalment 1
  const adv = await makeBooking(project.id, member.personId, 2);
  assert.equal((await followUpOf(adv))?.latestResult, "25% left to pay · Instalment 1 (of 25%) · 0% paid so far");

  // --- audit 2: an advance payment pays future instalments before they are due
  await approve(adv, "60", "0");
  assert.deepEqual(await instalments(adv), ["25", "25", "10", "0"], "oldest first, across instalments");
  const advFollowUp = await followUpOf(adv);
  assert.equal(advFollowUp?.latestResult, "15% left to pay · Instalment 3 (of 25%) · 60% paid so far");
  const third = await db.paymentInstalment.findFirstOrThrow({ where: { scheduleVersion: { bookingId: adv, status: "ACTIVE" }, seq: 3 } });
  assert.equal(advFollowUp?.dueAt.getTime(), third.dueDate.getTime(), "the follow-up moves to the next unpaid instalment's own due date");

  // --- audit 2: a claim whose reference is already on a verified payment is refused
  const usedRef = (await db.paymentReceivedEntry.findFirstOrThrow({ where: { bookingId: adv }, include: { externalReference: true } })).externalReference.rawValue;
  await assert.rejects(claim(adv, usedRef), /already saved as a payment/);

  // --- audit 2: corrections — up, down past a milestone (commission steps back), and over 100%
  const fix = await makeBooking(project.id, member.personId, 3);
  await approve(fix, "25", "0");
  const reached = (await booking(fix)).commissions.find((c) => c.type === "DIRECT")!;
  assert.notEqual(reached.eligibility, "MILESTONE_PENDING", "exactly 25% reaches the 25% milestone");
  const firstEntry = (await booking(fix)).paymentEntries.find((e) => e.status === "CONFIRMED")!;
  await correctPaymentReceived({ ...md, idempotencyKey: key(), entryId: firstEntry.id, percent: "20", paidOn: new Date(), reference: ref(), reason: "Part of the cheque returned" });
  assert.equal(await received(fix), "20");
  const lost = (await booking(fix)).commissions.find((c) => c.type === "DIRECT")!;
  assert.equal(lost.eligibility, "MILESTONE_PENDING", "below 25% the existing engine puts the milestone back to pending");
  const secondEntry = (await booking(fix)).paymentEntries.find((e) => e.status === "CONFIRMED")!;
  await assert.rejects(
    correctPaymentReceived({ ...md, idempotencyKey: key(), entryId: secondEntry.id, percent: "101", paidOn: new Date(), reference: ref(), reason: "typo" }),
    /decimal places|above 100%|cannot exceed|outstanding schedule/
  );
  await correctPaymentReceived({ ...md, idempotencyKey: key(), entryId: secondEntry.id, percent: "30", paidOn: new Date(), reference: ref(), reason: "Second cheque cleared" });
  assert.equal(await received(fix), "30");
  assert.equal(
    (await db.paymentReceivedEntry.count({ where: { bookingId: fix } })),
    3,
    "every correction keeps the entry it replaced"
  );

  // --- audit 4: a pending claim moves no commission, trip or royalty record
  const before = await db.commissionRecord.findMany({ where: { bookingId: fix }, orderBy: { id: "asc" } });
  const trips = await db.tripCredit.count({ where: { sourceBookingId: fix } });
  await claim(fix, ref());
  assert.deepEqual(await db.commissionRecord.findMany({ where: { bookingId: fix }, orderBy: { id: "asc" } }), before);
  assert.equal(await db.tripCredit.count({ where: { sourceBookingId: fix } }), trips);

  // --- owner review 1: eight places are kept, so thirds add up to exactly 100%; staff read two
  const fine = await makeBooking(project.id, member.personId, 4);
  await approve(fine, "33.33333333", "0");
  await approve(fine, "33.33333333", "33.33333333");
  assert.equal(await received(fine), "66.66666666");
  assert.match((await followUpOf(fine))?.latestResult ?? "", /· 66\.66% paid so far$/, "paid rounds down to two places");
  await assert.rejects(approve(fine, "0.000000001", "66.66666666"), /8 decimal places/);
  await approve(fine, "33.33333334", "66.66666666");
  assert.equal(await received(fine), "100");
  assert.equal((await booking(fine)).status, "PAYMENT_COMPLETED");

  // --- owner review 3: a late instalment stays the follow-up's subject when a later one falls due
  const late = await makeBooking(project.id, member.personId, 5, { dues: [-40, -10, 30, 60], bookedDaysAgo: 60 });
  const lateLines = await db.paymentInstalment.findMany({ where: { scheduleVersion: { bookingId: late, status: "ACTIVE" } }, orderBy: { seq: "asc" } });
  let lateTask = await followUpOf(late);
  assert.equal(lateTask?.latestResult, `50% late · Instalments 1–2 · late since ${formatIstDate(lateLines[0].dueDate)} · 0% paid so far`);
  assert.equal(lateTask?.dueAt.getTime(), lateLines[0].dueDate.getTime(), "due on the oldest unpaid instalment, not the newest");
  await approve(late, "30", "0");
  lateTask = await followUpOf(late);
  assert.equal(lateTask?.latestResult, `20% late · Instalment 2 · late since ${formatIstDate(lateLines[1].dueDate)} · 30% paid so far`);
  assert.equal(lateTask?.dueAt.getTime(), lateLines[1].dueDate.getTime());

  // --- owner review 2: MD reverses a whole payment; the entry and its history stay
  const rev = await makeBooking(project.id, member.personId, 6);
  await approve(rev, "25", "0");
  await approve(rev, "75", "25");
  assert.equal((await booking(rev)).status, "PAYMENT_COMPLETED");
  const bounced = (await booking(rev)).paymentEntries.find((e) => e.percent.eq(75))!;
  await assert.rejects(reversePaymentReceived({ actorRef: CRM, actorRole: "ACCOUNTS", idempotencyKey: key(), entryId: bounced.id, reason: "x" }), /Only MD/);
  await assert.rejects(reversePaymentReceived({ ...md, idempotencyKey: key(), entryId: bounced.id, reason: " " }), /compulsory reason/);
  await reversePaymentReceived({ ...md, idempotencyKey: key(), entryId: bounced.id, reason: "Cheque bounced" });
  const afterReverse = await booking(rev);
  assert.equal(afterReverse.paymentReceivedPercent.toString(), "25");
  assert.equal(afterReverse.status, "BOOKED", "Payment Completed steps back to Booked");
  assert.equal(afterReverse.paymentEntries.find((e) => e.id === bounced.id)!.status, "REVERSED", "the entry is kept, marked reversed");
  assert.equal(afterReverse.paymentEntries.length, 2, "nothing deleted, nothing invented");
  assert.deepEqual(await instalments(rev), ["25", "0", "0", "0"]);
  assert.ok(await followUpOf(rev), "the follow-up is back");
  await assert.rejects(reversePaymentReceived({ ...md, idempotencyKey: key(), entryId: bounced.id, reason: "again" }), /already corrected or reversed/);
  const firstPaid = afterReverse.paymentEntries.find((e) => e.percent.eq(25))!;
  await reversePaymentReceived({ ...md, idempotencyKey: key(), entryId: firstPaid.id, reason: "Transfer returned by the bank" });
  assert.equal(await received(rev), "0", "a full reversal can reach 0%");
  assert.equal((await booking(rev)).commissions.find((c) => c.type === "DIRECT")!.eligibility, "MILESTONE_PENDING", "below 25% the milestone steps back");
  assert.ok(await db.auditEvent.findFirst({ where: { entityId: rev, action: "PAYMENT_RECEIVED_REVERSED" } }));
  assert.equal(await db.bookingEvent.count({ where: { bookingId: rev, action: "PAYMENT_REVERSED" } }), 2);

  // --- owner review 6: an opening balance made by Change Plot — no entry is invented for it
  const moved = await makeBooking(project.id, member.personId, 7, { dues: [-20, 30, 60, 90], bookedDaysAgo: 30 });
  await approve(moved, "20", "0");
  await approve(moved, "10", "20");
  const bigger = await db.plot.create({
    data: { projectId: project.id, plotType: "RESIDENTIAL", plotNumber: `${TAG}-7B`, areaSqFt: "1800", areaSqYd: "200", areaSqM: "167.225", status: "AVAILABLE", restriction: "NONE" },
  });
  await submitChangePlot({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: moved, toPlotId: bigger.id, remark: "Moved to a bigger plot" });
  await decideChangePlot({
    idempotencyKey: key(),
    actorRef: `${TAG}-ACC`,
    actorRole: "ACCOUNTS",
    bookingId: moved,
    approve: true,
    note: "Checked in the accounts",
    appliedPercent: "27.5",
    schedule: [
      { seq: 1, percent: "30", dueDate: day(-20) },
      { seq: 2, percent: "35", dueDate: day(30) },
      { seq: 3, percent: "35", dueDate: day(60) },
    ],
  });
  const movedAt = (await db.paymentScheduleVersion.findFirstOrThrow({ where: { bookingId: moved, reason: { startsWith: "Change Plot" } } })).createdAt;
  // As both screens count it: only entries recorded after the Change Plot.
  const opening = async () => {
    const b = await booking(moved);
    return fromUnits(
      openingBalance(
        b.paymentReceivedPercent.toString(),
        b.paymentEntries.filter((e) => e.status === "CONFIRMED" && e.recordedAt >= movedAt).map((e) => e.percent.toString())
      )
    );
  };
  assert.equal(await received(moved), "27.5");
  assert.equal((await booking(moved)).paymentEntries.length, 2, "no entry invented for the carried 27.5%");
  assert.equal(await opening(), "27.5");
  assert.deepEqual(await instalments(moved), ["27.5", "0", "0"]);
  assert.match((await followUpOf(moved))?.latestResult ?? "", /^2\.5% late · Instalment 1 · late since .+ · 27\.5% paid so far$/);
  const oldPlotEntry = (await booking(moved)).paymentEntries[0];
  await assert.rejects(reversePaymentReceived({ ...md, idempotencyKey: key(), entryId: oldPlotEntry.id, reason: "x" }), /before a Change Plot/);
  await approve(moved, "2.5", "27.5");
  assert.deepEqual(await instalments(moved), ["30", "0", "0"]);
  assert.equal(await opening(), "27.5", "a new payment never moves the opening balance");
  const topUp = (await booking(moved)).paymentEntries.find((e) => e.percent.eq("2.5"))!;
  await reversePaymentReceived({ ...md, idempotencyKey: key(), entryId: topUp.id, reason: "UPI reversed by the bank" });
  assert.equal(await received(moved), "27.5");
  assert.equal(await opening(), "27.5");
  await approve(moved, "72.5", "27.5");
  assert.equal((await booking(moved)).status, "PAYMENT_COMPLETED");
  assert.equal(await followUpOf(moved), null, "follow-up closed at 100%");
  // The go-live reconciliation counts the carried % plus the entries since — no exception.
  const movedNumber = (await booking(moved)).bookingNumber;
  const report = await reconcile();
  assert.ok(!report.rules.some((r) => r.exceptions.some((e) => e.record === movedNumber)), "a Change Plot booking reconciles");

  // --- no monetary column on anything this feature added
  const columns = await db.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name IN ('PaymentVerificationRequest', 'CalculatorPriceBasis') OR (table_name = 'Task' AND column_name = 'promisedOn')`;
  assert.ok(columns.length > 0);
  for (const { column_name } of columns) assert.ok(!/price|amount|rupee|value|rate|paise|inr/i.test(column_name), column_name);

  // --- audit trail for claims
  assert.ok(await db.auditEvent.findFirst({ where: { entityId: first.requestId, action: "PAYMENT_CLAIM_APPROVED" } }));
  assert.ok(await db.auditEvent.findFirst({ where: { entityId: second.requestId, action: "PAYMENT_CLAIM_REJECTED" } }));

  await purgeCheckData(db, TAG);
  await db.project.deleteMany({ where: { projectCode: `${TAG}-P` } });
  console.log("payment-trial.check: claims, MD-only approval, thresholds, replay, staleness, races, rejection, crossing, ceiling, corrections, 8-place precision, late follow-up, full reversal, Change Plot opening balance and schema checks pass.");
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await purgeCheckData(db, TAG).catch(() => {});
  })
  .finally(() => db.$disconnect());
