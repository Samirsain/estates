// Members without Projects — docss/11 §3 and §5 (8), against a database that
// has no Project at all. Members and who-invited-whom are created through the
// real commands; joining earns nothing; self-referral and loops are refused.
// Run: npm run members-empty:check   (requires an empty, Project-free database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import { activateMember } from "@/lib/services/network-service";
import { correctInviter } from "@/lib/services/trip-service";
import { memberTokenView } from "@/lib/services/royalty-service";

const db = new PrismaClient();
const TAG = "ZZ-NOPRJ";
let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const ADMIN = { actorRef: `${TAG}-ADMIN`, actorRole: "ADMIN" };

async function join(name: string, invitedByMemberId: string | null) {
  const person = await db.person.create({ data: { fullName: `${TAG} ${name}`, primaryMobile: `96${String(10_000_000 + ++seq).slice(-8)}` } });
  await activateMember({ idempotencyKey: key(), ...ADMIN, personId: person.id, invitedByMemberId });
  return db.memberProfile.findUniqueOrThrow({ where: { personId: person.id } });
}

const correct = (memberProfileId: string, invitedByMemberId: string | null) =>
  correctInviter({ idempotencyKey: key(), ...ADMIN, memberProfileId, invitedByMemberId, reason: "Check." });

async function main() {
  assert.equal(await db.project.count(), 0, "this check is for a database with no Project at all");
  await purgeCheckData(db, TAG);

  // No Project, Booking or token configuration is needed to register a Member.
  const a = await join("A", null);
  const b = await join("B", a.id);
  const c = await join("C", b.id);
  assert.equal(b.invitedByMemberId, a.id);
  assert.equal(c.invitedByMemberId, b.id);
  assert.ok(a.activationDate && b.activationDate && c.activationDate);

  // Joining and inviting earn nothing: zero figures, no award, ledger or Trip row.
  for (const m of [a, b, c]) {
    const view = await memberTokenView(m.id, "MEMBER");
    assert.deepEqual(view.figures, { earned: 0, spent: 0, balance: 0 });
    assert.deepEqual(view.redemptions, []);
  }
  const ids = [a.id, b.id, c.id];
  assert.equal(await db.royaltyAward.count({ where: { memberProfileId: { in: ids } } }), 0);
  assert.equal(await db.tokenLedgerEntry.count({ where: { memberProfileId: { in: ids } } }), 0);
  assert.equal(await db.tripCredit.count({ where: { memberProfileId: { in: ids } } }), 0);

  // Self-referral and loops are refused in corrections…
  await assert.rejects(correct(a.id, a.id), /own inviter/, "self-referral");
  await assert.rejects(correct(a.id, c.id), /loop/, "A ← B ← C, then C invites A");
  await assert.rejects(correct(a.id, b.id), /loop/, "a two-step loop");
  // …a permitted correction still works and is audited.
  const d = await join("D", null);
  await correct(c.id, d.id);
  assert.equal((await db.memberProfile.findUniqueOrThrow({ where: { id: c.id } })).invitedByMemberId, d.id);

  // …and at activation: a Person whose own profile is named as their inviter.
  const e = await db.person.create({ data: { fullName: `${TAG} E`, primaryMobile: `96${String(10_000_000 + ++seq).slice(-8)}` } });
  const eProfile = await db.memberProfile.create({ data: { memberId: `${TAG}-E`, personId: e.id, activationDate: null } });
  await assert.rejects(
    activateMember({ idempotencyKey: key(), ...ADMIN, personId: e.id, invitedByMemberId: eProfile.id }),
    /own inviter/,
    "self-referral at activation"
  );

  await purgeCheckData(db, TAG);
  console.log("members-empty.check.ts OK");
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
