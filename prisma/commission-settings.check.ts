// Project commission settings — SSOT §12–§16, Change Pack §7, §8, §65, against
// the real database and the real commands. Admin prepares and sends; MD approves
// or rejects; an approved version takes effect at its Effective from (now, if
// none) and supersedes the previous one.
// Run: npm run commission-settings:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  activateDueVersions,
  decideCommissionVersion,
  listCommissionVersions,
  prepareCommissionDraft,
  sendCommissionVersion,
} from "@/lib/services/commission-settings-service";
import { freezeAtSubmission } from "@/lib/services/commission-service";
import { runCommissionVersionActivation } from "@/lib/jobs";
import { createProject } from "@/lib/services/project-service";

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

  /* ============ Change Pack §7.3, §8, §65 — exception audit, NT01, effective time ============ */

  // CP §7.3 — MD's approval of version 3 was the commercial exception, audited as such.
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
  const nt01 = (status: "PENDING" | "COMPLETED") =>
    db.task.count({ where: { recordId: projectId, purpose: "COMMISSION_VERSION_APPROVAL", status } });

  // UAT SET-08 — a past Effective from is refused when prepared.
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, effectiveFrom: inMs(-60_000) }),
    /must be in the future/
  );

  // UAT SET-12, TSK-08 — a future version: NT01 to MD on send, closed on approval,
  // and the version waits as Approved while version 3 stays Active.
  const v4 = await prepareCommissionDraft({
    idempotencyKey: key(),
    ...ADMIN,
    projectId,
    ...terms,
    directPercent: "2.5",
    reason: "Next quarter",
    effectiveFrom: inMs(6_000),
  });
  assert.equal(await nt01("PENDING"), 0, "no MD task for a Draft");
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v4.versionId });
  const nt01Task = await db.task.findFirstOrThrow({
    where: { recordId: projectId, purpose: "COMMISSION_VERSION_APPROVAL", status: "PENDING" },
  });
  assert.equal(nt01Task.assigneeRole, "MD");
  assert.equal(nt01Task.recordKind, "Project");
  assert.match(nt01Task.latestResult ?? "", /Version 4: Direct 2\.5%, Loyalty 1%\. Effective from/);
  const waiting = await decideCommissionVersion({
    idempotencyKey: key(),
    ...MD,
    versionId: v4.versionId,
    approve: true,
    note: "From next quarter",
  });
  assert.equal(waiting.status, "APPROVED");
  assert.equal(waiting.supersededVersion, null);
  assert.equal(await nt01("PENDING"), 0, "the decision closes NT01");
  assert.equal(
    (await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v3.versionId } })).status,
    "ACTIVE",
    "the current version stays in force until the approved one's time"
  );
  // One open version per Project: nothing new while version 4 waits.
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms }),
    /approved and takes effect/
  );
  assert.equal(await db.$transaction((tx) => activateDueVersions(tx, projectId)), 0, "not due yet");

  // The scheduled job activates it once its time has come — and only once.
  await wait(6_500);
  assert.ok((await runCommissionVersionActivation()).changed >= 1);
  const v4Row = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v4.versionId } });
  const v3Row = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v3.versionId } });
  assert.equal(`${v3Row.status}|${v4Row.status}`, "SUPERSEDED|ACTIVE");
  assert.equal(v3Row.effectiveTo?.getTime(), v4Row.effectiveFrom?.getTime(), "the hand-over is seamless");
  assert.ok(v4Row.effectiveFrom! >= v4Row.decidedAt!, "never effective before its approval");
  assert.equal(await db.$transaction((tx) => activateDueVersions(tx, projectId)), 0, "a re-run changes nothing");

  // Review Focus 3 — a Booking Request between the time and the job freezes
  // the new version: submission activates a due version itself.
  const v5 = await prepareCommissionDraft({
    idempotencyKey: key(),
    ...ADMIN,
    projectId,
    ...terms,
    directPercent: "2",
    reason: "Later still",
    effectiveFrom: inMs(6_000),
  });
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v5.versionId });
  await decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v5.versionId, approve: true, note: "ok" });
  await wait(6_500);
  const frozen = await db.$transaction((tx) =>
    freezeAtSubmission(tx, {
      projectId,
      soldByType: "THREE_PERCENT_CLUB",
      soldByPersonId: null,
      buyerPersonId: "00000000-0000-0000-0000-000000000000",
    })
  );
  assert.equal(frozen.commissionVersionId, v5.versionId, "the due version is the one frozen");

  // UAT SET-08, Review Focus 2 — MD cannot approve a time that passed while it waited.
  const v6 = await prepareCommissionDraft({
    idempotencyKey: key(),
    ...ADMIN,
    projectId,
    ...terms,
    reason: "Too slow",
    effectiveFrom: inMs(4_000),
  });
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v6.versionId });
  await wait(4_500);
  await assert.rejects(
    decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v6.versionId, approve: true, note: "ok" }),
    /already passed/
  );
  assert.equal(await nt01("PENDING"), 1, "a refused approval leaves NT01 open");
  await decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v6.versionId, approve: false, note: "Re-time" });
  assert.equal(await nt01("PENDING"), 0);

  /* The create form may carry the settings too: they are saved as Draft v1,
     which Admin sends and MD approves exactly as above. */
  const base = { name: `${TAG} Created`, type: "RESIDENTIAL" as const, components: [] };
  const created = await createProject({
    idempotencyKey: key(),
    ...ADMIN,
    ...base,
    projectCode: "ZZCSETC1",
    commission: { ...terms, directPercent: "4", loyaltyPercent: "2" },
  });
  const draft = await db.projectCommissionVersion.findFirstOrThrow({ where: { projectId: created.projectId } });
  assert.equal(`${draft.version}:${draft.status}`, "1:DRAFT", "the create form saves Draft v1, not an Active version");
  assert.equal(draft.directPercent?.toString(), "4");
  assert.equal(draft.preparedByRef, ADMIN.actorRef);

  // Only Admin prepares, on the create form too; PC can still create without settings.
  await assert.rejects(
    createProject({
      idempotencyKey: key(),
      actorRef: `${TAG}-PC`,
      actorRole: "PC",
      ...base,
      projectCode: "ZZCSETC2",
      commission: terms,
    }),
    /Only Admin prepares/
  );
  await assert.rejects(
    createProject({
      idempotencyKey: key(),
      ...ADMIN,
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
