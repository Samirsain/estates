// Self-check for the dashboard task logic. Run: node src/lib/tasks.check.ts
import assert from "node:assert/strict";
import {
  addIstDays,
  emphasis,
  filterTasks,
  findPendingDuplicate,
  istDay,
  istInstant,
  summarise,
  type Task,
  type TaskView,
} from "./tasks.ts";

const task = (over: Partial<Task>): Task => ({
  id: "T1",
  purpose: "P",
  title: "t",
  record: { kind: "Booking", id: "B1", name: "n" },
  assigneeRole: "CRM",
  assigneeName: "a",
  dueAt: "2026-08-19T05:30:00.000Z",
  urgent: false,
  status: "PENDING",
  revisions: 0,
  ...over,
});

// Asia/Kolkata is +05:30 — 19:00Z already belongs to the next IST day.
assert.equal(istDay("2026-08-19T18:29:00Z"), "2026-08-19");
assert.equal(istDay("2026-08-19T18:31:00Z"), "2026-08-20");
assert.equal(addIstDays("2026-02-28", 1), "2026-03-01");

const now = new Date("2026-08-19T06:00:00Z"); // 11:30 IST
const past = task({ dueAt: "2026-08-19T05:00:00Z", urgent: true });
const future = task({ dueAt: "2026-08-19T09:00:00Z", urgent: true });

assert.equal(emphasis(past, now), "overdue", "overdue wins over urgent");
assert.equal(emphasis(future, now), "urgent");
assert.equal(emphasis(task({ ...past, status: "COMPLETED" }), now), "none");

// Today / Overdue / Upcoming cover every pending task. Today and Overdue
// deliberately overlap: a task due earlier today is both (DESIGN §6.1).
const today0 = istDay(now);
const on = (offset: number, hhmm: string) => istInstant(addIstDays(today0, offset), hhmm);
const tasks: Task[] = [
  task({ id: "A", dueAt: on(-2, "11:00"), urgent: true }),
  task({ id: "B", dueAt: on(0, "09:00") }), // earlier today, already passed
  task({ id: "C", dueAt: on(0, "23:00") }),
  task({ id: "D", dueAt: on(1, "11:00") }),
  task({ id: "E", dueAt: on(4, "11:00"), urgent: true }),
  task({ id: "F", dueAt: on(-3, "11:00"), status: "COMPLETED" }),
  task({ id: "G", dueAt: on(0, "10:00"), purpose: "OTHER" }),
];
const pending = tasks.filter((t) => t.status === "PENDING");
const ids = (v: TaskView) => filterTasks(tasks, v, now).map((t) => t.id);
const bucketed = [...ids("TODAY"), ...ids("OVERDUE"), ...ids("UPCOMING")];
assert.deepEqual(
  new Set(bucketed),
  new Set(pending.map((t) => t.id)),
  "every pending task appears in at least one view"
);
// Upcoming is strictly future days, so it never overlaps Today or Overdue.
for (const id of ids("UPCOMING")) {
  assert.ok(!ids("TODAY").includes(id) && !ids("OVERDUE").includes(id), `Upcoming ${id}`);
}
// A task due earlier today is intentionally in both Today and Overdue.
assert.ok(ids("TODAY").includes("B") && ids("OVERDUE").includes("B"));
// A task due later today is Today only.
assert.ok(ids("TODAY").includes("C") && !ids("OVERDUE").includes("C"));
assert.equal(filterTasks(tasks, "ALL", now).length, tasks.length);
assert.equal(
  filterTasks(tasks, "COMPLETED", now).length,
  tasks.length - pending.length
);

// Date Range bounds are inclusive.
const today = istDay(now);
const range = { from: today, to: today };
assert.deepEqual(
  new Set(filterTasks(tasks, "RANGE", now, range).map((t) => istDay(t.dueAt))),
  new Set([today])
);
assert.equal(filterTasks(tasks, "RANGE", now).length, 0, "no range -> no rows");

// Record + Purpose is the duplicate key; the same record may hold other purposes.
const dupe = pending[0];
assert.ok(findPendingDuplicate(tasks, dupe.record.id, dupe.purpose));
assert.ok(findPendingDuplicate(tasks, dupe.record.id, "OTHER"), "same record, other purpose is allowed");
assert.equal(findPendingDuplicate(tasks, dupe.record.id, "SOME_OTHER_PURPOSE"), undefined);
assert.equal(
  findPendingDuplicate(
    tasks.map((t) => ({ ...t, status: "COMPLETED" as const })),
    dupe.record.id,
    dupe.purpose
  ),
  undefined,
  "completed tasks do not block a new one"
);

const s = summarise(tasks, now);
assert.equal(s.pending + s.completed, tasks.length);
assert.equal(s.overdue + s.urgent <= s.pending, true);

console.log("tasks.check.ts OK");
