"use client";

// Royalty Credits a Member owns — SSOT §75, §78, §81; Change Pack §45, §68.
// One Credit is one Gift. CRM/Admin record the chosen Gift, the order and the
// delivery; MD decides a non-family recipient. A hold stops ordering and
// delivery until it clears. No amount or cash anywhere.

import React from "react";
import { useRouter } from "next/navigation";
import { formatIst, istDay } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import {
  decideRoyaltyRecipientAction,
  deliverRoyaltyGiftAction,
  orderRoyaltyGiftAction,
  selectRoyaltyGiftAction,
  type ActionResult,
} from "../royalty-actions";

export type RoyaltyCreditView = {
  id: string;
  state: "ELIGIBLE" | "SELECTED" | "ORDERED" | "DELIVERED" | "REVERSED";
  holdReason: string | null;
  customerId: string;
  customerName: string;
  bookingNumber: string | null;
  programmeRef: string;
  /** CP §68 — the Programme Version and its catalogue. */
  programmeVersion: number;
  catalogueVersion: string;
  route: "PAYMENT_100" | "APPROVED_BUYBACK";
  eligibleAt: string;
  selectedRewardRef: string | null;
  recipient: string | null;
  recipientName: string | null;
  recipientApproved: boolean;
  orderReference: string | null;
  orderedAt: string | null;
  deliveredAt: string | null;
  deliveryReference: string | null;
  reversalReason: string | null;
};

const STATE: Record<RoyaltyCreditView["state"], { label: string; variant: "success" | "warning" | "outline" | "destructive" | "info" }> = {
  ELIGIBLE: { label: "Eligible", variant: "info" },
  SELECTED: { label: "Selected", variant: "info" },
  ORDERED: { label: "Ordered", variant: "warning" },
  DELIVERED: { label: "Delivered", variant: "success" },
  REVERSED: { label: "Reversed", variant: "outline" },
};

export const REWARD_HOLD_LABEL: Record<string, string> = {
  RECOVERY_OUTSTANDING: "Recovery Outstanding",
  MEMBER_DEACTIVATED: "Member Deactivated",
  BUYBACK_STABLE_COMPLETION_PENDING: "Waiting for Stable Buyback Completion",
  REWARD_DEFICIENT: "Reward Deficient",
  NOMINEE_APPROVAL_PENDING: "Recipient waiting for MD",
  PROGRAMME_TERMS_ACTION_REQUIRED: "Programme Terms action required",
  STAFF_CONFLICT_REVIEW: "Staff conflict review",
  RECOVERY_CIRCUMVENTION_REVIEW: "Recovery circumvention review",
};

const RECIPIENTS = [
  ["SELF", "The Member"],
  ["SPOUSE", "Spouse"],
  ["PARENT", "Parent"],
  ["CHILD", "Child"],
  ["SIBLING", "Sibling"],
  ["NON_FAMILY", "Someone else (needs MD)"],
] as const;

