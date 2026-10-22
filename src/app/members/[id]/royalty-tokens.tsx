"use client";

// A Member's Royalty Tokens — docss/11. The four figures, and behind two
// buttons the redemptions recorded against the one pooled balance and — for
// staff only — the awards behind it (history, never wallets). CRM or MD record
// spending arranged outside the CRM, for any recipient; MD corrects an
// erroneous entry. Kept as plain as the Rewards list: who, how many, when.
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
  recordTokenRedemptionAction,
  tokenAvailabilityAction,
  type ActionResult,
} from "../royalty-actions";
import { RemarkSelect } from "@/components/ui/remark-select";
import type { RemarkPresetKey } from "@/lib/remark-presets";

export const REWARD_HOLD_LABEL: Record<string, string> = {
  RECOVERY_OUTSTANDING: "Recovery Pending",
  MEMBER_DEACTIVATED: "Member Deactivated",
  BUYBACK_STABLE_COMPLETION_PENDING: "Waiting for Stable Buyback Completion",
  REWARD_DEFICIENT: "Reward Deficient",
  PROGRAMME_TERMS_ACTION_REQUIRED: "Programme Terms action required",
  RECOVERY_CIRCUMVENTION_REVIEW: "Recovery circumvention review",
};

const RECIPIENTS = [
  ["SELF", "The Member"],
  ["SPOUSE", "Spouse"],
  ["PARENT", "Parent"],
  ["CHILD", "Child"],
  ["SIBLING", "Sibling"],
  ["NON_FAMILY", "Someone else"],
] as const;

const REDEMPTION_STATE: Record<string, { label: string; variant: "success" | "warning" | "outline" | "destructive" | "info" }> = {
  RECORDED: { label: "Spent", variant: "success" },
  REJECTED: { label: "Rejected", variant: "outline" },
  CORRECTED: { label: "Corrected", variant: "outline" },
};

const AWARD_STATE: Record<string, { label: string; variant: "success" | "warning" | "outline" | "info" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  RELEASED: { label: "Earned", variant: "success" },
  REVERSED: { label: "Cancelled", variant: "outline" },
};

// The Rewards list's look: a toggle, then one plain line per entry.
const TOGGLE = "text-[11px] font-medium text-primary hover:underline";
const ROW = "flex flex-wrap items-center justify-between gap-2 py-2";
const LINE = "flex min-w-0 flex-wrap items-center gap-1.5";

const newKey = () => `tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

type Dialog =
  | { kind: "RECORD" }
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
  const [showSpent, setShowSpent] = React.useState(false);
  const [showAwards, setShowAwards] = React.useState(false);
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
        />
        <Stat label="Can still earn" value={openOpportunities} />
      </dl>

      {notice && <p className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.ok ? notice.message : notice.error}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {staff.redemptions.length > 0 && (
          <button type="button" className={TOGGLE} aria-expanded={showSpent} onClick={() => setShowSpent(!showSpent)}>
            {showSpent ? "▾" : "▸"} Show spent ({staff.redemptions.length})
          </button>
        )}
        {staff.awards.length > 0 && (
          <button type="button" className={TOGGLE} aria-expanded={showAwards} onClick={() => setShowAwards(!showAwards)}>
            {showAwards ? "▾" : "▸"} Show where points came from ({staff.awards.length})
          </button>
        )}
        {records && (
          <Button size="xs" variant="outline" className="ml-auto" onClick={() => setDialog({ kind: "RECORD" })}>
            Record redemption
          </Button>
        )}
      </div>

      {/* A state badge says something only when it is not the normal one. */}
      {showSpent && (
        <ul className="divide-y divide-border/40">
          {staff.redemptions.map((r) => (
            <li key={r.id} className={ROW}>
              <span className={LINE}>
                <span className="text-foreground">
                  {r.recipient === "SELF" ? "The Member" : `${r.recipientName} (${r.recipient.toLowerCase().replace("_", "-")})`}
                </span>
                <span className="text-muted-foreground">
                  · {r.tokens} points · {formatIst(r.redeemedOn)}
                </span>
                {r.state !== "RECORDED" && (
                  <Badge variant={REDEMPTION_STATE[r.state]?.variant ?? "outline"}>{REDEMPTION_STATE[r.state]?.label ?? r.state}</Badge>
                )}
              </span>
              {corrects && r.state === "RECORDED" && (
                <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "CORRECT", redemptionId: r.id, tokens: r.tokens })}>
                  Correct
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Internal history: where the points came from. Never a balance per Project. */}
      {showAwards && (
        <ul className="divide-y divide-border/40">
          {staff.awards.map((a) => (
            <li key={a.id} className={ROW}>
              <span className={LINE}>
                {/* Read like an earned Reward: what, when, then Ref as ID and first name. */}
                <span className="text-foreground">{a.tokens} points</span>
                <span className="text-muted-foreground">
                  · {formatIst(a.qualifiedAt)} · Ref: {a.customerId} {a.customerName.trim().split(/\s+/)[0]}
                </span>
                {a.state !== "RELEASED" && <Badge variant={AWARD_STATE[a.state].variant}>{AWARD_STATE[a.state].label}</Badge>}
                {a.holdReason && <Badge variant="warning">{REWARD_HOLD_LABEL[a.holdReason] ?? a.holdReason}</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "RECORD" && (
        <RecordDialog busy={busy} memberProfileId={memberProfileId} onClose={() => setDialog(null)} run={run} />
      )}
      {dialog?.kind === "CORRECT" && (
        <NoteDialog
          title={`Correct an erroneous redemption of ${dialog.tokens} points`}
          label="Why it was wrong (compulsory). The points return to the balance; the entry stays in history."
          presets="correctRedemption"
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
          <RemarkSelect presets="recordRedemption" value={reference} onChange={setReference} />
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
  presets,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  presets: RemarkPresetKey;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = React.useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={label}>
        <RemarkSelect presets={presets} value={note} onChange={setNote} required />
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
