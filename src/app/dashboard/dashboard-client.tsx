"use client";

// Dashboard — DESIGN.md §6 (views, task row, actions, Add Task),
// §4.1 (overdue red / urgent yellow, red wins), §19 (empty, loading, blocked).

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Plus, CheckCircle2, Link2 } from "lucide-react";
import { addTaskAction, completeTaskAction, reviseTaskAction, type ActionResult } from "./actions";
import { AppShell } from "@/components/app-shell";
import { STAFF_ROLES } from "@/lib/security/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import {
  addIstDays,
  emphasis,
  filterTasks,
  formatDue,
  istDay,
  istInstant,
  sortTasks,
  summarise,
  type DateRange,
  type Emphasis,
  type RecordKind,
  type Recurrence,
  type StaffRole,
  type Task,
  type TaskView,
  recordReference,
} from "@/lib/tasks";

const VIEWS: { id: TaskView; label: string }[] = [
  { id: "TODAY", label: "Today" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "UPCOMING", label: "Upcoming" },
  { id: "COMPLETED", label: "Completed" },
  { id: "ALL", label: "All" },
  { id: "RANGE", label: "Date Range" },
];

// The kind is what gets stored, the label is what gets read. They were the same
// string until "Acquisition" needed to read as the two deals it actually means,
// and an <option> without an explicit value posts its own text — so the label
// alone would have written "Buyback / Resale" into recordKind.
const RECORD_KINDS: { kind: RecordKind; label: string }[] = [
  { kind: "Plot", label: "Plot" },
  { kind: "Enquiry", label: "Enquiry" },
  { kind: "Booking", label: "Booking" },
  { kind: "Booking Request", label: "Booking Request" },
  { kind: "Customer", label: "Customer" },
  { kind: "Member", label: "Member" },
  { kind: "Acquisition", label: "Buyback / Resale" },
];

/** Both row buttons are one size, as they are on every other list. */
const taskButton = "w-20";

const EMPHASIS_STYLE: Record<Emphasis, { row: string; label: string | null }> = {
  overdue: { row: "border-l-4 border-l-red-500", label: "Overdue" },
  urgent: { row: "border-l-4 border-l-amber-400", label: "Urgent" },
  none: { row: "border-l-4 border-l-transparent", label: null },
};

