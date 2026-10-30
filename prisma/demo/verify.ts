// The demo dataset looks real (spec §1, §7). Run after seed:demo.
// Run: npm run demo:verify
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "../check-guard.ts";

assertCheckDatabase();
const db = new PrismaClient();
const now = new Date();

async function main() {
  const projects = await db.project.findMany({ where: { projectCode: { in: ["SRE", "AH", "MBP"] } }, include: { _count: { select: { plots: true } } } });
  assert.deepEqual(
    Object.fromEntries(projects.map((p) => [p.projectCode, p._count.plots])),
    { SRE: 30, AH: 25, MBP: 20 },
    "exactly the three Projects with their plots (a re-run left no duplicates)"
  );
  assert.equal(await db.project.count({ where: { projectCode: { startsWith: "UAT" } } }), 0, "no UAT Projects");

  const testy = await db.person.findMany({ where: { OR: [{ fullName: { contains: "UAT" } }, { fullName: { startsWith: "ZZ" } }, { fullName: { startsWith: "Buyer " } }, { fullName: { contains: "Filler" } }] }, select: { fullName: true } });
  assert.deepEqual(testy, [], "no test-looking people");

  const bookings = await db.booking.findMany({ where: { project: { projectCode: { in: ["SRE", "AH", "MBP"] } } }, select: { createdAt: true, bookingDate: true } });
  assert.ok(bookings.length >= 34, `at least 34 Bookings (found ${bookings.length})`);
  const months = new Set(bookings.map((b) => b.createdAt.toISOString().slice(0, 7)));
  for (const m of ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) assert.ok(months.has(m), `a Booking made in ${m}`);
  for (const b of bookings) {
    assert.ok(b.createdAt <= now, "no Booking created in the future");
    assert.ok(b.createdAt >= new Date("2026-04-01"), "no Booking before April");
  }
  const future = await db.auditEvent.count({ where: { at: { gt: new Date(now.getTime() + 60_000) } } });
  assert.equal(future, 0, "no audit event dated in the future");

  const pending = await db.task.findMany({ where: { status: "PENDING" }, select: { dueAt: true, purpose: true } });
  const today = now.toISOString().slice(0, 10);
  assert.ok(pending.some((t) => t.dueAt.toISOString().slice(0, 10) < today), "some tasks are overdue");
  assert.ok(pending.some((t) => t.dueAt.toISOString().slice(0, 10) > today), "some tasks are upcoming");
  const purposes = new Set(pending.map((t) => t.purpose));
  for (const p of ["PAYMENT_FOLLOW_UP", "ENQUIRY_FOLLOW_UP", "COMMISSION_PAYMENT", "RECOVERY_FOLLOW_UP", "RECOVERY_CIRCUMVENTION_REVIEW", "BANK_VERIFICATION", "DEACTIVATED_MEMBER_REQUEST_REVIEW", "RERA_EXPIRY"]) {
    assert.ok(purposes.has(p), `a pending ${p} task`);
  }

  // Scoped to the demo's own deal: the all-cases dataset (seed:all-cases) has a Ready one too.
  assert.equal(await db.commissionRecord.count({ where: { acquisition: { plot: { project: { projectCode: "AH" } } }, eligibility: "READY", payment: "NOT_PAID" } }), 1, "the AH-05 Buying Commission is Ready");
  assert.ok(await db.tripReward.count({ where: { state: "EARNED" } }), "a Reward earned");
  assert.ok(await db.tokenRedemption.count(), "Royalty points spent");
  assert.ok((await db.landInquiry.count()) >= 10, "ten Land Inquiries");
  console.log("demo verify OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
