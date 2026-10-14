// Server-side guard and data load. A crafted URL cannot reach the dashboard
// without an active session whose version still matches the account.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { taskSubjects } from "@/lib/services/task-service";
import type { RecordKind, Recurrence, Task } from "@/lib/tasks";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireStaff();

  // PRD §3.2 — MD may see all Dashboard work; ordinary staff see work assigned
  // to them and to their role. The scope is applied here, in the query,
  // because a client-side filter is not a control (DESIGN §1): the rows would
  // already be in the page payload, remarks and all.
  const seesAllWork = actor.role === "MD";
  // A task given to one person is theirs alone (owner, 14 Oct 2026); a task
  // given to a role is for everyone in it.
  const scope = seesAllWork
    ? {}
    : { OR: [{ assigneeStaffId: actor.accountId }, { assigneeRole: actor.role, assigneeStaffId: null }] };
  const include = { assigneeStaff: { include: { person: true } } } as const;

  // Every pending task, always — a cap here once hid live work behind old
  // completed rows. Completed ones are history: only the most recent.
  const [pending, completed] = await Promise.all([
    db.task.findMany({ where: { ...scope, status: "PENDING" }, include, orderBy: { dueAt: "asc" } }),
    db.task.findMany({ where: { ...scope, status: { not: "PENDING" } }, include, orderBy: { completedAt: "desc" }, take: 100 }),
  ]);
  const rows = [...pending, ...completed];

  // What each task is actually about, in columns rather than in one line of
  // display text (DESIGN §6.2).
  const subjects = await taskSubjects(rows);

  const tasks: Task[] = rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    title: row.title,
    record: { kind: row.recordKind as RecordKind, id: row.recordId, name: row.recordName },
    subject: subjects.get(row.recordId),
    assigneeRole: row.assigneeRole,
    assigneeName: row.assigneeStaff?.person.fullName ?? "Unassigned",
    dueAt: row.dueAt.toISOString(),
    urgent: row.urgent,
    status: row.status,
    latestResult: row.latestResult ?? undefined,
    decision: row.decision,
    recurrence: row.recurrence as Recurrence,
    revisions: row.revisions,
  }));

  return (
    <DashboardClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      initialTasks={tasks}
      seesAllWork={seesAllWork}
    />
  );
}
