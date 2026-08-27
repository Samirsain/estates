// PLC version status and snapshot correction evidence — system/plc.md §3,
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
  updateProject,
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

  /* ================================================== 1–3. version status */

  const { projectId } = await createProject({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    name: `${TAG} PLC Status`,
    type: "RESIDENTIAL",
    city: "Jaipur",
    amenities: "Clubhouse\n24x7 water",
    components: [
      { category: "ROAD_WIDTH", threshold: "30", percent: "2.0000" },
      { category: "PARK_FACING", threshold: null, percent: "1.5000" },
      { category: "OPEN_SIDES", threshold: "2", percent: "1.0000" },
    ],
  });

  /* ================================ Project Code is generated, not typed */

  const created = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.match(
    created.projectCode,
    /^[A-Z]{1,3}-\d{2}$/,
    "the code is derived from the name, not typed by a person"
  );
  assert.equal(created.city, "Jaipur");
  assert.equal(created.amenities, "Clubhouse\n24x7 water", "amenities are one per line");

  const twin = await createProject({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    name: `${TAG} PLC Status`,
    type: "RESIDENTIAL",
    components: [{ category: "OPEN_SIDES", threshold: "2", percent: "1.0000" }],
  });
  assert.notEqual(
    twin.projectCode,
    created.projectCode,
    "a repeated name takes the next number rather than colliding"
  );

  /* ============================================= Project edit (spec §6.3) */

  await updateProject({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    projectId,
    name: `${TAG} PLC Status Renamed`,
    type: "COMMERCIAL",
    city: "Udaipur",
    reason: "The developer renamed the launch.",
  });

  const edited = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.equal(edited.name, `${TAG} PLC Status Renamed`);
  assert.equal(edited.type, "COMMERCIAL", "type is a label over the inventory, so it may change");
  assert.equal(edited.city, "Udaipur");
  assert.equal(
    edited.projectCode,
    created.projectCode,
    "the Project Code never changes — it is what an export points back to"
  );
  assert.equal(
    edited.isExternalResaleGroup,
    created.isExternalResaleGroup,
    "and the External Resale Group flag is not editable (PRD §11.6)"
  );

  await expectBlocked(/compulsory reason/, () =>
    updateProject({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      projectId,
      name: `${TAG} No Reason`,
      type: "COMMERCIAL",
      reason: "   ",
    })
  );

  const editAudit = await db.auditEvent.findFirstOrThrow({
    where: { entity: "Project", entityId: projectId, action: "PROJECT_UPDATED" },
  });
  assert.equal(editAudit.reason, "The developer renamed the launch.");
  assert.ok(editAudit.beforeMasked && editAudit.afterMasked, "before and after are both recorded");

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
      { category: "ROAD_WIDTH", threshold: "30", percent: "3.0000" },
      { category: "OPEN_SIDES", threshold: "2", percent: "1.0000" },
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

  await expectBlocked(/configured twice/, () =>
    savePlcDraft({
      idempotencyKey: key(),
      actorRef: PC,
      actorRole: "PC",
      projectId,
      components: [
        { category: "ROAD_WIDTH", threshold: "30", percent: "2.0000" },
        { category: "ROAD_WIDTH", threshold: "30", percent: "3.0000" },
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
    components: [{ category: "OPEN_SIDES", threshold: "2", percent: "1.2500" }],
    reason: "Race draft A.",
  });
  const raceB = await savePlcDraft({
    idempotencyKey: key(),
    actorRef: PC,
    actorRole: "PC",
    projectId,
    components: [{ category: "OPEN_SIDES", threshold: "2", percent: "1.7500" }],
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
    components: [{ category: "OPEN_SIDES", threshold: "2", percent: "2.0000" }],
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
      { category: "ROAD_WIDTH", threshold: "30", percent: "2.0000" },
      { category: "PARK_FACING", threshold: null, percent: "1.5000" },
      { category: "OPEN_SIDES", threshold: "2", percent: "1.0000" },
    ],
    reason: "Baseline for the calculation evidence.",
  });
  const currentVersion = await db.plcRuleVersion.findFirstOrThrow({
    where: { projectId, status: "PUBLISHED" },
    include: { components: true },
  });
  await db.project.update({ where: { id: projectId }, data: { status: "ACTIVE" } });

  const plot = await db.plot.create({
    data: {
      projectId,
      plotType: "INFORMAL_SECTOR",
      plotNumber: `${TAG}-A1`,
      areaSqFt: "1350",
      areaSqYd: "150",
      areaSqM: "125.4191",
      status: "AVAILABLE",
      restriction: "NONE",
      // Road qualifies on two sides. It is charged once, at the widest band,
      // and the distinct categories sum once each (§2.2, §2.3, §19.7, §19.8).
      boundaries: {
        create: [
          { side: "NORTH", kind: "ROAD", roadWidthFt: "30" },
          { side: "EAST", kind: "ROAD", roadWidthFt: "35" },
          { side: "SOUTH", kind: "PARK" },
          { side: "WEST", kind: "PLOT", reference: "A-900" },
        ],
      },
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
  // Road 30 ft band = 2 (charged once for two Road sides), Park facing = 1.5,
  // and three open sides clears the two-side band = 1.
  const expectedTotal = 4.5;
  assert.equal(
    Number(frozen.totalPercent),
    expectedTotal,
    "the same category on two sides is charged once, and distinct categories sum (§19.7, §19.8, §19.10)"
  );
  assert.equal(
    (frozen.components as Array<{ category: string }>).length,
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
    components: [{ category: "OPEN_SIDES", threshold: "2", percent: "4.0000" }],
    reason: "Post-Hold revision.",
  });
  assert.equal(
    Number((await db.plcSnapshot.findUniqueOrThrow({ where: { id: frozen.id } })).totalPercent),
    expectedTotal,
    "a new PLC version does not alter a frozen snapshot (§19.14)"
  );

  /* ========================================== 31–35. correction and audit */

  // There is no applicability to retype. A correction fixes the Plot fact that
  // was wrong — here the south side was never a park — and the correction then
  // re-derives the frozen snapshot from the boundaries as they now stand.
  await db.plotBoundary.updateMany({
    where: { plotId: plot.id, side: "SOUTH" },
    data: { kind: "PLOT", reference: "A-901" },
  });
  await db.plotBoundary.updateMany({
    where: { plotId: plot.id, side: "EAST" },
    data: { kind: "PLOT", roadWidthFt: null, reference: "A-902" },
  });

  const correction = await correctPlcSnapshot({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    snapshotId: frozen.id,
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
  // One 30 ft road remains, so one open side: below the two-side band, and the
  // park is gone. 2% is all that is left.
  assert.equal(
    Number(corrected.totalPercent),
    2,
    "the corrected snapshot re-derives from the corrected boundaries"
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
      reason: "Second attempt on a superseded snapshot.",
    })
  );

  // §5.3 — a Road with no width has no band to land in. The domain rule refuses
  // it (see domain.check.ts), and the database refuses to store it at all, so
  // the unbanded road can never reach a correction in the first place.
  await assert.rejects(
    db.plotBoundary.updateMany({
      where: { plotId: plot.id, side: "WEST" },
      data: { kind: "ROAD", roadWidthFt: null, reference: null },
    }),
    /boundary_details_match_kind/,
    "a Road side cannot be stored without its width"
  );

  // §11.1 — the reason is compulsory.
  await expectBlocked(/compulsory reason/, () =>
    correctPlcSnapshot({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      snapshotId: corrected.id,
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
    await cleanup().catch((purgeError) => {
      // A swallowed purge failure is why a later check script fails on data
      // this one left behind. Say so here, where it happened.
      console.error("Cleanup failed — tagged rows may remain:", purgeError);
    });
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
