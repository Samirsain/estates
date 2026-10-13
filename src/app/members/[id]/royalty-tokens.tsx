"use client";

// A Member's Royalty Tokens — docss/11. The three figures a Member also sees,
// every redemption recorded against the one pooled balance, and — for staff
// only — the awards behind it (history, never wallets) and why spending is
// blocked now. CRM or Admin record spending arranged outside the CRM; MD
// decides a non-family recipient; Admin or MD corrects an erroneous entry.
// No cash, no rupee value, no expiry.

import React from "react";
import { useRouter } from "next/navigation";
import { formatIst, istDay } from "@/lib/tasks";
import { validateBusinessDay, validateTokenQuantity } from "@/lib/domain/tokens";
import type { MemberTokenView } from "@/lib/services/royalty-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import {
  correctTokenRedemptionAction,
  decideTokenRedemptionAction,
  recordTokenRedemptionAction,
  tokenAvailabilityAction,
  type ActionResult,
} from "../royalty-actions";

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

const REDEMPTION_STATE: Record<string, { label: string; variant: "success" | "warning" | "outline" | "destructive" | "info" }> = {
  RECORDED: { label: "Spent", variant: "success" },
  AWAITING_MD: { label: "Waiting for MD", variant: "warning" },
  REJECTED: { label: "Rejected", variant: "outline" },
  CORRECTED: { label: "Corrected", variant: "outline" },
};

const AWARD_STATE: Record<string, { label: string; variant: "success" | "warning" | "outline" | "info" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  RELEASED: { label: "Posted", variant: "success" },
  REVERSED: { label: "Reversed", variant: "outline" },
};