const newKey = () => `rgc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type Dialog =
  | { kind: "SELECT"; credit: RoyaltyCreditView }
  | { kind: "RECIPIENT"; credit: RoyaltyCreditView; approve: boolean }
  | { kind: "ORDER"; credit: RoyaltyCreditView }
  | { kind: "DELIVER"; credit: RoyaltyCreditView };

export default function RoyaltyCredits({
  role,
  credits,
  openOpportunities = 0,
}: {
  role: string;
  credits: RoyaltyCreditView[];
  /** CP §68 — final relationships whose one Gift is still unused. */
  openOpportunities?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const fulfils = role === "CRM" || role === "ADMIN";

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNotice(result);
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  if (credits.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No Royalty Credit yet. A Gift is earned when a final linked Customer&apos;s first Club-direct purchase is paid in
        full, or bought back on an approved Buyback after 25%.
        {openOpportunities > 0 ? ` ${openOpportunities} relationship(s) can still earn one.` : ""}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {notice && (
        <p className={`text-xs ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.ok ? notice.message : notice.error}</p>
      )}
      <ul className="divide-y divide-border/40 text-xs">
        {credits.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATE[c.state].variant}>{STATE[c.state].label}</Badge>
                {c.holdReason && <Badge variant="warning">{REWARD_HOLD_LABEL[c.holdReason] ?? c.holdReason}</Badge>}
                <span className="font-medium">
                  {c.customerId} · {c.customerName}
                </span>
              </div>
              <p className="text-muted-foreground">
                {c.bookingNumber} · {c.programmeRef} v{c.programmeVersion} ({c.catalogueVersion}) ·{" "}
                {c.route === "PAYMENT_100" ? "100% Payment Received" : "Approved Buyback"} · {formatIst(c.eligibleAt)}
              </p>
              {c.selectedRewardRef && (
                <p>
                  Gift {c.selectedRewardRef} to {c.recipient === "SELF" ? "the Member" : `${c.recipientName} (${c.recipient?.toLowerCase().replace("_", "-")})`}
                  {c.recipient === "NON_FAMILY" && (c.recipientApproved ? " · MD approved" : " · waiting for MD")}
                </p>
              )}
              {c.orderReference && (
                <p className="text-muted-foreground">
                  Order {c.orderReference}
                  {c.orderedAt ? ` · ${formatIst(c.orderedAt)}` : ""}
                </p>
              )}
              {c.deliveredAt && (
                <p className="text-muted-foreground">
                  Delivered {formatIst(c.deliveredAt)}
                  {c.deliveryReference ? ` · ${c.deliveryReference}` : ""}
                </p>
              )}
              {c.reversalReason && <p className="text-muted-foreground">{c.reversalReason}</p>}
            </div>
            <div className="flex flex-wrap gap-1">
              {fulfils && (c.state === "ELIGIBLE" || c.state === "SELECTED") && (
                <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "SELECT", credit: c })}>
                  {c.state === "ELIGIBLE" ? "Record Gift" : "Change Gift"}
                </Button>
              )}
              {role === "MD" && c.state === "SELECTED" && c.recipient === "NON_FAMILY" && !c.recipientApproved && (
                <>
                  <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "RECIPIENT", credit: c, approve: false })}>
                    Reject Recipient
                  </Button>
                  <Button size="xs" onClick={() => setDialog({ kind: "RECIPIENT", credit: c, approve: true })}>
                    Approve Recipient
                  </Button>
                </>
              )}
              {fulfils && c.state === "SELECTED" && !c.holdReason && (
                <Button size="xs" onClick={() => setDialog({ kind: "ORDER", credit: c })}>
                  Ordered
                </Button>
              )}
              {fulfils && c.state === "ORDERED" && !c.holdReason && (
                <Button size="xs" onClick={() => setDialog({ kind: "DELIVER", credit: c })}>
                  Delivered
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {dialog?.kind === "SELECT" && <SelectDialog busy={busy} credit={dialog.credit} onClose={() => setDialog(null)} run={run} />}
      {dialog?.kind === "RECIPIENT" && (
        <NoteDialog
          title={dialog.approve ? "Approve the recipient" : "Reject the recipient"}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) =>
            run(() => decideRoyaltyRecipientAction({ creditId: dialog.credit.id, approve: dialog.approve, note }, newKey()))
          }
        />
      )}
      {dialog?.kind === "ORDER" && (
        <ReferenceDialog
          title="Gift ordered"
          referenceLabel="Order reference"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(reference, on) =>
            run(() => orderRoyaltyGiftAction({ creditId: dialog.credit.id, orderReference: reference, orderedOn: on }, newKey()))
          }
        />
      )}
      {dialog?.kind === "DELIVER" && (
        <ReferenceDialog
          title="Gift delivered"
          referenceLabel="Delivery / dispatch reference (optional)"
          optional
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(reference, on) =>
            run(() => deliverRoyaltyGiftAction({ creditId: dialog.credit.id, deliveryReference: reference, deliveredOn: on }, newKey()))
          }
        />
      )}
    </div>
  );
}

function SelectDialog({
  credit,
  busy,
  onClose,
  run,
}: {
  credit: RoyaltyCreditView;
  busy: boolean;
  onClose: () => void;
  run: (action: () => Promise<ActionResult>) => void;
}) {
  const [rewardRef, setRewardRef] = React.useState(credit.selectedRewardRef ?? "");
  const [recipient, setRecipient] = React.useState<(typeof RECIPIENTS)[number][0]>(
    (credit.recipient as (typeof RECIPIENTS)[number][0]) ?? "SELF"
  );
  const [recipientName, setRecipientName] = React.useState(credit.recipientName ?? "");
  const ready = rewardRef.trim() && (recipient === "SELF" || recipientName.trim());
  return (
    <Modal title="Record the Gift" description={`From the ${credit.programmeRef} catalogue. One Credit is one Gift; no cash alternative.`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Reward Reference from the catalogue, e.g. RG-01">
          <input className={inputClass} value={rewardRef} onChange={(e) => setRewardRef(e.target.value)} />
        </Field>
        <Field label="Recipient">
          <select className={inputClass} value={recipient} onChange={(e) => setRecipient(e.target.value as typeof recipient)}>
            {RECIPIENTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {recipient !== "SELF" && (
          <Field label="Recipient's name">
            <input className={inputClass} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !ready}
            onClick={() => run(() => selectRoyaltyGiftAction({ creditId: credit.id, rewardRef, recipient, recipientName }, newKey()))}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NoteDialog({ title, busy, onClose, onSubmit }: { title: string; busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = React.useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Note (compulsory)">
        <textarea className={`${inputClass} h-16 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy || !note.trim()} onClick={() => onSubmit(note)}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

function ReferenceDialog({
  title,
  referenceLabel,
  optional,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  referenceLabel: string;
  optional?: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reference: string, on: string) => void;
}) {
  const [reference, setReference] = React.useState("");
  const [on, setOn] = React.useState(istDay(new Date()));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Date">
          <input type="date" className={inputClass} value={on} max={istDay(new Date())} onChange={(e) => setOn(e.target.value)} />
        </Field>
        <Field label={referenceLabel}>
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || !on || (!optional && !reference.trim())} onClick={() => onSubmit(reference, on)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
