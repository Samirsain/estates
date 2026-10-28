"use client";

// A Member's Rewards — SSOT §40, §47, §54, §56, §65; Change Pack §68. One row
// per Project programme the Member has a qualifying sale in: its rule, how far
// the next Reward is, and one list that opens under it: every sale of the
// programme — those in an earned Reward and those still counting.
//
// What staff read says "Reward" and nothing more: never "Trip", never who
// travels, a booking or a destination. The owner asked that a Reward show as
// a Reward only, so its fulfilment is one step here: Mark Delivered. The
// internal names (TripCredit, tripProgrammes, the actions) keep the old word.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deliverRewardAction } from "../trip-actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { creditStatus } from "@/lib/domain/trip";
import type { TripProgrammeView } from "@/lib/trip-view";
import { REWARD_HOLD_LABEL } from "./royalty-tokens";
import { RemarkSelect } from "@/components/ui/remark-select";

export type { TripProgrammeView };

/** The three on-screen credit statuses, coloured as the owner approved them. */
const STATUS_TONE = { Pending: "text-amber-700", Counted: "text-emerald-700", "Not Counted": "text-red-700" } as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** CP §68 — what counts toward the next Reward: Self, plus References up to their maximum. */
function progress(p: TripProgrammeView) {
  return p.qualifiedOwn + (p.rules ? Math.min(p.qualifiedReference, p.rules.maxRef) : p.qualifiedReference);
}

/** The credits behind the row: qualified and not yet in an earned Reward.
 *  Waiting, cancelled, expired and used ones stay out. */
const counting = (p: TripProgrammeView) => p.credits.filter((c) => c.state === "QUALIFIED" && !c.bucketId);

// The profile's own table look (Bookings sold).
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-2.5 pr-4 align-top";
const SUB = "block text-[11px] text-muted-foreground";
const TOGGLE = "text-[11px] font-medium text-primary hover:underline";
/** The Status column's slot: the heading and the button under it share one centre. */
const SLOT = "inline-block w-24 text-center";

