"use client";

// A Member's Sales & Reference Trip Reward — SSOT §40, §47, §54, §56, §65;
// Change Pack §68. Per programme: the open bucket's frozen target and
// composition, the credits, and each earned Trip with its fulfilment. CRM or
// Admin record the traveller, the booking and the travel; MD decides a
// non-family nominee. Non-cash: there is no value to show.

import React from "react";
import { useRouter } from "next/navigation";
import { formatIst, istDay } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/modal";
import type { TripProgrammeView } from "@/lib/trip-view";
import { REWARD_HOLD_LABEL } from "./royalty-credits";
import {
  bookTripAction,
  correctInviterAction,
  decideTripNomineeAction,
  recordTripNomineeAction,
  travelledTripAction,
  type ActionResult,
} from "../trip-actions";

export type { TripProgrammeView };

export type ReferenceView = { memberId: string; name: string; consumed: boolean; winningBooking: string | null };

const RECIPIENTS = [
  ["SELF", "The Member"],
  ["SPOUSE", "Spouse"],
  ["PARENT", "Parent"],
  ["CHILD", "Child"],
  ["SIBLING", "Sibling"],
  ["NON_FAMILY", "Someone else (needs MD)"],
] as const;

const newKey = () => `trp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** SSOT §47–§64 — a credit's life, in staff words. */
const CREDIT_STATE: Record<string, string> = {
  PENDING: "Pending — waiting for 100% payment",
  QUALIFIED: "Qualified",
  ALLOCATED: "In an earned Trip",
  USED: "Used — travelled",
  HELD: "Held — Member deactivated",
  EXPIRED: "Expired",
  REVERSED: "Reversed",
};

const TH = "py-1 pr-3 text-left font-medium text-muted-foreground";
const TD = "py-1 pr-3";

type Dialog =
  | { kind: "NOMINEE"; rewardId: string }
  | { kind: "DECIDE"; rewardId: string; approve: boolean }
  | { kind: "BOOK"; rewardId: string }
  | { kind: "TRAVELLED"; rewardId: string }
  | { kind: "INVITER" };

export default function TripSection({
  role,
  memberProfileId,
  inviterFrozenAt,
  programmes,
  references,
}: {
  role: string;
  memberProfileId: string;
  inviterFrozenAt: string | null;
  programmes: TripProgrammeView[];
  references: ReferenceView[];
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

  return (
    <div className="space-y-3 text-xs">
      {notice && <p className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.ok ? notice.message : notice.error}</p>}

      {programmes.length === 0 ? (
        <p className="text-muted-foreground">No Trip progress yet.</p>
      ) : (
        programmes.map((p) => {
          // CP §68 — what counts toward the next Trip: Own, plus Reference up to its maximum.
          const countedRef = p.rules ? Math.min(p.qualifiedReference, p.rules.maxRef) : p.qualifiedReference;
          const counted = p.qualifiedOwn + countedRef;
          const label = (id: string) => {
            const c = p.credits.find((x) => x.id === id)!;
            return `${c.plot ?? "?"}${c.via ? ` (Reference via ${c.via})` : ""}`;
          };
          return (
          <div key={p.key} className="space-y-2 rounded-lg border border-border/60 p-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {p.project} · {p.code}
                </p>
                <p className="text-muted-foreground">
                  {p.rules
                    ? `Target ${p.rules.target} · min Own ${p.rules.minOwn} · max Reference ${p.rules.maxRef} · Terms ${p.rules.termsRef}`
                    : "No bucket yet"}
                  {p.open ? ` · bucket open since ${formatIst(p.open.openedAt)}` : " · no open bucket — the next qualifying sale opens one"}
                </p>
              </div>
              {p.rules && (
                <Badge variant="info">
                  {p.rewards.length > 0 ? "Next Trip " : ""}
                  {counted} / {p.rules.target}
                </Badge>
              )}
            </div>
            <dl className="grid grid-cols-[max-content_3rem] gap-x-3 gap-y-0.5 sm:grid-cols-[repeat(4,max-content_4rem)]">
              <dt className="text-muted-foreground">Pending Own</dt>
              <dd className="tabular-nums">{p.pendingOwn}</dd>
              <dt className="text-muted-foreground">Qualified Own</dt>
              <dd className="tabular-nums">{p.qualifiedOwn}</dd>
              <dt className="text-muted-foreground">Qualified Reference</dt>
              <dd className="tabular-nums">{countedRef}</dd>
              <dt className="text-muted-foreground">Banked Reference</dt>
              <dd className="tabular-nums">{p.banked}</dd>
              <dt className="text-muted-foreground">Held</dt>
              <dd className="tabular-nums">{p.held}</dd>
              <dt className="text-muted-foreground">Expired</dt>
              <dd className="tabular-nums">{p.expired}</dd>
              <dt className="text-muted-foreground">Next expiry</dt>
              <dd>{p.nearestExpiry ? formatIst(p.nearestExpiry) : "—"}</dd>
            </dl>
            {p.credits.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">Credits ({p.credits.length})</summary>
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full min-w-[40rem]">
                    <thead className="border-b border-border/50">
                      <tr>
                        <th className={TH}>Type</th>
                        <th className={TH}>Source</th>
                        <th className={TH}>State</th>
                        <th className={TH}>Qualified by</th>
                        <th className={TH}>Qualified</th>
                        <th className={TH}>Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {p.credits.map((c) => (
                        <tr key={c.id}>
                          <td className={TD}>{c.type === "REFERENCE" ? "Reference" : "Own sale"}</td>
                          <td className={TD}>
                            {c.booking ?? "—"} · {c.plot ?? "—"}
                            {c.via && <span className="block text-[11px] text-muted-foreground">first sale of {c.via}</span>}
                          </td>
                          <td className={TD}>
                            {CREDIT_STATE[c.state] ?? c.state}
                            {c.reversalReason && <span className="block text-[11px] text-muted-foreground">{c.reversalReason}</span>}
                          </td>
                          <td className={TD}>
                            {c.route === "APPROVED_BUYBACK" ? "Approved Buyback" : c.route === "PAYMENT_100" ? "100% Payment" : "—"}
                          </td>
                          <td className={TD}>{c.qualifiedAt ? formatIst(c.qualifiedAt) : "—"}</td>
                          <td className={TD}>{c.expiresAt && !c.bucketId ? formatIst(c.expiresAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {p.rewards.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.state === "TRAVELLED" ? "success" : r.state === "DEFICIENT" ? "destructive" : "info"}>
                    Trip {r.state.toLowerCase()}
                  </Badge>
                  {r.holdReason && <Badge variant="warning">{REWARD_HOLD_LABEL[r.holdReason] ?? r.holdReason}</Badge>}
                  <span className="text-muted-foreground">
                    Earned {formatIst(r.earnedAt)}
                    {r.recipient ? ` · ${r.recipient === "SELF" ? "the Member" : r.recipientName}` : ""}
                    {r.recipient === "NON_FAMILY" ? (r.recipientApproved ? " (MD approved)" : " (waiting for MD)") : ""}
                    {r.bookingReference ? ` · ${r.bookingReference}` : ""}
                    {r.bookedAt ? ` · booked ${formatIst(r.bookedAt)}` : ""}
                    {r.travelledAt ? ` · travelled ${formatIst(r.travelledAt)}` : ""}
                  </span>
                  <span className="basis-full text-[11px] text-muted-foreground">
                    Judged by target {r.rules.target} · min Own {r.rules.minOwn} · max Reference {r.rules.maxRef} · Terms{" "}
                    {r.rules.termsRef}
                    {p.credits.some((c) => c.bucketId === r.bucketId)
                      ? ` · credits: ${p.credits.filter((c) => c.bucketId === r.bucketId).map((c) => label(c.id)).join(", ")}`
                      : ""}
                  </span>
                </span>
                <span className="flex gap-1">
                  {fulfils && r.state === "EARNED" && (
                    <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "NOMINEE", rewardId: r.id })}>
                      Traveller
                    </Button>
                  )}
                  {role === "MD" && r.recipient === "NON_FAMILY" && !r.recipientApproved && r.state === "EARNED" && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "DECIDE", rewardId: r.id, approve: false })}>
                        Reject Nominee
                      </Button>
                      <Button size="xs" onClick={() => setDialog({ kind: "DECIDE", rewardId: r.id, approve: true })}>
                        Approve Nominee
                      </Button>
                    </>
                  )}
                  {fulfils && r.state === "EARNED" && r.recipient && !r.holdReason && (
                    <Button size="xs" onClick={() => setDialog({ kind: "BOOK", rewardId: r.id })}>
                      Booked
                    </Button>
                  )}
                  {fulfils && r.state === "BOOKED" && !r.holdReason && (
                    <Button size="xs" onClick={() => setDialog({ kind: "TRAVELLED", rewardId: r.id })}>
                      Travelled
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
          );
        })
      )}

      <div className="space-y-1 border-t border-border/40 pt-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">Reference opportunities of Members invited</p>
          {(role === "ADMIN" || role === "MD") && (
            <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "INVITER" })}>
              Correct this Member&apos;s inviter
            </Button>
          )}
        </div>
        {inviterFrozenAt && <p className="text-muted-foreground">This Member&apos;s inviter froze {formatIst(inviterFrozenAt)}.</p>}
        {references.length === 0 ? (
          <p className="text-muted-foreground">None invited.</p>
        ) : (
          <ul className="space-y-0.5">
            {references.map((r) => (
              <li key={r.memberId} className="flex justify-between gap-2">
                <span>
                  {r.memberId} · {r.name}
                </span>
                <span className="text-muted-foreground">{r.consumed ? `Used — ${r.winningBooking ?? ""}` : "Unused"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog?.kind === "NOMINEE" && <NomineeDialog busy={busy} onClose={() => setDialog(null)} onSubmit={(recipient, recipientName) => run(() => recordTripNomineeAction({ rewardId: dialog.rewardId, recipient, recipientName }, newKey()))} />}
      {dialog?.kind === "DECIDE" && (
        <TextDialog
          title={dialog.approve ? "Approve the nominee" : "Reject the nominee"}
          label="Note (compulsory)"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => run(() => decideTripNomineeAction({ rewardId: dialog.rewardId, approve: dialog.approve, note }, newKey()))}
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
      {dialog?.kind === "INVITER" && <InviterDialog busy={busy} onClose={() => setDialog(null)} onSubmit={(inviterMemberId, reason) => run(() => correctInviterAction({ memberProfileId, inviterMemberId, reason }, newKey()))} />}
    </div>
  );
}

function NomineeDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (r: (typeof RECIPIENTS)[number][0], name: string) => void }) {
  const [recipient, setRecipient] = React.useState<(typeof RECIPIENTS)[number][0]>("SELF");
  const [name, setName] = React.useState("");
  return (
    <Modal title="Who travels" description="Immediate family needs no approval; anyone else needs MD. No cash alternative." onClose={onClose}>
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

function InviterDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (inviter: string, reason: string) => void }) {
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
        <div className="flex justify-end">
          <Button size="sm" disabled={busy || !reason.trim()} onClick={() => onSubmit(inviter, reason)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
