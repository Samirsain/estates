"use client";

// Payment & Instalments — confidential payment trial (revised brief §4.1).
// With the trial on it takes the place of the Payment Schedule and Received
// Payment Details boxes: the same facts, so nothing shows twice. Percentages
// only, for everyone: there is no rupee figure anywhere on it.

import React from "react";
import { Wallet } from "lucide-react";
import { Section } from "@/components/record-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal, ModalError } from "@/components/ui/modal";
import { safely } from "@/lib/safely";
import { formatIst, istDay } from "@/lib/tasks";
import {
  instalmentRows,
  nextAction,
  receiptTrackingId,
  openingBalance,
  duePct,
  paidPct,
  paymentSummary,
  shareOfInstalment,
  TOTAL_UNITS,
  unitsOf,
} from "@/lib/domain/payment-percent";
import { requestPaymentVerificationAction, type BookingDetail } from "./actions";

const TH = "px-2 pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-2 py-2.5 text-center align-middle tabular-nums";
const MODES = ["UPI", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "CARD", "OTHER"] as const;
const PAYMENT_BADGE = { COMPLETE: "success", PARTIAL: "warning", UNPAID: "outline" } as const;
const PAYMENT_LABEL = { COMPLETE: "Paid", PARTIAL: "Part paid", UNPAID: "Not paid" } as const;
const DUE_LABEL = { UPCOMING: "Not due yet", DUE_TODAY: "Due today", OVERDUE: "Late" } as const;
const CLAIM_BADGE = { PENDING: "warning", APPROVED: "success", REJECTED: "destructive", CANCELLED: "outline" } as const;
const CLAIM_LABEL = { PENDING: "Waiting for MD", APPROVED: "Accepted by MD", REJECTED: "Not accepted", CANCELLED: "Cancelled" } as const;

const day = (d: string) => formatIst(`${d}T00:00:00+05:30`);
const ACTION_TONE = {
  done: "border-emerald-500/40 bg-emerald-500/5",
  wait: "border-amber-500/40 bg-amber-500/5",
  urgent: "border-red-500/40 bg-red-500/5",
  normal: "border-primary/40 bg-primary/5",
} as const;

