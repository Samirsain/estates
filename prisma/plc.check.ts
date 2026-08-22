// PLC version lifecycle and snapshot correction evidence — system/plc.md §3,
// §5, §7.2, §11 and the acceptance tests in §19 (1–5, 11, 14, 31–35, 38).
// Run: npm run plc:check   (requires a seeded database)
//
// Everything it creates is tagged and purged again.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import { createHold } from "@/lib/services/hold-service";
import {
  correctPlcSnapshot,
  createProject,
  publishPlcVersion,
  revisePlcRules,
  savePlcDraft,
} from "@/lib/services/project-service";

const db = new PrismaClient();
const TAG = "ZZ-PLC";
const PC = `${TAG}-PC`;
const ADMIN = `${TAG}-ADMIN`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;

async function expectBlocked(pattern: RegExp, fn: () => Promise<unknown>) {
  await assert.rejects(fn, pattern);
}

async function cleanup() {
  await purgeCheckData(db, TAG);
}

async function main() {
  await cleanup();

  /* ================================================== 1–3. version lifecycle */

  const { projectId } = await createProject({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    projectCode: `${TAG}-01`,
    name: `${TAG} PLC Lifecycle`,
    type: "RESIDENTIAL",
    components: [
      { code: "ROAD_FACING", label: "Road facing", percent: "2.000" },
      { code: "PARK_FACING", label: "Park facing", percent: "1.500" },
      { code: "CORNER", label: "Corner", percent: "1.000" },
    ],
  });

  const v1 = await db.plcRuleVersion.findFirstOrThrow({
    where: { projectId, version: 1 },
  });
  assert.equal(v1.status, "PUBLISHED", "Project setup publishes version 1");
  assert.ok(v1.publishedAt && v1.effectiveFrom, "a published version carries its publish stamp");

  // A Draft changes nothing: the published version is still the one in force.
  const draft = await savePlcDraft({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    projectId,
    components: [
      { code: "ROAD_FACING", label: "Road facing", percent: "3.000" },
      { code: "CORNER", label: "Corner", percent: "1.000" },
    ],
    reason: "Road-facing raised for the revised layout.",
  });

  const drafted = await db.plcRuleVersion.findUniqueOrThrow({
    where: { id: draft.plcRuleVersionId },
  });
  assert.equal(drafted.status, "DRAFT", "a new version starts as a Draft (§3.1)");
  assert.equal(drafted.effectiveFrom, null, "a draft has no effective date until it is published");
  assert.equal(
    (await db.plcRuleVersion.findFirstOrThrow({ where: { projectId, status: "PUBLISHED" } })).id,
    v1.id,
    "drafting does not disturb the version in force (§3.1)"
  );

  const published = await publishPlcVersion({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    plcRuleVersionId: draft.plcRuleVersionId,
  });
  assert.equal(published.supersededVersion, 1, "publishing closes the previous version");

  const v1After = await db.plcRuleVersion.findUniqueOrThrow({ where: { id: v1.id } });
  assert.equal(v1After.status, "SUPERSEDED", "the earlier version becomes historical (§3.4)");
  assert.equal(v1After.supersededById, draft.plcRuleVersionId, "and links to its replacement");
  assert.ok(v1After.effectiveTo, "and is closed off with an effective-to date");
  assert.equal(
    await db.plcRuleVersion.count({ where: { projectId, status: "PUBLISHED" } }),
    1,
    "exactly one published version per Project (§3.5)"
  );

  /* ============================================ 4. published is not editable */

  await expectBlocked(/already published and cannot be published again/, () =>
    publishPlcVersion({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      plcRuleVersionId: draft.plcRuleVersionId,
    })
  );

  /* ================================= 5. conflicting duplicate blocks publish */

  await expectBlocked(/appears twice/, () =>
    savePlcDraft({
      idempotencyKey: key(),
      actorRef: PC,
      actorRole: "PC",
      projectId,
      components: [
        { code: "ROAD_FACING", label: "Road facing", percent: "2.000" },
        { code: "ROAD_FACING", label: "Road facing (east)", percent: "3.000" },
      ],
      reason: "Conflicting configuration.",
    })
  );

  /* =============================== 38. two simultaneous publishes cannot both win */

  const raceA = await savePlcDraft({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    projectId,
    components: [{ code: "CORNER", label: "Corner", percent: "1.250" }],
    reason: "Race draft A.",
  });
  const raceB = await savePlcDraft({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    projectId,
    components: [{ code: "CORNER", label: "Corner", percent: "1.750" }],
    reason: "Race draft B.",
  });

  const race = await Promise.allSettled([
    publishPlcVersion({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      plcRuleVersionId: raceA.plcRuleVersionId,
    }),
    publishPlcVersion({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      plcRuleVersionId: raceB.plcRuleVersionId,
    }),
  ]);
  // Whether the two serialise or collide, the invariant is the same one §19.38
  // asks for: they cannot leave two current versions behind. A publish that
  // loses the race fails; one that follows a committed publish supersedes it.
  assert.ok(
    race.some((r) => r.status === "fulfilled"),
    "at least one of two simultaneous publishes goes through"
  );
  assert.equal(
    await db.plcRuleVersion.count({ where: { projectId, status: "PUBLISHED" } }),
    1,
    "two simultaneous publishes cannot create two current versions (§19.38)"
  );

  // And that invariant is the database's, not the service's: a write that goes
  // round the service is refused just the same.
  const spare = await savePlcDraft({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    projectId,
    components: [{ code: "CORNER", label: "Corner", percent: "2.000" }],
    reason: "Draft used to prove the database constraint.",
  });
  await assert.rejects(
    db.$executeRaw`UPDATE "PlcRuleVersion"
       SET "status" = 'PUBLISHED', "publishedAt" = now(), "effectiveFrom" = now()
       WHERE "id" = ${spare.plcRuleVersionId}`,
    // Postgres reports the unique violation as 23505; Prisma passes the code
    // through even where it redacts the constraint name.
    (error: unknown) => /23505|unique/i.test(error instanceof Error ? error.message : String(error)),
    "the one-published-version rule is enforced by the database (§3.5)"
  );

  /* ============================ 6–10. calculation, and 11/14. snapshot freeze */

  // A known configuration to calculate against, whichever draft won the race.
  await revisePlcRules({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId,
    components: [
      { code: "ROAD_FACING", label: "Road facing", percent: "2.000" },
      { code: "PARK_FACING", label: "Park facing", percent: "1.500" },
      { code: "CORNER", label: "Corner", percent: "1.000" },
    ],
    reason: "Baseline for the calculation evidence.",
  });
  const currentVersion = await db.plcRuleVersion.findFirstOrThrow({
    where: { projectId, status: "PUBLISHED" },
    include: { components: true },
  });
  await db.project.update({ where: { id: projectId }, data: { lifecycle: "ACTIVE" } });

  const plot = await db.plot.create({
    data: {
      projectId,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-A1`,
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.419",
      lifecycle: "AVAILABLE",
      restriction: "NONE",
      // Road facing qualifies on two sides. It is charged once, and the two
      // different categories are summed once each (§2.2, §2.3, §19.7, §19.8).
      plcComponentCodes: ["ROAD_FACING", "ROAD_FACING", "PARK_FACING", "CORNER"],
    },
  });

  const crmStaff = await db.staffAccount.findFirstOrThrow({ where: { role: "CRM" } });
  const buyer = await db.person.create({
    data: { fullName: `${TAG} Buyer`, primaryMobile: "9500000801" },
  });

  const hold = await createHold({
    idempotencyKey: key(),
    actorRef: `${TAG}-CRM`,
    actorRole: "CRM",
    plotId: plot.id,
    personId: buyer.id,
    responsibleStaffId: crmStaff.id,
  });

  const frozen = await db.plcSnapshot.findFirstOrThrow({
    where: { holds: { some: { id: hold.holdId } } },
  });
  const expectedTotal = 4.5; // 2 + 1.5 + 1, with Road facing charged once
  assert.equal(
    Number(frozen.totalPercent),
    expectedTotal,
    "the same category on two sides is charged once, and distinct categories sum (§19.7, §19.8, §19.10)"
  );
  assert.equal(
    (frozen.components as Array<{ code: string }>).length,
    3,
    "the breakdown holds one row per distinct category"
  );
  assert.equal(frozen.isCurrent, true, "the frozen snapshot is the current one");

  // 14. A later PLC version does not touch what is already frozen.
  await revisePlcRules({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId,
    components: [{ code: "CORNER", label: "Corner", percent: "4.000" }],
    reason: "Post-Hold revision.",
  });
  assert.equal(
    Number((await db.plcSnapshot.findUniqueOrThrow({ where: { id: frozen.id } })).totalPercent),
    expectedTotal,
    "a new PLC version does not alter a frozen snapshot (§19.14)"
  );

  /* ========================================== 31–35. correction and audit */

  const correction = await correctPlcSnapshot({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    snapshotId: frozen.id,
    componentCodes: ["CORNER"],
    reason: "Road and park applicability were recorded against the wrong Plot.",
  });

  const old = await db.plcSnapshot.findUniqueOrThrow({ where: { id: frozen.id } });
  const corrected = await db.plcSnapshot.findUniqueOrThrow({
    where: { id: correction.snapshotId },
  });

  assert.equal(old.isCurrent, false, "the corrected snapshot supersedes the old one (§19.31)");
  assert.equal(old.supersededById, corrected.id, "and the two stay linked");
  assert.equal(
    Number(old.totalPercent),
    expectedTotal,
    "the old snapshot keeps its own total for History (§19.33)"
  );
  assert.equal(
    Number(corrected.totalPercent),
    Number(currentVersion.components.find((c) => c.code === "CORNER")!.percent),
    "the corrected snapshot carries the corrected total"
  );
  assert.notEqual(
    Number(corrected.totalPercent),
    Number(old.totalPercent),
    "old and new totals both remain visible (§19.30, §19.33)"
  );
  assert.ok(corrected.correctionReason, "a correction names its reason (§19.32)");
  assert.equal(corrected.correctedBy, ADMIN, "and its actor (§19.32)");
  assert.equal(
    corrected.ruleVersionId,
    frozen.ruleVersionId,
    "a correction keeps the rule version the original froze"
  );

  // 35. The Hold now reads the corrected snapshot; nothing was hard-deleted.
  assert.equal(
    (await db.hold.findUniqueOrThrow({ where: { id: hold.holdId } })).plcSnapshotId,
    corrected.id,
    "the Hold is repointed at the corrected snapshot"
  );
  assert.equal(
    await db.plcSnapshot.count({ where: { plotId: plot.id } }),
    2,
    "no snapshot is hard-deleted (§19.34)"
  );

  // A superseded snapshot cannot be corrected again — correct the current one.
  await expectBlocked(/already been superseded/, () =>
    correctPlcSnapshot({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      snapshotId: frozen.id,
      componentCodes: ["CORNER"],
      reason: "Second attempt on a superseded snapshot.",
    })
  );

  // §5.3 — an unknown code is refused, never silently dropped.
  await expectBlocked(/is not in the Project's current rule version/, () =>
    correctPlcSnapshot({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      snapshotId: corrected.id,
      componentCodes: ["SEA_FACING"],
      reason: "Category that was never configured.",
    })
  );

  // §11.1 — the reason is compulsory.
  await expectBlocked(/compulsory reason/, () =>
    correctPlcSnapshot({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      snapshotId: corrected.id,
      componentCodes: ["CORNER"],
      reason: "   ",
    })
  );

  const audit = await db.auditEvent.findFirstOrThrow({
    where: { entity: "PlcSnapshot", entityId: corrected.id, action: "PLC_SNAPSHOT_CORRECTED" },
  });
  assert.equal(audit.actorRef, ADMIN, "the correction is audited against its actor");
  assert.ok(audit.beforeMasked && audit.afterMasked, "with both the old and the new breakdown");

  await cleanup();
  console.log("plc.check.ts OK");
}

main()
  .catch(async (error) => {
    await cleanup().catch(() => {});
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
