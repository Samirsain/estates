// Release controls — bank-account uniqueness, staff / relative conflict,
// Recovery circumvention, third-party payer, merge de-duplication.
// SSOT §22, §92, §94, §95, §100; Change Pack §15, §55, §57, §58, §65 (NT08,
// NT09), §78, §87; UAT CTL-04/05/08/09/10/11, SYS-11, COR-08 — against the
// real database and the real commands.
// Run: npm run controls:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { decideBankDetails, enterBankDetails } from "@/lib/services/bank-service";
import { markCommissionPaid } from "@/lib/services/commission-service";
import { clearRecovery } from "@/lib/services/recovery-service";
import {
  decideCircumvention,
  decideStaffConflict,
  declareStaffRelative,
  endStaffRelative,
} from "@/lib/services/control-review-service";
import { decidePersonMerge, requestPersonMerge } from "@/lib/services/merge-service";
import { CommandError } from "@/lib/services/command";
import { encryptSensitive } from "@/lib/security/identity";

const db = new PrismaClient();
const TAG = "ZZ-CTL";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;
const ADMIN = `${TAG}-ADMIN`;
const MD = `${TAG}-MD`;
const STAFF_REF = `${TAG}-STF`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const today = new Date();
// Mobiles nobody else in the database uses, so only the shares made here match.
const mobile = (n: number) => `90${String(Date.now()).slice(-6)}${String(n).padStart(2, "0")}`;

async function refused(work: () => Promise<unknown>, text: RegExp) {
  await assert.rejects(work, (e: unknown) => e instanceof CommandError && text.test(e.message));
}

async function cleanup() {
  await db.staffAccount.deleteMany({ where: { staffAccountId: { startsWith: TAG } } });
  await purgeCheckData(db, TAG);
}

async function person(name: string, phone: string, extra: { addressLine?: string; city?: string } = {}) {
  const p = await db.person.create({
    data: {
      fullName: `${TAG} ${name}`,
      primaryMobile: phone,
      ...extra,
      aadhaarCipher: encryptSensitive(`4${phone}00`.slice(0, 12)),
      aadhaarLastFour: phone.slice(-4),
      aadhaarStatus: "AVAILABLE",
    },
  });
  await db.bankDetail.create({
    data: {
      personId: p.id,
      accountHolder: name,
      bankName: "Test Bank",
      accountCipher: encryptSensitive(`66${phone}`),
      accountLastFour: phone.slice(-4),
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
async function sale(suffix: string, buyerId: string, sellerId: string) {
  const plot = await db.plot.create({
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
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plot.id,
    parties: [{ personId: buyerId, role: "PRIMARY" }],
    soldByType: "MEMBER",
    soldByPersonId: sellerId,
    bookingDate: today,
    schedule: [
      { seq: 1, percent: "40", dueDate: today },
      { seq: 2, percent: "60", dueDate: day(30) },
    ],
  });
  await decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: submitted.bookingId, approve: true, note: "Verified." });
  return submitted.bookingId;
}

const pay = (bookingId: string, percent: string, ref: string, payer?: { payerName?: string; payerReference?: string }) =>
  confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: today,
    reference: `${TAG} ${ref}`,
    ...payer,
  });

const direct = (bookingId: string) =>
  db.commissionRecord.findFirstOrThrow({ where: { bookingId, type: "DIRECT", isCurrent: true } });
const pendingTasks = (recordId: string, purpose: string) =>
  db.task.count({ where: { recordId, purpose, status: "PENDING" } });

