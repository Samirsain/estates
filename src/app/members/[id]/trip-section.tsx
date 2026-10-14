"use client";

// A Member's Rewards (the Sales & Reference Trip) — SSOT §40, §47, §54, §56,
// §65; Change Pack §68. Per programme: progress toward the next Trip, the
// credits behind it, and each earned Trip with its fulfilment. CRM or MD
// record the traveller (family or not), the booking and the travel. Non-cash:
// there is no value to show.

import React from "react";
import { useRouter } from "next/navigation";
import { formatIst, istDay } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import { Stat } from "@/components/record-section";
import type { TripProgrammeView } from "@/lib/trip-view";
import { REWARD_HOLD_LABEL } from "./royalty-tokens";
import {
  bookTripAction,
  correctInviterAction,
  recordTripNomineeAction,
  travelledTripAction,
  type ActionResult,
} from "../trip-actions";

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

/** SSOT §47–§64 — a credit's life, in staff words. */
const CREDIT_STATE: Record<string, string> = {
  PENDING: "Waiting for 100% payment",
  QUALIFIED: "Qualified",
  ALLOCATED: "In an earned Trip",
  USED: "Used — travelled",
  HELD: "Held — Member deactivated",
  EXPIRED: "Expired",
  REVERSED: "Reversed",
};