const newKey = () => `tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

type Dialog =
  | { kind: "RECORD" }
  | { kind: "DECIDE"; redemptionId: string; approve: boolean }
  | { kind: "CORRECT"; redemptionId: string; tokens: number };

export default function RoyaltyTokens({
  role,
  memberProfileId,
  view,
  openOpportunities,
}: {
  role: string;
  memberProfileId: string;
  view: MemberTokenView;
  /** CP §68 — final relationships whose one opportunity is still unused. */
  openOpportunities: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const staff = view.staff!;
  const records = role === "CRM" || role === "ADMIN";
  const corrects = role === "ADMIN" || role === "MD";

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

  return (
    <div className="space-y-3 text-xs">
      {/* docss/11 §1 — exactly the three Member-facing figures. */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Tokens earned", view.figures.earned],
            ["Tokens spent", view.figures.spent],
            ["Token balance", view.figures.balance],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-lg border border-border/60 px-2.5 py-2">
            <p className={`text-base font-semibold tabular-nums ${n < 0 ? "text-red-700" : ""}`}>{signed(n)}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {staff.blockers.length > 0 && (
        <ul className="space-y-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-amber-800">
          {staff.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      {notice && <p className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.ok ? notice.message : notice.error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          One balance across every Project. Earned when a final linked Customer&apos;s first Club-direct purchase qualifies
          {openOpportunities > 0 ? ` — ${openOpportunities} relationship(s) can still earn` : ""}. No expiry, no cash value.
        </p>
        {records && (
          <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "RECORD" })}>
            Record redemption
          </Button>
        )}
      </div>

      <div>
        <h4 className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens spent</h4>
        {staff.redemptions.length === 0 ? (
          <p className="text-muted-foreground">Nothing spent yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {staff.redemptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-1.5">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums">{r.tokens} tokens</span>
                    <span>{formatIst(r.redeemedOn)}</span>
                    <Badge variant={REDEMPTION_STATE[r.state]?.variant ?? "outline"}>{REDEMPTION_STATE[r.state]?.label ?? r.state}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {r.recipient === "SELF"
                      ? "For the Member"
                      : `For ${r.recipientName} (${r.recipient.toLowerCase().replace("_", "-")})`}
                    {r.reference ? ` · ${r.reference}` : ""} · recorded by {r.recordedByRef}
                  </p>
                  {r.decisionNote && <p className="text-muted-foreground">MD: {r.decisionNote}</p>}
                  {r.correctionReason && <p className="text-muted-foreground">Corrected: {r.correctionReason}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {role === "MD" && r.state === "AWAITING_MD" && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "DECIDE", redemptionId: r.id, approve: false })}>
                        Reject
                      </Button>
                      <Button size="xs" onClick={() => setDialog({ kind: "DECIDE", redemptionId: r.id, approve: true })}>
                        Approve
                      </Button>
                    </>
                  )}
                  {corrects && r.state === "RECORDED" && (
                    <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "CORRECT", redemptionId: r.id, tokens: r.tokens })}>
                      Correct
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Internal history: where the tokens came from. Never a balance per Project. */}
      <details>
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Royalty awards — internal ({staff.awards.length})
        </summary>
        {staff.awards.length === 0 ? (
          <p className="pt-1 text-muted-foreground">No award yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border/40">
            {staff.awards.map((a) => (
              <li key={a.id} className="space-y-0.5 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={AWARD_STATE[a.state].variant}>{AWARD_STATE[a.state].label}</Badge>
                  {a.holdReason && <Badge variant="warning">{REWARD_HOLD_LABEL[a.holdReason] ?? a.holdReason}</Badge>}
                  <span className="font-medium tabular-nums">{a.tokens} tokens</span>
                  {a.consumed && <span className="text-muted-foreground">used</span>}
                </div>
                <p className="text-muted-foreground">
                  {a.customerId} · {a.customerName} ·{" "}
                  <a className="underline-offset-2 hover:underline" href={`/bookings?booking=${a.bookingId}`}>
                    {a.bookingNumber}
                  </a>{" "}
                  · {a.project} · {a.route === "PAYMENT_100" ? "100% Payment Received" : "Approved Buyback"} · {formatIst(a.qualifiedAt)}
                </p>
                {a.reversalReason && a.state === "REVERSED" && <p className="text-muted-foreground">{a.reversalReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </details>

      {dialog?.kind === "RECORD" && (
        <RecordDialog busy={busy} memberProfileId={memberProfileId} onClose={() => setDialog(null)} run={run} />
      )}
      {dialog?.kind === "DECIDE" && (
        <NoteDialog
          title={dialog.approve ? "Approve the non-family recipient" : "Reject the non-family recipient"}
          label="Note (compulsory)"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) =>
            run(() => decideTokenRedemptionAction({ redemptionId: dialog.redemptionId, approve: dialog.approve, note }, newKey()))
          }
        />
      )}
      {dialog?.kind === "CORRECT" && (
        <NoteDialog
          title={`Correct an erroneous redemption of ${dialog.tokens} tokens`}
          label="Why it was wrong (compulsory). The tokens return to the balance; the entry stays in history."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => run(() => correctTokenRedemptionAction({ redemptionId: dialog.redemptionId, reason }, newKey()))}
        />
      )}
    </div>
  );
}

function RecordDialog({
  memberProfileId,
  busy,
  onClose,
  run,
}: {
  memberProfileId: string;
  busy: boolean;
  onClose: () => void;
  run: (action: () => Promise<ActionResult>) => void;
}) {
  const today = istDay(new Date());
  // One key per dialog: a double-click or a retry is the same redemption.
  const [key] = React.useState(newKey);
  const [availability, setAvailability] = React.useState<{ canRecordUpTo: number; blockers: string[] } | null>(null);
  const [tokens, setTokens] = React.useState("");
  const [on, setOn] = React.useState(today);
  const [recipient, setRecipient] = React.useState<(typeof RECIPIENTS)[number][0]>("SELF");
  const [recipientName, setRecipientName] = React.useState("");
  const [reference, setReference] = React.useState("");

  React.useEffect(() => {
    tokenAvailabilityAction(memberProfileId).then(setAvailability);
  }, [memberProfileId]);

  const amount = /^\d+$/.test(tokens.trim()) ? Number(tokens) : Number.NaN;
  const quantity = validateTokenQuantity("Tokens", amount);
  const dated = validateBusinessDay("Redemption date", on, today);
  const problem = !tokens
    ? null
    : !quantity.ok
      ? quantity.reason
      : availability && amount > availability.canRecordUpTo
        ? `Only ${availability.canRecordUpTo} tokens can be recorded now.`
        : !dated.ok
          ? dated.reason
          : recipient !== "SELF" && !recipientName.trim()
            ? "Enter the recipient's name."
            : null;
  const ready = tokens && !problem && availability;

  return (
    <Modal
      title="Record a token redemption"
      description="For spending already arranged outside the CRM. It comes off the one pooled balance, oldest tokens first."
      onClose={onClose}
    >
      <div className="space-y-3">
        {!availability ? (
          <p className="text-xs text-muted-foreground">Checking what can be spent…</p>
        ) : (
          <div className="text-xs">
            <p className="font-medium">Up to {availability.canRecordUpTo} tokens can be recorded now.</p>
            {availability.blockers.map((b) => (
              <p key={b} className="text-amber-800">
                {b}
              </p>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tokens">
            <input className={inputClass} inputMode="numeric" value={tokens} onChange={(e) => setTokens(e.target.value)} />
          </Field>
          <Field label="Redemption date">
            <input type="date" className={inputClass} value={on} max={today} onChange={(e) => setOn(e.target.value)} />
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
        </div>
        <Field label="What was arranged (internal, optional)">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {problem && <p className="text-xs text-red-700">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !ready}
            onClick={() =>
              run(() =>
                recordTokenRedemptionAction(
                  { memberProfileId, tokens: amount, redeemedOn: on, recipient, recipientName, reference },
                  key
                )
              )
            }
          >
            Record
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NoteDialog({
  title,
  label,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = React.useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={label}>
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
