// Dashboard task model — PRD.md §20 (task rules), DESIGN.md §4.1, §6.
// Percentage-only: no rupee field exists here by design.

// One source of truth for roles — the permission matrix owns it.
import type { StaffRole } from "./security/permissions.ts";
export type { StaffRole };

export type RecordKind =
  | "Plot"
  | "Enquiry"
  | "Booking"
  | "Booking Request"
  | "Customer"
  | "Member"
  | "Acquisition";

export type TaskView =
  | "TODAY"
  | "OVERDUE"
  | "UPCOMING"
  | "COMPLETED"
  | "ALL"
  | "RANGE";

export type Task = {
  id: string;
  /** Duplicate-prevention key is Record + Purpose (PRD §20). */
  purpose: string;
  title: string;
  record: { kind: RecordKind; id: string; name: string };
  assigneeRole: StaffRole;
  assigneeName: string;
  /** ISO instant. Displayed in Asia/Kolkata. */
  dueAt: string;
  urgent: boolean;
  status: "PENDING" | "COMPLETED";
  /** Latest result / waiting reason shown on the row (DESIGN §6.2). */
  latestResult?: string;
  /** Decision tasks are approved on the record's review snapshot, not inline (DESIGN §5.2). */
  decision?: boolean;
  recurrence?: Recurrence;
  revisions: number;
};

export type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

/* ---------------------------------------------------------------- Asia/Kolkata */

const IST = "Asia/Kolkata";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
// en-US for the clock alone: it is the locale that prints AM / PM in capitals.
// Everything reading these times is in one timezone, so the zone is not worth
// a suffix on every line.
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: IST,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/** Calendar day in Asia/Kolkata as YYYY-MM-DD — sortable and comparable as a string. */
export function istDay(at: Date | string): string {
  return dayFmt.format(new Date(at));
}

/** DD/MM/YYYY — the date alone, where the clock time says nothing extra. */
export function formatIstDate(at: Date | string): string {
  return dateFmt.format(new Date(at));
}

/** DD/MM/YYYY hh:mm AM/PM — DESIGN §18, read on a 12-hour clock. */
export function formatIst(at: Date | string): string {
  const d = new Date(at);
  // Some ICU builds put a narrow no-break space before AM/PM and some a plain
  // one. One space, so what is stored, compared and read is the same string
  // everywhere this runs.
  return `${dateFmt.format(d)} ${timeFmt.format(d).replace(/ /g, " ")}`;
}

/**
 * PRD §23.1 — percentages and areas are exact to four decimals, and "display
 * normally to two decimals unless more detail is needed". So two decimals is
 * the floor, not the ceiling: a value carrying more keeps it rather than being
 * rounded away on screen.
 */
export function formatPercent(value: string | number): string {
  // String arithmetic, not Number: the stored value is already exact to four
  // decimals, and routing it through a binary float to print it would be the
  // one place the exact-decimal rule leaks (ARCHITECTURE §3.4).
  const [whole, fraction = ""] = `${value}`.split(".");
  const trimmed = fraction.replace(/0+$/, "").slice(0, 4);
  return `${whole}.${trimmed.padEnd(2, "0")}%`;
}

/**
 * Indian digit grouping for a quantity that is already at the precision it
 * should display: 1507959 reads 15,07,959. An area with no separators is a
 * number nobody can check at a glance.
 *
 * Grouping only — rounding belongs to the Decimal that produced the value, so
 * no quantity takes a trip through a binary float on its way to the screen.
 */
export function formatQuantity(value: string | number): string {
  const [whole = "0", fraction = ""] = `${value}`.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = whole.replace("-", "");
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}` : tail;
  return fraction ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}

/**
 * Feet and inches, the way a Plot is spoken about: dimensions are stored as
 * decimal feet — the inverse of what the Plot form parses — and nobody says
 * "25.42 feet". 25.4167 reads 25'5", a whole number reads 24'.
 */
export function formatDimension(value: string | number): string {
  const ft = Math.floor(Number(value));
  const inches = Math.round((Number(value) - ft) * 12);
  if (inches === 12) return `${ft + 1}'`;
  return inches ? `${ft}'${inches}"` : `${ft}'`;
}

export function addIstDays(day: string, days: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Instant for an IST wall-clock time on an IST calendar day. India has no DST. */
export function istInstant(day: string, hhmm: string): string {
  return new Date(`${day}T${hhmm}:00+05:30`).toISOString();
}

/* ---------------------------------------------------------------- emphasis + views */

export type Emphasis = "overdue" | "urgent" | "none";

/** DESIGN §4.1 — overdue is red, urgent is yellow, red wins when both. */
export function emphasis(task: Task, now: Date): Emphasis {
  if (task.status === "COMPLETED") return "none";
  if (Date.parse(task.dueAt) < now.getTime()) return "overdue";
  return task.urgent ? "urgent" : "none";
}

export type DateRange = { from: string; to: string };

export function filterTasks(
  tasks: Task[],
  view: TaskView,
  now: Date,
  range?: DateRange
): Task[] {
  const today = istDay(now);
  return tasks.filter((t) => {
    const day = istDay(t.dueAt);
    switch (view) {
      case "TODAY":
        return t.status === "PENDING" && day === today;
      case "OVERDUE":
        return t.status === "PENDING" && emphasis(t, now) === "overdue";
      case "UPCOMING":
        return t.status === "PENDING" && day > today;
      case "COMPLETED":
        return t.status === "COMPLETED";
      case "ALL":
        return true;
      case "RANGE":
        return !!range && day >= range.from && day <= range.to;
    }
  });
}

/** Overdue first, then earliest due, then urgent above normal. */
export function sortTasks(tasks: Task[], now: Date): Task[] {
  const rank = (t: Task) => (emphasis(t, now) === "overdue" ? 0 : t.urgent ? 1 : 2);
  return [...tasks].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.dueAt) - Date.parse(b.dueAt)
  );
}

/**
 * The reference a person can act on, or nothing.
 *
 * `record.id` carries two different things. A task someone typed in holds what
 * they typed — CUS-3390, MEM-0217 — and that is worth showing. A task a job
 * raised holds the row's database id, which is not a reference to anything a
 * person can look up; for those the record's name is the reference, and it is
 * already on the same line. An unlinked manual task holds a placeholder.
 *
 * So: show the id only when it is one of ours to show.
 */
const INTERNAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recordReference(record: { id: string; name: string }): string | null {
  if (!record.id || record.id.startsWith("UNLINKED:") || INTERNAL_ID.test(record.id)) return null;
  return record.id;
}

/**
 * PRD §20 — the duplicate-prevention key is Record + Purpose. One record may
 * hold different Pending tasks for different purposes.
 */
export function findPendingDuplicate(
  tasks: Task[],
  recordId: string,
  purpose: string
): Task | undefined {
  return tasks.find(
    (t) =>
      t.status === "PENDING" &&
      t.record.id === recordId &&
      t.purpose === purpose
  );
}

export function summarise(tasks: Task[], now: Date) {
  const pending = tasks.filter((t) => t.status === "PENDING");
  return {
    pending: pending.length,
    overdue: pending.filter((t) => emphasis(t, now) === "overdue").length,
    urgent: pending.filter((t) => emphasis(t, now) === "urgent").length,
    completed: tasks.length - pending.length,
  };
}
