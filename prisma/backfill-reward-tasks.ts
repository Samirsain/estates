// Owner, 27 Oct 2026 (docs/Rewards_Guide.md) — the Task List never says what
// a Reward is, the Reward Earned task closes as the Reward is earned, and
// there is no Reward Sale Cancelled or Reward Expiry task any more. The
// services now work that way; this brings the tasks raised before into line:
//
//   - every Reward Earned task reads "Reward earned.", and an open one closes
//   - an open Reward Sale Cancelled or Reward Expiry task closes
//   - "Trip" in the other Reward tasks reads "Reward"
//
//   npm run backfill:reward-tasks              dry run, writes nothing
//   npm run backfill:reward-tasks -- --confirm applies it
//
// Safe to re-run: a task already right is left alone. Task events are
// history and are not rewritten; no screen shows them.
import { db } from "@/lib/db";
import { completeTask } from "@/lib/services/task-service";
import { REWARD_EARNED_RESULT, TRIP_BUCKET_KIND, TRIP_FULFILMENT_PURPOSE, TRIP_REWARD_KIND } from "@/lib/services/trip-service";

const apply = process.argv.includes("--confirm");

/** NT04 and NT05, which the services no longer raise. */
const RETIRED = ["TRIP_REWARD_DEFICIENCY", "TRIP_BUCKET_WIND_DOWN"];
const RETIRED_RESULT = "No longer needed.";

/** The old wording, as the services wrote it last. */
const WORDS: [string, string][] = [
  ["booked Trip", "booked Reward"],
  ["Trip Terms", "Reward Terms"],
  ["Trip progress", "Reward progress"],
];

const tasks = await db.task.findMany({ where: { recordKind: { in: [TRIP_REWARD_KIND, TRIP_BUCKET_KIND] } } });
let changed = 0;
for (const t of tasks) {
  const earned = t.purpose === TRIP_FULFILMENT_PURPOSE;
  const close = t.status === "PENDING" && (earned || RETIRED.includes(t.purpose));
  const text = earned
    ? REWARD_EARNED_RESULT
    : close
      ? RETIRED_RESULT
      : WORDS.reduce((s, [from, to]) => s.replaceAll(from, to), t.latestResult ?? "") || t.latestResult;
  if (!close && text === t.latestResult) continue;
  changed++;
  console.log(`${t.taskNo} ${t.title} [${t.status}${close ? " → COMPLETED" : ""}]\n  ${t.latestResult}\n  → ${text}`);
  if (!apply) continue;
  await db.$transaction(async (tx) => {
    if (close) await completeTask(tx, t.id, "SYSTEM:REWARD_TASKS", text!);
    else await tx.task.update({ where: { id: t.id }, data: { latestResult: text } });
  });
}
console.log(`${changed} task(s) ${apply ? "updated" : "would change. Run with -- --confirm to apply"}.`);
await db.$disconnect();
