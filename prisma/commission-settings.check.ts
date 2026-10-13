// Project commission settings — SSOT §12–§16, Change Pack §7, §8, against the
// real database and the real commands. MD creates each version and creating it
// is its approval; a version takes effect at its Effective from (now, if none)
// and supersedes the previous one.
// Run: npm run commission-settings:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  activateDueVersions,
  createCommissionVersion,
  listCommissionVersions,
} from "@/lib/services/commission-settings-service";
import { freezeAtSubmission } from "@/lib/services/commission-service";
import { runCommissionVersionActivation } from "@/lib/jobs";
import { createProject } from "@/lib/services/project-service";

const db = new PrismaClient();
const TAG = "ZZ-CSET";
let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const MD = { actorRef: `${TAG}-MD`, actorRole: "MD" };
const terms = {
  directEnabled: true,
  directPercent: "3" as string | null,
  loyaltyEnabled: true,
  loyaltyPercent: "1" as string | null,
  loyaltyExceptionReason: null as string | null,
  reason: "Launch terms",
  royaltyTokensPerAward: 10,
};

async function main() {
  await purgeCheckData(db, TAG);
  const project = await db.project.create({
    data: { projectCode: `${TAG}P`, name: `${TAG} Project`, type: "RESIDENTIAL" },
  });
  const projectId = project.id;

  // Only MD creates — Review Focus 4: PC holds PROJECT_SETUP but may not.
  for (const role of ["PC", "CRM", "ACCOUNTS", "MIS"]) {
    await assert.rejects(
      createCommissionVersion({ idempotencyKey: key(), actorRef: `${TAG}-${role}`, actorRole: role, projectId, ...terms }),
      /Only MD creates/,
      role
    );
  }

  // Validation reaches the service too.
  await assert.rejects(
    createCommissionVersion({ idempotencyKey: key(), ...MD, projectId, ...terms, directPercent: "6" }),
    /cannot exceed 5%/
  );
  await assert.rejects(createCommissionVersion({ idempotencyKey: key(), ...MD, projectId, ...terms, reason: " " }), /reason/);

  // docss/11 §1 — the Royalty points rate is a whole number, above 0, on every version.
  for (const bad of [0, -5, 2.5, 1_000_001, null as unknown as number]) {
    await assert.rejects(
      createCommissionVersion({ idempotencyKey: key(), ...MD, projectId, ...terms, royaltyTokensPerAward: bad }),
      /Royalty points/,
      `refuses a rate of ${String(bad)}`
    );
  }

  // Created by MD = approved: Active at once, decided by the same MD.
  const v1 = await createCommissionVersion({ idempotencyKey: key(), ...MD, projectId, ...terms });
  assert.equal(`${v1.version}:${v1.status}`, "1:ACTIVE");
  const active1 = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } });
  assert.equal(active1.royaltyTokensPerAward, 10, "the rate is stored with the version");
  assert.equal(`${active1.preparedByRef}|${active1.decidedByRef}`, `${MD.actorRef}|${MD.actorRef}`);
  // v2.1 §15 — never effective before its approval.
  assert.ok(active1.effectiveFrom && active1.decidedAt && active1.effectiveFrom >= active1.decidedAt);

  // An MD exception: Loyalty equal to Direct needs the written reason (v2.1 §13).
  await assert.rejects(
    createCommissionVersion({ idempotencyKey: key(), ...MD, projectId, ...terms, loyaltyPercent: "3" }),
    /MD exception/
  );

  // Version 2 supersedes version 1.
  const v2 = await createCommissionVersion({
    idempotencyKey: key(),
    ...MD,
    projectId,
    ...terms,
    loyaltyPercent: "3",
    loyaltyExceptionReason: "Launch offer",
    reason: "Raise Loyalty",
  });
  assert.equal(`${v2.version}:${v2.status}`, "2:ACTIVE");
  const old = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } });
  assert.equal(old.status, "SUPERSEDED");
  assert.ok(old.effectiveTo);
  assert.deepEqual(
    (await listCommissionVersions(projectId)).map((v) => `${v.version}:${v.status}`),
    ["2:ACTIVE", "1:SUPERSEDED"]
  );

  // The database refuses a second Active version however it is written.
  await assert.rejects(
    db.projectCommissionVersion.create({
      data: {
        projectId,
        version: 9,
        status: "ACTIVE",
        directEnabled: true,
        directPercent: "3",
        loyaltyEnabled: false,
        reason: "x",
        preparedByRef: "x",
        submittedAt: new Date(),
        decidedByRef: "x",
        decidedAt: new Date(),
        effectiveFrom: new Date(),
      },
    }),
    /one_active_commission_version_per_project|Unique constraint/
  );

  /* ============ Change Pack §7.3, §8 — exception audit, effective time ============ */

  // CP §7.3 — MD creating version 2 was the commercial exception, audited as such.
  const approvals = await db.auditEvent.findMany({
    where: { entity: "Project", entityId: projectId, action: "COMMISSION_VERSION_APPROVED" },
    orderBy: { at: "asc" },
  });
  assert.deepEqual(
    approvals.map((a) => (a.afterMasked as { commercialExceptionApproved?: boolean }).commercialExceptionApproved),
    [false, true],
    "only the Loyalty-equals-Direct version records an approved exception"
  );

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const inMs = (ms: number) => new Date(Date.now() + ms);

  // UAT SET-08 — a past Effective from is refused.
  await assert.rejects(
    createCommissionVersion({ idempotencyKey: key(), ...MD, projectId, ...terms, effectiveFrom: inMs(-60_000) }),
    /must be in the future/
  );

  // UAT SET-12 — a future version waits as Approved while version 2 stays Active.
  const v3 = await createCommissionVersion({
    idempotencyKey: key(),
    ...MD,
    projectId,
    ...terms,
    directPercent: "2.5",
    reason: "Next quarter",
    effectiveFrom: inMs(6_000),
  });
  assert.equal(v3.status, "APPROVED");
  assert.equal(
    (await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v2.versionId } })).status,
    "ACTIVE",
    "the current version stays in force until the next one's time"
  );
  // One waiting version per Project: nothing new while version 3 waits.
  await assert.rejects(createCommissionVersion({ idempotencyKey: key(), ...MD, projectId, ...terms }), /takes effect on/);
  assert.equal(await db.$transaction((tx) => activateDueVersions(tx, projectId)), 0, "not due yet");

  // The scheduled job activates it once its time has come — and only once.
  await wait(6_500);
  assert.ok((await runCommissionVersionActivation()).changed >= 1);
  const v3Row = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v3.versionId } });
  const v2Row = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v2.versionId } });
  assert.equal(`${v2Row.status}|${v3Row.status}`, "SUPERSEDED|ACTIVE");
  assert.equal(v2Row.effectiveTo?.getTime(), v3Row.effectiveFrom?.getTime(), "the hand-over is seamless");
  assert.ok(v3Row.effectiveFrom! >= v3Row.decidedAt!, "never effective before its approval");
  assert.equal(await db.$transaction((tx) => activateDueVersions(tx, projectId)), 0, "a re-run changes nothing");

  // Review Focus 3 — a Booking Request between the time and the job freezes
  // the new version: submission activates a due version itself.
  const v4 = await createCommissionVersion({
    idempotencyKey: key(),
    ...MD,
    projectId,
    ...terms,
    directPercent: "2",
    reason: "Later still",
    effectiveFrom: inMs(6_000),
  });
  await wait(6_500);
  const frozen = await db.$transaction((tx) =>
    freezeAtSubmission(tx, {
      projectId,
      soldByType: "THREE_PERCENT_CLUB",
      soldByPersonId: null,
      buyerPersonId: "00000000-0000-0000-0000-000000000000",
    })
  );
  assert.equal(frozen.commissionVersionId, v4.versionId, "the due version is the one frozen");
  assert.equal(frozen.royaltyTokensPerAward, 10, "docss/11 — the points rate freezes with the request");

  // docss/11 §1; Review Focus 5 — an Active version without a points rate (one
  // created before points) is never frozen as "0 points": the request is refused.
  const legacy = await db.project.create({ data: { projectCode: `${TAG}L`, name: `${TAG} Legacy`, type: "RESIDENTIAL" } });
  await db.projectCommissionVersion.create({
    data: {
      projectId: legacy.id,
      version: 1,
      status: "ACTIVE",
      directEnabled: true,
      directPercent: "3",
      loyaltyEnabled: false,
      reason: "Before points",
      preparedByRef: MD.actorRef,
      submittedAt: new Date(),
      decidedByRef: MD.actorRef,
      decidedAt: new Date(),
      effectiveFrom: new Date(),
    },
  });
  await assert.rejects(
    db.$transaction((tx) =>
      freezeAtSubmission(tx, {
        projectId: legacy.id,
        soldByType: "THREE_PERCENT_CLUB",
        soldByPersonId: null,
        buyerPersonId: "00000000-0000-0000-0000-000000000000",
      })
    ),
    /no Royalty points rate/
  );

  /* The create form may carry the settings too: saved as version 1, approved
     by the MD creating the Project exactly as above. */
  const base = { name: `${TAG} Created`, type: "RESIDENTIAL" as const, components: [] };
  const created = await createProject({
    idempotencyKey: key(),
    ...MD,
    ...base,
    projectCode: "ZZCSETC1",
    commission: { ...terms, directPercent: "4", loyaltyPercent: "2" },
  });
  const first = await db.projectCommissionVersion.findFirstOrThrow({ where: { projectId: created.projectId } });
  assert.equal(`${first.version}:${first.status}`, "1:ACTIVE", "the create form saves an Active version 1");
  assert.equal(first.directPercent?.toString(), "4");
  assert.equal(first.royaltyTokensPerAward, 10, "docss/11 — the create form carries the points rate");
  assert.equal(first.decidedByRef, MD.actorRef);

  // Only MD sets settings, on the create form too; PC can still create without them.
  await assert.rejects(
    createProject({
      idempotencyKey: key(),
      actorRef: `${TAG}-PC`,
      actorRole: "PC",
      ...base,
      projectCode: "ZZCSETC2",
      commission: terms,
    }),
    /Only MD creates/
  );
  await assert.rejects(
    createProject({
      idempotencyKey: key(),
      ...MD,
      ...base,
      projectCode: "ZZCSETC3",
      commission: { ...terms, loyaltyPercent: "3" },
    }),
    /MD exception/,
    "the same validation as the Project page"
  );
  const plain = await createProject({
    idempotencyKey: key(),
    actorRef: `${TAG}-PC`,
    actorRole: "PC",
    ...base,
    projectCode: "ZZCSETC4",
  });
  assert.equal(await db.projectCommissionVersion.count({ where: { projectId: plain.projectId } }), 0);

  await purgeCheckData(db, TAG);
  console.log("commission-settings.check.ts OK");
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
