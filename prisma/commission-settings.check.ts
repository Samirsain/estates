// Project commission settings — v2.1 §12–§15, against the real database and the
// real commands. Admin prepares and sends; MD approves or rejects; an approved
// version is Active at once and supersedes the previous one.
// Run: npm run commission-settings:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  decideCommissionVersion,
  listCommissionVersions,
  prepareCommissionDraft,
  sendCommissionVersion,
} from "@/lib/services/commission-settings-service";

const db = new PrismaClient();
const TAG = "ZZ-CSET";
let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const ADMIN = { actorRef: `${TAG}-ADMIN`, actorRole: "ADMIN" };
const MD = { actorRef: `${TAG}-MD`, actorRole: "MD" };
const terms = {
  directEnabled: true,
  directPercent: "3" as string | null,
  loyaltyEnabled: true,
  loyaltyPercent: "1" as string | null,
  loyaltyExceptionReason: null as string | null,
  reason: "Launch terms",
};

async function main() {
  await purgeCheckData(db, TAG);
  const project = await db.project.create({
    data: { projectCode: `${TAG}P`, name: `${TAG} Project`, type: "RESIDENTIAL" },
  });
  const projectId = project.id;

  // Only Admin prepares — Review Focus 4: PC holds PROJECT_SETUP but may not.
  for (const role of ["MD", "PC", "CRM", "ACCOUNTS"]) {
    await assert.rejects(
      prepareCommissionDraft({ idempotencyKey: key(), actorRef: `${TAG}-${role}`, actorRole: role, projectId, ...terms }),
      /Only Admin prepares/,
      role
    );
  }

  // Validation reaches the service too.
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, directPercent: "6" }),
    /cannot exceed 5%/
  );
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, reason: " " }),
    /reason/
  );

  const v1 = await prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms });
  assert.equal(v1.version, 1);

  // Editing the Draft keeps the same version.
  const edited = await prepareCommissionDraft({
    idempotencyKey: key(),
    ...ADMIN,
    projectId,
    ...terms,
    directPercent: "3.5",
  });
  assert.equal(edited.versionId, v1.versionId);
  assert.equal(
    (await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } })).directPercent?.toString(),
    "3.5"
  );

  // Only Admin sends; MD cannot decide a Draft that was never sent.
  await assert.rejects(sendCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v1.versionId }), /Only Admin sends/);
  await assert.rejects(
    decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v1.versionId, approve: true, note: "ok" }),
    /not waiting for MD/
  );
  const sent = await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v1.versionId });
  assert.equal(sent.projectId, projectId);

  // Review Focus 5 — a sent version is no longer editable, and no second open
  // version may be started beside it.
  await assert.rejects(prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms }), /waiting for MD/);
  await assert.rejects(sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v1.versionId }), /Only a Draft/);

  // Admin cannot approve; MD needs a note.
  await assert.rejects(
    decideCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v1.versionId, approve: true, note: "ok" }),
    /Only MD/
  );
  await assert.rejects(
    decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v1.versionId, approve: false, note: " " }),
    /note/
  );

  const approved = await decideCommissionVersion({
    idempotencyKey: key(),
    ...MD,
    versionId: v1.versionId,
    approve: true,
    note: "Approved",
  });
  assert.equal(approved.status, "ACTIVE");
  assert.equal(approved.supersededVersion, null);
  assert.equal(approved.projectId, projectId);
  const active1 = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } });
  assert.equal(active1.decidedByRef, MD.actorRef);
  // v2.1 §15 — never effective before its approval.
  assert.ok(active1.effectiveFrom && active1.decidedAt && active1.effectiveFrom >= active1.decidedAt);

  // Version 2, rejected with a note; version 1 stays Active.
  const v2 = await prepareCommissionDraft({
    idempotencyKey: key(),
    ...ADMIN,
    projectId,
    ...terms,
    loyaltyEnabled: false,
    loyaltyPercent: null,
    reason: "No Loyalty",
  });
  assert.equal(v2.version, 2);
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v2.versionId });
  const rejected = await decideCommissionVersion({
    idempotencyKey: key(),
    ...MD,
    versionId: v2.versionId,
    approve: false,
    note: "Keep Loyalty",
  });
  assert.equal(rejected.status, "REJECTED");
  assert.equal((await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } })).status, "ACTIVE");
  await assert.rejects(sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v2.versionId }), /Only a Draft/);

  // An MD exception: Loyalty equal to Direct needs the written reason (v2.1 §13).
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, loyaltyPercent: "3" }),
    /MD exception/
  );

  // Version 3 approved supersedes version 1.
  const v3 = await prepareCommissionDraft({
    idempotencyKey: key(),
    ...ADMIN,
    projectId,
    ...terms,
    directPercent: "3",
    loyaltyPercent: "3",
    loyaltyExceptionReason: "Launch offer",
    reason: "Raise Loyalty",
  });
  assert.equal(v3.version, 3);
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v3.versionId });
  const approved3 = await decideCommissionVersion({
    idempotencyKey: key(),
    ...MD,
    versionId: v3.versionId,
    approve: true,
    note: "Exception approved",
  });
  assert.equal(approved3.supersededVersion, 1);
  const old = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } });
  assert.equal(old.status, "SUPERSEDED");
  assert.ok(old.effectiveTo);

  const listed = await listCommissionVersions(projectId);
  assert.deepEqual(
    listed.map((v) => `${v.version}:${v.status}`),
    ["3:ACTIVE", "2:REJECTED", "1:SUPERSEDED"]
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
