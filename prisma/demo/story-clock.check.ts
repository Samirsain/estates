// The demo's story clock (spec §4) against the real database.
// Run: npm run demo-clock:check
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "../check-guard.ts";
import { at, installStoryClock, realNow } from "./story-clock.ts";

assertCheckDatabase();
installStoryClock();
const db = new PrismaClient();
const TAG = "ZZ-CLOCK";

async function main() {
  await db.person.deleteMany({ where: { fullName: { startsWith: TAG } } });

  // Written outside any step: keeps its real time.
  const before = await db.person.create({ data: { fullName: `${TAG} Outside`, primaryMobile: "9299900001" } });
  await new Promise((resolve) => setTimeout(resolve, 5_000)); // further from the step than its slack

  const inside = await at(db, "2026-04-12", async () => {
    assert.equal(new Date().toISOString().slice(0, 10), "2026-04-12", "the script reads story time");
    assert.equal(new Date(Date.now()).toISOString().slice(0, 10), "2026-04-12", "Date.now() too");
    return db.person.create({ data: { fullName: `${TAG} Inside`, primaryMobile: "9299900002" } });
  });
  assert.ok(Math.abs(new Date().getTime() - realNow().getTime()) < 5_000, "the clock is real again after the step");

  const row = await db.person.findUniqueOrThrow({ where: { id: inside.id } });
  assert.equal(row.createdAt.toISOString().slice(0, 10), "2026-04-12", "the database default moved to story time");
  const outside = await db.person.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(outside.createdAt.getTime(), before.createdAt.getTime(), "a row written outside the step is untouched");

  // A step that throws still shifts what it wrote and still restores the clock.
  await assert.rejects(
    at(db, "2026-05-01", async () => {
      await db.person.create({ data: { fullName: `${TAG} Thrown`, primaryMobile: "9299900003" } });
      throw new Error("boom");
    }),
    /boom/
  );
  const thrown = await db.person.findFirstOrThrow({ where: { fullName: `${TAG} Thrown` } });
  assert.equal(thrown.createdAt.toISOString().slice(0, 10), "2026-05-01");
  assert.ok(Math.abs(new Date().getTime() - realNow().getTime()) < 5_000);

  // The append-only ledger trigger is enabled again.
  const [trigger] = await db.$queryRaw<{ tgenabled: string }[]>`SELECT tgenabled FROM pg_trigger WHERE tgname = 'token_ledger_append_only'`;
  assert.equal(trigger?.tgenabled, "O", "token_ledger_append_only is enabled");

  await db.person.deleteMany({ where: { fullName: { startsWith: TAG } } });
  console.log("story-clock.check.ts OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
