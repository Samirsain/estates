// Database-level Phase 1 controls — the ones only Postgres can enforce.
// Run: npm run db:check   (requires a seeded database)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashPassword, totpCode, verifyPassword, verifyTotp } from "../src/lib/security/auth.ts";
import { blindIndex, decryptSensitive, encryptSensitive } from "../src/lib/security/identity.ts";

const db = new PrismaClient();
const TAG = "ZZ-CHECK";

async function expectRejected(label: string, fn: () => Promise<unknown>) {
  await assert.rejects(fn, label);
}

/**
 * Deferred constraint triggers fire on COMMIT, and Prisma resolves the
 * transaction promise even when that COMMIT is rejected. Every command goes
 * through `runCommand`, which forces them immediate before returning; these
 * raw checks do the same so they observe the same behaviour.
 */
function settle(tx: { $executeRawUnsafe: (sql: string) => Promise<unknown> }) {
  return tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
}

/** Idempotent, so a crashed run never blocks the next one. */
async function cleanup() {
  const persons = await db.person.findMany({
    where: { fullName: { startsWith: TAG } },
    select: { id: true },
  });
  const personIds = persons.map((p) => p.id);
  const bookings = await db.booking.findMany({
    where: { requestNo: { startsWith: TAG } },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);

  // Deleting a schedule version cascades its instalments, so a live schedule
  // is never briefly left below 100%.
  await db.paymentScheduleVersion.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.paymentReceivedEntry.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.bookingParty.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.bookingReviewVersion.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.bookingEvent.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await db.externalReference.updateMany({
    where: { normalisedKey: { startsWith: TAG } },
    data: { replacesId: null },
  });
  await db.externalReference.deleteMany({ where: { normalisedKey: { startsWith: TAG } } });

  await db.task.deleteMany({ where: { taskNo: { startsWith: TAG } } });

  // The Plot Type collision test reuses a seeded Plot Number, so it is tagged
  // through its restriction reason instead.
  const plots = await db.plot.findMany({
    where: { OR: [{ plotNumber: { startsWith: TAG } }, { restrictionReason: TAG }] },
    select: { id: true },
  });
  const plotIds = plots.map((p) => p.id);
  const scope = { OR: [{ personId: { in: personIds } }, { plotId: { in: plotIds } }] };
  await db.holdRequest.deleteMany({ where: scope });
  await db.hold.deleteMany({ where: scope });
  await db.enquiryFollowUp.deleteMany({ where: { enquiry: { enquiryNo: { startsWith: TAG } } } });
  await db.enquiry.deleteMany({ where: { enquiryNo: { startsWith: TAG } } });
  await db.plotBoundary.deleteMany({ where: { plotId: { in: plotIds } } });
  await db.plot.deleteMany({ where: { id: { in: plotIds } } });
  await db.person.deleteMany({ where: { id: { in: personIds } } });
}

async function main() {
  await cleanup();

  // Dropping the deferred-constraint guard makes a rolled back write look like
  // a success, and it is silent. Every transaction that writes protected data
  // must settle its constraints before the transaction closes. These two files
  // are the only places that open one.
  for (const rel of ["../src/lib/services/command.ts", "../src/lib/jobs.ts"]) {
    const source = readFileSync(new URL(rel, import.meta.url), "utf8");
    const opened = (source.match(/\$transaction\(/g) ?? []).length;
    const settled = (source.match(/settleConstraints\(tx\)/g) ?? []).length;
    assert.ok(opened > 0, `${rel} opens a transaction`);
    assert.equal(settled, opened, `${rel} settles deferred constraints in every transaction`);
  }

  // PRD §3.1 — exactly one active MD in normal operation.
  const activeMds = await db.staffAccount.count({ where: { role: "MD", status: "ACTIVE" } });
  assert.equal(activeMds, 1, "exactly one active MD");

  const scratch = await db.person.create({
    data: { fullName: `${TAG} Person`, primaryMobile: "9999999999" },
  });

  await expectRejected("a second active MD must be rejected", () =>
    db.staffAccount.create({
      data: {
        staffAccountId: `${TAG}-MD`,
        personId: scratch.id,
        role: "MD",
        passwordHash: hashPassword("0123456789ab"),
      },
    })
  );

  // PRD §14 — duplicate Aadhaar and PAN are prevented without storing a
  // searchable plaintext column.
  const seeded = await db.person.findFirst({ where: { aadhaarBlindIndex: { not: null } } });
  assert.ok(seeded?.aadhaarBlindIndex, "seed provides one Aadhaar to collide with");
  await expectRejected("duplicate Aadhaar must be rejected", () =>
    db.person.create({
      data: {
        fullName: `${TAG} Duplicate`,
        primaryMobile: "9999999998",
        aadhaarCipher: encryptSensitive("234567890123"),
        aadhaarLastFour: "0123",
        aadhaarBlindIndex: seeded.aadhaarBlindIndex,
        aadhaarStatus: "AVAILABLE",
      },
    })
  );
  assert.equal(blindIndex("234567890123"), seeded.aadhaarBlindIndex, "blind index is stable across runs");

  // PRD §14.2 — PAN Available requires a PAN Number; Not Available requires it empty.
  await expectRejected("PAN status must match the stored value", () =>
    db.person.create({
      data: { fullName: `${TAG} Bad PAN`, primaryMobile: "9999999997", panStatus: "AVAILABLE" },
    })
  );

  // A shared mobile must not merge two Persons (PRD §17.1).
  const shared = await db.person.create({
    data: { fullName: `${TAG} Shared Mobile`, primaryMobile: "9999999999" },
  });
  assert.notEqual(shared.id, scratch.id, "shared mobile keeps Persons distinct");

  // Seeded credentials round-trip: password verifies, MFA secret decrypts.
  const md = await db.staffAccount.findUniqueOrThrow({ where: { staffAccountId: "STF-0001" } });
  assert.ok(verifyPassword("ChangeMe#2026", md.passwordHash), "seeded password verifies");
  assert.ok(!verifyPassword("ChangeMe#2027", md.passwordHash));
  assert.ok(md.mfaSecretCipher, "MD is MFA-enrolled");
  const secret = decryptSensitive(md.mfaSecretCipher);
  assert.ok(verifyTotp(secret, totpCode(secret)), "MFA code verifies");
  assert.ok(!md.passwordHash.includes("ChangeMe"), "password is stored only as a hash");

  /* ------------------------------------------------------------- Phase 2 */

  const project = await db.project.findUniqueOrThrow({ where: { projectCode: "GRN" } });
  const plot = await db.plot.findFirstOrThrow({ where: { projectId: project.id, lifecycle: "AVAILABLE" } });

  // PRD §16.2 — Plot uniqueness is Project + Plot Type + Plot Number.
  await expectRejected("duplicate Project + Plot Type + Plot Number must be rejected", () =>
    db.plot.create({
      data: {
        projectId: project.id,
        plotType: plot.plotType,
        plotNumber: plot.plotNumber,
        areaSqFt: "100",
        areaSqYd: "11.111",
        areaSqM: "9.29",
      },
    })
  );
  // The same number under a different Plot Type is a different Plot.
  const otherType = await db.plot.create({
    data: {
      projectId: project.id,
      plotType: "COMMERCIAL",
      plotNumber: plot.plotNumber,
      areaSqFt: "100",
      areaSqYd: "11.111",
      areaSqM: "9.29",
      restrictionReason: TAG,
    },
  });

  // ARCHITECTURE §7.1 — one active commercial allocation per Plot.
  const personA = await db.person.create({ data: { fullName: `${TAG} Buyer A`, primaryMobile: "9990000001" } });
  const personB = await db.person.create({ data: { fullName: `${TAG} Buyer B`, primaryMobile: "9990000002" } });
  const inThreeDays = new Date(Date.now() + 72 * 3_600_000);

  await db.hold.create({ data: { plotId: otherType.id, personId: personA.id, expiresAt: inThreeDays } });
  await expectRejected("a second active Hold on one Plot must be rejected", () =>
    db.hold.create({ data: { plotId: otherType.id, personId: personB.id, expiresAt: inThreeDays } })
  );

  await expectRejected("a Hold cannot expire before it starts", () =>
    db.hold.create({
      data: {
        plotId: plot.id,
        personId: personB.id,
        startsAt: inThreeDays,
        expiresAt: new Date(Date.now() - 1000),
      },
    })
  );

  // PRD §8.3 — one Pending Hold Request per Customer and Plot; different
  // Customers may still request the same Plot.
  const member = await db.memberProfile.findUniqueOrThrow({ where: { memberId: "MEM-0217" } });
  const tomorrow = new Date(Date.now() + 86_400_000);
  await db.holdRequest.create({
    data: { memberId: member.id, personId: personA.id, plotId: plot.id, expiresAt: tomorrow },
  });
  await expectRejected("duplicate Pending request for the same Customer and Plot", () =>
    db.holdRequest.create({
      data: { memberId: member.id, personId: personA.id, plotId: plot.id, expiresAt: tomorrow },
    })
  );
  const otherCustomerRequest = await db.holdRequest.create({
    data: { memberId: member.id, personId: personB.id, plotId: plot.id, expiresAt: tomorrow },
  });
  assert.ok(otherCustomerRequest.id, "a different Customer may request the same Plot");

  // PRD §7.1 — one Active Enquiry per Person + Project + Plot, enforced in the
  // database so two concurrent submissions cannot both get through.
  await db.enquiry.create({
    data: {
      enquiryNo: `${TAG}-E1`,
      personId: personA.id,
      projectId: project.id,
      plotId: plot.id,
      source: "DIRECT",
    },
  });
  await expectRejected("a duplicate Active Enquiry for the same Person, Project and Plot", () =>
    db.enquiry.create({
      data: {
        enquiryNo: `${TAG}-E2`,
        personId: personA.id,
        projectId: project.id,
        plotId: plot.id,
        source: "DIRECT",
      },
    })
  );
  // A different Plot in the same Project is a separate Enquiry record.
  const otherPlotEnquiry = await db.enquiry.create({
    data: {
      enquiryNo: `${TAG}-E3`,
      personId: personA.id,
      projectId: project.id,
      plotId: otherType.id,
      source: "DIRECT",
    },
  });
  assert.ok(otherPlotEnquiry.id, "Plot-wise Enquiries stay separate records");

  // A general Enquiry carries no Plot; NULL must still collide with NULL.
  await db.enquiry.create({
    data: { enquiryNo: `${TAG}-E4`, personId: personA.id, projectId: project.id, source: "DIRECT" },
  });
  await expectRejected("a duplicate Active general Enquiry for the same Person and Project", () =>
    db.enquiry.create({
      data: { enquiryNo: `${TAG}-E5`, personId: personA.id, projectId: project.id, source: "DIRECT" },
    })
  );

  // PRD §20 — one Pending task per Record + Purpose; other purposes are fine.
  await db.task.create({
    data: {
      taskNo: `${TAG}-T1`,
      recordKind: "Plot",
      recordId: plot.id,
      recordName: "check",
      purpose: "ZZ_CHECK_PURPOSE",
      title: "check",
      assigneeRole: "CRM",
      dueAt: tomorrow,
    },
  });
  await expectRejected("duplicate Pending task for the same Record + Purpose", () =>
    db.task.create({
      data: {
        taskNo: `${TAG}-T2`,
        recordKind: "Plot",
        recordId: plot.id,
        recordName: "check",
        purpose: "ZZ_CHECK_PURPOSE",
        title: "check",
        assigneeRole: "CRM",
        dueAt: tomorrow,
      },
    })
  );
  const otherPurpose = await db.task.create({
    data: {
      taskNo: `${TAG}-T3`,
      recordKind: "Plot",
      recordId: plot.id,
      recordName: "check",
      purpose: "ZZ_CHECK_OTHER",
      title: "check",
      assigneeRole: "CRM",
      dueAt: tomorrow,
    },
  });
  assert.ok(otherPurpose.id, "one record may hold different purposes");

  // PRD §16.2 / §15 — data-integrity CHECKs.
  await expectRejected("an exact-area override without a reason must be rejected", () =>
    db.plot.create({
      data: {
        projectId: project.id,
        plotType: "INFORMAL_SECTOR",
        plotNumber: `${TAG}-X1`,
        exactAreaSqFt: "1200",
        areaSqFt: "1200",
        areaSqYd: "133.333",
        areaSqM: "111.484",
      },
    })
  );
  await expectRejected("a sale-blocking restriction without a reason must be rejected", () =>
    db.plot.create({
      data: {
        projectId: project.id,
        plotType: "INFORMAL_SECTOR",
        plotNumber: `${TAG}-X2`,
        areaSqFt: "1200",
        areaSqYd: "133.333",
        areaSqM: "111.484",
        restriction: "PLEDGE",
      },
    })
  );
  await expectRejected("a Road boundary without a road width must be rejected", () =>
    db.plotBoundary.create({ data: { plotId: plot.id, side: "NORTH", kind: "ROAD" } })
  );

  /* ------------------------------------------------------------- Phase 3 */

  const bookPlot = await db.plot.create({
    data: {
      projectId: project.id,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-B1`,
      areaSqFt: "1200",
      areaSqYd: "133.333",
      areaSqM: "111.484",
      lifecycle: "AVAILABLE",
      restriction: "NONE",
    },
  });
  const today = new Date();

  const booking = await db.booking.create({
    data: {
      requestNo: `${TAG}-REQ1`,
      projectId: project.id,
      plotId: bookPlot.id,
      primaryPersonId: personA.id,
      soldByType: "THREE_PERCENT_CLUB",
      bookingDate: today,
      submittedByRef: TAG,
    },
  });

  // ARCHITECTURE §7.1 — one active commercial allocation per Plot. The request
  // stage already holds the Plot.
  await expectRejected("a second live Booking on one Plot must be rejected", () =>
    db.booking.create({
      data: {
        requestNo: `${TAG}-REQ2`,
        projectId: project.id,
        plotId: bookPlot.id,
        primaryPersonId: personB.id,
        soldByType: "THREE_PERCENT_CLUB",
        bookingDate: today,
        submittedByRef: TAG,
      },
    })
  );

  // PRD §5.2 — the permanent Booking Number appears only on approval.
  await expectRejected("Booked without a Booking Number must be rejected", () =>
    db.booking.update({ where: { id: booking.id }, data: { status: "BOOKED" } })
  );

  // PRD §11.3 — Sold By Member/Customer must name the closer.
  await expectRejected("Sold By Member without a beneficiary must be rejected", () =>
    db.booking.update({ where: { id: booking.id }, data: { soldByType: "MEMBER" } })
  );

  // PRD §10.4 — payment progress can never exceed 100%.
  await expectRejected("payment progress above 100% must be rejected", () =>
    db.booking.update({ where: { id: booking.id }, data: { paymentReceivedPercent: "100.0001" } })
  );

  // PRD §9.1 — one pending review version per Booking.
  const snapshot = { plotId: bookPlot.id, soldByType: "THREE_PERCENT_CLUB" };
  await db.bookingReviewVersion.create({
    data: { bookingId: booking.id, version: 1, snapshot, submittedByRef: TAG },
  });
  await expectRejected("a second Pending review version must be rejected", () =>
    db.bookingReviewVersion.create({
      data: { bookingId: booking.id, version: 2, snapshot, submittedByRef: TAG },
    })
  );
  await expectRejected("a rejection without a reason must be rejected", () =>
    db.bookingReviewVersion.updateMany({
      where: { bookingId: booking.id, version: 1 },
      data: { status: "REJECTED" },
    })
  );

  // PRD §10.3 / §24 — one ACTIVE Payment Reference No. globally, across
  // Payment Received and Payment Given. Superseded values stay searchable.
  const reference = await db.externalReference.create({
    data: {
      rawValue: "utr 4471",
      normalisedKey: `${TAG}-UTR4471`,
      purpose: "PAYMENT_RECEIVED",
      actionDate: today,
      actorRef: TAG,
    },
  });
  await expectRejected("a duplicate active Payment Reference must be rejected", () =>
    db.externalReference.create({
      data: {
        rawValue: "UTR  4471",
        normalisedKey: `${TAG}-UTR4471`,
        purpose: "PAYMENT_GIVEN",
        actionDate: today,
        actorRef: TAG,
      },
    })
  );
  await db.externalReference.update({ where: { id: reference.id }, data: { status: "SUPERSEDED" } });
  const replacement = await db.externalReference.create({
    data: {
      rawValue: "UTR 4471",
      normalisedKey: `${TAG}-UTR4471`,
      purpose: "PAYMENT_RECEIVED",
      actionDate: today,
      actorRef: TAG,
      replacesId: reference.id,
      reason: "Bank confirmed the corrected reference.",
    },
  });
  assert.ok(replacement.id, "a superseded reference frees the value for its replacement");

  // PRD §12.1 — a single buyer may omit the share; two or more must total 100%.
  // The trigger is deferred, so the whole rewrite is judged at commit.
  const soleParty = await db.bookingParty.create({
    data: { bookingId: booking.id, personId: personA.id, role: "PRIMARY", actorRef: TAG },
  });
  assert.ok(soleParty.id, "a single buyer may omit the ownership share");

  await expectRejected("a single buyer holding less than 100% must be rejected", () =>
    db.bookingParty.update({ where: { id: soleParty.id }, data: { sharePercent: "60" } })
  );

  await expectRejected("two buyers whose shares miss 100% must be rejected", () =>
    db.$transaction(async (tx) => {
      await tx.bookingParty.update({ where: { id: soleParty.id }, data: { sharePercent: "60" } });
      await tx.bookingParty.create({
        data: {
          bookingId: booking.id,
          personId: personB.id,
          role: "ADDITIONAL",
          sharePercent: "30",
          actorRef: TAG,
        },
      });
      await settle(tx);
    })
  );

  await db.$transaction(async (tx) => {
    await tx.bookingParty.update({ where: { id: soleParty.id }, data: { sharePercent: "60" } });
    await tx.bookingParty.create({
      data: {
        bookingId: booking.id,
        personId: personB.id,
        role: "ADDITIONAL",
        sharePercent: "40",
        actorRef: TAG,
      },
    });
    await settle(tx);
  });
  const shareTotal = await db.bookingParty.aggregate({
    where: { bookingId: booking.id, effectiveTo: null },
    _sum: { sharePercent: true },
  });
  assert.equal(shareTotal._sum.sharePercent?.toFixed(0), "100", "two buyers total exactly 100%");

  // PRD §10.2 — a live payment schedule totals exactly 100%.
  await expectRejected("a schedule that misses 100% must be rejected", () =>
    db.$transaction(async (tx) => {
      const version = await tx.paymentScheduleVersion.create({
        data: { bookingId: booking.id, version: 1, createdByRef: TAG },
      });
      await tx.paymentInstalment.create({
        data: { scheduleVersionId: version.id, seq: 1, scheduledPercent: "90", dueDate: today },
      });
      await settle(tx);
    })
  );

  const schedule = await db.$transaction(async (tx) => {
    const version = await tx.paymentScheduleVersion.create({
      data: { bookingId: booking.id, version: 1, status: "ACTIVE", createdByRef: TAG },
    });
    await tx.paymentInstalment.createMany({
      data: [
        { scheduleVersionId: version.id, seq: 1, scheduledPercent: "30", dueDate: today },
        { scheduleVersionId: version.id, seq: 2, scheduledPercent: "70", dueDate: today },
      ],
    });
    await settle(tx);
    return version;
  });

  // PRD §10.1 — an instalment can never be credited beyond what it scheduled.
  const firstInstalment = await db.paymentInstalment.findFirstOrThrow({
    where: { scheduleVersionId: schedule.id, seq: 1 },
  });
  await expectRejected("crediting an instalment beyond its scheduled % must be rejected", () =>
    db.paymentInstalment.update({ where: { id: firstInstalment.id }, data: { receivedPercent: "40" } })
  );

  assert.ok(replacement.id && otherType.id && schedule.id, "Phase 3 fixtures were created");

  await cleanup();
  console.log("db.check.ts OK");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    await db.$disconnect();
    process.exit(1);
  });
