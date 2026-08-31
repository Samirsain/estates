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
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { PersonPicker, personLabel } from "@/components/person-picker";
import {
  addIstDays,
  formatPlotSize,
  formatIst,
  formatIstDate,
  formatQuantity,
  istDay,
  istInstant,
  type StaffRole,
} from "@/lib/tasks";
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
  /** CONSTANT_CASE from the schema — `humanise` before showing it. */
  plotType: string | null;
  plotRequirement: string | null;
  source: string;
  sourceRefId: string | null;
  sourceRefName: string | null;
  sourceRefPersonId: string | null;
  sourceRefKind: "member" | "customer" | null;
  status: string;
  closeReason: string | null;
  assignedTo: string;
  assignedStaffCode: string | null;
  lastOutcome: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
};

/** A Plot the Enquiry can name, with the facts the form shows once it is picked. */
export type PlotOption = {
  id: string;
  projectId: string;
  label: string;
  status: string;
  widthFt: string;
  lengthFt: string;
  areaSqFt: string;
  areaSqM: string;
};

const OUTCOMES = [
  "CONTACTED",
  "NOT_ANSWERED",
  "CALL_LATER",
  "SITE_VISIT_PLANNED",
  "BOOKING_DISCUSSION",
] as const;

/** main-PRD §9.2 — the six sources, in the words the spec uses. */
/** What the New Enquiry form offers, in the order it offers them. */
const SOURCE_OPTIONS = ["DIRECT", "BY_MEMBER", "BY_CUSTOMER", "EXISTING_CUSTOMER"] as const;

const SOURCE_LABEL: Record<string, string> = {
  ONLINE: "Online / Advertisement / Website",
  SITE_VISIT: "Site Visit",
  BY_MEMBER: "By Member",
  BY_CUSTOMER: "By Customer",
  EXISTING_CUSTOMER: "Existing Customer",
  DIRECT: "3% Club",
};

/**
 * A follow-up is due on a day, not at a minute — main-PRD §9.5 makes the time
 * optional and nobody was setting it, so the form stopped asking. The task the
 * Enquiry raises still needs an instant, and this is it, in IST.
 */
