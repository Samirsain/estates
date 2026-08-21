"use client";

// Plot Inventory table and state actions — DESIGN.md §7.
// Actions are hidden by permission for clarity; the server re-checks every one.

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "@/components/ui/modal";
import { formatIst, istDay, type StaffRole } from "@/lib/tasks";
import {
  cancelHoldAction,
  createHoldAction,
  decideHoldExtensionAction,
  decideHoldRequestAction,
  makeAvailableAction,
  prepareInventoryAction,
  requestExtensionAction,
  setRestrictionAction,
  type ActionResult,
} from "./actions";

export type PlotRowView = {
  id: string;
  project: string;
  projectId: string;
  plotType: string;
  plotNumber: string;
  areaSqYd: string;
  areaSqFt: string;
  lifecycle: string;
  restriction: string;
  restrictionReason: string | null;
  isResale: boolean;
  plcCodes: string[];
  facing: string;
  hold: {
    id: string;
    heldForName: string;
    expiresAt: string;
    extensionCount: number;
    pendingExtension: boolean;
    pendingExtensionId: string | null;
    pendingExtensionReason: string | null;
    /** Frozen behind a Booking Request — the timer is not running (PRD §10.5). */
    frozen: boolean;
  } | null;
};

export type HoldRequestView = {
  id: string;
  project: string;
  plot: string;
  plotLifecycle: string;
  buyer: string;
  member: string;
  createdAt: string;
  expiresAt: string;
  queuePosition: number;
};

type ProjectView = {
  id: string;
  name: string;
  lifecycle: string;
  plcCodes: string[];
  rawPlcCodes: string[];
};

const LIFECYCLE_LABEL: Record<string, string> = {
  NOT_AVAILABLE: "Not Available",
  AVAILABLE: "Available",
  HOLD: "Hold",
  WAITING_FOR_BOOKING_APPROVAL: "Waiting for Booking Approval",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  REFUND_PENDING: "Refund Pending",
  DELIVERED: "Delivered",
};

const RESTRICTION_LABEL: Record<string, string> = {
  NONE: "—",
  NOT_YET_RELEASED: "Not Yet Released",
  NOT_FOR_SALE: "Not for Sale",
  PLEDGE: "Pledge",
};

const inputClass =
  "h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function lifecycleVariant(lifecycle: string) {
  if (lifecycle === "AVAILABLE") return "success" as const;
  if (lifecycle === "HOLD") return "warning" as const;
  if (lifecycle === "NOT_AVAILABLE") return "outline" as const;
  return "info" as const;
}