type TripState = TripProgrammeView["rewards"][number]["state"];
const TRIP_STATE: Record<TripState, { label: string; variant: "success" | "destructive" | "info" | "outline" }> = {
  EARNED: { label: "Earned", variant: "info" },
  BOOKED: { label: "Booked", variant: "info" },
  TRAVELLED: { label: "Travelled", variant: "success" },
  DEFICIENT: { label: "Deficient", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

// The profile's own table look (Bookings sold).
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-2.5 pr-4 align-top";
const SUB = "block text-[11px] text-muted-foreground";

type Dialog =
  | { kind: "NOMINEE"; rewardId: string }
  | { kind: "BOOK"; rewardId: string }
  | { kind: "TRAVELLED"; rewardId: string };

export default function TripSection({ role, programmes }: { role: string; programmes: TripProgrammeView[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<ActionResult | null>(null);
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
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
        No progress yet. It starts with a qualifying sale in a Project with Rewards.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {notice && <p className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.ok ? notice.message : notice.error}</p>}

      {programmes.map((p) => {
        // CP §68 — what counts toward the next Trip: Own, plus Reference up to its maximum.
        const countedRef = p.rules ? Math.min(p.qualifiedReference, p.rules.maxRef) : p.qualifiedReference;
        const counted = p.qualifiedOwn + countedRef;
        const pct = p.rules ? Math.min(100, Math.round((counted / p.rules.target) * 100)) : 0;
        const plotsOf = (bucketId: string) =>
          p.credits
            .filter((c) => c.bucketId === bucketId)
            .map((c) => c.plot ?? "?")
            .join(", ");
        return (
          <div key={p.key} className="space-y-3 rounded-xl border border-border/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{p.project}</p>
                <p className={SUB}>
                  {p.code}
                  {p.rules ? ` · Terms ${p.rules.termsRef}` : ""}
                  {p.open ? ` · counting since ${formatIst(p.open.openedAt)}` : ""}
                </p>
              </div>
              {p.rules && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                  {p.rewards.length > 0 ? "Next Trip " : ""}
                  {counted} / {p.rules.target}
                </span>
              )}
            </div>

            {p.rules && (
              <div className="space-y-1">
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${p.project} Rewards progress`}
                  aria-valuemin={0}
                  aria-valuemax={p.rules.target}
                  aria-valuenow={counted}
                >
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                </div>
                <p className={SUB}>
                  {p.rules.target} credits earn a Trip · at least {p.rules.minOwn} own sales · at most {p.rules.maxRef} from
                  references{p.open ? "" : " · the next qualifying sale starts the count"}
                </p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-y-3 md:grid-cols-4 md:divide-x md:divide-border/60">
              <Stat label="Own sales" value={p.qualifiedOwn} hint={p.pendingOwn ? `${p.pendingOwn} waiting for payment` : undefined} />
              <Stat label="References" value={countedRef} hint={p.banked ? `${p.banked} kept for a later Trip` : undefined} />
              <Stat
                label="Next expiry"
                value={p.nearestExpiry ? formatIst(p.nearestExpiry) : "—"}
                hint={p.expired ? `${p.expired} expired` : undefined}
              />
              <Stat label="Held" value={p.held} hint={p.held ? "Member deactivated" : undefined} />
            </dl>

            {p.rewards.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem]">
                  <thead className="border-b border-border/50">
                    <tr>
                      <th className={TH}>Trip</th>
                      <th className={TH}>Traveller</th>
                      <th className={TH}>Travel booking</th>
                      <th className={`${TH} pr-0`} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {p.rewards.map((r) => (
                      <tr key={r.id}>
                        <td className={TD}>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={TRIP_STATE[r.state].variant}>{TRIP_STATE[r.state].label}</Badge>
                            {r.holdReason && <Badge variant="warning">{REWARD_HOLD_LABEL[r.holdReason] ?? r.holdReason}</Badge>}
                          </span>
                          <span className={SUB}>
                            Earned {formatIst(r.earnedAt)}
                            {plotsOf(r.bucketId) ? ` · ${plotsOf(r.bucketId)}` : ""}
                          </span>
                        </td>
                        <td className={TD}>
                          {r.recipient ? (r.recipient === "SELF" ? "The Member" : r.recipientName) : "—"}
                        </td>
                        <td className={TD}>
                          {r.bookingReference ?? "—"}
                          {(r.bookedAt || r.travelledAt) && (
                            <span className={SUB}>
                              {[r.bookedAt && `Booked ${formatIst(r.bookedAt)}`, r.travelledAt && `Travelled ${formatIst(r.travelledAt)}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className={`${TD} pr-0`}>
                          <span className="flex justify-end gap-1">
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
                            {fulfils && r.state === "BOOKED" && !r.holdReason && (
                              <Button size="xs" onClick={() => setDialog({ kind: "TRAVELLED", rewardId: r.id })}>
                                Mark travelled
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

            {p.credits.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                  Show credits ({p.credits.length})
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[40rem]">
                    <thead className="border-b border-border/50">
                      <tr>
                        <th className={TH}>Sale</th>
                        <th className={TH}>Type</th>
                        <th className={TH}>Status</th>
                        <th className={TH}>Qualified</th>
                        <th className={`${TH} pr-0`}>Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {p.credits.map((c) => (
                        <tr key={c.id}>
                          <td className={TD}>
                            {c.booking ?? "—"} · {c.plot ?? "—"}
                            {c.via && <span className={SUB}>first sale of {c.via}</span>}
                          </td>
                          <td className={TD}>{c.type === "REFERENCE" ? "Reference" : "Own sale"}</td>
                          <td className={TD}>
                            {CREDIT_STATE[c.state] ?? c.state}
                            {c.reversalReason && <span className={SUB}>{c.reversalReason}</span>}
                          </td>
                          <td className={TD}>
                            {c.qualifiedAt ? formatIst(c.qualifiedAt) : "—"}
                            {c.route && (
                              <span className={SUB}>{c.route === "APPROVED_BUYBACK" ? "Approved Buyback" : "100% payment"}</span>
                            )}
                          </td>
                          <td className={`${TD} pr-0`}>{c.expiresAt && !c.bucketId ? formatIst(c.expiresAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        );
      })}

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
          title="Trip booked"
          label="Travel booking reference"
          withDate
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(ref, on) => run(() => bookTripAction({ rewardId: dialog.rewardId, bookingReference: ref, bookedOn: on! }, newKey()))}
        />
      )}
      {dialog?.kind === "TRAVELLED" && (
        <TextDialog
          title="Trip travelled"
          label="Note"
          optional
          withDate
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(_note, on) => run(() => travelledTripAction({ rewardId: dialog.rewardId, travelledOn: on! }, newKey()))}
        />
      )}
    </div>
  );
}

/** SSOT §38 — Admin or MD corrects who invited this Member, until it freezes. */
export function CorrectInviterButton({ memberProfileId }: { memberProfileId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Correct inviter
      </Button>
      {open && (
        <InviterDialog
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
          onSubmit={async (inviterMemberId, reason) => {
            setBusy(true);
            const result = await correctInviterAction({ memberProfileId, inviterMemberId, reason }, newKey());
            setBusy(false);
            if (!result.ok) return setError(result.error);
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
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
        <div className="flex justify-end">
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
  optional,
  withDate,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
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
          <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button size="sm" disabled={busy || (!optional && !text.trim())} onClick={() => onSubmit(text, withDate ? on : undefined)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function InviterDialog({
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
  const [inviter, setInviter] = React.useState("");
  const [reason, setReason] = React.useState("");
  return (
    <Modal
      title="Correct the inviter"
      description="Allowed only until this Member's first Reference-eligible Booking Request is submitted (SSOT §38). A refused attempt is recorded."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="Inviting Member ID — blank for none">
          <input className={inputClass} value={inviter} onChange={(e) => setInviter(e.target.value)} />
        </Field>
        <Field label="Reason (compulsory)">
          <textarea className={`${inputClass} h-16 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" disabled={busy || !reason.trim()} onClick={() => onSubmit(inviter, reason)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
