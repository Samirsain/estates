"use client";

// A Member's Royalty Tokens — docss/11. The three figures, and behind Show
// Details the redemptions recorded against the one pooled balance. CRM or MD
// record spending arranged outside the CRM (a Gift or a Voucher) with Claim
// Points. No cash, no rupee value, no expiry.

import React from "react";
import { useRouter } from "next/navigation";
import { formatIst, istDay } from "@/lib/tasks";
import { validateBusinessDay, validateTokenQuantity } from "@/lib/domain/tokens";
import type { MemberTokenView } from "@/lib/services/royalty-service";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { Stat } from "@/components/record-section";
import { recordTokenRedemptionAction, tokenAvailabilityAction, type ActionResult } from "../royalty-actions";

export const REWARD_HOLD_LABEL: Record<string, string> = {
  RECOVERY_OUTSTANDING: "Recovery Pending",
  MEMBER_DEACTIVATED: "Member Deactivated",
  BUYBACK_STABLE_COMPLETION_PENDING: "Waiting for Stable Buyback Completion",
  REWARD_DEFICIENT: "Reward Deficient",
  PROGRAMME_TERMS_ACTION_REQUIRED: "Programme Terms action required",
  RECOVERY_CIRCUMVENTION_REVIEW: "Recovery Review",
};

/** What a redemption arranged: these two only (owner, 27 Oct 2026). */
const ARRANGED = ["Gift", "Voucher"] as const;
// ponytail: entries saved before 27 Oct 2026 hold free text ("Gift voucher",
// "Diwali sweets hamper"); they read as Voucher when they say so, else Gift.
// A data backfill can replace this if the old text must change at the source.
const usedFor = (reference: string | null) =>
  !reference?.trim() ? "—" : /voucher/i.test(reference) ? "Voucher" : "Gift";

const TOGGLE = "text-[11px] font-medium text-primary hover:underline";
// Show Details: the same three columns as Royalty Customers below it.
const GRID = "grid grid-cols-[1fr_auto_1fr] items-start gap-x-2";
const HEAD = "pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const SLOT = "inline-block w-24 text-center";

const newKey = () => `tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

export default function RoyaltyTokens({
  role,
  memberProfileId,
  view,
}: {
  role: string;
  memberProfileId: string;
  view: MemberTokenView;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [showSpent, setShowSpent] = React.useState(false);
  const staff = view.staff!;
  // Only what was really spent: a corrected or rejected entry gave its points
  // back, so it is not listed (owner, 27 Oct 2026), and the list adds up to Spent.
  const spent = staff.redemptions.filter((r) => r.state === "RECORDED");
  const records = role === "CRM" || role === "MD";

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNotice(result);
    if (result.ok) {
      setRecording(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4 text-xs">
      {/* docss/11 §1 — the three Member-facing figures. */}
      <dl className="grid grid-cols-3 gap-y-3 divide-x divide-border/60">
        <Stat label="Total Points" value={view.figures.earned} />
        <Stat label="Spent" value={view.figures.spent} />
        <Stat
          label="Balance"
          value={<span className={view.figures.balance < 0 ? "text-red-700" : undefined}>{signed(view.figures.balance)}</span>}
        />
      </dl>

      {notice && <p className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.ok ? notice.message : notice.error}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {spent.length > 0 && (
          <button type="button" className={TOGGLE} aria-expanded={showSpent} onClick={() => setShowSpent(!showSpent)}>
            {showSpent ? "▾" : "▸"} Show Details ({spent.length})
          </button>
        )}
        {records && (
          <Button size="xs" variant="outline" className="ml-auto" onClick={() => setRecording(true)}>
            Claim Points
          </Button>
        )}
      </div>

      {/* Each redemption: points, date, what it was used for — the card's
          three columns (the sides share the width, so Date is centred). */}
      {showSpent && (
        <div>
          <div className={`${GRID} border-b border-border/50`}>
            <span className={HEAD}>Points</span>
            <span className={`${HEAD} text-center`}>Date</span>
            <span className={`${HEAD} text-right`}>
              <span className={SLOT}>Used For</span>
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {spent.map((r) => (
              <li key={r.id} className={`${GRID} py-2`}>
                <span className="font-semibold tabular-nums text-foreground">{r.tokens}</span>
                <span className="whitespace-nowrap text-center tabular-nums">{formatIst(r.redeemedOn)}</span>
                <span className="text-right">
                  <span className={SLOT}>{usedFor(r.reference)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recording && (
        <RecordDialog busy={busy} memberProfileId={memberProfileId} onClose={() => setRecording(false)} run={run} />
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
          : null;
  const ready = tokens && reference && !problem && availability;

  return (
    // A small portrait sheet: three fields, one under the other.
    <Modal title="Record a points redemption" width="w-[min(22rem,94vw)]" onClose={onClose}>
      <div className="space-y-3">
        {/* Only what stops spending; the limit itself shows if it is crossed. */}
        {availability && availability.blockers.length > 0 && (
          <div className="text-xs">
            {availability.blockers.map((b) => (
              <p key={b} className="text-amber-800">
                {b}
              </p>
            ))}
          </div>
        )}
        <div className="space-y-3">
          <Field label="Points">
            <input className={inputClass} inputMode="numeric" value={tokens} onChange={(e) => setTokens(e.target.value)} />
          </Field>
          <Field label="Redemption date">
            <input type="date" className={inputClass} value={on} max={today} onChange={(e) => setOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Used for">
          <select className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {ARRANGED.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
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
                  // The Member is always the recipient now (owner, 27 Oct 2026).
                  { memberProfileId, tokens: amount, redeemedOn: on, recipient: "SELF", recipientName: "", reference },
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
