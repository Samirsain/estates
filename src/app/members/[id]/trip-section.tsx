"use client";

// A Member's Rewards — SSOT §40, §47, §54, §56, §65; Change Pack §68. One row
// per Project programme the Member has a qualifying sale in, with Self,
// References and the progress toward the next Reward, each counted on
// that programme alone. "Show credit" lists the sales behind a row; the earned
// Rewards follow with their fulfilment. CRM or MD record the traveller (family
// or not), the booking and the travel. Non-cash: there is no value to show.
//
// What staff read says "Reward", never "Trip"; the internal names (TripCredit,
// tripProgrammes, the actions) keep the old word.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatIst, istDay } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { creditStatus } from "@/lib/domain/trip";
import type { TripProgrammeView } from "@/lib/trip-view";
import { REWARD_HOLD_LABEL } from "./royalty-tokens";
import {
  bookTripAction,
  recordTripNomineeAction,
  type ActionResult,
} from "../trip-actions";
import { RemarkSelect } from "@/components/ui/remark-select";
import type { RemarkPresetKey } from "@/lib/remark-presets";

export type { TripProgrammeView };

const RECIPIENTS = [
  ["SELF", "The Member"],
  ["SPOUSE", "Spouse"],
  ["PARENT", "Parent"],
  ["CHILD", "Child"],
  ["SIBLING", "Sibling"],
  ["NON_FAMILY", "Someone else"],
] as const;

