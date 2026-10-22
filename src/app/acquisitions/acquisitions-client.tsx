"use client";

// Acquisitions — design.md §15; prd-corrections.md §11; prd-complete §17.
// Payment Given is its own dataset here and is never shown beside Payment
// Received (PRD §1.2).

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { PersonLink } from "@/components/person-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { PersonPicker, personLabel } from "@/components/person-picker";
import { istDay, type StaffRole } from "@/lib/tasks";
import { round2 } from "@/lib/domain/shares";
import {
  addDays,
  fillDatesForward,
  fillForward,
  removeRow,
  scheduleTotal,
} from "@/lib/domain/schedule-edit";
import { AcquisitionDialogs } from "./acquisition-dialogs";
import {
  STATUS_LABEL,
  TYPE_LABEL,
  newKey,
  type AcquisitionRowView,
  type Dialog,
  type Permissions,
  type PersonView,
} from "./types";
import {
  createAcquisitionAction,
  type ActionResult,
  type ScheduleRowInput,
} from "./actions";
import { RemarkSelect } from "@/components/ui/remark-select";


/** The one row button, sized like Inventory's. */
const rowButton = "h-7 px-2 text-[11px]";

/** Filters sit inline and size to their content, unlike a form field. */
const filterClass =
  "h-9 w-auto rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/** New Buyback is the list's own dialog; every other one is shared. */
type ListDialog = Dialog | { kind: "NEW" };

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
  const [dialog, setDialog] = React.useState<ListDialog | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [typeFilter, setTypeFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");

  const visible = rows.filter(
    (r) =>
      (typeFilter === "ALL" || r.type === typeFilter) &&
      (statusFilter === "ALL" || r.status === statusFilter) &&
      (search.trim() === "" ||
        `${r.plotNumber} ${r.project} ${r.seller} ${r.arrangedBy}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

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
      {/* Plot Inventory's layout: heading and action, filters, then the
          table ruled by hairlines rather than boxed in a card. */}
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Buyback / Resale</h1>
          {permissions.create && (
            <Button size="sm" variant="gradient" onClick={() => setDialog({ kind: "NEW" })}>
              <Plus className="mr-1 h-4 w-4" /> New Buyback
            </Button>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={filterClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by deal"
          >
            <option value="ALL">All deals</option>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className={filterClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-56"
            placeholder="Search Plot, Project, Seller or Arranged by"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {notice && (
          <Card
            className={`p-4 ${
              notice.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <p
              role="status"
              className={`flex items-start gap-2 text-sm ${notice.ok ? "text-emerald-700" : "text-destructive"}`}
            >
              {notice.ok ? (
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
            <p className="text-sm font-semibold">
              {rows.length === 0 ? "No Buyback or Resale yet." : "No deals match these filters."}
            </p>
            <p className="mt-1 text-xs font-medium text-foreground">
              {rows.length === 0
                ? "A Buyback takes back a Booking we sold; a Purchase for Resale brings an outside property into inventory."
                : "Clear a filter to see more deals."}
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] border-collapse text-sm">
              <thead className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1">Plot</th>
                  <th className="px-3 py-1">Deal</th>
                  <th className="px-3 py-1">Seller</th>
                  <th className="px-3 py-1">Arranged by</th>
                  <th className="px-3 py-1 text-center">Payment Given</th>
                  <th className="px-3 py-1 text-center">Status</th>
                  <th className="px-3 py-1 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="h-14 border-b border-border/60 align-middle transition-colors hover:bg-secondary/50 [&>td]:px-3 [&>td]:py-2">
                      {/* As on Plot Inventory: the Plot leads, with its Project
                          and type under it. It opens the deal — everything
                          that used to unfold under this row now has a page. */}
                      <td>
                        <Link
                          href={`/acquisitions/${row.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {row.plotNumber}
                        </Link>
                        <span className="block text-[11px] font-medium text-foreground">
                          {row.project}
                          {row.plotType && (
                            <span className="text-muted-foreground">
                              {" · "}
                              {row.plotType.replaceAll("_", " ").toLowerCase()}
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        {TYPE_LABEL[row.type] ?? row.type}
                        {row.location && (
                          <span className="block text-[11px] text-muted-foreground">{row.location}</span>
                        )}
                      </td>
                      <td>
                        <PersonLink personId={row.sellerPersonId} name={row.seller} />
                      </td>
                      {/* Two people, two columns. Stacked in one cell with a
                          "via" in front, the arranger read as a footnote on the
                          seller rather than the other party to the deal. */}
                      <td>
                        <PersonLink
                          personId={row.arrangedByPersonId}
                          name={row.arrangedBy}
                          as={row.arrangedByType === "MEMBER" ? "member" : undefined}
                        />
                      </td>
                      <td className="text-center tabular-nums">
                        {row.paymentGivenPercent}%
                        {Number(row.paymentGivenPercent) < 100 && row.status === "APPROVED" && (
                          <span className="block text-[11px] text-amber-700">Payment Pending</span>
                        )}
                      </td>
                      <td className="text-center">
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
                      {/* Payment is the one action taken against a row while
                          reading a list. Approve, Reject, Cancel and the
                          commission need the record in front of you, so they
                          are on the deal's own page. */}
                      <td>
                        <div className="flex justify-center gap-1.5">
                          {permissions.confirmGiven &&
                          (row.status === "PENDING_APPROVAL" || row.status === "APPROVED") ? (
                            <Button
                              className={rowButton}
                              variant="outline"
                              onClick={() => setDialog({ kind: "PAY", row })}
                            >
                              <Wallet className="mr-1 h-3 w-3" /> Payment
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
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

      <AcquisitionDialogs
        dialog={dialog && dialog.kind !== "NEW" ? dialog : null}
        people={people}
        busy={busy}
        run={run}
        onClose={() => setDialog(null)}
      />
    </AppShell>
  );
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
  // Two rows, both blank: the split is the buyer's to type, and typing the
  // first fills the second with what is left.
  const [schedule, setSchedule] = React.useState<ScheduleRowInput[]>([
    { seq: 1, percent: "", dueDate: today },
    { seq: 2, percent: "", dueDate: addDays(today, 30) },
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
            <PersonPicker
              name="sellerPersonId"
              required
              defaultValue={selected?.primaryPersonId ?? ""}
              key={selected?.primaryPersonId ?? "none"}
              options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
            />
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
              <PersonPicker
                name="arrangedByPersonId"
                required
                options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
              />
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
                className="h-9 w-24 min-w-0 text-xs sm:w-28"
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={line.percent}
                placeholder="%"
                // A row that already holds a number is retyped, not edited.
                onFocus={(e) => e.target.select()}
                // max="100" only blocks the submit; it lets 150 be typed and
                // then argues. fillForward caps the row at what the rows above
                // it leave, so the column cannot be built past 100 at all.
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
                className="h-9 w-40 min-w-0 flex-1 text-xs sm:w-44 sm:flex-none"
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
                  onClick={() => setSchedule(removeRow(schedule, index))}
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
          <RemarkSelect presets="newDeal" name="remark" required />
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
