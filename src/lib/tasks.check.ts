// Self-check for the dashboard task logic. Run: node src/lib/tasks.check.ts
import assert from "node:assert/strict";
import {
  addIstDays,
  emphasis,
  filterTasks,
  findPendingDuplicate,
  formatDimension,
  remainingPercent,
  formatDue,
  formatPlotSize,
  istDay,
  istInstant,
  summarise,
  type Task,
  type TaskView,
  recordReference,
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

/* ------------------------------------------- which id is worth showing */

// A reference someone typed is a reference.
assert.equal(recordReference({ id: "CUS-3390", name: "Vikram Shah" }), "CUS-3390");
assert.equal(recordReference({ id: "MEM-0217", name: "Kavita Joshi" }), "MEM-0217");

// A row id is not: the RERA reminder puts one here, and the card used to print
// it beside a link icon as though it were something to look up.
assert.equal(
  recordReference({
    id: "bdedd579-75a3-4085-8e8b-d811cf666424",
    name: "MEM-000218 · SAMIR",
  }),
  null
);

// Neither is the placeholder an unlinked manual task carries.
assert.equal(recordReference({ id: "UNLINKED:STF-0001", name: "Not linked" }), null);
assert.equal(recordReference({ id: "", name: "Not linked" }), null);

// Decimal feet read back as feet and inches — the inverse of what the Plot
// form parses, so 25' 5" typed in is 25' 5" shown.
assert.equal(formatDimension("25.4167"), `25' 5"`);
// The quarter, half and three-quarter foot every plan is drawn in.
assert.equal(formatDimension("30.25"), `30' 3"`);
assert.equal(formatDimension("30.50"), `30' 6"`);
assert.equal(formatDimension("30.75"), `30' 9"`);
// Zero inches is not a measurement — a whole foot prints as 24', not 24' 0".
assert.equal(formatDimension("24"), "24'");
assert.equal(formatDimension("24.000"), "24'");
assert.equal(formatDimension("31.00"), "31'");
// A rounding that lands on twelve inches is the next foot, not 24' 12" — and
// the foot it lands on carries no inch mark either.
assert.equal(formatDimension("24.999"), "25'");
// Thousands stay grouped the way every other quantity here is grouped.
assert.equal(formatDimension("1200.5"), `1,200' 6"`);
assert.equal(formatDimension("1200"), "1,200'");

// One size, one shape, wherever a Plot size is printed. Width first — which is
// which is said in the column heading, not in every row.
assert.equal(formatPlotSize("30.250", "20.750"), `30' 3" × 20' 9"`);
assert.equal(formatPlotSize("30.5", "23.25"), `30' 6" × 23' 3"`);
assert.equal(formatPlotSize("30", "45.5"), `30' × 45' 6"`);
// Three stored decimals must not claim a precision the tape never had.
assert.equal(formatPlotSize("40.000", "23.000"), "40' × 23'");
assert.equal(formatPlotSize("1200.500", "20"), `1,200' 6" × 20'`);
// The foot and inch marks are the unit; no trailing "ft" repeating it.
assert.ok(!formatPlotSize("30", "45")!.includes("ft"));
// An irregular Plot has an area and no sides — the caller prints that instead.
assert.equal(formatPlotSize(null, "23"), null);
assert.equal(formatPlotSize("40", null), null);
assert.equal(formatPlotSize("", ""), null);
assert.equal(formatPlotSize(undefined, undefined), null);
// Numbers and Decimal-ish objects arrive from the loaders as either.
assert.equal(formatPlotSize(40, 23), "40' × 23'");
// A side that is not a number is no size at all, not "NaN' NaN"".
assert.equal(formatPlotSize("irregular", "23"), null);

// The Payment Received field is capped at what is left of the Booking, not at
// a flat 100 — progressAfter() refuses anything that lands above 100%.
assert.equal(remainingPercent("0.00"), "100.00");
assert.equal(remainingPercent("30.00"), "70.00");
assert.equal(remainingPercent("99.75"), "0.25");
// A Booking that is fully paid offers nothing, rather than offering 100 again.
assert.equal(remainingPercent("100.00"), "0.00");

// A due date, as a list has room for it. Fixed instants, so the assertions do
// not drift with the clock.
const noon = new Date("2026-08-31T06:30:00.000Z"); // 12:00 PM IST, 31 Aug 2026
// Due today: the date is the one thing every row of a Today view already says.
assert.equal(formatDue(new Date("2026-08-31T13:33:00.000Z"), noon), "07:03 PM");
// Another day this year: the day and the month, no year and no clock.
assert.equal(formatDue(new Date("2026-09-02T13:33:00.000Z"), noon), "2 Sep");
assert.equal(formatDue(new Date("2026-08-21T04:00:00.000Z"), noon), "21 Aug");
// Another year earns the year.
assert.equal(formatDue(new Date("2025-12-31T09:00:00.000Z"), noon), "31 Dec 2025");
// The day is the IST day, not the UTC one: 18:35 UTC on the 31st is already
// past midnight in Kolkata, so it is tomorrow and prints as a date.
assert.equal(formatDue(new Date("2026-08-31T18:35:00.000Z"), noon), "1 Sep");
// And the last minute that is still today prints as a time.
assert.equal(formatDue(new Date("2026-08-31T18:29:00.000Z"), noon), "11:59 PM");

console.log("tasks.check.ts OK");