async function main() {
  await cleanup();
  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { status: "PUBLISHED" } }, commissionVersions: { some: { status: "ACTIVE" } } },
  });
  projectId = project.id;
  const buyer = await person("Buyer", mobile(1));

  // ---------------------------------------------------- CTL-08/09, SYS-11
  const holderA = await db.person.create({ data: { fullName: `${TAG} Holder A`, primaryMobile: mobile(2) } });
  const holderB = await db.person.create({ data: { fullName: `${TAG} Holder B`, primaryMobile: mobile(3) } });
  const account = { accountHolder: "A and B", bankName: "Test Bank", branchName: "MI Road", accountNumber: "123456789012" };
  await enterBankDetails({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: holderA.id, ...account, ifsc: "SBIN0000001" });
  // The same account at another branch of the same bank is the same account.
  await refused(
    () => enterBankDetails({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", personId: holderB.id, ...account, ifsc: "SBIN0009999" }),
    /already verified for .*Holder A/
  );
  assert.equal(await db.bankDetail.count({ where: { personId: holderB.id } }), 0, "CTL-08: no silent second verification");

  const joint = await enterBankDetails({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: holderB.id,
    ...account,
    ifsc: "SBIN0000001",
    jointAccountProof: "Passbook first page names both holders",
  });
  assert.equal(joint.jointExceptionPending, true);
  const pendingJoint = await db.bankDetail.findUniqueOrThrow({ where: { id: joint.bankDetailId } });
  assert.equal(pendingJoint.status, "PENDING", "CTL-09: the exception waits for its own approval");
  assert.equal(await pendingTasks(holderB.id, "BANK_VERIFICATION"), 1);
  await refused(
    () => decideBankDetails({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bankDetailId: joint.bankDetailId, approve: true, note: "Self." }),
    /different staff account/
  );
  await decideBankDetails({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bankDetailId: joint.bankDetailId, approve: true, note: "Proof checked." });
  assert.equal((await db.bankDetail.findUniqueOrThrow({ where: { id: joint.bankDetailId } })).status, "VERIFIED");
  assert.equal(
    await db.auditEvent.count({ where: { entityId: holderB.id, action: "BANK_JOINT_EXCEPTION_APPROVED" } }),
    1,
    "CTL-09: the exception is audited"
  );
  console.log("  ✓ CTL-08/09, SYS-11 — one verified account = one Person; joint accounts only by a separate approval");

  // ------------------------------------------------------- CTL-10/11 NT09
  const staffPerson = await person("Staff", mobile(4));
  await db.staffAccount.create({ data: { staffAccountId: STAFF_REF, personId: staffPerson.id, role: "ACCOUNTS", passwordHash: "x" } });
  const relative = await person("Relative", mobile(5));
  const relMember = await member("REL", relative.id);
  await refused(
    () => declareStaffRelative({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", staffPersonId: staffPerson.id, relativePersonId: relative.id, relation: "SPOUSE" }),
    /Admin or MD/
  );
  const declared = await declareStaffRelative({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    staffPersonId: staffPerson.id,
    relativePersonId: relative.id,
    relation: "SPOUSE",
  });

  const relBooking = await sale("REL", buyer.id, relative.id);
  await pay(relBooking, "40", "REL-40");
  let record = await direct(relBooking);
  assert.equal(record.eligibility, "ON_HOLD");
  assert.equal(record.holdReason, "STAFF_CONFLICT_REVIEW", "CTL-10: the relative's Direct waits for MD");
  const review = await db.staffConflictReview.findUniqueOrThrow({ where: { recordKind_recordId: { recordKind: "Commission", recordId: record.id } } });
  assert.deepEqual(review.staffPersonIds, [staffPerson.id]);
  assert.equal(await pendingTasks(review.id, "STAFF_CONFLICT_REVIEW"), 1, "NT09 raised for MD");

  // CTL-11 — the conflicted staff user can neither decide nor process it.
  await refused(
    () => decideStaffConflict({ idempotencyKey: key(), actorRef: STAFF_REF, actorRole: "MD", reviewId: review.id, approve: true, note: "Mine." }),
    /another staff account/
  );
  await refused(
    () =>
      markCommissionPaid({
        idempotencyKey: key(),
        actorRef: STAFF_REF,
        actorRole: "ACCOUNTS",
        recordId: record.id,
        early: false,
        paidOn: today,
        reference: `${TAG} SELF-PAY`,
        remarks: "",
      }),
    /another staff account/
  );
  assert.equal(
    await db.auditEvent.count({ where: { actorRef: STAFF_REF, action: "CONFLICTED_ACTION_DENIED" } }),
    2,
    "CTL-11: both refusals audited"
  );
  await refused(
    () => decideStaffConflict({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", reviewId: review.id, approve: true, note: "Admin." }),
    /Only MD/
  );
  await decideStaffConflict({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", reviewId: review.id, approve: true, note: "Disclosed; arm's-length sale." });
  record = await direct(relBooking);
  assert.equal(record.eligibility, "READY", "released once MD approves");
  assert.equal(await pendingTasks(review.id, "STAFF_CONFLICT_REVIEW"), 0);

  // The staff Person's own benefit is conflicted too.
  await member("STF", staffPerson.id);
  const staffBooking = await sale("STF", buyer.id, staffPerson.id);
  await pay(staffBooking, "40", "STF-40");
  assert.equal((await direct(staffBooking)).holdReason, "STAFF_CONFLICT_REVIEW");
  // A declaration ended before MD decided cancels the review and releases the benefit.
  const second = await person("Second Relative", mobile(10));
  await member("REL2", second.id);
  const secondDecl = await declareStaffRelative({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    staffPersonId: staffPerson.id,
    relativePersonId: second.id,
    relation: "SIBLING",
  });
  const rel2Booking = await sale("REL2", buyer.id, second.id);
  await pay(rel2Booking, "40", "REL2-40");
  assert.equal((await direct(rel2Booking)).holdReason, "STAFF_CONFLICT_REVIEW");
  await endStaffRelative({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", declarationId: secondDecl.declarationId, reason: "Declared in error." });
  const rel2Review = await db.staffConflictReview.findUniqueOrThrow({
    where: { recordKind_recordId: { recordKind: "Commission", recordId: (await direct(rel2Booking)).id } },
  });
  assert.equal(rel2Review.status, "CANCELLED", "an undecided review closes when the declaration ends");
  assert.equal(await pendingTasks(rel2Review.id, "STAFF_CONFLICT_REVIEW"), 0);
  assert.equal((await direct(rel2Booking)).eligibility, "READY");

  // An ended declaration stops new reviews; what MD decided stays.
  await endStaffRelative({ idempotencyKey: key(), actorRef: ADMIN, actorRole: "ADMIN", declarationId: declared.declarationId, reason: "Divorce recorded." });
  assert.equal((await db.staffConflictReview.findUniqueOrThrow({ where: { id: review.id } })).status, "APPROVED");
  void relMember;
  console.log("  ✓ CTL-10/11 — staff and declared relatives wait for MD; the conflicted user cannot decide or pay");

  // ---------------------------------------------------- CTL-04/05 NT08
  const debtorPhone = mobile(6);
  const debtor = await person("Debtor", debtorPhone, { addressLine: "12, Shanti Nagar", city: "Jaipur" });
  await member("DEBT", debtor.id);
  const debtBooking = await sale("DEBT", buyer.id, debtor.id);
  const debtRecord = await direct(debtBooking);
  const recovery = await db.recovery.create({
    data: {
      recoveryNo: `${TAG}-REC-1`,
      personId: debtor.id,
      commissionRecordId: debtRecord.id,
      noticeOn: today,
      dueOn: new Date(today.getTime() + 15 * 86_400_000),
      reference: `${TAG} ACC-REC-1`,
      reason: "Paid Direct became invalid.",
      openedByRef: ACC,
    },
  });

  // Same mobile as the debtor.
  const sameMobile = await person("Same Mobile", debtorPhone);
  await member("MOB", sameMobile.id);
  const mobBooking = await sale("MOB", buyer.id, sameMobile.id);
  await pay(mobBooking, "40", "MOB-40");
  const mobRecord = await direct(mobBooking);
  assert.equal(mobRecord.holdReason, "RECOVERY_CIRCUMVENTION_REVIEW", "CTL-04: held, not denied");
  assert.equal(mobRecord.payment, "NOT_PAID");
  const mobReview = await db.circumventionReview.findUniqueOrThrow({
    where: { subjectPersonId_recoveryId: { subjectPersonId: sameMobile.id, recoveryId: recovery.id } },
  });
  assert.deepEqual(mobReview.indicators, ["MOBILE"]);
  assert.equal(await pendingTasks(mobReview.id, "RECOVERY_CIRCUMVENTION_REVIEW"), 1, "NT08 raised for Accounts");
  await refused(
    () => decideCircumvention({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", reviewId: mobReview.id, clear: true, reason: "x" }),
    /Accounts or MD/
  );
  await refused(
    () => decideCircumvention({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", reviewId: mobReview.id, clear: true, reason: " " }),
    /reason/
  );
  await decideCircumvention({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", reviewId: mobReview.id, clear: true, reason: "Shared family phone; separate earner." });
  assert.equal((await direct(mobBooking)).eligibility, "READY", "CTL-05: cleared releases the hold");
  assert.equal(await db.auditEvent.count({ where: { entityId: sameMobile.id, action: "CIRCUMVENTION_CLEARED" } }), 1);

  // Same address; restricted, then released when the Recovery is cleared.
  const sameAddress = await person("Same Address", mobile(7), { addressLine: "12 Shanti  Nagar", city: "jaipur" });
  await member("ADR", sameAddress.id);
  const adrBooking = await sale("ADR", buyer.id, sameAddress.id);
  await pay(adrBooking, "40", "ADR-40");
  const adrReview = await db.circumventionReview.findUniqueOrThrow({
    where: { subjectPersonId_recoveryId: { subjectPersonId: sameAddress.id, recoveryId: recovery.id } },
  });
  assert.deepEqual(adrReview.indicators, ["ADDRESS"]);
  await decideCircumvention({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", reviewId: adrReview.id, clear: false, reason: "Same household as the debtor." });
  assert.equal((await direct(adrBooking)).holdReason, "RECOVERY_CIRCUMVENTION_REVIEW", "restricted stays held");
  await clearRecovery({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", recoveryId: recovery.id, note: "Repaid in full." });
  assert.equal((await direct(adrBooking)).eligibility, "READY", "the restriction ends with the Recovery");
  console.log("  ✓ CTL-04/05 — shared mobile/address with a Recovery is reviewed, cleared or restricted, never auto-denied");

  // ------------------------------------------------------ SSOT §22 payer
  const payerBooking = await sale("PAYER", buyer.id, relative.id);
  await refused(() => pay(payerBooking, "10", "PAYER-1", { payerReference: "UTR123" }), /Name the third-party payer/);
  await pay(payerBooking, "10", "PAYER-2", { payerName: "Ramesh (uncle)", payerReference: "UTR 998877" });
  const entry = await db.paymentReceivedEntry.findFirstOrThrow({ where: { bookingId: payerBooking } });
  assert.equal(entry.payerName, "Ramesh (uncle)");
  assert.equal(entry.payerReference, "UTR 998877");
  console.log("  ✓ SSOT §22 — the third-party payer and their reference are recorded");

  // ------------------------------------------------------------- COR-08
  const survivor = await person("Survivor", mobile(8));
  const duplicate = await person("Duplicate", mobile(9));
  const sm = await member("SUR", survivor.id);
  const dm = await member("DUP", duplicate.id);
  await db.memberProfile.update({ where: { id: dm.id }, data: { status: "DEACTIVATED" } });
  await db.memberProfile.update({ where: { id: sm.id }, data: { referenceOpportunityConsumedAt: day(-1) } });
  await db.memberProfile.update({ where: { id: dm.id }, data: { referenceOpportunityConsumedAt: day(-10) } });
  const merge = await requestPersonMerge({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    survivingPersonId: survivor.id,
    mergedPersonId: duplicate.id,
    reason: "Same Aadhaar.",
  });
  await decidePersonMerge({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", requestId: merge.requestId, approve: true, note: "Confirmed." });
  const after = await db.memberProfile.findUniqueOrThrow({ where: { id: sm.id } });
  assert.ok(after.referenceOpportunityConsumedAt! < day(-5), "COR-08: the survivor keeps the earlier Reference opportunity only");
  assert.equal((await db.personMergeRequest.findUniqueOrThrow({ where: { id: merge.requestId } })).loyaltyRebuiltTo, 0);
  console.log("  ✓ COR-08 — one Reference opportunity after a merge; closing count rebuilt");
}

main().then(
  async () => {
    await cleanup();
    await db.$disconnect();
    console.log("controls.check.ts OK");
  },
  async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    await db.$disconnect();
    process.exit(1);
  }
);
