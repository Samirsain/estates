"use client";

// Administration — DESIGN.md §17; PRD.md §17.2, §21, §22.

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, History, Merge, Plus, ShieldOff, UserCheck, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatIst, type StaffRole } from "@/lib/tasks";

type IdentityRow = Awaited<ReturnType<typeof identityDirectoryAction>>[number];
import {
  decidePersonMergeAction,
  disableStaffAction,
  reassignWorkAction,
  requestPersonMergeAction,
  searchPersonsAction,
  createStaffAccountAction,
  resetStaffPasswordAction,
  staffCandidatesAction,
  identityDirectoryAction,
  revealIdentityAction,
  type IdentityReveal,
  type ActionResult,
  type PersonOption,
} from "./actions";

export type StaffRowView = {
  id: string;
  staffAccountId: string;
  name: string;
  mobileMasked: string;
  role: string;
  status: string;
  emergencyDisabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  lastLoginAt: string | null;
  openTasks: number;
  openEnquiries: number;
  mfaEnrolled: boolean;
};

export type QueuedTaskView = {
  id: string;
  taskNo: string;
  title: string;
  recordName: string;
  dueAt: string;
};

export type QueuedEnquiryView = { id: string; enquiryNo: string; person: string; project: string };

export type MergeView = {
  id: string;
  status: string;
  survivor: string;
  merged: string;
  reason: string;
  requestedByRef: string;
  requestedAt: string;
  decidedByRef: string | null;
  loyaltyRebuiltTo: number | null;
};

export type AuditView = {
  id: string;
  at: string;
  actorRef: string;
  actorRole: string | null;
  entity: string;
  entityId: string;
  action: string;
  reason: string | null;
};

