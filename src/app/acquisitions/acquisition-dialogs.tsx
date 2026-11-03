"use client";

// The action popups a deal can open, and the FormDialog they all wear.
//
// They were inside the list screen, which was the only place a deal could be
// acted on. A deal now has a page of its own, and both open the same dialogs
// against the same server actions — so they live here, not in either screen.

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { PersonPicker, personLabel } from "@/components/person-picker";
import { istDay, remainingPercent } from "@/lib/tasks";
import { PaymentPercentInput } from "@/app/bookings/bookings-client";
import {
  cancelAcquisitionAction,
  confirmPaymentGivenAction,
  correctPaymentGivenAction,
  decideAcquisitionAction,
  markBuyingCommissionPaidAction,
  recordBuyingCommissionAction,
  type ActionResult,
} from "./actions";
import { newKey, type AcquisitionRowView, type Dialog, type EntryView, type PersonView } from "./types";
import { RemarkSelect } from "@/components/ui/remark-select";

export function FormDialog({
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
  consequence?: string;
  busy: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rounded-xl border border-border/60 bg-secondary p-3 text-xs">
        <p className="font-semibold text-foreground">{subtitle}</p>
        {consequence && <p className="mt-1 text-muted-foreground">{consequence}</p>}
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

/** Whichever dialog is open, or nothing. */
/**
 * Correct Payment Given opens on the latest confirmed entry; with several, the
 * form picks another, as Correct Payment Received does (owner, 3 Nov 2026).
 * The entry being corrected is taken off the total first, exactly as
 * correctPaymentGiven does server-side, so its own percentage is not counted
 * against itself.
 */
function CorrectGivenFields({ row, first }: { row: AcquisitionRowView; first: EntryView }) {
  const confirmed = row.entries.filter((e) => e.status === "CONFIRMED");
  const [entry, setEntry] = React.useState(first);
  const max = remainingPercent(Number(row.paymentGivenPercent) - Number(entry.percent));
  return (
    <>
      <input type="hidden" name="entryId" value={entry.id} />
      {confirmed.length > 1 && (
        <Field label="Payment to correct">
          <select
            className={inputClass}
            value={entry.id}
            onChange={(ev) => setEntry(confirmed.find((e) => e.id === ev.target.value) ?? entry)}
          >
            {confirmed.map((e) => (
              <option key={e.id} value={e.id}>
                {e.reference} · {e.percent}%
              </option>
            ))}
          </select>
        </Field>
      )}
      {/* Keyed on the entry, so picking another one refills its figures. */}
      <Field label={`Corrected percentage (%) — up to ${max}%`}>
        <PaymentPercentInput key={entry.id} max={max} defaultValue={entry.percent} />
      </Field>
      <Field label="Payment Date">
        <Input key={entry.id} type="date" name="paidOn" required defaultValue={istDay(entry.paidOn)} />
      </Field>
    </>
  );
}

export function AcquisitionDialogs({
  dialog,
  people,
  busy,
  run,
  onClose,
}: {
  dialog: Dialog | null;
  people: PersonView[];
  busy: boolean;
  run: (action: () => Promise<ActionResult>) => void;
  onClose: () => void;
}) {
  if (!dialog) return null;

  if (dialog.kind === "PAY") {
    return (
      <FormDialog
        title="Confirm Payment Given"
        subtitle={dialog.row.property}
        busy={busy}
        onClose={onClose}
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
        {/* Payment Given is incremental like Payment Received, so the ceiling
            is what is left of the deal, not a flat 100. Same clamped field,
            its own number — the two ledgers are never totalled together
            (prd-complete §1). */}
        <Field
          label={`Payment Given This Time (%) — ${remainingPercent(dialog.row.paymentGivenPercent)}% remaining`}
        >
          <PaymentPercentInput max={remainingPercent(dialog.row.paymentGivenPercent)} />
        </Field>
        <Field label="Payment Date">
          <Input type="date" name="paidOn" required defaultValue={istDay(new Date())} />
        </Field>
        <Field label="Payment Reference No.">
          <Input name="reference" required />
        </Field>
        <Field label="Remark">
          <RemarkSelect presets="paymentGiven" name="remark" />
        </Field>
      </FormDialog>
    );
  }

  if (dialog.kind === "CORRECT") {
    return (
      <FormDialog
        title="Correct Payment Given"
        subtitle={dialog.row.property}
        busy={busy}
        onClose={onClose}
        onSubmit={(f) =>
          run(() =>
            correctPaymentGivenAction(
              {
                entryId: String(f.get("entryId")),
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
        <CorrectGivenFields row={dialog.row} first={dialog.entry} />
        <Field label="Replacement Payment Reference No.">
          <Input name="reference" required />
        </Field>
        <Field label="Reason — compulsory">
          <RemarkSelect presets="correctPaymentGiven" name="reason" required />
        </Field>
      </FormDialog>
    );
  }

  if (dialog.kind === "DECIDE") {
    return (
      <FormDialog
        title={dialog.approve ? "Approve deal" : "Reject deal"}
        subtitle={dialog.row.property}
        busy={busy}
        onClose={onClose}
        onSubmit={(f) =>
          run(() =>
            decideAcquisitionAction(dialog.row.id, dialog.approve, String(f.get("note")), newKey())
          )
        }
      >
        <Field label="Remark — compulsory">
          <RemarkSelect presets="decideDeal" name="note" required kind={dialog.approve ? "Approved" : "Rejected"} />
        </Field>
      </FormDialog>
    );
  }

  if (dialog.kind === "COMMISSION_PAID") {
    const commission = dialog.row.commission!;
    return (
      <FormDialog
        title={dialog.early ? "Commission Paid Early" : "Commission Paid"}
        subtitle={`${commission.beneficiary} · ${commission.percent}%`}
        consequence={
          dialog.early
            ? "Payment Given is not yet 100%, so this is Paid Early: MD has approved it and remarks are compulsory. It can never be marked Paid again."
            : "The Buying Commission is Ready and is recorded as Paid against the reference below."
        }
        busy={busy}
        onClose={onClose}
        onSubmit={(f) =>
          run(() =>
            markBuyingCommissionPaidAction(
              {
                recordId: commission.recordId,
                early: dialog.early,
                paidOn: String(f.get("paidOn")),
                reference: String(f.get("reference")),
                remarks: String(f.get("remarks") ?? ""),
              },
              newKey()
            )
          )
        }
      >
        <Field label="Paid Date">
          <Input name="paidOn" type="date" defaultValue={istDay(new Date())} max={istDay(new Date())} required />
        </Field>
        <Field label="Payment Reference No.">
          <Input name="reference" required />
        </Field>
        <Field label={dialog.early ? "Remarks — compulsory" : "Remarks"}>
          <RemarkSelect presets="buyingCommissionPaid" name="remarks" required={dialog.early} />
        </Field>
      </FormDialog>
    );
  }

  if (dialog.kind === "CANCEL") {
    return (
      <FormDialog
        title="Cancel deal"
        subtitle={dialog.row.property}
        busy={busy}
        onClose={onClose}
        onSubmit={(f) =>
          run(() => cancelAcquisitionAction(dialog.row.id, String(f.get("reason")), newKey()))
        }
      >
        <Field label="Reason — compulsory">
          <RemarkSelect presets="cancelDeal" name="reason" required />
        </Field>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      title="Record Buying Commission"
      subtitle={`Arranged by ${dialog.row.arrangedBy}`}
      busy={busy}
      onClose={onClose}
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
        <PersonPicker
          name="beneficiaryPersonId"
          required
          options={people.map((p) => ({ id: p.id, label: personLabel(p) }))}
        />
      </Field>
      <Field label="Percentage (%)">
        <Input name="percent" required inputMode="decimal" />
      </Field>
    </FormDialog>
  );
}
