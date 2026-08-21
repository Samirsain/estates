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
  formatIst,
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
} from "@/lib/tasks";

const VIEWS: { id: TaskView; label: string }[] = [
  { id: "TODAY", label: "Today" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "UPCOMING", label: "Upcoming" },
  { id: "COMPLETED", label: "Completed" },
  { id: "ALL", label: "All" },
  { id: "RANGE", label: "Date Range" },
];

const RECORD_KINDS: RecordKind[] = [
  "Plot",
  "Enquiry",
  "Booking",
  "Booking Request",
  "Customer",
  "Member",
  "Acquisition",
];

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
  const [showAllAssignees, setShowAllAssignees] = React.useState(false);
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
      <div className="mx-auto max-w-6xl space-y-6">
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
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <input
                type="date"
                aria-label="Range from"
                className={`${inputClass} h-8 w-auto`}
                value={range?.from ?? ""}
                onChange={(e) =>
                  setRange((r) => ({ from: e.target.value, to: r?.to ?? e.target.value }))
                }
              />
              to
              <input
                type="date"
                aria-label="Range to"
                className={`${inputClass} h-8 w-auto`}
                value={range?.to ?? ""}
                onChange={(e) =>
                  setRange((r) => ({ from: r?.from ?? e.target.value, to: e.target.value }))
                }
              />
            </span>
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
          <ul className="space-y-3">
            {visible.map((task) => {
              const state = EMPHASIS_STYLE[emphasis(task, now)];
              return (
                <li key={task.id}>
                  <Card className={`p-4 ${state.row}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold">{task.title}</h2>
                          {state.label && (
                            <Badge
                              variant={state.label === "Overdue" ? "destructive" : "warning"}
                            >
                              {state.label}
                            </Badge>
                          )}
                          <Badge variant={task.status === "PENDING" ? "info" : "success"}>
                            {task.status === "PENDING" ? "Pending" : "Completed"}
                          </Badge>
                          {task.revisions > 0 && (
                            <Badge variant="outline">Revised ×{task.revisions}</Badge>
                          )}
                        </div>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Link2 className="h-3 w-3" />
                          <span className="font-mono text-primary">{task.record.id}</span>
                          <span>· {task.record.kind}</span>
                          <span className="truncate">· {task.record.name}</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            <Clock className="mr-1 inline h-3 w-3" />
                            Due {formatIst(task.dueAt)}
                          </span>
                          <span>
                            {task.assigneeName} ({task.assigneeRole})
                          </span>
                        </p>
                        {task.latestResult && (
                          <p className="max-w-3xl text-xs text-muted-foreground/90">
                            Latest: {task.latestResult}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {task.status === "COMPLETED" ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" /> Completed
                          </span>
                        ) : task.decision ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            title="Approve / Reject happens on the record's immutable review snapshot (DESIGN §5.2) — built in Phase 3."
                          >
                            Open Review
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={readOnly || busy}
                              title={readOnly ? "MIS is read-only." : undefined}
                              onClick={() => setRevising(task)}
                            >
                              Revise
                            </Button>
                            <Button
                              size="sm"
                              disabled={readOnly || busy}
                              title={readOnly ? "MIS is read-only." : undefined}
                              onClick={() => run(() => completeTaskAction(task.id, newKey()))}
                            >
                              Done
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
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
      description={`${task.title} — ${task.record.id}. The task stays Pending and the new date, result and remark are recorded.`}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="New follow-up date">
            <input
              required
              name="date"
              type="date"
              defaultValue={istDay(task.dueAt)}
              className={inputClass}
            />
          </Field>
          <Field label="Time (IST)">
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
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="Time (IST)">
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
        <div className="grid grid-cols-3 gap-3">
          <Field label="Link to">
            <select name="kind" defaultValue="Customer" className={inputClass}>
              {RECORD_KINDS.map((k) => (
                <option key={k}>{k}</option>
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
        <Field label="Remark (optional)">
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
