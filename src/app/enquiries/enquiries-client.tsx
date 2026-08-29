"use client";

// Enquiry list, create and follow-up — DESIGN.md §8.

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { PersonLink } from "@/components/person-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { addIstDays, formatIst, istDay, istInstant, type StaffRole } from "@/lib/tasks";
import {
  closeEnquiryAction,
  createEnquiryAction,
  followUpAction,
  loadFollowUps,
  type ActionResult,
} from "./actions";

export type EnquiryRowView = {
  id: string;
  enquiryNo: string;
  name: string;
  personId: string;
  mobileMasked: string;
  city: string;
  project: string;
  plot: string;
  source: string;
  sourceMember: string | null;
  sourceMemberPersonId: string | null;
  status: string;
  closeReason: string | null;
  assignedTo: string;
  lastOutcome: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
};

const OUTCOMES = [
  "CONTACTED",
  "NOT_ANSWERED",
  "CALL_LATER",
  "SITE_VISIT_PLANNED",
  "BOOKING_DISCUSSION",
] as const;

const inputClass =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const humanise = (v: string) =>
  v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/** The fact, and under it what qualifies it. Every cell reads the same way. */
function Cell({ value, under }: { value: React.ReactNode; under?: React.ReactNode }) {
  return (
    <>
      <span className="block text-foreground">{value}</span>
      {under && <span className="block text-[11px] text-muted-foreground">{under}</span>}
    </>
  );
}