const newKey = () => `trp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** The three on-screen credit statuses, coloured as the owner approved them. */
const STATUS_TONE = { Pending: "text-amber-700", Counted: "text-emerald-700", "Not Counted": "text-red-700" } as const;

type TripState = TripProgrammeView["rewards"][number]["state"];
const TRIP_STATE: Record<TripState, { label: string; variant: "success" | "destructive" | "info" | "outline" }> = {
  EARNED: { label: "Earned", variant: "info" },
  BOOKED: { label: "Booked", variant: "info" },
  TRAVELLED: { label: "Travelled", variant: "success" },
  DEFICIENT: { label: "Deficient", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

/** "The Member", "Sunita (Spouse)", or a name alone when not family. */
function traveller(r: TripProgrammeView["rewards"][number]) {
  if (!r.recipient) return "No traveller yet";
  if (r.recipient === "SELF") return "The Member";
  const relation = r.recipient === "NON_FAMILY" ? null : RECIPIENTS.find(([v]) => v === r.recipient)?.[1];
  return relation ? `${r.recipientName} (${relation})` : r.recipientName;
}

/** CP §68 — what counts toward the next Reward: Self, plus References up to their maximum. */
function progress(p: TripProgrammeView) {
  const countedRef = p.rules ? Math.min(p.qualifiedReference, p.rules.maxRef) : p.qualifiedReference;
  return p.qualifiedOwn + countedRef;
}

/** The credits behind the row's Self and References: qualified and not yet in
 *  an earned Reward. Waiting, cancelled, expired and used ones stay out. */
const counting = (p: TripProgrammeView) => p.credits.filter((c) => c.state === "QUALIFIED" && !c.bucketId);

// The profile's own table look (Bookings sold).
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-2.5 pr-4 align-top";
const SUB = "block text-[11px] text-muted-foreground";

type Dialog =
  | { kind: "NOMINEE"; rewardId: string }
  | { kind: "BOOK"; rewardId: string };

export default function TripSection({ role, programmes }: { role: string; programmes: TripProgrammeView[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  // The programme whose credits are open under its row.
  const [open, setOpen] = React.useState<string | null>(null);
  const [showEarned, setShowEarned] = React.useState(false);
  const fulfils = role === "CRM" || role === "MD";

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

  if (programmes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No qualifying sale yet. Rewards start with a sale that reaches 100% payment in a Project with Rewards.
      </p>
    );
  }

  // Two programmes in one Project (an old one winding down) are counted apart,
  // so their rows need the programme code to tell them apart.
  const shared = (project: string) => programmes.filter((p) => p.project === project).length > 1;
  // A Reward's References are the Reference credits filed in its bucket.
  const earned = programmes.flatMap((p) =>
    p.rewards.map((r) => ({
      ...r,
      project: p.project,
      refs: p.credits.filter((c) => c.bucketId === r.bucketId && c.type === "REFERENCE" && c.via).map((c) => c.via!),
    }))
  );

  return (
    <div className="space-y-4 text-xs">
      {notice && <p className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.ok ? notice.message : notice.error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem]">
          <thead className="border-b border-border/50">
            <tr>
              <th className={TH}>Project</th>
              <th className={`${TH} text-right`}>Self</th>
              <th className={`${TH} text-right`}>References</th>
              <th className={`${TH} pr-0`}>Reward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {programmes.map((p) => {
              const total = progress(p);
              return (
                <React.Fragment key={p.key}>
                  <tr>
                    <td className={TD}>
                      <span className="font-semibold text-foreground">{p.project}</span>
                      {shared(p.project) && <span className={SUB}>{p.code}</span>}
                      {p.rules && (
                        <span className={SUB}>
                          Need {p.rules.target} sales · max {p.rules.maxRef} Reference
                          {p.rules.maxRef === 1 ? "" : "s"}
                        </span>
                      )}
                      <button
                        type="button"
                        className="mt-1 text-[11px] font-medium text-primary hover:underline"
                        aria-expanded={open === p.key}
                        onClick={() => setOpen(open === p.key ? null : p.key)}
                      >
                        {open === p.key ? "▾" : "▸"} Show credit ({counting(p).length})
                      </button>
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{p.qualifiedOwn}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {p.qualifiedReference}
                      {p.banked > 0 && <span className={SUB}>{p.banked} kept for later</span>}
                    </td>
                    <td className={`${TD} pr-0`}>
                      {p.rules ? (
                        <>
                          <span className="font-semibold tabular-nums text-primary">
                            {total} / {p.rules.target}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {open === p.key && (
                    <tr>
                      <td colSpan={4} className="pb-3">
                        <CreditList programme={p} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {earned.length > 0 && (
        <div>
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            aria-expanded={showEarned}
            onClick={() => setShowEarned(!showEarned)}
          >
            {showEarned ? "▾" : "▸"} Show earned Rewards ({earned.length})
          </button>
          {showEarned && (
          <ul className="divide-y divide-border/40">
            {earned.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {/* Only who gets it and when. What the Reward is is never
                      shown, and a state says something only when it went wrong. */}
                  <span className="text-foreground">{traveller(r)}</span>
                  <span className="text-muted-foreground">
                    · {programmes.length > 1 && `${r.project} · `}
                    {formatIst(r.earnedAt)}
                    {r.refs.length > 0 && ` · Ref: ${r.refs.join(", ")}`}
                  </span>
                  {(r.state === "DEFICIENT" || r.state === "CANCELLED") && (
                    <Badge variant={TRIP_STATE[r.state].variant}>{TRIP_STATE[r.state].label}</Badge>
                  )}
                  {r.holdReason && <Badge variant="warning">{REWARD_HOLD_LABEL[r.holdReason] ?? r.holdReason}</Badge>}
                </span>
                <span className="flex gap-1">
                  {fulfils && r.state === "EARNED" && (
                    <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "NOMINEE", rewardId: r.id })}>
                      {r.recipient ? "Change traveller" : "Add traveller"}
                    </Button>
                  )}
                  {fulfils && r.state === "EARNED" && r.recipient && !r.holdReason && (
                    <Button size="xs" onClick={() => setDialog({ kind: "BOOK", rewardId: r.id })}>
                      Mark booked
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}

      {dialog?.kind === "NOMINEE" && (
        <NomineeDialog
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(recipient, recipientName) =>
            run(() => recordTripNomineeAction({ rewardId: dialog.rewardId, recipient, recipientName }, newKey()))
          }
        />
      )}
      {dialog?.kind === "BOOK" && (
        <TextDialog
          title="Mark booked"
          label="Travel booking reference"
          withDate
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(ref, on) => run(() => bookTripAction({ rewardId: dialog.rewardId, bookingReference: ref, bookedOn: on! }, newKey()))}
        />
      )}
    </div>
  );
}

/** The credits behind one row, opened in place under it: Project · Plot, the
 *  credit's state with why it stands there, and the Booking to open. Credits
 *  have no staff action of their own (the system moves them). */
function CreditList({ programme: p }: { programme: TripProgrammeView }) {
  const rows = counting(p);
  const CELL = "py-1.5 pr-4 align-top";
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No Self or Reference credit is counting toward a Reward right now.</p>
      ) : (
        // globals.css sets every table to 14px; this nested list sits a step
        // below the row it opens from, at the card's own 12px.
        <table className="mt-1 w-full text-xs">
          <thead className="border-b border-border/50">
            <tr>
              <th className={TH}>Project · Plot</th>
              <th className={TH}>Status</th>
              <th className={`${TH} pr-0 text-right`}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((c) => {
              const { status, reason } = creditStatus(c);
              return (
                <tr key={c.id}>
                  <td className={CELL}>
                    <span className="text-muted-foreground">{p.project} · </span>
                    <span className="font-semibold text-foreground">{c.plot ?? "—"}</span>
                  </td>
                  <td className={CELL}>
                    <span className={`font-medium ${STATUS_TONE[status]}`}>{status}</span>
                    <span className={SUB}>{reason}</span>
                  </td>
                  <td className={`${CELL} pr-0 text-right`}>
                    {c.bookingId ? (
                      <Link href={`/bookings/${c.bookingId}`} className="font-medium text-primary hover:underline">
                        View Booking
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NomineeDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (r: (typeof RECIPIENTS)[number][0], name: string) => void }) {
  const [recipient, setRecipient] = React.useState<(typeof RECIPIENTS)[number][0]>("SELF");
  const [name, setName] = React.useState("");
  return (
    <Modal title="Who travels" description="Anyone may travel: the Member, family or someone else. No cash alternative." onClose={onClose}>
      <div className="space-y-3">
        <Field label="Traveller / nominee">
          <select className={inputClass} value={recipient} onChange={(e) => setRecipient(e.target.value as typeof recipient)}>
            {RECIPIENTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {recipient !== "SELF" && (
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button size="sm" disabled={busy || (recipient !== "SELF" && !name.trim())} onClick={() => onSubmit(recipient, name)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TextDialog({
  title,
  label,
  presets,
  optional,
  withDate,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  presets?: RemarkPresetKey;
  optional?: boolean;
  withDate?: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (text: string, on?: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [on, setOn] = React.useState(istDay(new Date()));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {withDate && (
          <Field label="Date">
            <input type="date" className={inputClass} value={on} max={istDay(new Date())} onChange={(e) => setOn(e.target.value)} />
          </Field>
        )}
        <Field label={label}>
          {presets ? (
            <RemarkSelect presets={presets} value={text} onChange={setText} required={!optional} />
          ) : (
            <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button size="sm" disabled={busy || (!optional && !text.trim())} onClick={() => onSubmit(text, withDate ? on : undefined)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const CLUB = "3% Club";

/** SSOT §38 — MD corrects who invited this Member, until it freezes. Opened from the Update menu. */
export function InviterDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (inviter: string, reason: string) => void;
}) {
  const [inviter, setInviter] = React.useState(CLUB);
  const [reason, setReason] = React.useState("");
  return (
    <Modal title="Correct the inviter" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Invited by">
          <input
            className={inputClass}
            placeholder={CLUB}
            value={inviter}
            onChange={(e) => setInviter(e.target.value)}
          />
        </Field>
        <Field label="Reason (compulsory)">
          <RemarkSelect presets="correctInviter" value={reason} onChange={setReason} required />
        </Field>
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Back
          </Button>
          {/* The 3% Club goes to the server as blank — no inviting Member. */}
          <Button
            size="sm"
            disabled={busy || !reason.trim()}
            onClick={() => onSubmit(inviter.trim().toLowerCase() === CLUB.toLowerCase() ? "" : inviter, reason)}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