export default function TripSection({
  programmes,
  canDeliver,
}: {
  programmes: TripProgrammeView[];
  /** CRM or MD — the service's fulfilment roles. */
  canDeliver: boolean;
}) {
  const router = useRouter();
  // The programme whose Sales list is open.
  const [open, setOpen] = React.useState<string | null>(null);
  const toggle = (id: string) => setOpen(open === id ? null : id);
  // The Reward waiting for "Mark Delivered" to be confirmed.
  const [deliver, setDeliver] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function markDelivered(rewardId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await deliverRewardAction(rewardId, globalThis.crypto.randomUUID());
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDeliver(null);
    router.refresh();
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
  // One Reward per Project (owner, 27 Oct 2026): once earned, no next one is counted.
  const done = (project: string) =>
    programmes.some((p) => p.project === project && p.rewards.some((r) => r.state !== "CANCELLED"));
  // The rule (total sales · max References) sits in the header row in place of
  // a heading (owner, 27 Oct 2026). Projects with different rules keep it on
  // their own rows instead.
  const rule = (p: TripProgrammeView) =>
    p.rules ? `Total ${plural(p.rules.target, "sale")} · max ${p.rules.maxRef} Ref` : "—";
  const rules = new Set(programmes.map(rule));
  const oneRule = rules.size === 1 ? [...rules][0] : null;

  return (
    <div className="space-y-4 text-xs">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border/50">
            <tr>
              {/* The rule and counter sit in the card's centre (they wrap in a narrow
                  card, below xl, rather than scroll sideways): the two side
                  columns ask for the same width, so the middle one is centred. */}
              <th className={cn(TH, "w-1/2")}>Project</th>
              <th className={cn(TH, "min-w-[7rem] px-2 text-center xl:whitespace-nowrap")}>{oneRule}</th>
              {/* Status sits at the right edge, centred over its button. */}
              <th className={cn(TH, "w-1/2 pr-0 text-right")}>
                <span className={SLOT}>Status</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {programmes.map((p) => {
              const total = progress(p);
              // Rewards arrive newest first, so the oldest one not yet delivered is last.
              const waiting = p.rewards.filter((r) => r.state === "EARNED" || r.state === "BOOKED").pop();
              const sales = salesOf(p, !done(p.project));
              return (
                <React.Fragment key={p.key}>
                  <tr>
                    <td className={TD}>
                      <span className="font-semibold text-foreground xl:whitespace-nowrap">{p.project}</span>
                      {shared(p.project) && <span className={SUB}>{p.code}</span>}
                      <button
                        type="button"
                        className={cn(TOGGLE, "mt-1 block")}
                        aria-expanded={open === p.key}
                        onClick={() => toggle(p.key)}
                      >
                        {open === p.key ? "▾" : "▸"} Sales ({sales.length})
                      </button>
                    </td>
                    {/* The counter on the Project's line, centred under the rule: 0/3, 1/3 … full once the Reward is earned. */}
                    <td className={cn(TD, "whitespace-nowrap px-2 text-center")}>
                      {p.rules && (
                        <span className="font-semibold tabular-nums text-primary">
                          {done(p.project) ? p.rules.target : total}/{p.rules.target}
                        </span>
                      )}
                      {!oneRule && <span className={SUB}>{rule(p)}</span>}
                    </td>
                    <td className={cn(TD, "pr-0 text-right")}>
                      <span className={SLOT}>
                        {waiting ? (
                          canDeliver && (
                            <Button size="xs" onClick={() => setDeliver(waiting.id)}>
                              Mark Delivered
                            </Button>
                          )
                        ) : (
                          p.rewards.some((r) => r.state === "TRAVELLED") && (
                            <span className="font-semibold text-emerald-700">Delivered</span>
                          )
                        )}
                      </span>
                    </td>
                  </tr>
                  {/* The list opens as rows of this table, so Plot, Sold By and
                      Status line up under Project, the rule and Status. */}
                  {open === p.key && <SalesRows project={p.project} rows={sales} />}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Delivered cannot be undone, so it asks once. */}
      {deliver && (
        <Modal title="Mark Delivered" onClose={() => setDeliver(null)}>
          <div className="space-y-3">
            <p className="text-sm">Mark this Reward delivered? This cannot be undone.</p>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDeliver(null)}>
                Back
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void markDelivered(deliver)}>
                Mark Delivered
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

type Credit = TripProgrammeView["credits"][number];

/** As on Plot Inventory and Bookings: the Plot number is the way into the
 *  Booking, with its Project under it (no Plot type, owner 27 Oct 2026). */
function PlotCell({ project, credit: c }: { project: string; credit: Credit }) {
  return (
    <>
      {c.bookingId ? (
        <Link href={`/bookings/${c.bookingId}`} className="block font-semibold text-primary hover:underline">
          {c.plot ?? "—"}
        </Link>
      ) : (
        <span className="block font-semibold text-foreground">{c.plot ?? "—"}</span>
      )}
      <span className="block text-[11px] font-medium text-foreground">{project}</span>
    </>
  );
}

/** Who sold a Plot: Self, or the invited Member — ID (the way to
 *  their profile) on top, name under it, as in Members Invited. */
function SoldBy({ credit: c }: { credit: Credit }) {
  if (c.type !== "REFERENCE") return <>Self</>;
  if (!c.via) return <>Reference</>;
  return (
    <>
      <Link href={`/members/${c.via.id}`} className="block font-semibold text-primary hover:underline">
        {c.via.memberId}
      </Link>
      <span className="block text-[11px] font-medium text-foreground">{c.via.name}</span>
    </>
  );
}

// The three columns of an opened list, aligned to the table's own; a step
// below the row it opens from, at the card's 12px (globals.css sets tables to 14px).
const C1 = "py-1.5 pr-4 align-top text-xs";
const C2 = "px-2 py-1.5 text-center align-top text-xs xl:whitespace-nowrap";
const C3 = "py-1.5 pr-0 text-right align-top text-xs";

/** An opened list's own heading row: Plot · Sold By · Status. */
function ListHead() {
  return (
    <tr>
      <td className={cn(TH, "pt-2")}>Plot</td>
      <td className={cn(TH, "px-2 pt-2 text-center")}>Sold By</td>
      <td className={cn(TH, "pr-0 pt-2 text-right")}>
        <span className={SLOT}>Status</span>
      </td>
    </tr>
  );
}

type SaleRow = { key: string; credit: Credit | null; status: React.ReactNode };

/** Every sale of the programme, one line each (owner, 27 Oct 2026, merging
 *  Earned Rewards and Sales counting): first the Plots of each earned Reward,
 *  oldest Reward first and own sales first, as Earned (or Cancelled, with any
 *  hold); then, while the Project has no Reward yet, the sales still counting.
 *  What the Reward is, or who receives it, is never shown. */
function salesOf(p: TripProgrammeView, stillCounting: boolean): SaleRow[] {
  const earned = [...p.rewards].reverse().flatMap((r): SaleRow[] => {
    const cancelled = r.state === "CANCELLED";
    // Earned or Cancelled, nothing else; Delivered shows on the Project line.
    const status = (
      <span className={cn(SLOT, "font-medium", cancelled ? "text-red-700" : "text-emerald-700")}>
        {cancelled ? "Cancelled" : "Earned"}
        {r.holdReason && (
          <span className="block text-[11px] font-normal text-amber-700">
            {REWARD_HOLD_LABEL[r.holdReason] ?? r.holdReason}
          </span>
        )}
      </span>
    );
    const sales = p.credits
      .filter((c) => c.bucketId === r.bucketId)
      .sort((a, b) => (a.type === b.type ? 0 : a.type === "OWN_SALE" ? -1 : 1));
    return sales.length === 0
      ? [{ key: r.id, credit: null, status }]
      : sales.map((c) => ({ key: c.id, credit: c, status }));
  });
  // Credits have no staff action of their own (the system moves them).
  const live: SaleRow[] = stillCounting
    ? counting(p).map((c) => {
        const { status } = creditStatus(c);
        return {
          key: c.id,
          credit: c,
          status: (
            <span className={cn(SLOT, "font-medium", STATUS_TONE[status])}>
              {status}
              {c.route === "APPROVED_BUYBACK" && " (Buyback)"}
            </span>
          ),
        };
      })
    : [];
  return [...earned, ...live];
}

/** The Sales list, opened in place under its row. */
function SalesRows({ project, rows }: { project: string; rows: SaleRow[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={3} className="py-2 text-muted-foreground">
          No sale is counting toward a Reward right now.
        </td>
      </tr>
    );
  }
  return (
    <>
      <ListHead />
      {rows.map((r) => (
        <tr key={r.key}>
          <td className={C1}>{r.credit ? <PlotCell project={project} credit={r.credit} /> : "—"}</td>
          <td className={C2}>{r.credit ? <SoldBy credit={r.credit} /> : "—"}</td>
          <td className={C3}>{r.status}</td>
        </tr>
      ))}
    </>
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
