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
        programmes.map((p) => (
          <div key={p.key} className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
            <p className="font-medium">
              {p.project} · {p.code}
            </p>
            {p.open ? (
              <p className="text-muted-foreground">
                Open bucket: target {p.open.target} · min Own {p.open.minOwn} · max Reference {p.open.maxRef} · Terms{" "}
                {p.open.termsRef} · since {formatIst(p.open.openedAt)}
              </p>
            ) : (
              <p className="text-muted-foreground">No open bucket.</p>
            )}
            <p>
              Own: {p.pendingOwn} pending · {p.qualifiedOwn} qualified · Reference: {p.qualifiedReference} banked
              {p.held > 0 ? ` · ${p.held} held` : ""}
              {p.expired > 0 ? ` · ${p.expired} expired` : ""}
              {p.nearestExpiry ? ` · next expiry ${formatIst(p.nearestExpiry)}` : ""}
            </p>
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
                    {r.travelledAt ? ` · travelled ${formatIst(r.travelledAt)}` : ""}
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
        ))
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