const newKey = () => `admin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function AdministrationClient(props: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  canEmergencyDisable: boolean;
  canReassign: boolean;
  canMerge: boolean;
  canRevealIdentity: boolean;
  staff: StaffRowView[];
  queuedTasks: QueuedTaskView[];
  queuedEnquiries: QueuedEnquiryView[];
  merges: MergeView[];
  audit: AuditView[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState("staff");
  const [result, setResult] = React.useState<ActionResult | null>(null);

  const queueSize = props.queuedTasks.length + props.queuedEnquiries.length;

  function done(outcome: ActionResult) {
    setResult(outcome);
    if (outcome.ok) router.refresh();
  }

  return (
    <AppShell role={props.role} actorName={props.actorName} staffAccountId={props.staffAccountId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Administration</h1>
          <p className="text-xs text-muted-foreground">
            Staff lifecycle, the Unassigned Review queue, Person Merge and Activity History.
          </p>
        </div>

        {result && (
          <Card
            className={`p-4 text-sm ${
              result.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"
            }`}
          >
            {result.ok ? result.message : result.error}
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="staff">Staff ({props.staff.length})</TabsTrigger>
            <TabsTrigger value="queue">
              Unassigned Review{queueSize ? ` (${queueSize})` : ""}
            </TabsTrigger>
            <TabsTrigger value="merge">
              Person Merge ({props.merges.filter((m) => m.status === "PENDING").length})
            </TabsTrigger>
            <TabsTrigger value="identity">Aadhaar / PAN</TabsTrigger>
            <TabsTrigger value="audit">Activity History</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "staff" && (
          <StaffTab
            rows={props.staff}
            canEmergencyDisable={props.canEmergencyDisable}
            onResult={done}
          />
        )}
        {tab === "queue" && (
          <QueueTab
            tasks={props.queuedTasks}
            enquiries={props.queuedEnquiries}
            staff={props.staff.filter((s) => s.status === "ACTIVE")}
            canReassign={props.canReassign}
            onResult={done}
          />
        )}
        {tab === "merge" && (
          <MergeTab
            merges={props.merges}
            canMerge={props.canMerge}
            isMd={props.role === "MD"}
            onResult={done}
          />
        )}
        {tab === "identity" && <IdentityTab canReveal={props.canRevealIdentity} />}
        {tab === "audit" && <AuditTab rows={props.audit} />}
      </div>
    </AppShell>
  );
}

/* --------------------------------------------------------------- staff */

function StaffTab({
  rows,
  canEmergencyDisable,
  onResult,
}: {
  rows: StaffRowView[];
  canEmergencyDisable: boolean;
  onResult: (result: ActionResult) => void;
}) {
  const router = useRouter();
  const [target, setTarget] = React.useState<StaffRowView | null>(null);
  const [resetting, setResetting] = React.useState<StaffRowView | null>(null);
  const [creating, setCreating] = React.useState(false);

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Staff accounts</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <UserPlus className="mr-2 h-3.5 w-3.5" /> Create account
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Account</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Open work</th>
              <th className="py-2 pr-4 font-medium">MFA</th>
              <th className="py-2 pr-4 font-medium">Last login</th>
              <th className="py-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/40">
                <td className="py-2 pr-4">
                  <div className="font-medium text-foreground">{row.name}</div>
                  <div className="text-muted-foreground">
                    {row.staffAccountId} · {row.mobileMasked}
                  </div>
                </td>
                <td className="py-2 pr-4">{row.role}</td>
                <td className="py-2 pr-4">
                  {row.status === "ACTIVE" ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <div className="space-y-1">
                      <Badge variant="destructive">
                        {row.emergencyDisabled ? "Emergency disabled" : "Disabled"}
                      </Badge>
                      {row.disabledReason && (
                        <div className="text-muted-foreground">{row.disabledReason}</div>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {row.openTasks} task(s), {row.openEnquiries} enquiry(ies)
                </td>
                <td className="py-2 pr-4">
                  {row.mfaEnrolled ? "Enrolled" : (row.role === "MD" || row.role === "ADMIN") ? (
                    <span className="text-amber-400">Required</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-4">{row.lastLoginAt ? formatIst(row.lastLoginAt) : "Never"}</td>
                <td className="py-2 pr-4">
                  {row.status === "ACTIVE" && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setResetting(row)}>
                        Reset password
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setTarget(row)}>
                        <ShieldOff className="mr-2 h-3.5 w-3.5" /> Disable
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <DisableModal
          target={target}
          canEmergencyDisable={canEmergencyDisable}
          onClose={() => setTarget(null)}
          onResult={onResult}
        />
      )}

      {creating && (
        <CreateStaffModal onClose={() => setCreating(false)} onRefresh={() => router.refresh()} />
      )}

      {resetting && (
        <ResetPasswordModal
          target={resetting}
          onClose={() => setResetting(null)}
          onRefresh={() => router.refresh()}
        />
      )}
    </Card>
  );
}

function DisableModal({
  target,
  canEmergencyDisable,
  onClose,
  onResult,
}: {
  target: StaffRowView;
  canEmergencyDisable: boolean;
  onClose: () => void;
  onResult: (result: ActionResult) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [emergency, setEmergency] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const openWork = target.openTasks + target.openEnquiries;

  async function submit() {
    setBusy(true);
    const outcome = await disableStaffAction(target.id, reason, emergency, newKey());
    setBusy(false);
    onResult(outcome);
    if (outcome.ok) onClose();
  }

  return (
    <Modal
      title={`Disable ${target.name}`}
      description={`${target.staffAccountId} · ${target.role}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {openWork > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This account holds {target.openTasks} open task(s) and {target.openEnquiries}{" "}
            Enquiry(ies). A planned disable is refused until they are reassigned; Emergency Disable
            blocks the login now and queues them for review.
          </p>
        )}

        <Field label="Compulsory reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        {canEmergencyDisable && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => setEmergency(e.target.checked)}
            />
            Emergency Disable — block access immediately and queue the open work
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "Disabling…" : emergency ? "Emergency Disable" : "Disable account"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- queue */

