"use client";

// A Member's commission payout from the Booking Commission table (owner,
// 27 Oct 2026). Ready → Mark Paid. Payment Pending or Recovery Review → Pay Early: MD pays it
// straight away; Accounts asks MD first, then pays once approved. Every field
// is typed in, and each step uses the same server action as the Booking and
// Buyback screens, so a payout recorded here is the one recorded there.

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { istDay } from "@/lib/tasks";
import { markCommissionPaidAction, requestCommissionPaidEarlyAction } from "@/app/bookings/actions";
import { markBuyingCommissionPaidAction } from "@/app/acquisitions/actions";

import type { PayoutStep } from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";

const PAID_LABEL: Record<string, string> = {
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Recovery Pending",
  CANCELLED: "Cancelled",
};

/** One commission line's Payout: its paid state with the date, else the step
 *  this viewer can take, else what it waits for. Member and Customer profiles. */
export function PayoutCell({
  payment,
  paidOn,
  step,
  awaitingMd,
  recordId,
  buying,
  label,
}: {
  payment: string;
  paidOn: Date | null;
  step: PayoutStep | null;
  /** Accounts asked for Pay Early and MD has not decided. */
  awaitingMd: boolean;
  recordId: string;
  buying: boolean;
  label: string;
}) {
  if (payment !== "NOT_PAID") {
    // Paid, Paid Early, Recovery Pending (paid, now to recover) or Cancelled.
    const tone =
      payment === "CANCELLED" ? "text-muted-foreground" : payment === "ACCOUNTS_ADJUSTMENT_REQUIRED" ? "text-amber-700" : "text-emerald-700";
    return (
      <span className="block">
        <span className={`font-medium ${tone}`}>{PAID_LABEL[payment] ?? payment}</span>
        {paidOn && <span className="block text-[11px] text-muted-foreground">{formatIst(paidOn)}</span>}
      </span>
    );
  }
  if (step) return <PayoutButton step={step} recordId={recordId} buying={buying} label={label} />;
  return <span className="block text-muted-foreground">{awaitingMd ? "Pay Early · awaiting MD" : "—"}</span>;
}

const TITLE: Record<PayoutStep, string> = {
  PAY: "Mark Commission Paid",
  REQUEST: "Request Pay Early",
  PAY_EARLY: "Mark Commission Paid Early",
};

export function PayoutButton({
  step,
  recordId,
  buying,
  label,
}: {
  step: PayoutStep;
  recordId: string;
  /** A Buying Commission on a Buyback or Resale. */
  buying: boolean;
  /** "Direct 3.00% · BKG-000068 · TN-18". */
  label: string;
}) {
  const router = useRouter();
  // One key per opened form, so a double submit is the same step, not two.
  const [key, setKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const today = istDay(new Date());
  const pays = step === "PAY" || step === "PAY_EARLY";
  const action = step === "PAY" ? "Mark Paid" : step === "REQUEST" ? "Request" : "Pay Early";

  async function submit(f: FormData) {
    const text = String(f.get("text") ?? "");
    if (step === "REQUEST") return requestCommissionPaidEarlyAction({ recordId, reason: text }, key!);
    const input = {
      recordId,
      early: step === "PAY_EARLY",
      paidOn: String(f.get("paidOn")),
      reference: String(f.get("reference")),
      remarks: text,
    };
    return (buying ? markBuyingCommissionPaidAction : markCommissionPaidAction)(input, key!);
  }

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant={step === "PAY" ? "default" : "outline"}
        onClick={() => {
          setError(null);
          setKey(globalThis.crypto.randomUUID());
        }}
      >
        {step === "PAY" ? "Mark Paid" : "Pay Early"}
      </Button>
      {key && (
        <Modal title={TITLE[step]} description={label} width="w-[min(24rem,94vw)]" onClose={() => setKey(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const result = await submit(new FormData(e.currentTarget));
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setKey(null);
              router.refresh();
            }}
          >
            {step === "REQUEST" && (
              <p className="text-xs text-muted-foreground">MD approves it next; then it can be paid early.</p>
            )}
            {pays && (
              <>
                <Field label="Paid Date">
                  <Input name="paidOn" type="date" defaultValue={today} max={today} required />
                </Field>
                <Field label="Reference No.">
                  <Input name="reference" required />
                </Field>
              </>
            )}
            {/* Remarks are optional only on a normal payout; every early step needs its why. */}
            <Field label={step === "PAY" ? "Remarks" : step === "REQUEST" ? "Reason — compulsory" : "Remarks — compulsory"}>
              <textarea name="text" rows={2} className={`${inputClass} w-full`} required={step !== "PAY"} />
            </Field>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setKey(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {action}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
