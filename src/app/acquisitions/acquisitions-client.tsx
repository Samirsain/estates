"use client";

// Acquisitions — design.md §15; prd-corrections.md §11; prd-complete §17.
// Payment Given is its own dataset here and is never shown beside Payment
// Received (PRD §1.2).

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Wallet } from "lucide-react";
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


/** The one row button, sized like Inventory's. */
const rowButton = "h-7 px-2 text-[11px]";

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
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Plot No.</th>
                  <th className="px-4 py-3 font-medium">Seller</th>
                  <th className="px-4 py-3 font-medium">Arranged by</th>
                  <th className="px-4 py-3 font-medium">Payment Given</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="h-14 border-t border-border/40">
                      {/* The deal itself is the link to the deal. Everything
                          that used to unfold under this row now has a page. */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/acquisitions/${row.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {TYPE_LABEL[row.type] ?? row.type}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {row.project}
                        {row.location && <div className="text-muted-foreground">{row.location}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {row.plotId ? (
                          <Link
                            href={`/plots/${row.plotId}`}
                            className="block font-medium text-primary hover:underline"
                          >
                            {row.plotNumber}
                          </Link>
                        ) : (
                          <div className="font-medium text-foreground">{row.plotNumber}</div>
                        )}
                        {row.plotType && (
                          <div className="text-muted-foreground">
                            {row.plotType.replaceAll("_", " ").toLowerCase()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PersonLink personId={row.sellerPersonId} name={row.seller} />
                      </td>
                      {/* Two people, two columns. Stacked in one cell with a
                          "via" in front, the arranger read as a footnote on the
                          seller rather than the other party to the deal. */}
                      <td className="px-4 py-3">
                        <PersonLink
                          personId={row.arrangedByPersonId}
                          name={row.arrangedBy}
                          as={row.arrangedByType === "MEMBER" ? "member" : undefined}
                        />
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
                      {/* Payment is the one action taken against a row while
                          reading a list. Approve, Reject, Cancel and the
                          commission need the record in front of you, so they
                          are on the deal's own page. */}
                      <td className="px-4 py-3">
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
