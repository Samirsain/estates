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
import { Stat } from "@/components/record-section";
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

// The profile's own table look (Bookings sold).
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-2.5 pr-4 align-top";
const SUB = "block text-[11px] text-muted-foreground";

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
  const records = role === "CRM" || role === "MD";
  const corrects = role === "MD";

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
    <div className="space-y-4 text-xs">
      {/* docss/11 §1 — the three Member-facing figures, plus who can still earn. */}
      <dl className="grid grid-cols-2 gap-y-3 md:grid-cols-4 md:divide-x md:divide-border/60">
        <Stat label="Earned" value={view.figures.earned} />
        <Stat label="Spent" value={view.figures.spent} />
        <Stat
          label="Balance"
          value={<span className={view.figures.balance < 0 ? "text-red-700" : undefined}>{signed(view.figures.balance)}</span>}
          hint="One balance, every Project"
        />
        <Stat label="Can still earn" value={openOpportunities} hint="linked Customers" />
      </dl>

      {staff.blockers.length > 0 && (
        <ul className="space-y-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-800">
          {staff.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      {notice && <p className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.ok ? notice.message : notice.error}</p>}

      <div>
        <div className="flex items-center justify-between gap-2 pb-2">
          <p className="text-sm font-semibold text-foreground">Spent</p>
          {records && (
            <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "RECORD" })}>
              Record redemption
            </Button>
          )}
        </div>
        {staff.redemptions.length === 0 ? (
          <p className="text-muted-foreground">Nothing spent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem]">
              <thead className="border-b border-border/50">
                <tr>
                  <th className={TH}>Date</th>
                  <th className={TH}>Points</th>
                  <th className={TH}>For</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} pr-0`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {staff.redemptions.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>{formatIst(r.redeemedOn)}</td>
                    <td className={`${TD} font-semibold tabular-nums`}>{r.tokens}</td>
                    <td className={TD}>
                      {r.recipient === "SELF" ? "The Member" : `${r.recipientName} (${r.recipient.toLowerCase().replace("_", "-")})`}
                      <span className={SUB}>
                        {r.reference ? `${r.reference} · ` : ""}by {r.recordedByRef}
                      </span>
                      {r.decisionNote && <span className={SUB}>MD: {r.decisionNote}</span>}
                      {r.correctionReason && <span className={SUB}>Corrected: {r.correctionReason}</span>}
                    </td>
                    <td className={TD}>
                      <Badge variant={REDEMPTION_STATE[r.state]?.variant ?? "outline"}>{REDEMPTION_STATE[r.state]?.label ?? r.state}</Badge>
                    </td>
                    <td className={`${TD} pr-0`}>
                      <span className="flex justify-end gap-1">
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
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Internal history: where the points came from. Never a balance per Project. */}
      {staff.awards.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
            Where the points came from ({staff.awards.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead className="border-b border-border/50">
                <tr>
                  <th className={TH}>Customer</th>
                  <th className={TH}>Booking</th>
                  <th className={TH}>Points</th>
                  <th className={`${TH} pr-0`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {staff.awards.map((a) => (
                  <tr key={a.id}>
                    <td className={TD}>
                      {a.customerId}
                      <span className={SUB}>{a.customerName}</span>
                    </td>
                    <td className={TD}>
                      <a className="font-semibold text-primary hover:underline" href={`/bookings?booking=${a.bookingId}`}>
                        {a.bookingNumber}
                      </a>
                      <span className={SUB}>
                        {a.project} · {a.route === "PAYMENT_100" ? "100% payment" : "Approved Buyback"} · {formatIst(a.qualifiedAt)}
                      </span>
                    </td>
                    <td className={`${TD} font-semibold tabular-nums`}>
                      {a.tokens}
                      {a.consumed && <span className={SUB}>used</span>}
                    </td>
                    <td className={`${TD} pr-0`}>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant={AWARD_STATE[a.state].variant}>{AWARD_STATE[a.state].label}</Badge>
                        {a.holdReason && <Badge variant="warning">{REWARD_HOLD_LABEL[a.holdReason] ?? a.holdReason}</Badge>}
                      </span>
                      {a.reversalReason && a.state === "REVERSED" && <span className={SUB}>{a.reversalReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

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
          title={`Correct an erroneous redemption of ${dialog.tokens} points`}
          label="Why it was wrong (compulsory). The points return to the balance; the entry stays in history."
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
  const quantity = validateTokenQuantity("Points", amount);
  const dated = validateBusinessDay("Redemption date", on, today);
  const problem = !tokens
    ? null
    : !quantity.ok
      ? quantity.reason
      : availability && amount > availability.canRecordUpTo
        ? `Only ${availability.canRecordUpTo} points can be recorded now.`
        : !dated.ok
          ? dated.reason
          : recipient !== "SELF" && !recipientName.trim()
            ? "Enter the recipient's name."
            : null;
  const ready = tokens && !problem && availability;

  return (
    <Modal
      title="Record a points redemption"
      description="For spending already arranged outside the CRM. It comes off the one pooled balance, oldest points first."
      onClose={onClose}
    >
      <div className="space-y-3">
        {!availability ? (
          <p className="text-xs text-muted-foreground">Checking what can be spent…</p>
        ) : (
          <div className="text-xs">
            <p className="font-medium">Up to {availability.canRecordUpTo} points can be recorded now.</p>
            {availability.blockers.map((b) => (
              <p key={b} className="text-amber-800">
                {b}
              </p>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Points">
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