const inputClass =
  "h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export default function DashboardClient({
  role,
  actorName,
  staffAccountId,
  initialTasks,
  seesAllWork,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  initialTasks: Task[];
  /** PRD §3.2 — only MD and Admin are served other people's work at all. */
  seesAllWork: boolean;
}) {
  const tasks = initialTasks;
  const [now, setNow] = React.useState<Date | null>(null);
  const [view, setView] = React.useState<TaskView>("TODAY");
  // MD and Admin answer for every queue, Accounts' included, so they open on
  // all of it. Everyone else opens on their own work and has no toggle.
  const [showAllAssignees, setShowAllAssignees] = React.useState(seesAllWork);
  const [range, setRange] = React.useState<DateRange | undefined>();
  const [revising, setRevising] = React.useState<Task | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();

  // Time-dependent output is client-only, so nothing can mismatch on hydration.
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const readOnly = role === "MIS"; // PRD §3 — MIS reads; it may still add a manual task.

  const visible = React.useMemo(() => {
    if (!now) return [];
    const scoped = showAllAssignees
      ? tasks
      : tasks.filter((t) => t.assigneeRole === role);
    return sortTasks(filterTasks(scoped, view, now, range), now);
  }, [tasks, view, now, range, role, showAllAssignees]);

  const stats = now ? summarise(tasks.filter((t) => showAllAssignees || t.assigneeRole === role), now) : null;

  /** Every write carries a fresh idempotency key, so a double click writes once. */
  async function run(action: () => Promise<ActionResult>) {
    if (busy) return false;
    setBusy(true);
    setBlocked(null);
    const outcome = await action();
    setBusy(false);
    if (!outcome.ok) {
      setBlocked(outcome.error);
      return false;
    }
    router.refresh();
    return true;
  }

  const newKey = () => globalThis.crypto.randomUUID();

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats ? (
                <>
                  {stats.pending} Pending · {stats.overdue} Overdue ·{" "}
                  {stats.urgent} Urgent · {stats.completed} Completed —{" "}
                  {showAllAssignees ? "all assignees" : `assigned to ${role}`} ·
                  times in Asia/Kolkata
                </>
              ) : (
                "Loading tasks…"
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {seesAllWork && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showAllAssignees}
                  onChange={(e) => setShowAllAssignees(e.target.checked)}
                  className="h-4 w-4 rounded border-input bg-secondary"
                />
                Show all assignees
              </label>
            )}
            <Button size="sm" variant="gradient" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Task
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-pressed={view === v.id}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === v.id
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-accent"
              }`}
            >
              {v.label}
            </button>
          ))}
          {view === "RANGE" && (
            <div className="inline-flex max-w-full items-center gap-0 overflow-hidden rounded-xl border border-border/60 bg-secondary/50">
              <input
                type="date"
                aria-label="Range from"
                className="h-8 w-[7.5rem] border-0 bg-transparent px-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset"
                value={range?.from ?? ""}
                onChange={(e) =>
                  setRange((r) => ({ from: e.target.value, to: r?.to ?? e.target.value }))
                }
              />
              <span className="flex h-8 items-center border-x border-border/40 bg-muted/30 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                to
              </span>
              <input
                type="date"
                aria-label="Range to"
                className="h-8 w-[7.5rem] border-0 bg-transparent px-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset"
                value={range?.to ?? ""}
                onChange={(e) =>
                  setRange((r) => ({ from: r?.from ?? e.target.value, to: e.target.value }))
                }
              />
            </div>
          )}
        </div>

        {blocked && (
          <Card className="border-red-500/40 bg-red-500/5 p-4">
            <p className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{blocked}</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setBlocked(null)}
            >
              Dismiss
            </Button>
          </Card>
        )}

        {/* One table, and the columns the work is actually filed under: which
            Project, which Plot, whose Member or Customer ID, whose name, and
            what the task is. The task title used to be a heading over a group
            of rows that repeated everything else about the record; as a column
            it lines up and scans with the rest of the row. */}
        {!now ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Loading tasks…
          </Card>
        ) : visible.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm font-semibold">No tasks in this view.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {view === "RANGE" && !range
                ? "Choose a from and to date to list tasks by due date."
                : `Nothing ${VIEWS.find((v) => v.id === view)?.label.toLowerCase()} for ${
                    showAllAssignees ? "any assignee" : role
                  }. Use + Add Task to create a manual task.`}
            </p>
          </Card>
        ) : (
          // A wide table on a narrow screen scrolls inside its own card rather
          // than taking the page sideways with it.
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[62rem] text-xs">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pl-3 pr-2 font-semibold">Project</th>
                  <th className="px-2 py-2 font-semibold">Plot</th>
                  <th className="px-2 py-2 font-semibold">Member / Customer</th>
                  <th className="px-2 py-2 font-semibold">Name</th>
                  <th className="px-2 py-2 font-semibold">Task</th>
                  <th className="px-2 py-2 font-semibold">Due</th>
                  <th className="px-2 py-2 font-semibold">Assignee</th>
                  <th className="py-2 pl-2 pr-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => {
                  const state = EMPHASIS_STYLE[emphasis(task, now)];
                  // Where the record resolved, its own reference is the one
                  // thing the columns do not already carry. Where it did not —
                  // a manual task typed against free text — the stored line is
                  // all there is, so it stands in.
                  const detail = [
                    task.subject
                      ? task.subject.reference
                      : (recordReference(task.record) ?? task.record.name),
                    task.latestResult,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <tr
                      key={task.id}
                      className="border-b border-border/60 align-top last:border-b-0 hover:bg-secondary/50"
                    >
                      <td className={`py-2 pl-3 pr-2 ${state.row}`}>
                        {task.subject?.project ?? "—"}
                      </td>
                      <td className="px-2 py-2">{task.subject?.plot ?? "—"}</td>
                      <td className="px-2 py-2 text-primary">{task.subject?.partyRef ?? "—"}</td>
                      <td className="px-2 py-2">{task.subject?.partyName ?? "—"}</td>
                      <td className="px-2 py-2">
                        <span className="font-medium">{task.title}</span>
                        <span className="ml-1.5 text-muted-foreground">({task.record.kind})</span>
                        {detail && (
                          <span className="block text-[11px] text-muted-foreground">{detail}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          {state.label && (
                            <Badge variant={state.label === "Overdue" ? "destructive" : "warning"}>
                              {state.label}
                            </Badge>
                          )}
                          <span>
                            <Clock className="mr-1 inline h-3 w-3" />
                            {formatDue(task.dueAt, now)}
                          </span>
                        </span>
                        {task.revisions > 0 && (
                          <span className="block text-[11px]">Revised ×{task.revisions}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {task.assigneeName} ({task.assigneeRole})
                      </td>
                      <td className="py-2 pl-2 pr-3">
                        <span className="flex items-center justify-end gap-1.5">
                          {task.status === "COMPLETED" ? (
                            <span className="flex items-center gap-1 whitespace-nowrap text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" /> Completed
                            </span>
                          ) : task.decision ? (
                            <Button
                              size="xs"
                              variant="outline"
                              className={taskButton}
                              disabled
                              title="Approve / Reject happens on the record's review snapshot."
                            >
                              Open Review
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                className={taskButton}
                                disabled={readOnly || busy}
                                title={readOnly ? "MIS is read-only." : undefined}
                                onClick={() => setRevising(task)}
                              >
                                Revise
                              </Button>
                              <Button
                                size="xs"
                                className={taskButton}
                                disabled={readOnly || busy}
                                title={readOnly ? "MIS is read-only." : undefined}
                                onClick={() => run(() => completeTaskAction(task.id, newKey()))}
                              >
                                Done
                              </Button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {revising && (
        <ReviseDialog
          task={revising}
          onClose={() => setRevising(null)}
          onSubmit={async (dueAt, result, remark) => {
            const task = revising;
            setRevising(null);
            await run(() => reviseTaskAction(task.id, dueAt, result, remark, newKey()));
          }}
        />
      )}

      {adding && now && (
        <AddTaskDialog
          now={now}
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            const done = await run(() => addTaskAction(input, newKey()));
            if (done) setAdding(false);
          }}
        />
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------------- dialogs */

/** Native <dialog>: focus trap, Esc-to-close and backdrop for free. */


function ReviseDialog({
  task,
  onClose,
  onSubmit,
}: {
  task: Task;
  onClose: () => void;
  onSubmit: (dueAt: string, result: string, remark: string) => void;
}) {
  return (
    <Modal
      title="Revise task"
      description={`${task.title} — ${recordReference(task.record) ?? task.record.name}. The task stays Pending and the new date, result and remark are recorded.`}
      onClose={onClose}
    >
      <form
        method="dialog"
        className="space-y-4"
        onSubmit={(e) => {
          const f = new FormData(e.currentTarget);
          onSubmit(
            istInstant(String(f.get("date")), String(f.get("time"))),
            String(f.get("result")),
            String(f.get("remark") ?? "")
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New follow-up date">
            <input
              required
              name="date"
              type="date"
              defaultValue={istDay(task.dueAt)}
              className={inputClass}
            />
          </Field>
          <Field label="Time">
            <input required name="time" type="time" defaultValue="11:00" className={inputClass} />
          </Field>
        </div>
        <Field label="Result">
          <select name="result" required defaultValue="Contacted" className={inputClass}>
            {["Contacted", "Not Answered", "Call Later", "Site Visit Planned", "Booking Discussion", "Other"].map(
              (o) => (
                <option key={o}>{o}</option>
              )
            )}
          </select>
        </Field>
        <Field label="Remark (compulsory for extensions and decisions)">
          <Input name="remark" placeholder="Reason for the new date" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm">
            Confirm revision
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddTaskDialog({
  now,
  onClose,
  onSubmit,
}: {
  now: Date;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof addTaskAction>[0]) => void;
}) {
  return (
    <Modal
      title="Add Task"
      description="Manual task. One record may hold only one Pending task per purpose."
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const title = String(f.get("title"));
          onSubmit({
            title,
            recordKind: String(f.get("kind")),
            recordId: String(f.get("recordId") ?? ""),
            recordName: String(f.get("recordName") ?? ""),
            assigneeRole: f.get("assigneeRole") as StaffRole,
            assigneeName: String(f.get("assigneeName")),
            dueAtIso: istInstant(String(f.get("date")), String(f.get("time"))),
            urgent: f.get("urgent") === "on",
            recurrence: String(f.get("recurrence")),
            remark: String(f.get("remark") ?? ""),
          });
        }}
      >
        <Field label="Title">
          <Input name="title" required placeholder="e.g. Confirm site visit with Customer" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assignee">
            <Input name="assigneeName" required defaultValue="Rahul Mehta" />
          </Field>
          <Field label="Assignee role">
            <select name="assigneeRole" defaultValue="CRM" className={inputClass}>
              {STAFF_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input
              name="date"
              type="date"
              required
              defaultValue={addIstDays(istDay(now), 1)}
              className={inputClass}
            />
          </Field>
          <Field label="Time">
            <input name="time" type="time" required defaultValue="11:00" className={inputClass} />
          </Field>
          <Field label="Recurrence">
            <select name="recurrence" defaultValue="NONE" className={inputClass}>
              {["NONE", "DAILY", "WEEKLY", "MONTHLY"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Urgent">
            <span className="flex h-10 items-center gap-2 text-sm text-foreground">
              <input name="urgent" type="checkbox" className="h-4 w-4" /> Yes
            </span>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Link to">
            <select name="kind" defaultValue="Customer" className={inputClass}>
              {RECORD_KINDS.map(({ kind, label }) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Record ID">
            <Input name="recordId" placeholder="CUS-3390" />
          </Field>
          <Field label="Record name">
            <Input name="recordName" placeholder="Vikram Shah" />
          </Field>
        </div>
        <Field label="Remark">
          <Input name="remark" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm">
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