export default function EnquiriesClient({
  role,
  actorName,
  staffAccountId,
  rows,
  projects,
  plots,
  people,
  members,
  canManage,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: EnquiryRowView[];
  projects: Array<{ id: string; name: string }>;
  plots: Array<{ id: string; projectId: string; label: string }>;
  people: Array<{ id: string; fullName: string; mobileMasked: string }>;
  members: Array<{ id: string; label: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("ACTIVE");
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [followUp, setFollowUp] = React.useState<EnquiryRowView | null>(null);
  const [closing, setClosing] = React.useState<EnquiryRowView | null>(null);

  const visible = rows.filter(
    (r) =>
      (statusFilter === "ALL" || r.status === statusFilter) &&
      (search.trim() === "" ||
        `${r.enquiryNo} ${r.name} ${r.project} ${r.plot}`.toLowerCase().includes(search.trim().toLowerCase()))
  );

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    setNotice(result.ok ? { kind: "ok", text: result.message ?? "Done." } : { kind: "error", text: result.error });
    if (result.ok) router.refresh();
    return result.ok;
  }

  const newKey = () => globalThis.crypto.randomUUID();

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Enquiries</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {visible.length} of {rows.length} · each Active Enquiry carries one Pending follow-up task ·
              mobile numbers masked
            </p>
          </div>
          {canManage && (
            <Button size="sm" variant="gradient" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> New Enquiry
            </Button>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={filterClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            {["ACTIVE", "BOOKED", "CLOSED", "ALL"].map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All statuses" : humanise(s)}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-56"
            placeholder="Search Enquiry ID, name or Project"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {notice && (
          <Card
            className={`p-4 ${
              notice.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
            }`}
          >
            <p
              role="status"
              className={`flex items-start gap-2 text-sm ${
                notice.kind === "ok" ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {notice.kind === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{notice.text}</span>
            </p>
          </Card>
        )}

        {visible.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm font-semibold">No Enquiries in this view.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {canManage ? "Use New Enquiry to capture one." : "Nothing to show for this filter."}
            </p>
          </Card>
        ) : (
          // A rule between rows, not a filled card behind each one: ten
          // Enquiries fit on a laptop screen without the page becoming stripes.
          // Same table as Customers, so the two lists are read the same way.
          <div className="overflow-x-auto">
            {/* Nine columns in a laptop width leaves the two that vary — the
                name and the Project — about 8rem each, so what qualifies them
                (the city, the Plot, who sourced it) sits on the second line of
                its own cell rather than taking a column and wrapping. */}
            <table className="w-full min-w-[60rem] border-collapse text-xs">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-1.5">Name</th>
                  <th className="w-[6.5rem] px-3 py-1.5">Mobile</th>
                  <th className="px-3 py-1.5">Project</th>
                  <th className="w-[6rem] px-3 py-1.5">Status</th>
                  <th className="w-[9.5rem] px-3 py-1.5">Source</th>
                  <th className="w-[10rem] px-3 py-1.5">Follow-up</th>
                  <th className="w-[7rem] px-3 py-1.5">Assigned to</th>
                  {canManage && <th className="w-[7rem] px-3 py-1.5 text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-border/60 align-middle leading-tight last:border-0 hover:bg-secondary/50 [&>td]:px-3 [&>td]:py-1"
                  >
                    <td>
                      <Cell
                        value={<PersonLink personId={e.personId} name={e.name} />}
                        under={e.city}
                      />
                    </td>
                    <td className="whitespace-nowrap font-mono">{e.mobileMasked}</td>
                    <td>
                      <Cell value={e.project || "—"} under={e.plot} />
                    </td>
                    <td>
                      <Badge
                        variant={
                          e.status === "ACTIVE" ? "info" : e.status === "BOOKED" ? "success" : "outline"
                        }
                      >
                        {humanise(e.status)}
                      </Badge>
                      {e.closeReason && (
                        <span className="block text-[11px] text-muted-foreground">
                          {e.closeReason}
                        </span>
                      )}
                    </td>
                    <td>
                      <Cell
                        value={humanise(e.source)}
                        under={
                          e.sourceMember && (
                            <PersonLink
                              personId={e.sourceMemberPersonId}
                              name={e.sourceMember}
                              as="member"
                            />
                          )
                        }
                      />
                    </td>
                    <td>
                      <Cell
                        value={e.lastOutcome ? humanise(e.lastOutcome) : "No follow-up yet"}
                        under={e.nextFollowUpAt ? `next ${formatIst(e.nextFollowUpAt)}` : null}
                      />
                    </td>
                    <td>{e.assignedTo || "—"}</td>
                    {canManage && (
                      <td className="whitespace-nowrap text-right">
                        {/* One button, the same shape the Plot row uses when a
                            row has more than one thing to do: a named trigger,
                            the choice behind it. Two pills side by side at the
                            edge of a row read as a pair fighting for the same
                            job. What ends the Enquiry is red inside the menu. */}
                        {e.status === "ACTIVE" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="xs" className="w-24" disabled={busy}>
                                Update
                                <ChevronDown className="ml-1 h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setFollowUp(e)}>
                                Record follow-up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setClosing(e)}
                                className="text-red-700 focus:text-red-700"
                              >
                                Close Enquiry
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateEnquiryDialog
          projects={projects}
          plots={plots}
          people={people}
          members={members}
          busy={busy}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const done = await run(() => createEnquiryAction(input, newKey()));
            if (done) setCreating(false);
          }}
        />
      )}

      {followUp && (
        <FollowUpDialog
          enquiry={followUp}
          busy={busy}
          onClose={() => setFollowUp(null)}
          onSubmit={async (outcome, remark, nextIso) => {
            const done = await run(() => followUpAction(followUp.id, outcome, remark, nextIso, newKey()));
            if (done) setFollowUp(null);
          }}
        />
      )}

      {closing && (
        <Modal title={`Close ${closing.enquiryNo}`} onClose={() => setClosing(null)}>
          <p className="text-xs text-muted-foreground">
            Closing the Enquiry completes its Pending follow-up task. A Close reason is compulsory.
          </p>
          <form
            className="space-y-3"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const reason = String(new FormData(ev.currentTarget).get("reason"));
              const done = await run(() => closeEnquiryAction(closing.id, reason, newKey()));
              if (done) setClosing(null);
            }}
          >
            <Field label="Close reason — compulsory">
              <Input name="reason" required minLength={3} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setClosing(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                Confirm close
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------------- dialogs */



function CreateEnquiryDialog({
  projects,
  plots,
  people,
  members,
  busy,
  onClose,
  onSubmit,
}: {
  projects: Array<{ id: string; name: string }>;
  plots: Array<{ id: string; projectId: string; label: string }>;
  people: Array<{ id: string; fullName: string; mobileMasked: string }>;
  members: Array<{ id: string; label: string }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createEnquiryAction>[0]) => void;
}) {
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [source, setSource] = React.useState("DIRECT");
  const projectPlots = plots.filter((p) => p.projectId === projectId);

  return (
    <Modal title="New Enquiry" onClose={onClose}>
      <p className="-mt-1 text-xs text-muted-foreground">
        A Plot-wise Enquiry stays a separate record. Only one Active Enquiry may exist for the same
        Person, Project and Plot.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            personId: String(f.get("personId")),
            projectId,
            plotId: String(f.get("plotId") ?? ""),
            source: source as "DIRECT",
            sourceMemberId: String(f.get("sourceMemberId") ?? ""),
            sourceCustomerId: "",
            nextFollowUpIso: istInstant(String(f.get("date")), String(f.get("time"))),
            remark: String(f.get("remark") ?? ""),
          });
        }}
      >
        <Field label="Person">
          <select name="personId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select the Person
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} · {p.mobileMasked}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Interested Project">
            <select className={inputClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Interested Plot (optional)">
            <select name="plotId" defaultValue="" className={inputClass}>
              <option value="">General Enquiry</option>
              {projectPlots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Enquiry Source">
            <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
              {["DIRECT", "BY_MEMBER", "BY_CUSTOMER", "OTHER"].map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          </Field>
          {source === "BY_MEMBER" && (
            <Field label="Source Member — required">
              <select name="sourceMemberId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Select the Member
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Next follow-up date">
            <input
              name="date"
              type="date"
              required
              defaultValue={addIstDays(istDay(new Date()), 1)}
              className={inputClass}
            />
          </Field>
          <Field label="Time">
            <input name="time" type="time" required defaultValue="11:00" className={inputClass} />
          </Field>
        </div>

        <Field label="Remark (optional)">
          <Input name="remark" />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Create Enquiry"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FollowUpDialog({
  enquiry,
  busy,
  onClose,
  onSubmit,
}: {
  enquiry: EnquiryRowView;
  busy: boolean;
  onClose: () => void;
  onSubmit: (outcome: (typeof OUTCOMES)[number], remark: string, nextIso: string) => void;
}) {
  const [history, setHistory] = React.useState<Awaited<ReturnType<typeof loadFollowUps>> | null>(null);

  React.useEffect(() => {
    loadFollowUps(enquiry.id).then(setHistory);
  }, [enquiry.id]);

  return (
    <Modal title={`Follow-up · ${enquiry.enquiryNo}`} onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {enquiry.name} · {enquiry.project} · {enquiry.plot}
        </p>
        <p className="mt-1 text-muted-foreground">
          Recording a follow-up reuses the same Pending task for this Enquiry and moves its due date.
        </p>
      </div>

      <div className="max-h-32 overflow-auto rounded-xl border border-border/50 p-3 text-[11px] text-muted-foreground">
        {history === null ? (
          "Loading history…"
        ) : history.length === 0 ? (
          "No previous follow-up."
        ) : (
          <ul className="space-y-1">
            {history.map((h, i) => (
              <li key={i}>
                {formatIst(h.at)} — {humanise(h.outcome)}
                {h.remark ? ` · ${h.remark}` : ""}
                {h.nextAt ? ` · next ${formatIst(h.nextAt)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit(
            f.get("outcome") as (typeof OUTCOMES)[number],
            String(f.get("remark") ?? ""),
            istInstant(String(f.get("date")), String(f.get("time")))
          );
        }}
      >
        <Field label="Outcome">
          <select name="outcome" defaultValue="CONTACTED" className={inputClass}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {humanise(o)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Next follow-up date">
            <input
              name="date"
              type="date"
              required
              defaultValue={addIstDays(istDay(new Date()), 2)}
              className={inputClass}
            />
          </Field>
          <Field label="Time">
            <input name="time" type="time" required defaultValue="11:00" className={inputClass} />
          </Field>
        </div>
        <Field label="Remark">
          <Input name="remark" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Record follow-up"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
