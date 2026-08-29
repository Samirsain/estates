"use client";

// Acquisitions — DESIGN.md §15; PRD.md §11; main-PRD §17.
// Payment Given is its own dataset here and is never shown beside Payment
// Received (PRD §1.2).

import React from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, Coins, Plus, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { PersonLink } from "@/components/person-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { formatIst, istDay, type StaffRole } from "@/lib/tasks";
import {
  cancelAcquisitionAction,
  confirmPaymentGivenAction,
  correctPaymentGivenAction,
  createAcquisitionAction,
  decideAcquisitionAction,
  recordBuyingCommissionAction,
  type ActionResult,
  type ScheduleRowInput,
} from "./actions";

export type EntryView = {
  id: string;
  percent: string;
  paidOn: string;
  status: string;
  reference: string;
  confirmedByRef: string;
  reason: string | null;
};

export type AcquisitionRowView = {
  id: string;
  acquisitionNo: string;
  type: string;
  status: string;
  property: string;
  location: string | null;
  seller: string;
  sellerPersonId: string;
  arrangedBy: string;
  arrangedByPersonId: string | null;
  arrangedByType: string;
  sourceBooking: string | null;
  purchaseDate: string;
  paymentGivenPercent: string;
  remark: string;
  decisionNote: string | null;
  closedReason: string | null;
  submittedByRef: string;
  instalments: Array<{ seq: number; scheduled: string; received: string; dueDate: string }>;
  entries: EntryView[];
  commission: {
    beneficiary: string;
    beneficiaryPersonId: string;
    percent: string;
    eligibility: string;
    payment: string;
  } | null;
};

type PersonView = { id: string; fullName: string; mobileMasked: string };
type Permissions = {
  create: boolean;
  decide: boolean;
  cancel: boolean;
  confirmGiven: boolean;
  correctGiven: boolean;
  recordCommission: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Deal Cancelled",
};

