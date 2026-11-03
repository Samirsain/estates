"use client";

// A Member's commission payout from the Booking Commission table (owner,
// 27 Oct 2026). Ready → Mark Paid. Payment Pending or Recovery Review → Pay Early: MD pays it
// straight away; Accounts asks MD first, then pays once approved. Every field
// is typed in, and each step uses the same server action as the Booking and
// Buyback screens, so a payout recorded here is the one recorded there.
// Recovery Pending → Recover (owner, 3 Nov 2026): Accounts opens the Recovery,
// then marks it repaid, with the Bookings screen's own actions.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { istDay } from "@/lib/tasks";
import { RemarkSelect } from "@/components/ui/remark-select";
import {
  clearRecoveryAction,
  markCommissionPaidAction,
  openRecoveryAction,
  requestCommissionPaidEarlyAction,
} from "@/app/bookings/actions";
import { markBuyingCommissionPaidAction } from "@/app/acquisitions/actions";

import type { PayoutFix, PayoutStep, RecoveryStep } from "@/lib/domain/commission";
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
  recovery = null,
  canRecover = false,
  fix = null,
}: {
  payment: string;
  paidOn: Date | null;
  step: PayoutStep | null;
  /** Accounts asked for Pay Early and MD has not decided. */
  awaitingMd: boolean;
  recordId: string;
  buying: boolean;
  label: string;
  /** Where a Recovery Pending line's Recovery stands (recoveryStep). */
  recovery?: RecoveryStep | null;
  /** Accounts — the only role that handles Recovery. */
  canRecover?: boolean;
  /** What completes the hold on an unpaid line (Update RERA, Decide Refund…). */
  fix?: PayoutFix | null;
}) {
  if (recovery?.kind === "RECOVERED" || recovery?.kind === "NONE") {
    return (
      <span className="block">
        <span className={`font-medium ${recovery.kind === "RECOVERED" ? "text-emerald-700" : "text-muted-foreground"}`}>
          {recovery.kind === "RECOVERED" ? "Recovered" : "No Recovery"}
        </span>
        {recovery.kind === "RECOVERED" && recovery.on && (
          <span className="block text-[11px] text-muted-foreground">{formatIst(recovery.on)}</span>
        )}
      </span>
    );
  }
  if (recovery) {
    return (
      <span className="block space-y-1">
        <span className="block font-medium text-amber-700">
          Recovery Pending
          {recovery.kind === "PENDING" && (
            <span className="block text-[11px] font-normal text-muted-foreground">{recovery.recoveryNo}</span>
          )}
        </span>
        {canRecover && <RecoverButton step={recovery} recordId={recordId} label={label} />}
      </span>
    );
  }
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
  if (!step && !fix) return <span className="block text-muted-foreground">{awaitingMd ? "Pay Early · awaiting MD" : "—"}</span>;
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1">
      {awaitingMd && <span className="block w-full text-[11px] text-muted-foreground">Pay Early · awaiting MD</span>}
      {step && <PayoutButton step={step} recordId={recordId} buying={buying} label={label} />}
      {fix && <FixButton fix={fix} recordId={recordId} label={label} />}
    </span>
  );
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
            <Field label={step === "PAY" ? "Remarks" : step === "REQUEST" ? "Reason (compulsory)" : "Remarks (compulsory)"}>
              {/* h-auto: inputClass's fixed h-9 would hold two rows to one line. */}
              <textarea name="text" rows={2} className={`${inputClass} h-auto py-2`} required={step !== "PAY"} />
            </Field>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setKey(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : action}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Recover: Open Recovery while none is open, then Recovery repaid to finish it. */
function RecoverButton({ step, recordId, label }: { step: RecoveryStep; recordId: string; label: string }) {
  const router = useRouter();
  const [key, setKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const today = istDay(new Date());
  const opening = step.kind === "OPEN";

  return (
    <>
      <Button
        type="button"
        size="xs"
        onClick={() => {
          setError(null);
          setKey(globalThis.crypto.randomUUID());
        }}
      >
        Recover
      </Button>
      {key && (
        <Modal
          title={opening ? "Open Recovery" : "Recovery repaid"}
          description={step.kind === "PENDING" ? `${label} · ${step.recoveryNo}` : label}
          width="w-[min(24rem,94vw)]"
          onClose={() => setKey(null)}
        >
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              const result =
                step.kind === "PENDING"
                  ? await clearRecoveryAction({ recoveryId: step.recoveryId, note: String(f.get("note")) }, key)
                  : await openRecoveryAction(
                      {
                        recordId,
                        noticeOn: String(f.get("noticeOn")),
                        reference: String(f.get("reference")),
                        reason: String(f.get("reason")),
                      },
                      key
                    );
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setKey(null);
              router.refresh();
            }}
          >
            <p className="text-xs text-muted-foreground">
              {opening
                ? "The Recovery opens as Recovery Pending, due 15 days after the notice date. New cash payouts to this Person are held. When the money is back, use Recover again to mark it repaid."
                : "The Recovery is cleared as repaid, and payouts it was holding are released if nothing else holds them."}
            </p>
            {opening ? (
              <>
                <Field label="Notice date">
                  <Input name="noticeOn" type="date" defaultValue={today} max={today} required />
                </Field>
                <Field label="Accounts Recovery Reference">
                  <Input name="reference" required />
                </Field>
                <Field label="Reason (compulsory)">
                  <RemarkSelect presets="openRecovery" name="reason" required />
                </Field>
              </>
            ) : (
              <Field label="Note (compulsory)">
                <RemarkSelect presets="recoveryRepaid" name="note" required />
              </Field>
            )}
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setKey(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : opening ? "Open Recovery" : "Mark Repaid"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** The hold's own completing step: a link to where it is done, or Recover in place. */
function FixButton({ fix, recordId, label }: { fix: PayoutFix; recordId: string; label: string }) {
  if ("recover" in fix) return <RecoverButton step={fix.recover} recordId={recordId} label={label} />;
  return (
    <Button asChild size="xs" variant="outline">
      {/* A #name opens this page's own dialog (useHashOpen); a path opens that page. */}
      {fix.href.startsWith("#") ? <a href={fix.href}>{fix.label}</a> : <Link href={fix.href}>{fix.label}</Link>}
    </Button>
  );
}