export default function PlotsClient({
  role,
  actorName,
  staffAccountId,
  rows,
  holdRequests,
  projects,
  people,
  permissions,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  rows: PlotRowView[];
  holdRequests: HoldRequestView[];
  projects: ProjectView[];
  people: Array<{ id: string; fullName: string; primaryMobile: string }>;
  permissions: {
    makeAvailable: boolean;
    restriction: boolean;
    hold: boolean;
    extend: boolean;
    decideExtension: boolean;
    setup: boolean;
    reviewRequests: boolean;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [projectFilter, setProjectFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<
    | { kind: "HOLD"; plot: PlotRowView }
    | { kind: "AVAILABLE"; plot: PlotRowView }
    | { kind: "RESTRICT"; plot: PlotRowView }
    | { kind: "CANCEL_HOLD"; plot: PlotRowView }
    | { kind: "EXTEND"; plot: PlotRowView }
    | { kind: "PREPARE" }
    | { kind: "DECIDE_REQUEST"; request: HoldRequestView; approve: boolean }
    | { kind: "DECIDE_EXTENSION"; plot: PlotRowView; approve: boolean }
    | null
  >(null);

  const visible = rows.filter(
    (r) =>
      (projectFilter === "ALL" || r.projectId === projectFilter) &&
      (statusFilter === "ALL" || r.lifecycle === statusFilter) &&
      (search.trim() === "" ||
        `${r.plotNumber} ${r.project} ${r.hold?.heldForName ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

  async function run(action: () => Promise<ActionResult>) {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    setNotice(
      result.ok
        ? { kind: "ok", text: result.message ?? "Done." }
        : { kind: "error", text: result.error }
    );
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
    return result.ok;
  }

  const newKey = () => globalThis.crypto.randomUUID();

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Plot Inventory</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {visible.length} of {rows.length} Plots · Location Charge is a percentage only ·
              times in Asia/Kolkata
            </p>
          </div>
          {permissions.setup && (
            <Button size="sm" variant="gradient" onClick={() => setDialog({ kind: "PREPARE" })}>
              <Plus className="mr-1 h-4 w-4" /> Prepare Inventory
            </Button>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputClass} h-9 w-auto`}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Filter by Project"
          >
            <option value="ALL">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} h-9 w-auto`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {Object.entries(LIFECYCLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-56"
            placeholder="Search Plot Number or Customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {notice && (
          <Card
            className={`p-4 ${
              notice.kind === "ok"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-red-500/40 bg-red-500/5"
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

        {/* DESIGN §9.3 — the Member Hold Request queue lives inside Plot
            Inventory, not as its own top-level tab. */}
        {permissions.reviewRequests && holdRequests.length > 0 && (
          <Card className="space-y-3 p-4">
            <div>
              <h2 className="text-sm font-semibold">Member Hold Requests — {holdRequests.length} Pending</h2>
              <p className="text-xs text-muted-foreground">
                Each request names the actual buyer. A request expires on the working-day cut-off and
                cannot be approved after that.
              </p>
            </div>
            <ul className="space-y-2">
              {holdRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/50 p-3"
                >
                  <div className="min-w-0 space-y-0.5 text-xs">
                    <p className="text-sm font-semibold">
                      {r.project} · <span className="font-mono text-primary">{r.plot}</span>
                      <Badge variant="outline" className="ml-2">
                        Queue #{r.queuePosition}
                      </Badge>
                    </p>
                    <p className="text-muted-foreground">
                      For {r.buyer} · requested by {r.member}
                    </p>
                    <p className="text-muted-foreground">
                      Submitted {formatIst(r.createdAt)} · expires {formatIst(r.expiresAt)}
                      {r.plotLifecycle !== "AVAILABLE"
                        ? ` · Plot is now ${LIFECYCLE_LABEL[r.plotLifecycle] ?? r.plotLifecycle}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setDialog({ kind: "DECIDE_REQUEST", request: r, approve: false })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setDialog({ kind: "DECIDE_REQUEST", request: r, approve: true })}
                    >
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {visible.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm font-semibold">No Plots match these filters.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length === 0
                ? permissions.setup
                  ? "Use Prepare Inventory to add Plots to a Project."
                  : "Inventory has not been prepared yet."
                : "Clear a filter to see more inventory."}
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] border-separate border-spacing-y-2 text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1">Project</th>
                  <th className="px-3 py-1">Plot Type / Number</th>
                  <th className="px-3 py-1">Area</th>
                  <th className="px-3 py-1">Status</th>
                  <th className="px-3 py-1">Location Charge (PLC %)</th>
                  <th className="px-3 py-1">Restriction</th>
                  <th className="px-3 py-1">Customer</th>
                  <th className="px-3 py-1">Next action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((plot) => (
                  <tr key={plot.id} className="glass-card rounded-xl align-top">
                    <td className="rounded-l-xl px-3 py-3">{plot.project}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono font-semibold text-primary">{plot.plotNumber}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {plot.plotType.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {plot.areaSqYd} sq yd
                      <span className="block text-[11px] text-muted-foreground">{plot.areaSqFt} sq ft</span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={lifecycleVariant(plot.lifecycle)}>
                        {LIFECYCLE_LABEL[plot.lifecycle] ?? plot.lifecycle}
                      </Badge>
                      {plot.isResale && (
                        <Badge variant="outline" className="ml-1">
                          RESALE
                        </Badge>
                      )}
                      {plot.hold && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {plot.hold.frozen
                            ? "Hold timer frozen — Booking Request under review"
                            : `Expires ${formatIst(plot.hold.expiresAt)}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {plot.plcCodes.length ? plot.plcCodes.join(", ") : "None"}
                      <span className="block text-[11px]">{plot.facing}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {RESTRICTION_LABEL[plot.restriction] ?? plot.restriction}
                      {plot.restrictionReason && (
                        <span className="block text-[11px] text-muted-foreground">
                          {plot.restrictionReason}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {plot.hold ? (
                        <>
                          {plot.hold.heldForName}
                          <span className="block text-[11px] text-muted-foreground">
                            Extensions: {plot.hold.extensionCount}
                            {plot.hold.pendingExtension ? " · request pending" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="rounded-r-xl px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {plot.lifecycle === "NOT_AVAILABLE" && permissions.makeAvailable && (
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "AVAILABLE", plot })}>
                            Make Available
                          </Button>
                        )}
                        {plot.lifecycle === "AVAILABLE" && permissions.hold && (
                          <Button size="sm" onClick={() => setDialog({ kind: "HOLD", plot })}>
                            Hold
                          </Button>
                        )}
                        {["AVAILABLE", "NOT_AVAILABLE"].includes(plot.lifecycle) && permissions.restriction && (
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "RESTRICT", plot })}>
                            Restriction
                          </Button>
                        )}
                        {plot.lifecycle === "HOLD" &&
                          plot.hold &&
                          permissions.extend &&
                          !plot.hold.pendingExtension && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: "EXTEND", plot })}
                            >
                              Extend Hold
                            </Button>
                          )}
                        {/* PRD §8.5 — a further extension is Admin's decision, and
                            reviewing it never pauses the Hold expiry. */}
                        {plot.hold?.pendingExtension && permissions.decideExtension && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setDialog({ kind: "DECIDE_EXTENSION", plot, approve: true })}
                            >
                              Approve extension
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: "DECIDE_EXTENSION", plot, approve: false })}
                            >
                              Reject extension
                            </Button>
                          </>
                        )}
                        {plot.lifecycle === "HOLD" && plot.hold && permissions.hold && (
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "CANCEL_HOLD", plot })}>
                            Cancel Hold
                          </Button>
                        )}
                        {plot.lifecycle === "AVAILABLE" && (
                          <Button size="sm" variant="ghost" disabled title="Booking Requests arrive in Phase 3.">
                            Start Booking
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === "HOLD" && (
        <ConfirmDialog
          title="Hold Plot"
          plot={dialog.plot}
          consequence="A Hold runs for 72 hours from now and counts toward the Customer's three open Plot positions. The PLC snapshot is frozen at creation."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <>
              <Field label="Actual Customer / Person — required">
                <select name="personId" required className={inputClass} defaultValue="">
                  <option value="" disabled>
                    Select the actual Person
                  </option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} · {p.primaryMobile}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Remark (optional)">
                <Input name="remark" />
              </Field>
            </>
          }
          onSubmit={(f) =>
            run(() =>
              createHoldAction(
                dialog.plot.id,
                String(f.get("personId")),
                String(f.get("remark") ?? ""),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "AVAILABLE" && (
        <ConfirmDialog
          title="Make Available"
          plot={dialog.plot}
          consequence="The Plot becomes Available for Hold or Booking. This action does not also place a Hold — use Hold separately."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <Field label="Reason — compulsory">
              <Input name="reason" required minLength={3} />
            </Field>
          }
          onSubmit={(f) => run(() => makeAvailableAction(dialog.plot.id, String(f.get("reason")), newKey()))}
        />
      )}

      {dialog?.kind === "RESTRICT" && (
        <ConfirmDialog
          title="Change restriction"
          plot={dialog.plot}
          consequence="Not for Sale and Pledge keep the Plot Not Available, including whenever it returns from a Hold or a cancelled Booking."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <>
              <Field label="Restriction">
                <select name="restriction" className={inputClass} defaultValue={dialog.plot.restriction}>
                  {Object.entries(RESTRICTION_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {value === "NONE" ? "No restriction" : label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason — compulsory">
                <Input name="reason" required minLength={3} />
              </Field>
            </>
          }
          onSubmit={(f) =>
            run(() =>
              setRestrictionAction(
                dialog.plot.id,
                f.get("restriction") as "NONE",
                String(f.get("reason")),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "CANCEL_HOLD" && dialog.plot.hold && (
        <ConfirmDialog
          title="Cancel Hold"
          plot={dialog.plot}
          consequence="The Plot returns under its restriction rule: Available when unrestricted, Not Available when Not for Sale or Pledge is active."
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <Field label="Reason — compulsory">
              <Input name="reason" required minLength={3} />
            </Field>
          }
          onSubmit={(f) =>
            run(() => cancelHoldAction(dialog.plot.hold!.id, String(f.get("reason")), newKey()))
          }
        />
      )}

      {dialog?.kind === "EXTEND" && dialog.plot.hold && (
        <ConfirmDialog
          title="Request Hold extension"
          plot={dialog.plot}
          consequence={`Requesting an extension does not pause the Hold timer. Current expiry: ${formatIst(
            dialog.plot.hold.expiresAt
          )}. ${
            dialog.plot.hold.extensionCount >= 1
              ? "This is a further extension, so Admin approval is required."
              : "This is the first extension, which CRM may approve."
          }`}
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <>
              <Field label="Additional hours">
                <input name="hours" type="number" min={1} max={168} defaultValue={24} className={inputClass} />
              </Field>
              <Field label="Reason — compulsory">
                <Input name="reason" required minLength={3} />
              </Field>
            </>
          }
          onSubmit={(f) =>
            run(() =>
              requestExtensionAction(
                dialog.plot.hold!.id,
                String(f.get("reason")),
                Number(f.get("hours")),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "DECIDE_EXTENSION" && dialog.plot.hold?.pendingExtensionId && (
        <ConfirmDialog
          title={dialog.approve ? "Approve Hold extension" : "Reject Hold extension"}
          plot={dialog.plot}
          consequence={`${
            dialog.approve
              ? "The new expiry applies from the original expiry, not from now."
              : "The Hold keeps its existing expiry."
          } Reviewing never pauses the timer — current expiry ${formatIst(
            dialog.plot.hold.expiresAt
          )}.${
            dialog.plot.hold.pendingExtensionReason
              ? ` Requested because: ${dialog.plot.hold.pendingExtensionReason}`
              : ""
          }`}
          busy={busy}
          onClose={() => setDialog(null)}
          fields={
            <Field label="Remark">
              <Input name="note" />
            </Field>
          }
          onSubmit={(f) =>
            run(() =>
              decideHoldExtensionAction(
                dialog.plot.hold!.pendingExtensionId!,
                dialog.approve,
                String(f.get("note") ?? ""),
                newKey()
              )
            )
          }
        />
      )}

      {dialog?.kind === "DECIDE_REQUEST" && (
        <Modal
          title={dialog.approve ? "Approve Member Hold Request" : "Reject Member Hold Request"}
          onClose={() => setDialog(null)}
        >
          <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
            <p className="font-semibold text-foreground">
              {dialog.request.project} · {dialog.request.plot} · for {dialog.request.buyer}
            </p>
            <p className="mt-1 text-muted-foreground">
              {dialog.approve
                ? "Approval creates a 72-hour Hold for the named buyer and freezes the Plot's PLC snapshot. The buyer's three open Plot positions are re-checked now."
                : "The remark is shown to the Member. The Plot stays as it is."}
            </p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const note = String(new FormData(e.currentTarget).get("note"));
              run(() => decideHoldRequestAction(dialog.request.id, dialog.approve, note, newKey()));
            }}
          >
            <Field label="Remark — compulsory">
              <Input name="note" required minLength={3} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Back
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Processing…" : dialog.approve ? "Confirm approval" : "Confirm rejection"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === "PREPARE" && (
        <PrepareInventoryDialog
          projects={projects}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(projectId, rows) => run(() => prepareInventoryAction(projectId, rows, newKey()))}
        />
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------------- dialogs */



/** DESIGN §5.1 — record identifier, exact action, consequences, compulsory reason. */
function ConfirmDialog({
  title,
  plot,
  consequence,
  fields,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  plot: PlotRowView;
  consequence: string;
  fields: React.ReactNode;
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">
          {plot.project} · {plot.plotType.replaceAll("_", " ")} {plot.plotNumber}
        </p>
        <p className="mt-1 text-muted-foreground">{consequence}</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        {fields}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Processing…" : "Confirm"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type GridRow = {
  plotNumber: string;
  plotType: string;
  widthFt: string;
  lengthFt: string;
  exactAreaSqFt: string;
  exactAreaReason: string;
  plcCodes: string;
  parkFacing: boolean;
};

const EMPTY_ROW: GridRow = {
  plotNumber: "",
  plotType: "RESIDENTIAL",
  widthFt: "",
  lengthFt: "",
  exactAreaSqFt: "",
  exactAreaReason: "",
  plcCodes: "",
  parkFacing: false,
};

/** PRD §16.4 — controlled Excel-style grid inside the CRM; no CSV upload. */
function PrepareInventoryDialog({
  projects,
  busy,
  onClose,
  onSubmit,
}: {
  projects: ProjectView[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (projectId: string, rows: Parameters<typeof prepareInventoryAction>[1]) => void;
}) {
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [rows, setRows] = React.useState<GridRow[]>([{ ...EMPTY_ROW }]);
  const project = projects.find((p) => p.id === projectId);

  const update = (index: number, patch: Partial<GridRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <Modal title="Prepare Inventory" onClose={onClose} wide>
      <p className="text-xs text-muted-foreground">
        Every Plot is created as Not Available — Not Yet Released. Release it with Make Available.
        Enter Width and Length, or an exact area with a compulsory reason for an irregular Plot.
        Plot uniqueness is Project + Plot Type + Plot Number.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project">
          <select className={inputClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="PLC components in the current rule version">
          <p className="rounded-xl border border-border/60 bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {project?.plcCodes.length ? project.plcCodes.join(" · ") : "No current PLC rule version"}
          </p>
        </Field>
      </div>

      <div className="max-h-[45vh] overflow-auto">
        <table className="w-full min-w-[54rem] text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-1">Plot No.</th>
              <th className="p-1">Type</th>
              <th className="p-1">Width ft</th>
              <th className="p-1">Length ft</th>
              <th className="p-1">Exact area sq ft</th>
              <th className="p-1">Override reason</th>
              <th className="p-1">PLC codes</th>
              <th className="p-1">Park</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="p-1">
                  <input
                    className={`${inputClass} h-8`}
                    value={row.plotNumber}
                    onChange={(e) => update(i, { plotNumber: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <select
                    className={`${inputClass} h-8`}
                    value={row.plotType}
                    onChange={(e) => update(i, { plotType: e.target.value })}
                  >
                    {["RESIDENTIAL", "COMMERCIAL", "INFORMAL_SECTOR"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <input
                    className={`${inputClass} h-8`}
                    value={row.widthFt}
                    onChange={(e) => update(i, { widthFt: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    className={`${inputClass} h-8`}
                    value={row.lengthFt}
                    onChange={(e) => update(i, { lengthFt: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    className={`${inputClass} h-8`}
                    value={row.exactAreaSqFt}
                    onChange={(e) => update(i, { exactAreaSqFt: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    className={`${inputClass} h-8`}
                    value={row.exactAreaReason}
                    onChange={(e) => update(i, { exactAreaReason: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    className={`${inputClass} h-8`}
                    placeholder={project?.rawPlcCodes.join(",") ?? ""}
                    value={row.plcCodes}
                    onChange={(e) => update(i, { plcCodes: e.target.value })}
                  />
                </td>
                <td className="p-1 text-center">
                  <input
                    type="checkbox"
                    checked={row.parkFacing}
                    onChange={(e) => update(i, { parkFacing: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setRows((r) => [...r, { ...EMPTY_ROW }])}>
            + Row
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRows((r) => (r.length > 1 ? r.slice(0, -1) : r))}
          >
            − Row
          </Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !projectId}
            onClick={() =>
              onSubmit(
                projectId,
                rows
                  .filter((r) => r.plotNumber.trim())
                  .map((r) => ({
                    plotNumber: r.plotNumber,
                    plotType: r.plotType as "RESIDENTIAL",
                    widthFt: r.widthFt || undefined,
                    lengthFt: r.lengthFt || undefined,
                    exactAreaSqFt: r.exactAreaSqFt || undefined,
                    exactAreaReason: r.exactAreaReason || undefined,
                    parkFacing: r.parkFacing,
                    plcComponentCodes: r.plcCodes
                      .split(",")
                      .map((c) => c.trim())
                      .filter(Boolean),
                  }))
              )
            }
          >
            {busy ? "Saving…" : "Save grid"}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Prepared on {istDay(new Date())} (IST).</p>
    </Modal>
  );
}
