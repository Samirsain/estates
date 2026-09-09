"use client";

// The action popups a deal can open, and the FormDialog they all wear.
//
// They were inside the list screen, which was the only place a deal could be
// acted on. A deal now has a page of its own, and both open the same dialogs
// against the same server actions — so they live here, not in either screen.

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal } from "@/components/ui/modal";
import { PersonPicker, personLabel } from "@/components/person-picker";
import { istDay, remainingPercent } from "@/lib/tasks";
import { PaymentPercentInput } from "@/app/bookings/bookings-client";
import {
  cancelAcquisitionAction,
  confirmPaymentGivenAction,
  correctPaymentGivenAction,
  decideAcquisitionAction,
  recordBuyingCommissionAction,
  type ActionResult,
} from "./actions";
import { newKey, type Dialog, type PersonView } from "./types";

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

/** Whichever dialog is open, or nothing. */
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
        subtitle={`${dialog.row.acquisitionNo} · ${dialog.row.property}`}
        consequence="Percentage only, allocated to the oldest unpaid instalment first. The reference must be unique across Payment Received and Payment Given."
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
          <Input name="remark" />
        </Field>
      </FormDialog>
    );
  }

  if (dialog.kind === "CORRECT") {
    return (
      <FormDialog
        title="Correct Payment Given"
        subtitle={`${dialog.row.acquisitionNo} · entry ${dialog.entry.percent}% · ${dialog.entry.reference}`}
        consequence="The original entry is superseded, never deleted. Falling below 100% shows Payment Pending again and steps the Buying Commission back; below 20% the property stops being sellable."
        busy={busy}
        onClose={onClose}
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
        {/* The entry being corrected is taken off the total first, exactly as
            correctPaymentGiven does server-side, so its own percentage is not
            counted against itself. */}
        <Field
          label={`Corrected percentage (%) — up to ${remainingPercent(
            Number(dialog.row.paymentGivenPercent) - Number(dialog.entry.percent)
          )}%`}
        >
          <PaymentPercentInput
            max={remainingPercent(
              Number(dialog.row.paymentGivenPercent) - Number(dialog.entry.percent)
            )}
            defaultValue={dialog.entry.percent}
          />
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
    );
  }

  if (dialog.kind === "DECIDE") {
    return (
      <FormDialog
        title={dialog.approve ? "Approve deal" : "Reject deal"}
        subtitle={`${dialog.row.acquisitionNo} · ${dialog.row.property}`}
        consequence={
          dialog.approve
            ? "The property enters normal inventory as Available + RESALE. A Buyback closes the old Booking as Buyback Completed and removes the previous Customer from the allocation."
            : "The prior state is restored exactly and the Booking is released from Buyback Pending."
        }
        busy={busy}
        onClose={onClose}
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
    );
  }

  if (dialog.kind === "CANCEL") {
    return (
      <FormDialog
        title="Cancel deal"
        subtitle={`${dialog.row.acquisitionNo} · ${dialog.row.property}`}
        consequence="The property becomes Not Available — Deal Cancelled and must not remain sellable. Payment Given history stays, and Accounts adjustment work is created where payment already happened."
        busy={busy}
        onClose={onClose}
        onSubmit={(f) =>
          run(() => cancelAcquisitionAction(dialog.row.id, String(f.get("reason")), newKey()))
        }
      >
        <Field label="Reason — compulsory">
          <Input name="reason" required minLength={3} />
        </Field>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      title="Record Buying Commission"
      subtitle={`${dialog.row.acquisitionNo} · arranged by ${dialog.row.arrangedBy}`}
      consequence="One beneficiary per deal, outside the 4% sale cap, payable only at 100% Payment Given. The seller cannot be the beneficiary."
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