function QueueTab({
  tasks,
  enquiries,
  staff,
  canReassign,
  onResult,
}: {
  tasks: QueuedTaskView[];
  enquiries: QueuedEnquiryView[];
  staff: StaffRowView[];
  canReassign: boolean;
  onResult: (result: ActionResult) => void;
}) {
  const [taskIds, setTaskIds] = React.useState<string[]>([]);
  const [enquiryIds, setEnquiryIds] = React.useState<string[]>([]);
  const [to, setTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  async function submit() {
    setBusy(true);
    const outcome = await reassignWorkAction(to, taskIds, enquiryIds, newKey());
    setBusy(false);
    onResult(outcome);
    if (outcome.ok) {
      setTaskIds([]);
      setEnquiryIds([]);
    }
  }

  if (tasks.length === 0 && enquiries.length === 0) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">
        Nothing is waiting for reassignment.
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      {tasks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Tasks</h2>
          {tasks.map((task) => (
            <label key={task.id} className="flex items-center gap-3 text-xs">
              <input
                type="checkbox"
                checked={taskIds.includes(task.id)}
                onChange={() => setTaskIds((list) => toggle(list, task.id))}
              />
              <span className="font-medium">{task.taskNo}</span>
              <span>{task.title}</span>
              <span className="text-muted-foreground">{task.recordName}</span>
              <span className="text-muted-foreground">due {formatIst(task.dueAt)}</span>
            </label>
          ))}
        </div>
      )}

      {enquiries.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Enquiries</h2>
          {enquiries.map((enquiry) => (
            <label key={enquiry.id} className="flex items-center gap-3 text-xs">
              <input
                type="checkbox"
                checked={enquiryIds.includes(enquiry.id)}
                onChange={() => setEnquiryIds((list) => toggle(list, enquiry.id))}
              />
              <span className="font-medium">{enquiry.enquiryNo}</span>
              <span>{enquiry.person}</span>
              <span className="text-muted-foreground">{enquiry.project}</span>
            </label>
          ))}
        </div>
      )}

      {canReassign && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Field label="Reassign to">
              <select className={inputClass} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Select an active account</option>
                {staff.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.staffAccountId} · {account.name} ({account.role})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            onClick={submit}
            disabled={busy || !to || taskIds.length + enquiryIds.length === 0}
          >
            <UserCheck className="mr-2 h-3.5 w-3.5" />
            {busy ? "Reassigning…" : "Reassign selected"}
          </Button>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- merge */

function MergeTab({
  merges,
  canMerge,
  isMd,
  onResult,
}: {
  merges: MergeView[];
  canMerge: boolean;
  isMd: boolean;
  onResult: (result: ActionResult) => void;
}) {
  const [raising, setRaising] = React.useState(false);
  const [deciding, setDeciding] = React.useState<MergeView | null>(null);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Person Merge</h2>
        {canMerge && (
          <Button size="sm" onClick={() => setRaising(true)}>
            <Merge className="mr-2 h-3.5 w-3.5" /> Raise a merge
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Two Active Members cannot be merged — deactivate one first. Only the MD decides. Loyalty is
        rebuilt from unique qualifying events, and old IDs stay searchable (PRD §22).
      </p>

      {merges.length === 0 ? (
        <p className="text-xs text-muted-foreground">No merges raised.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Survivor</th>
                <th className="py-2 pr-4 font-medium">Merged away</th>
                <th className="py-2 pr-4 font-medium">Reason</th>
                <th className="py-2 pr-4 font-medium">Raised</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {merges.map((merge) => (
                <tr key={merge.id} className="border-t border-border/40">
                  <td className="py-2 pr-4">
                    <Badge variant={merge.status === "PENDING" ? "secondary" : "outline"}>
                      {merge.status}
                    </Badge>
                    {merge.loyaltyRebuiltTo !== null && (
                      <div className="mt-1 text-muted-foreground">
                        Loyalty rebuilt to {merge.loyaltyRebuiltTo}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4">{merge.survivor}</td>
                  <td className="py-2 pr-4">{merge.merged}</td>
                  <td className="py-2 pr-4">{merge.reason}</td>
                  <td className="py-2 pr-4">
                    {merge.requestedByRef}
                    <div className="text-muted-foreground">{formatIst(merge.requestedAt)}</div>
                  </td>
                  <td className="py-2 pr-4">
                    {merge.status === "PENDING" && isMd && (
                      <Button size="sm" variant="outline" onClick={() => setDeciding(merge)}>
                        Decide
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {raising && <RaiseMergeModal onClose={() => setRaising(false)} onResult={onResult} />}
      {deciding && (
        <DecideMergeModal
          merge={deciding}
          onClose={() => setDeciding(null)}
          onResult={onResult}
        />
      )}
    </Card>
  );
}

function RaiseMergeModal({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (result: ActionResult) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<PersonOption[]>([]);
  const [survivor, setSurvivor] = React.useState("");
  const [merged, setMerged] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchPersonsAction(query);
      if (!cancelled) setOptions(found);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function submit() {
    setBusy(true);
    const outcome = await requestPersonMergeAction(survivor, merged, reason, newKey());
    setBusy(false);
    onResult(outcome);
    if (outcome.ok) onClose();
  }

  return (
    <Modal
      title="Raise a Person Merge"
      description="The MD decides it. Nothing changes until then."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="Search by name, mobile, Customer ID or Member ID">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type at least 2 characters" />
        </Field>

        <Field label="Surviving identity (this one remains)">
          <select className={inputClass} value={survivor} onChange={(e) => setSurvivor(e.target.value)}>
            <option value="">Select</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Merged away (its old IDs stay searchable)">
          <select className={inputClass} value={merged} onChange={(e) => setMerged(e.target.value)}>
            <option value="">Select</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Compulsory reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !survivor || !merged || survivor === merged || !reason.trim()}
          >
            {busy ? "Raising…" : "Raise merge"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DecideMergeModal({
  merge,
  onClose,
  onResult,
}: {
  merge: MergeView;
  onClose: () => void;
  onResult: (result: ActionResult) => void;
}) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function decide(approve: boolean) {
    setBusy(true);
    const outcome = await decidePersonMergeAction(merge.id, approve, note, newKey());
    setBusy(false);
    onResult(outcome);
    if (outcome.ok) onClose();
  }

  return (
    <Modal
      title="Decide the merge"
      description={`${merge.merged} merges into ${merge.survivor}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Raised by {merge.requestedByRef}: {merge.reason}</p>
        <Field label="Compulsory remark">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => decide(false)} disabled={busy || !note.trim()}>
            Reject
          </Button>
          <Button onClick={() => decide(true)} disabled={busy || !note.trim()}>
            Approve merge
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- audit */

function AuditTab({ rows }: { rows: AuditView[] }) {
  if (rows.length === 0) {
    return <Card className="p-5 text-sm text-muted-foreground">No audit entries visible to this role.</Card>;
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" /> Activity History
      </h2>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Actor</th>
              <th className="py-2 pr-4 font-medium">Record</th>
              <th className="py-2 pr-4 font-medium">Action</th>
              <th className="py-2 pr-4 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/40">
                <td className="whitespace-nowrap py-2 pr-4">{formatIst(row.at)}</td>
                <td className="py-2 pr-4">
                  {row.actorRef}
                  {row.actorRole && <span className="text-muted-foreground"> · {row.actorRole}</span>}
                </td>
                <td className="py-2 pr-4">
                  {row.entity}
                  <div className="text-muted-foreground">{row.entityId.slice(0, 8)}</div>
                </td>
                <td className="py-2 pr-4">{row.action}</td>
                <td className="py-2 pr-4">{row.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------ staff create / reset */

/** The one-time password is shown once, here, and never stored in clear. */
function OneTimePasswordCard({ password, onDone }: { password: string; onDone: () => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="text-xs text-amber-200">
        Give this to the account holder now. It is shown only once and cannot be recovered — if it is
        lost, issue a reset.
      </p>
      <p className="break-all font-mono text-lg text-foreground">{password}</p>
      <p className="text-xs text-muted-foreground">
        They change it themselves under My Account at first sign in.
      </p>
      <Button size="sm" onClick={onDone}>
        I have passed it on
      </Button>
    </div>
  );
}

function CreateStaffModal({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [candidates, setCandidates] = React.useState<PersonOption[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    staffCandidatesAction().then((found) => {
      if (!cancelled) setCandidates(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const outcome = await createStaffAccountAction(
      {
        personId: String(f.get("personId")),
        role: String(f.get("role")) as StaffRole,
        staffAccountId: String(f.get("staffAccountId")),
      },
      newKey()
    );
    setBusy(false);
    if (outcome.ok) {
      setIssued(outcome.oneTimePassword);
      onRefresh();
    } else {
      setError(outcome.error);
    }
  }

  return (
    <Modal
      title="Create a staff account"
      description="One Person holds one staff login. MD and Admin must also enrol MFA before their access is complete."
      onClose={onClose}
    >
      {issued ? (
        <OneTimePasswordCard
          password={issued}
          onDone={() => {
            setIssued(null);
            onClose();
          }}
        />
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Person">
            <select name="personId" className={inputClass} required defaultValue="">
              <option value="" disabled>
                {candidates.length === 0 ? "Everyone already has an account" : "Select a Person"}
              </option>
              {candidates.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Staff Account ID">
            <Input name="staffAccountId" required placeholder="STF-0009" />
          </Field>
          <Field label="Role">
            <select name="role" className={inputClass} required defaultValue="CRM">
              {["MD", "ADMIN", "ACCOUNTS", "CRM", "MIS", "PC"].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ResetPasswordModal({
  target,
  onClose,
  onRefresh,
}: {
  target: StaffRowView;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
    setBusy(true);
    setError(null);
    const outcome = await resetStaffPasswordAction(target.id, reason, newKey());
    setBusy(false);
    if (outcome.ok) {
      setIssued(outcome.oneTimePassword);
      onRefresh();
    } else {
      setError(outcome.error);
    }
  }

  return (
    <Modal
      title={`Reset password — ${target.name}`}
      description={`${target.staffAccountId} · ${target.role}. Every session of this account is signed out immediately.`}
      onClose={onClose}
    >
      {issued ? (
        <OneTimePasswordCard
          password={issued}
          onDone={() => {
            setIssued(null);
            onClose();
          }}
        />
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Compulsory reason">
            <Input name="reason" required minLength={3} placeholder="Forgot password, verified by phone" />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Resetting…" : "Issue one-time password"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------- protected identity (RD-05) */

/**
 * PRD RD-05 — MD and Admin may read a full Aadhaar or PAN. The list stays
 * masked and each reveal is its own logged security event, so "who looked at
 * whose Aadhaar, and when" is always answerable.
 */
function IdentityTab({ canReveal }: { canReveal: boolean }) {
  const [query, setQuery] = React.useState("");
  const [rows, setRows] = React.useState<IdentityRow[]>([]);
  const [revealed, setRevealed] = React.useState<Record<string, IdentityReveal>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const found = await identityDirectoryAction(query);
      if (!cancelled) {
        setRows(found);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function reveal(personId: string) {
    setError(null);
    const outcome = await revealIdentityAction(personId);
    if (outcome.ok) {
      setRevealed((current) => ({ ...current, [personId]: outcome.reveal }));
    } else {
      setError(outcome.error);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" /> Aadhaar and PAN
        </h2>
        <Input
          className="h-9 w-64"
          placeholder="Search name, mobile, Customer ID, Member ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {canReveal
          ? "Values are masked until you reveal them. Every reveal is written to the security log with your account and the Person it was read for (PRD RD-05)."
          : "Your role sees masked values only. Full Aadhaar and PAN are limited to MD and Admin."}
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody matches that search.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 font-medium">Aadhaar</th>
                <th className="py-2 pr-4 font-medium">PAN</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = revealed[row.id];
                return (
                  <tr key={row.id} className="border-t border-border/40">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-foreground">{row.fullName}</div>
                      <div className="text-muted-foreground">
                        {row.reference} · {row.mobileMasked}
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {open ? (open.aadhaar ?? "Not recorded") : row.aadhaarMasked}
                      <div className="font-sans text-muted-foreground">{row.aadhaarStatus}</div>
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {open ? (open.pan ?? "Not recorded") : row.panMasked}
                      <div className="font-sans text-muted-foreground">{row.panStatus}</div>
                    </td>
                    <td className="py-2 pr-4">
                      {canReveal && !open && (
                        <Button size="sm" variant="outline" onClick={() => reveal(row.id)}>
                          Reveal
                        </Button>
                      )}
                      {open && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setRevealed((current) => {
                              const next = { ...current };
                              delete next[row.id];
                              return next;
                            })
                          }
                        >
                          Hide
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