const newKey = () => `acq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type Dialog =
  | { kind: "NEW" }
  | { kind: "PAY"; row: AcquisitionRowView }
  | { kind: "CORRECT"; row: AcquisitionRowView; entry: EntryView }
  | { kind: "DECIDE"; row: AcquisitionRowView; approve: boolean }
  | { kind: "CANCEL"; row: AcquisitionRowView }
  | { kind: "COMMISSION"; row: AcquisitionRowView };

export default function AcquisitionsClient({
  role,
  actorName,
  staffAccountId,
  permissions,
  rows,
  buybackable,
  people,
  resaleGroups,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  permissions: Permissions;
  rows: AcquisitionRowView[];
  buybackable: Array<{ id: string; label: string; primaryPersonId: string }>;
  people: PersonView[];
  resaleGroups: Array<{ id: string; name: string; projectCode: string }>;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Buyback / Resale</h1>
            <p className="text-xs text-muted-foreground">
              Buyback and Purchase for Resale. Accounts approves at 20% Payment Given; the property
              shows Payment Pending until 100%.
            </p>
          </div>
          {permissions.create && (
            <Button size="sm" variant="gradient" onClick={() => setDialog({ kind: "NEW" })}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New Buyback
            </Button>
          )}
        </div>

        {notice && (
          <Card
            className={`p-4 text-sm ${
              notice.ok ? "border-emerald-500/40 text-emerald-700" : "border-red-500/40 text-red-700"
            }`}
          >
            {notice.text}
          </Card>
        )}

        {rows.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Nothing here yet. A Buyback takes back a Booking we sold; a Purchase for Resale brings
            an outside property into inventory.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Deal</th>
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Seller / Arranged by</th>
                  <th className="px-4 py-3 font-medium">Payment Given</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="border-t border-border/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{row.acquisitionNo}</div>
                        <div className="text-muted-foreground">
                          {row.type === "BUYBACK" ? "Buyback" : "Purchase for Resale"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.property}
                        {row.location && <div className="text-muted-foreground">{row.location}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <PersonLink personId={row.sellerPersonId} name={row.seller} />
                        <div className="text-muted-foreground">
                          via{" "}
                          <PersonLink
                            personId={row.arrangedByPersonId}
                            name={row.arrangedBy}
                            as={row.arrangedByType === "MEMBER" ? "member" : undefined}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {row.paymentGivenPercent}%
                        {Number(row.paymentGivenPercent) < 100 && row.status === "APPROVED" && (
                          <div className="text-amber-700">Payment Pending</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            row.status === "APPROVED"
                              ? "success"
                              : row.status === "PENDING_APPROVAL"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setOpen(open === row.id ? null : row.id)}
                        >
                          {open === row.id ? "Close" : "Open"}
                          <ChevronDown
                            className={`ml-1.5 h-3.5 w-3.5 transition-transform duration-200 ${
                              open === row.id ? "rotate-180" : ""
                            }`}
                          />
                        </Button>
                      </td>
                    </tr>
                    {open === row.id && (
                      <tr className="border-t border-border/40 bg-muted">
                        <td colSpan={6} className="px-4 py-4">
                          <Detail
                            row={row}
                            permissions={permissions}
                            onAction={(d) => setDialog(d)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {dialog?.kind === "NEW" && (
        <NewAcquisitionDialog
          busy={busy}
          buybackable={buybackable}
          people={people}
          resaleGroups={resaleGroups}
          onClose={() => setDialog(null)}
          onSubmit={(input) => run(() => createAcquisitionAction(input, newKey()))}
        />
      )}

      {dialog?.kind === "PAY" && (
        <FormDialog
          title="Confirm Payment Given"
          subtitle={`${dialog.row.acquisitionNo} · ${dialog.row.property}`}
          consequence="Percentage only, allocated to the oldest unpaid instalment first. The reference must be unique across Payment Received and Payment Given."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              confirmPaymentGivenAction(
                {
                  acquisitionId: dialog.row.id,
                  percent: String(f.get("percent")),
                  paidOn: String(f.get("paidOn")),
                  reference: String(f.get("reference")),
                  remark: String(f.get("remark") ?? ""),
                },
                newKey()
              )
            )
          }
        >
          <Field label="Payment Given This Time (%)">
            <Input name="percent" required inputMode="decimal" />
          </Field>
          <Field label="Payment Date">
            <Input type="date" name="paidOn" required defaultValue={istDay(new Date())} />
          </Field>
          <Field label="Payment Reference No.">
            <Input name="reference" required />
          </Field>
          <Field label="Remark">
            <Input name="remark" />
          </Field>
        </FormDialog>
      )}

      {dialog?.kind === "CORRECT" && (
        <FormDialog
          title="Correct Payment Given"
          subtitle={`${dialog.row.acquisitionNo} · entry ${dialog.entry.percent}% · ${dialog.entry.reference}`}
          consequence="The original entry is superseded, never deleted. Falling below 100% shows Payment Pending again and steps the Buying Commission back; below 20% the property stops being sellable."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              correctPaymentGivenAction(
                {
                  entryId: dialog.entry.id,
                  percent: String(f.get("percent")),
                  paidOn: String(f.get("paidOn")),
                  reference: String(f.get("reference")),
                  reason: String(f.get("reason")),
                },
                newKey()
              )
            )
          }
        >
          <Field label="Corrected percentage (%)">
            <Input name="percent" required inputMode="decimal" defaultValue={dialog.entry.percent} />
          </Field>
          <Field label="Payment Date">
            <Input type="date" name="paidOn" required defaultValue={istDay(dialog.entry.paidOn)} />
          </Field>
          <Field label="Replacement Payment Reference No.">
            <Input name="reference" required />
          </Field>
          <Field label="Reason — compulsory">
            <Input name="reason" required minLength={3} />
          </Field>
        </FormDialog>
      )}

      {dialog?.kind === "DECIDE" && (
        <FormDialog
          title={dialog.approve ? "Approve deal" : "Reject deal"}
          subtitle={`${dialog.row.acquisitionNo} · ${dialog.row.property}`}
          consequence={
            dialog.approve
              ? "The property enters normal inventory as Available + RESALE. A Buyback closes the old Booking as Buyback Completed and removes the previous Customer from the allocation."
              : "The prior state is restored exactly and the Booking is released from Buyback Pending."
          }
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              decideAcquisitionAction(dialog.row.id, dialog.approve, String(f.get("note")), newKey())
            )
          }
        >
          <Field label="Remark — compulsory">
            <Input name="note" required minLength={3} />
          </Field>
        </FormDialog>
      )}

      {dialog?.kind === "CANCEL" && (
        <FormDialog
          title="Cancel deal"
          subtitle={`${dialog.row.acquisitionNo} · ${dialog.row.property}`}
          consequence="The property becomes Not Available — Deal Cancelled and must not remain sellable. Payment Given history stays, and Accounts adjustment work is created where payment already happened."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() => cancelAcquisitionAction(dialog.row.id, String(f.get("reason")), newKey()))
          }
        >
          <Field label="Reason — compulsory">
            <Input name="reason" required minLength={3} />
          </Field>
        </FormDialog>
      )}

      {dialog?.kind === "COMMISSION" && (
        <FormDialog
          title="Record Buying Commission"
          subtitle={`${dialog.row.acquisitionNo} · arranged by ${dialog.row.arrangedBy}`}
          consequence="One beneficiary per deal, outside the 4% sale cap, payable only at 100% Payment Given. The seller cannot be the beneficiary."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(f) =>
            run(() =>
              recordBuyingCommissionAction(
                {
                  acquisitionId: dialog.row.id,
                  beneficiaryPersonId: String(f.get("beneficiaryPersonId")),
                  percent: String(f.get("percent")),
                },
                newKey()
              )
            )
          }
        >
          <Field label="Beneficiary">
            <select name="beneficiaryPersonId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select a Person
              </option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} · {person.mobileMasked}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Percentage (%)">
            <Input name="percent" required inputMode="decimal" />
          </Field>
        </FormDialog>
      )}
    </AppShell>
  );
}

/* --------------------------------------------------------------- detail */

function Detail({
  row,
  permissions,
  onAction,
}: {
  row: AcquisitionRowView;
  permissions: Permissions;
  onAction: (d: Dialog) => void;
}) {
  const live = row.status === "PENDING_APPROVAL" || row.status === "APPROVED";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payment Given schedule
        </h3>
        {row.instalments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No live schedule.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {row.instalments.map((i) => (
              <li key={i.seq} className="flex justify-between gap-3">
                <span>
                  Instalment {i.seq} · due {formatIst(i.dueDate)}
                </span>
                <span className="tabular-nums">
                  {i.received}% of {i.scheduled}%
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payment Given entries
        </h3>
        {row.entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing confirmed yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {row.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {entry.percent}% · {entry.reference} · {formatIst(entry.paidOn)}
                  {entry.status === "SUPERSEDED" && (
                    <Badge variant="outline" className="ml-2">
                      Superseded
                    </Badge>
                  )}
                </span>
                {entry.status === "CONFIRMED" && permissions.correctGiven && live && (
                  <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "CORRECT", row, entry })}>
                    Correct
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Record
        </h3>
        <dl className="space-y-1 text-xs">
          <Row label="Purchase Date" value={formatIst(row.purchaseDate)} />
          <Row label="Raised by" value={row.submittedByRef} />
          <Row label="Remark" value={row.remark} />
          {row.sourceBooking && <Row label="Old Booking" value={row.sourceBooking} />}
          {row.decisionNote && <Row label="Decision" value={row.decisionNote} />}
          {row.closedReason && <Row label="Closed" value={row.closedReason} />}
        </dl>

        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Buying Commission
        </h3>
        {row.commission ? (
          <p className="text-xs">
            <PersonLink
              personId={row.commission.beneficiaryPersonId}
              name={row.commission.beneficiary}
            />{" "}
            · {row.commission.percent}% ·{" "}
            <Badge variant="outline">{row.commission.eligibility}</Badge>{" "}
            <Badge variant="outline">{row.commission.payment}</Badge>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {row.arrangedByType === "THREE_PERCENT_CLUB"
              ? "A 3% Club deal earns no Buying Commission."
              : "Not recorded yet."}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {live && permissions.confirmGiven && (
            <Button size="sm" variant="outline" onClick={() => onAction({ kind: "PAY", row })}>
              <Wallet className="mr-2 h-3.5 w-3.5" /> Confirm Payment Given
            </Button>
          )}
          {row.status === "PENDING_APPROVAL" && permissions.decide && (
            <>
              <Button size="sm" onClick={() => onAction({ kind: "DECIDE", row, approve: true })}>
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction({ kind: "DECIDE", row, approve: false })}
              >
                Reject
              </Button>
            </>
          )}
          {live &&
            permissions.recordCommission &&
            !row.commission &&
            row.arrangedByType !== "THREE_PERCENT_CLUB" && (
              <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "COMMISSION", row })}>
                <Coins className="mr-2 h-3.5 w-3.5" /> Record Buying Commission
              </Button>
            )}
          {live && permissions.cancel && (
            <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "CANCEL", row })}>
              <Ban className="mr-2 h-3.5 w-3.5" /> Cancel deal
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- dialogs */

function FormDialog({
  title,
  subtitle,
  consequence,
  busy,
  children,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  consequence: string;
  busy: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">{subtitle}</p>
        <p className="mt-1 text-muted-foreground">{consequence}</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        {children}
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

const round2 = (n: number) => Math.round(n * 100) / 100;

function fillForward(rows: ScheduleRowInput[], typedIndex = -1): ScheduleRowInput[] {
  const out = rows.map((r, i) => ({ ...r, seq: i + 1 }));
  const last = out.length - 1;
  if (last < 1 || typedIndex === last) return out;
  const others = out.reduce((sum, r, i) => (i === last ? sum : sum + (Number(r.percent) || 0)), 0);
  out[last] = { ...out[last], percent: String(Math.max(0, round2(100 - others))) };
  return out;
}

const scheduleTotal = (rows: ScheduleRowInput[]) =>
  round2(rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0));

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function fillDatesForward(rows: ScheduleRowInput[], changedIndex: number): ScheduleRowInput[] {
  const out = rows.map((r) => ({ ...r }));
  for (let i = changedIndex + 1; i < out.length; i++) {
    if (out[i].dueDate <= out[i - 1].dueDate) {
      out[i] = { ...out[i], dueDate: addDays(out[i - 1].dueDate, 1) };
    }
  }
  return out;
}

function NewAcquisitionDialog({
  busy,
  buybackable,
  people,
  resaleGroups,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  buybackable: Array<{ id: string; label: string; primaryPersonId: string }>;
  people: PersonView[];
  resaleGroups: Array<{ id: string; name: string; projectCode: string }>;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createAcquisitionAction>[0]) => void;
}) {
  const today = istDay(new Date());
  const [type, setType] = React.useState<"BUYBACK" | "PURCHASE_FOR_RESALE">("BUYBACK");
  const [arrangedByType, setArrangedByType] = React.useState<
    "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER"
  >("THREE_PERCENT_CLUB");
  const [sourceBookingId, setSourceBookingId] = React.useState("");
  const [schedule, setSchedule] = React.useState<ScheduleRowInput[]>([
    { seq: 1, percent: "25", dueDate: today },
    { seq: 2, percent: "75", dueDate: addDays(today, 30) },
  ]);
  const [acknowledge, setAcknowledge] = React.useState(false);

  const remaining = round2(100 - scheduleTotal(schedule));
  const selected = buybackable.find((b) => b.id === sourceBookingId);

  return (
    <Modal title="New Buyback" centerTitle onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            type,
            sourceBookingId: type === "BUYBACK" ? sourceBookingId : undefined,
            sellerPersonId: String(f.get("sellerPersonId")),
            arrangedByType,
            arrangedByPersonId:
              arrangedByType === "THREE_PERCENT_CLUB"
                ? undefined
                : String(f.get("arrangedByPersonId")),
            purchaseDate: String(f.get("purchaseDate")),
            remark: String(f.get("remark")),
            schedule,
            propertyName: String(f.get("propertyName") ?? ""),
            location: String(f.get("location") ?? ""),
            propertyNumber: String(f.get("propertyNumber") ?? ""),
            areaSqFt: String(f.get("areaSqFt") ?? ""),
            plcPercent: String(f.get("plcPercent") ?? ""),
            resaleGroupId: String(f.get("resaleGroupId") ?? ""),
            acknowledgeDuplicate: acknowledge,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="BUYBACK">Buyback — take back a Booking we sold</option>
              <option value="PURCHASE_FOR_RESALE">Purchase for Resale — outside property</option>
            </select>
          </Field>
          <Field label="Purchase Date">
            <Input type="date" name="purchaseDate" required defaultValue={today} />
          </Field>
        </div>

        {type === "BUYBACK" ? (
          <Field label="Booking being taken back">
            <select
              className={inputClass}
              value={sourceBookingId}
              onChange={(e) => setSourceBookingId(e.target.value)}
              required
            >
              <option value="">Select a Booking</option>
              {buybackable.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Property / Project Name">
              <Input name="propertyName" required />
            </Field>
            <Field label="Location">
              <Input name="location" required />
            </Field>
            <Field label="Plot / Property Number">
              <Input name="propertyNumber" required />
            </Field>
            <Field label="Area (sq ft)">
              <Input name="areaSqFt" inputMode="decimal" />
            </Field>
            <Field label="PLC %">
              <Input name="plcPercent" inputMode="decimal" />
            </Field>
            <Field label="External Resale Property Group">
              <select name="resaleGroupId" className={inputClass} required defaultValue="">
                <option value="" disabled>
                  Select a group
                </option>
                {resaleGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.projectCode} · {group.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Seller / previous owner">
            <select
              name="sellerPersonId"
              className={inputClass}
              required
              defaultValue={selected?.primaryPersonId ?? ""}
              key={selected?.primaryPersonId ?? "none"}
            >
              <option value="" disabled>
                Select a Person
              </option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} · {person.mobileMasked}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arranged by">
            <select
              className={inputClass}
              value={arrangedByType}
              onChange={(e) => setArrangedByType(e.target.value as typeof arrangedByType)}
            >
              <option value="THREE_PERCENT_CLUB">3% Club</option>
              <option value="MEMBER">Member</option>
              <option value="CUSTOMER">Customer</option>
            </select>
          </Field>
          {arrangedByType !== "THREE_PERCENT_CLUB" && (
            <Field label="Arranging Person">
              <select name="arrangedByPersonId" className={inputClass} required defaultValue="">
                <option value="" disabled>
                  Select a Person
                </option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName} · {person.mobileMasked}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* Schedule — compact inline rows, same rules as Booking ScheduleEditor */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment Given Schedule
          </h3>
          {schedule.map((line, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="flex h-9 w-6 items-center justify-center text-xs font-medium text-muted-foreground">
                {line.seq}
              </span>
              <Input
                className="h-9 w-28 text-xs"
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={line.percent}
                placeholder="%"
                onChange={(e) =>
                  setSchedule(
                    fillForward(
                      schedule.map((r, i) => (i === index ? { ...r, percent: e.target.value } : r)),
                      index
                    )
                  )
                }
              />
              <Input
                className="h-9 w-44 text-xs"
                type="date"
                min={index === 0 ? today : addDays(schedule[index - 1].dueDate, 1)}
                required
                value={line.dueDate}
                onChange={(e) =>
                  setSchedule(
                    fillDatesForward(
                      schedule.map((r, i) => (i === index ? { ...r, dueDate: e.target.value } : r)),
                      index
                    )
                  )
                }
              />
              {schedule.length > 1 && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setSchedule(fillForward(schedule.filter((_, i) => i !== index)))}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-0.5">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                setSchedule([
                  ...schedule,
                  {
                    seq: schedule.length + 1,
                    percent: String(Math.max(0, remaining)),
                    dueDate: addDays(schedule[schedule.length - 1]?.dueDate ?? today, 30),
                  },
                ])
              }
            >
              + Add instalment
            </Button>
            <p className={remaining === 0 ? "text-xs text-muted-foreground" : "text-xs text-amber-700 font-medium"}>
              {remaining === 0
                ? "Total 100% — complete."
                : remaining > 0
                  ? `Remaining ${remaining}%`
                  : `Over by ${round2(-remaining)}%`}
            </p>
          </div>
        </section>

        <Field label="Remark — compulsory">
          <Input name="remark" required minLength={3} />
        </Field>

        {type === "PURCHASE_FOR_RESALE" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
            />
            I have checked the duplicate warning and this is a genuinely different property
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Creating…" : "Create Buyback"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