const FOLLOW_UP_HOUR = "11:00";

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
  customers,
  staff,
  canManage,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: EnquiryRowView[];
  projects: Array<{ id: string; name: string }>;
  plots: PlotOption[];
  people: Array<{
    id: string;
    fullName: string;
    mobileMasked: string;
    /** CUS-3390 / MEM-0012, where the Person holds that profile at all. */
    customerId: string | null;
    memberId: string | null;
  }>;
  members: Array<{ id: string; label: string }>;
  customers: Array<{ id: string; label: string }>;
  staff: Array<{ id: string; label: string; isSelf: boolean }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("ACTIVE");
  const [assigneeFilter, setAssigneeFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [followUp, setFollowUp] = React.useState<EnquiryRowView | null>(null);
  const [closing, setClosing] = React.useState<EnquiryRowView | null>(null);

  /** Who currently carries work here, for the filter beside the status one. */
  const assignees = Array.from(
    new Map(rows.map((r) => [r.assignedStaffCode ?? "", r.assignedTo])).entries()
  )
    .filter(([code]) => code !== "")
    .sort((a, b) => a[1].localeCompare(b[1]));

  const visible = rows.filter(
    (r) =>
      (statusFilter === "ALL" || r.status === statusFilter) &&
      (assigneeFilter === "ALL" || (r.assignedStaffCode ?? "") === assigneeFilter) &&
      (search.trim() === "" ||
        `${r.enquiryNo} ${r.name} ${r.city} ${r.mobileMasked} ${r.project} ${r.plot} ${r.plotRequirement ?? ""} ${r.assignedTo} ${r.assignedStaffCode ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
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
          <select
            className={filterClass}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="ALL">All assignees</option>
            {assignees.map(([code, name]) => (
              <option key={code} value={code}>
                {name} · {code}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-56"
            placeholder="Search name, city, Project, Plot or Enquiry ID"
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
            {/* A sheet: every fact under its own heading — when it came in, who
                it is, where they are, what they asked about — rather than two
                facts stacked in one cell. Only the Plot keeps a second line,
                for the type it is. */}
            <table className="w-full min-w-[64rem] border-collapse text-xs">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-[5.5rem] px-3 py-1.5">Date</th>
                  <th className="px-3 py-1.5">Name</th>
                  <th className="w-[6.5rem] px-3 py-1.5">Mobile</th>
                  <th className="w-[7rem] px-3 py-1.5">City</th>
                  <th className="px-3 py-1.5">Project</th>
                  <th className="w-[8rem] px-3 py-1.5">Plot</th>
                  <th className="w-[6rem] px-3 py-1.5">Status</th>
                  <th className="w-[9.5rem] px-3 py-1.5">Source</th>
                  <th className="w-[8rem] px-3 py-1.5">Follow-up</th>
                  {canManage && <th className="w-[6rem] px-3 py-1.5 text-center">Action</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-border/60 align-middle leading-tight last:border-0 hover:bg-secondary/50 [&>td]:px-3 [&>td]:py-1"
                  >
                    <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatIstDate(e.createdAt)}
                    </td>
                    <td>
                      <PersonLink personId={e.personId} name={e.name} />
                    </td>
                    <td className="whitespace-nowrap font-mono">{e.mobileMasked}</td>
                    <td>{e.city || "—"}</td>
                    <td>{e.project || "—"}</td>
                    <td>
                      {/* Three kinds of interest, and the column says which:
                          a Plot in inventory, something asked for that is not
                          in it yet, or the Project itself. */}
                      {e.plot !== "General" ? (
                        <>
                          <span className="block font-mono font-semibold">{e.plot}</span>
                          {e.plotType && (
                            <span className="block text-[11px] text-muted-foreground">
                              {humanise(e.plotType)}
                            </span>
                          )}
                        </>
                      ) : e.plotRequirement ? (
                        <span className="italic" title={e.plotRequirement}>
                          {e.plotRequirement}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">General</span>
                      )}
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
                        value={
                          e.sourceRefId ? (
                            <PersonLink
                              personId={e.sourceRefPersonId}
                              name={e.sourceRefId}
                              as={e.sourceRefKind ?? undefined}
                              className="font-mono"
                            />
                          ) : (
                            (SOURCE_LABEL[e.source] ?? humanise(e.source))
                          )
                        }
                        under={e.sourceRefName}
                      />
                    </td>
                    <td>
                      <Cell
                        value={e.lastOutcome ? humanise(e.lastOutcome) : "No follow-up yet"}
                        under={e.nextFollowUpAt ? `next ${formatIstDate(e.nextFollowUpAt)}` : null}
                      />
                    </td>
                    {canManage && (
                      <td className="whitespace-nowrap text-center">
                        {/* One button, the same shape the Plot row uses when a
                            row has more than one thing to do: a named trigger,
                            the choice behind it. Two pills side by side at the
                            edge of a row read as a pair fighting for the same
                            job. What ends the Enquiry is red inside the menu. */}
                        {e.status === "ACTIVE" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="xs" className="h-6 w-20 px-2 text-[11px]" disabled={busy}>
                                Update
                                <ChevronDown className="ml-0.5 h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center">
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
          customers={customers}
          staff={staff}
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



/** Read the way Plot Inventory reads them, so one Plot has one status. */
const PLOT_STATUS_LABEL: Record<string, string> = {
  NOT_AVAILABLE: "Not Available",
  AVAILABLE: "Available",
  HOLD: "Hold",
  WAITING_FOR_BOOKING_APPROVAL: "Waiting Approval",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  REFUND_PENDING: "Refund Pending",
  DELIVERED: "Delivered",
};

/**
 * Who the Enquiry came through — the Booking form's Sold By picker in every
 * respect: choose from the list, and what was chosen is echoed underneath as
 * the reference over the name, so a wrong pick is visible before submitting.
 *
 * It carries no label of its own: it sits inside the Enquiry Source field,
 * beside the choice that asked for it, and that field is already named.
 */
function SourcePersonPicker({
  name,
  placeholder,
  options,
  className,
}: {
  name: string;
  placeholder: string;
  options: Array<{ id: string; label: string }>;
  className?: string;
}) {
  const [picked, setPicked] = React.useState("");
  const chosen = options.find((o) => o.id === picked);
  const [code, ...rest] = (chosen?.label ?? "").split(" · ");

  return (
    <div className={className}>
      <PersonPicker
        name={name}
        required
        value={picked}
        onChange={setPicked}
        placeholder={placeholder}
        options={options}
      />
      {chosen && (
        <p className="mt-1 leading-tight">
          <span className="text-xs font-semibold tabular-nums">{code}</span>
          <br />
          <span className="text-[11px] text-muted-foreground">{rest.join(" · ")}</span>
        </p>
      )}
    </div>
  );
}

/**
 * New Enquiry — DESIGN §8.2 fields in the Booking form's own order: the Plot
 * first with its facts under it, then the Customer block, then the flat grid of
 * everything else. The Person block is the Booking form's Customer block, so a
 * first-time caller is captured here instead of having to exist already.
 */
function CreateEnquiryDialog({
  projects,
  plots,
  people,
  members,
  customers,
  staff,
  busy,
  onClose,
  onSubmit,
}: {
  projects: Array<{ id: string; name: string }>;
  plots: PlotOption[];
  people: Array<{
    id: string;
    fullName: string;
    mobileMasked: string;
    /** CUS-3390 / MEM-0012, where the Person holds that profile at all. */
    customerId: string | null;
    memberId: string | null;
  }>;
  members: Array<{ id: string; label: string }>;
  customers: Array<{ id: string; label: string }>;
  staff: Array<{ id: string; label: string; isSelf: boolean }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createEnquiryAction>[0]) => void;
}) {
  // "NEW" is a marker for this form only, exactly as the Booking form uses it:
  // a blank personId with a name and mobile beside it is a first-time caller.
  const [personId, setPersonId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [plotId, setPlotId] = React.useState("");
  const [source, setSource] = React.useState("DIRECT");
  const [assignedStaffId, setAssignedStaffId] = React.useState(
    staff.find((s) => s.isSelf)?.id ?? ""
  );
  const projectPlots = plots.filter((p) => p.projectId === projectId);
  const plot = plots.find((p) => p.id === plotId);

  return (
    <Modal title="New Enquiry" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            personId: personId === "NEW" ? "" : personId,
            fullName: String(f.get("fullName") ?? ""),
            mobile: String(f.get("mobile") ?? ""),
            city: String(f.get("city") ?? ""),
            projectId,
            plotId: plotId === "CUSTOM" ? "" : plotId,
            plotRequirement: String(f.get("plotRequirement") ?? ""),
            source: source as "DIRECT",
            sourceMemberId: source === "BY_MEMBER" ? String(f.get("sourceMemberId") ?? "") : "",
            sourceCustomerId: source === "BY_CUSTOMER" ? String(f.get("sourceCustomerId") ?? "") : "",
            assignedStaffId,
            nextFollowUpIso: istInstant(String(f.get("date")), FOLLOW_UP_HOUR),
            remark: String(f.get("remark") ?? ""),
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project">
            <select
              className={inputClass}
              required
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setPlotId("");
              }}
            >
              <option value="" disabled>
                Select a Project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Plot">
            <select
              className={inputClass}
              disabled={!projectId}
              value={plotId}
              onChange={(e) => setPlotId(e.target.value)}
            >
              <option value="">
                {projectId ? "General Enquiry — no Plot" : "Select a Project first"}
              </option>
              <option value="CUSTOM">Custom — not in inventory</option>
              {projectPlots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {plotId === "CUSTOM" && (
          <Field label="What they asked for — compulsory">
            <Input
              name="plotRequirement"
              className="h-9 text-xs"
              required
              placeholder="e.g. 40 × 60 corner, west facing"
            />
          </Field>
        )}

        {plot ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-xs">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium">
              {PLOT_STATUS_LABEL[plot.status] ?? plot.status.replaceAll("_", " ")}
            </dd>
            <dt className="text-muted-foreground">Size (W × L)</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatPlotSize(plot.widthFt, plot.lengthFt) ?? "Irregular"}
            </dd>
            <dt className="text-muted-foreground">Area</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatQuantity(plot.areaSqFt)} sq ft · {formatQuantity(plot.areaSqM)} sq m
            </dd>
          </dl>
        ) : plotId === "CUSTOM" ? (
          <p className="rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            A requirement, not a Plot: it allocates nothing and blocks nothing. Raise a Plot-wise
            Enquiry once inventory holds one that matches.
          </p>
        ) : null}

        {/* One person, so no bordered card and no section heading: an empty box
            around a single select is the space the Booking form spends on
            several Customers and their shares. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Customer">
              <PersonPicker
                required
                value={personId}
                onChange={setPersonId}
                newOptionLabel="+ New Person — enter details"
                placeholder="Search by name, mobile or Customer ID"
                options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
              />
            </Field>
          </div>

          {/* One question, one box, the way the Hold form asks it: the kind of
              Source and the Member or Customer behind it share a row, so
              choosing By Member fills the space beside the choice instead of
              pushing another field into the form. */}
          <div className="sm:col-span-2">
            <Field label="Enquiry Source">
              <div className="flex gap-2">
                <select
                  className={`${inputClass} w-44 shrink-0`}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  {SOURCE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {SOURCE_LABEL[value]}
                    </option>
                  ))}
                </select>
                {source === "BY_MEMBER" && (
                  <SourcePersonPicker
                    key="member"
                    className="min-w-0 flex-1"
                    name="sourceMemberId"
                    placeholder="Search by Member ID or name"
                    options={members}
                  />
                )}
                {source === "BY_CUSTOMER" && (
                  <SourcePersonPicker
                    key="customer"
                    className="min-w-0 flex-1"
                    name="sourceCustomerId"
                    placeholder="Search by Customer ID or name"
                    options={customers}
                  />
                )}
              </div>
            </Field>
          </div>

          {personId === "NEW" && (
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
              <Input className="h-9 text-xs" name="fullName" placeholder="Full name" required />
              <Input
                className="h-9 text-xs"
                name="mobile"
                placeholder="Mobile"
                inputMode="numeric"
                required
              />
              <Input className="h-9 text-xs" name="city" placeholder="City" />
            </div>
          )}

          <Field label="Assigned to">
            <select
              className={inputClass}
              value={assignedStaffId}
              onChange={(e) => setAssignedStaffId(e.target.value)}
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isSelf ? `${s.label} — you` : s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Next follow-up date">
            <input
              name="date"
              type="date"
              required
              defaultValue={addIstDays(istDay(new Date()), 1)}
              className={inputClass}
            />
          </Field>

          {/* A remark is a sentence, not a field width — it takes the row. */}
          <div className="sm:col-span-2">
            <Field label="Remark">
              <Input name="remark" className="h-9 text-xs" />
            </Field>
          </div>
        </div>

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
                {h.nextAt ? ` · next ${formatIstDate(h.nextAt)}` : ""}
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
            istInstant(String(f.get("date")), FOLLOW_UP_HOUR)
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
        <Field label="Next follow-up date">
          <input
            name="date"
            type="date"
            required
            defaultValue={addIstDays(istDay(new Date()), 2)}
            className={inputClass}
          />
        </Field>
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
