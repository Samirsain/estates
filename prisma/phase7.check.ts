// Phase 7 hardening evidence — PHASES.md Phase 7 "Hardening"; PRD §27 gates
// 6, 7, 8 and 9; ARCHITECTURE §14.
// Run: npm run phase7:check   (requires a seeded database)
//
// This is the evidence run the go-live gates ask for: idempotency retries,
// concurrency, permission abuse, scheduler retry/catch-up after downtime, and a
// clean reconciliation. Everything it creates is tagged and purged again.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import { CommandError } from "@/lib/services/command";
import { createHold } from "@/lib/services/hold-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { setMemberStatus } from "@/lib/services/network-service";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { runAllJobs, runHoldExpiry } from "@/lib/jobs";
import { reconcile } from "@/lib/migration/reconcile";

const db = new PrismaClient();
const TAG = "ZZ-P7";
const CRM = `${TAG}-CRM`;
const ACC = `${TAG}-ACC`;

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
      lifecycle: "AVAILABLE",
      // The schema defaults to NOT_YET_RELEASED, which returns a released Plot
      // to Not Available. These fixtures are released inventory.
      restriction: "NONE",
    },
  });
}

async function main() {
  await cleanup();

  const project = await db.project.findFirstOrThrow({
    where: { plcRuleVersions: { some: { isCurrent: true } } },
  });
  const crmStaff = await db.staffAccount.findFirstOrThrow({ where: { role: "CRM" } });
  const buyer = await db.person.create({
    data: { fullName: `${TAG} Buyer`, primaryMobile: "9500000701" },
  });
  const rival = await db.person.create({
    data: { fullName: `${TAG} Rival`, primaryMobile: "9500000702" },
  });

  /* ============================================ idempotency retry evidence */

  const plotA = await makePlot(project.id, "A");
  const holdKey = key();
  const holdArgs = {
    idempotencyKey: holdKey,
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotA.id,
    personId: buyer.id,
    responsibleStaffId: crmStaff.id,
  };

  const first = await createHold(holdArgs);
  const replay = await createHold(holdArgs);
  assert.equal(replay.holdId, first.holdId, "the same key returns the original result (PRD §19)");
  assert.equal(
    await db.hold.count({ where: { plotId: plotA.id } }),
    1,
    "a retry creates no second Hold"
  );

  // The same key with different details is a different request, and is refused
  // rather than silently answered with the first result.
  await expectBlocked(/already used for different details/, () =>
    createHold({ ...holdArgs, personId: rival.id })
  );

  const record = await db.idempotencyRecord.findUniqueOrThrow({ where: { key: holdKey } });
  // PRD §19 — at minimum 24 hours of retry cover, measured from the request the
  // client is retrying. The expiry is anchored to that instant, while createdAt
  // is the database's transaction-start clock a few hundred milliseconds later,
  // so the stored gap is 24 hours minus however long the command took to write.
  const retentionMs = record.expiresAt.getTime() - record.createdAt.getTime();
  const commandLatencyAllowance = 60_000;
  assert.ok(
    retentionMs > 24 * 3_600_000 - commandLatencyAllowance,
    `the key and its result are retained for at least 24 hours (PRD §19) — stored gap ${retentionMs}ms`
  );

  /* ================================================== concurrency evidence */

  const plotB = await makePlot(project.id, "B");
  const contest = await Promise.allSettled([
    createHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: plotB.id,
      personId: buyer.id,
      responsibleStaffId: crmStaff.id,
    }),
    createHold({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      plotId: plotB.id,
      personId: rival.id,
      responsibleStaffId: crmStaff.id,
    }),
  ]);
  assert.equal(
    contest.filter((c) => c.status === "fulfilled").length,
    1,
    "two concurrent Hold attempts on one Plot allow exactly one allocation"
  );
  assert.equal(
    await db.hold.count({ where: { plotId: plotB.id, status: "ACTIVE" } }),
    1,
    "and the database holds one active Hold for that Plot"
  );

  /* ============================================== permission abuse evidence */

  // A crafted request that names a role it does not hold is refused by the
  // service, not by the hidden button (DESIGN §1).
  const member = await db.memberProfile.findFirstOrThrow();
  await expectBlocked(/Only Admin or MD/, () =>
    setMemberStatus({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      memberProfileId: member.id,
      active: false,
      reason: "crafted request",
    })
  );

  // Maker-checker: the account that submitted a Booking Request may not decide it.
  const plotC = await makePlot(project.id, "C");
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotC.id,
    parties: [{ personId: buyer.id, role: "PRIMARY" }],
    soldByType: "THREE_PERCENT_CLUB",
    bookingDate: today,
    schedule: [
      { seq: 1, percent: "40", dueDate: today },
      { seq: 2, percent: "60", dueDate: day(30) },
    ],
  });
  await expectBlocked(/different staff account|not permitted/, () =>
    decideBookingRequest({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      bookingId: submitted.bookingId,
      approve: true,
      note: "self approval",
    })
  );

  // The state machine refuses an invalid transition even when the caller asks
  // for it directly: a decided request cannot be decided again.
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    approve: false,
    note: "Incomplete details.",
    rejectReason: "INCOMPLETE_DETAILS",
  });
  await expectBlocked(/already request rejected/, () =>
    decideBookingRequest({
      idempotencyKey: key(),
      actorRef: ACC,
      actorRole: "ACCOUNTS",
      bookingId: submitted.bookingId,
      approve: true,
      note: "second decision",
    })
  );

  /* ================================ scheduler retry and catch-up evidence == */

  // Downtime: a Hold that expired while the scheduler was down still expires
  // exactly once when the run catches up.
  const plotD = await makePlot(project.id, "D");
  const lateHold = await createHold({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotD.id,
    personId: buyer.id,
    responsibleStaffId: crmStaff.id,
  });
  // A Hold created six days ago that lapsed three days ago, while nothing was
  // running to expire it. Both ends move: an expiry before its own start is a
  // state the database refuses, and rightly.
  await db.hold.update({
    where: { id: lateHold.holdId },
    data: { startsAt: day(-6), expiresAt: day(-3) },
  });

  const caughtUp = await runHoldExpiry();
  assert.ok(caughtUp.changed >= 1, "the catch-up run expires the Hold that lapsed during downtime");
  const expired = await db.hold.findUniqueOrThrow({ where: { id: lateHold.holdId } });
  assert.equal(expired.status, "EXPIRED");
  assert.equal(
    (await db.plot.findUniqueOrThrow({ where: { id: plotD.id } })).lifecycle,
    "AVAILABLE",
    "the Plot returns through the one restriction-aware rule"
  );

  const rerun = await runHoldExpiry();
  assert.equal(rerun.changed, 0, "a retry changes nothing twice");
  assert.equal(
    await db.plotEvent.count({ where: { plotId: plotD.id, action: "HOLD_EXPIRED" } }),
    1,
    "and writes no second event"
  );

  // The whole daily run is safe to repeat: task counts are identical after it.
  await runAllJobs();
  const afterFirst = await db.task.count({ where: { status: "PENDING" } });
  await runAllJobs();
  const afterSecond = await db.task.count({ where: { status: "PENDING" } });
  assert.equal(afterSecond, afterFirst, "a duplicate daily run creates no duplicate tasks");

  // Every job records its own run for monitoring (PRD §18).
  const monitored = await db.scheduledJobRun.groupBy({
    by: ["jobType"],
    where: { startedAt: { gte: day(-1) } },
    _count: { _all: true },
  });
  const jobTypes = monitored.map((m) => m.jobType);
  for (const expectedJob of [
    "HOLD_EXPIRY",
    "MEMBER_HOLD_REQUEST_EXPIRY",
    "INSTALMENT_OVERDUE",
    "PAYMENT_RECEIVED_REMINDER",
    "PAYMENT_GIVEN_REMINDER",
    "BOOKING_DECISION_ALERT",
    "RERA_EXPIRY_REMINDER",
    "ANNUAL_COUNTER_RESET",
  ]) {
    assert.ok(jobTypes.includes(expectedJob), `${expectedJob} records its run`);
  }
  assert.equal(
    await db.scheduledJobRun.count({ where: { status: "RUNNING", startedAt: { lte: day(-1) } } }),
    0,
    "no job run is left hanging in RUNNING"
  );

  /* ================================== migration reconciliation evidence ==== */

  const report = await reconcile();
  assert.equal(
    report.exceptionCount,
    0,
    `the reconciliation report must be exception-free before go-live:\n` +
      report.rules
        .filter((r) => r.exceptions.length > 0)
        .map((r) => `${r.rule}: ${r.exceptions.map((e) => `${e.record} — ${e.detail}`).join("; ")}`)
        .join("\n")
  );
  assert.ok(report.counts.persons > 0, "the report carries the record counts that get signed");

  /* ================================================ audit is append-only == */

  const audited = await db.auditEvent.findFirst({ where: { actorRef: CRM } });
  assert.ok(audited, "every command wrote its audit entry inside its own transaction");
  assert.ok(
    !JSON.stringify(audited).match(/password|aadhaarCipher|mfaSecret/i),
    "no secret or protected value reaches the audit payload (PRD §17.1)"
  );

  await cleanup();
  console.log("phase7.check.ts OK");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    if (error instanceof CommandError) console.error(`${error.code}: ${error.message}`);
    console.error(error);
    await cleanup().catch(() => {});
    await db.$disconnect();
    process.exit(1);
  });