export function PaymentProgress({ units }: { units: bigint }) {
  // Width only; the exact figure is printed beside it.
  const width = Number((units * 10000n) / TOTAL_UNITS) / 100;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-label="Verified payment">
      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

export function PaymentInstalmentsPanel({
  bookingId,
  status,
  received,
  detail,
  canRequest,
  onChanged,
}: {
  bookingId: string;
  status: string;
  /** Booking.paymentReceivedPercent as stored — the verified total. */
  received: string;
  detail: BookingDetail;
  canRequest: boolean;
  onChanged: () => Promise<void>;
}) {
  const [asking, setAsking] = React.useState(false);
  const live = detail.scheduleVersions.find((s) => s.status === "ACTIVE");
  const rows = live ? instalmentRows(live.instalments) : [];
  const summary = paymentSummary(rows, received);
  const receivedOn = new Map(live?.instalments.map((i) => [i.seq, i.receivedOn]) ?? []);
  const claims = detail.verificationRequests;
  const modeOf = new Map(claims.filter((c) => c.paymentEntryId).map((c) => [c.paymentEntryId!, c.mode]));
  const waiting = claims.filter((c) => c.status === "PENDING");
  const opening = openingBalance(
    received,
    detail.paymentEntries.filter((e) => e.status === "CONFIRMED" && !e.oldPlot).map((e) => e.percent)
  );
  // A corrected or reversed entry stays, crossed out (owner review, 25 Nov 2026).
  const struck = (status: string) => status === "SUPERSEDED" || status === "REVERSED";
  const corrected = detail.paymentEntries.some((e) => struck(e.status));
  const action = nextAction({
    status,
    summary,
    hasPlan: !!live,
    claimsWaiting: waiting.length,
    promisedOn: detail.promisedOn,
    today: istDay(new Date()),
  });

  return (
    <Section
      title="Payment & Instalments"
      icon={<Wallet className="h-3.5 w-3.5" />}
      aside={
        <span className="flex gap-2">
          {canRequest && status === "BOOKED" && (
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
              Tell MD about a payment
            </Button>
          )}
        </span>
      }
    >
      <div className="space-y-4">
        {/* Audit point 5 — three things, kept apart: the whole Booking, the
            instalment being collected now, and what to do next. */}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total balance left</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{duePct(summary.outstanding)}</p>
            <p className="mb-2 text-[11px] text-muted-foreground">of the full price · {paidPct(summary.received)} paid so far</p>
            <PaymentProgress units={summary.received} />
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">This instalment — left to pay</p>
            {summary.current ? (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{duePct(summary.current.pending)}</p>
                <p className="text-[11px] text-muted-foreground">
                  Instalment {summary.current.seq} of {rows.length} · {paidPct(summary.current.received)} paid out of {paidPct(summary.current.target)}
                </p>
                <div className="mt-1 text-xs">
                  Due {day(summary.current.dueDay)}{" "}
                  {summary.current.due && (
                    <Badge variant={summary.current.due === "OVERDUE" ? "destructive" : summary.current.due === "DUE_TODAY" ? "warning" : "outline"}>
                      {DUE_LABEL[summary.current.due]}
                    </Badge>
                  )}
                </div>
                {summary.overdue > summary.current.pending && (
                  <p className="mt-1 text-[11px] text-red-700">{duePct(summary.overdue)} is late in total</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm font-semibold">{rows.length ? "All instalments paid" : "No payment plan yet"}</p>
            )}
          </div>
          <div className={`rounded-xl border p-3 ${ACTION_TONE[action.tone]}`}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">What to do now</p>
            <p className="mt-1 text-sm font-medium">{action.text}</p>
            {summary.current?.payment === "PARTIAL" && action.tone !== "wait" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                What to say: &ldquo;Your instalment {summary.current.seq} is partially paid. Please complete the remaining payment by the agreed date.&rdquo;
              </p>
            )}
          </div>
        </div>

        {!live ? (
          <p className="text-xs text-muted-foreground">
            No payment plan yet.
            {status === "REQUEST_PENDING" ? " It starts once the booking is approved." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border/60">
                <tr>
                  <th className={TH}>Instalment</th>
                  <th className={TH}>Due date</th>
                  <th className={TH}>Should pay</th>
                  <th className={TH}>Paid</th>
                  <th className={TH}>Left</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((r) => {
                  const last = receivedOn.get(r.seq);
                  return (
                    <tr key={r.seq}>
                      <td className={TD}>{r.seq}</td>
                      <td className={TD}>{day(r.dueDay)}</td>
                      <td className={TD}>{paidPct(r.target)}</td>
                      <td className={TD}>
                        {paidPct(r.received)}
                        {last && <span className="block text-[11px] text-muted-foreground">last {formatIst(last)}</span>}
                      </td>
                      <td className={TD}>{duePct(r.pending)}</td>
                      <td className={TD}>
                        <Badge variant={PAYMENT_BADGE[r.payment]}>{PAYMENT_LABEL[r.payment]}</Badge>
                        {r.payment === "PARTIAL" && (
                          <span className="block text-[11px] text-muted-foreground">{shareOfInstalment(r.received, r.target)} of this instalment paid</span>
                        )}
                        {r.due && (
                          <span className={`block text-[11px] ${r.due === "OVERDUE" ? "text-red-700" : "text-muted-foreground"}`}>
                            {DUE_LABEL[r.due]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-muted-foreground">
              All figures are % of the full plot price.
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Payments received (checked by MD)</h3>
          {detail.paymentEntries.length === 0 && opening === 0n ? (
            <p className="text-xs text-muted-foreground">No payment received yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-border/60">
                <tr>
                  <th className={TH}>Sr No</th>
                  <th className={TH}>Reference No</th>
                  <th className={TH}>Mode</th>
                  <th className={TH}>Date</th>
                  <th className={TH}>Paid</th>
                  <th className={TH}>Checked by</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {opening !== 0n && (
                  // Revised brief §6.3 — progress with no individual history behind it.
                  <tr>
                    <td className={TD}>—</td>
                    <td className={TD} colSpan={3}>
                      Paid earlier, carried over — no separate entries
                    </td>
                    <td className={TD}>{paidPct(opening)}</td>
                    <td className={TD}>—</td>
                    <td className={TD}>
                      <Badge variant="outline">Carried</Badge>
                    </td>
                  </tr>
                )}
                {[...detail.paymentEntries]
                  .sort((a, b) => Number(struck(a.status)) - Number(struck(b.status)))
                  .map((e, i) => (
                    <tr key={e.id} className={struck(e.status) ? "text-muted-foreground line-through" : e.oldPlot ? "text-muted-foreground" : undefined}>
                      <td className={TD}>{i + 1}</td>
                      <td className={TD}>
                        {e.reference}
                        {e.payerName && <span className="block text-[11px] text-amber-800">paid by {e.payerName}</span>}
                      </td>
                      <td className={TD}>{modeOf.get(e.id) ?? "—"}</td>
                      <td className={TD}>{formatIst(e.paidOn)}</td>
                      <td className={TD}>{paidPct(unitsOf(e.percent))}</td>
                      <td className={TD}>{e.confirmedByRef}</td>
                      <td className={TD}>
                        <Badge variant={e.status === "REVERSED" ? "destructive" : e.status === "SUPERSEDED" || e.oldPlot ? "outline" : "success"}>
                          {e.status === "REVERSED" ? "Reversed by MD" : e.status === "SUPERSEDED" ? "Corrected" : e.oldPlot ? "Old plot" : "Received"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          {corrected && <p className="mt-1 text-[11px] text-muted-foreground">A corrected or reversed entry stays here, crossed out, so nothing is lost.</p>}
          {detail.paymentEntries.some((e) => e.oldPlot) && (
            <p className="mt-1 text-[11px] text-muted-foreground">&ldquo;Old plot&rdquo; payments were made before the Change Plot. They are already inside &ldquo;Paid earlier, carried over&rdquo;.</p>
          )}
        </div>

        {claims.length > 0 && (
          <div>
            <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Customer says they paid — not counted until MD checks
            </h3>
            {waiting.length > 0 && (
              <p className="mb-1.5 text-xs text-amber-800">
                {waiting.length} {waiting.length === 1 ? "payment is" : "payments are"} waiting for MD to check. They count as paid only after MD accepts.
              </p>
            )}
            <ul className="space-y-1.5 text-xs">
              {claims.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
                  <span>
                    <strong>{c.mode}</strong> · {c.reference} · paid {formatIst(c.claimedPaidOn)} · by {c.requestedByRef} on {formatIst(c.requestedAt)}
                    {c.note && <span className="block text-muted-foreground">{c.note}</span>}
                    {c.status === "REJECTED" && c.decisionNote && <span className="block text-red-700">Rejected: {c.decisionNote}</span>}
                  </span>
                  <Badge variant={CLAIM_BADGE[c.status]}>{CLAIM_LABEL[c.status]}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {asking && (
        <ClaimDialog
          bookingId={bookingId}
          onClose={() => setAsking(false)}
          onSent={async () => {
            setAsking(false);
            await onChanged();
          }}
        />
      )}
    </Section>
  );
}

/** Revised brief §4.3 — what the customer says they paid. No amount field, on purpose. */
function ClaimDialog({ bookingId, onClose, onSent }: { bookingId: string; onClose: () => void; onSent: () => Promise<void> }) {
  const today = istDay(new Date());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const key = React.useRef(globalThis.crypto.randomUUID());

  return (
    <ModalError.Provider value={error}>
      <Modal title="Tell MD about a payment" description="Use the tracking ID issued by Accounts." onClose={onClose}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const f = new FormData(e.currentTarget);
            if (!receiptTrackingId(String(f.get("reference") ?? "").trim())) {
              setError("Enter the receipt tracking ID issued by Accounts.");
              return;
            }
            setBusy(true);
            setError(null);
            const result = await safely(() =>
              requestPaymentVerificationAction(
                {
                  bookingId,
                  claimedPaidOn: String(f.get("claimedPaidOn")),
                  mode: String(f.get("mode")),
                  reference: String(f.get("reference")),
                },
                key.current
              )
            );
            setBusy(false);
            if (result.ok) await onSent();
            else setError(result.error);
          }}
        >
          <Field label="When did the customer pay?">
            <Input type="date" name="claimedPaidOn" defaultValue={today} max={today} required />
          </Field>
          <Field label="How did they pay?">
            <select name="mode" required defaultValue="" className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm">
              <option value="" disabled>
                Choose
              </option>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Receipt tracking ID">
            <Input name="reference" required maxLength={39} placeholder="PV-…" autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send to MD"}
            </Button>
          </div>
        </form>
      </Modal>
    </ModalError.Provider>
  );
}
