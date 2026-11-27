"use client";

// MD worksheet. Private amounts are used only for the in-browser calculation.

import React from "react";
import { AppShell } from "@/components/app-shell";
import { Section, Stat } from "@/components/record-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/modal";
import { worksheetPoints } from "@/lib/domain/worksheet-formula";
import { PasswordInput } from "@/components/ui/password-input";
import { PaymentProgress } from "@/app/bookings/payment-instalments-panel";
import type { StaffRole } from "@/lib/security/permissions";
import { formatIst, istDay } from "@/lib/tasks";
import {
  allocateUnits,
  convertPayment,
  formatRupeeTyping,
  fromUnits,
  instalmentRows,
  openingBalance,
  paymentSummary,
  PAYMENT_DECISION_REASONS,
  parseRupees,
  pct,

  tokensForPercent,
  receiptTrackingId,
  shareOfInstalment,
  toUnits,
  TOTAL_UNITS,
  type InstalmentRow,
} from "@/lib/domain/payment-percent";
import {
  approveVerifiedPaymentAction,
  loadCalculatorBookingAction,
  rejectPaymentClaimAction,
  reversePaymentAction,
  savePlotTokensAction,
  type CalculatorBookingView,
} from "./actions";

type BookingOption = {
  id: string;
  number: string;
  project: string;
  plot: string;
  customer: string;
  customerId: string | null;
  status: string;
  received: string;
};

const TH = "px-2 pb-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-2 py-2 align-top tabular-nums";
const SELECT = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

const human = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");
const tokenShare = (basis: string | null, units: bigint) =>
  basis ? `${pct(units)} · ${tokensForPercent(basis, units)} Pts` : pct(units);
const day = (d: string) => formatIst(`${d}T00:00:00+05:30`);
const PAYMENT_BADGE = { COMPLETE: "success", PARTIAL: "warning", UNPAID: "outline" } as const;
const PAYMENT_LABEL = { COMPLETE: "Paid", PARTIAL: "Part paid", UNPAID: "Not paid" } as const;
const DUE_LABEL = { UPCOMING: "Not due yet", DUE_TODAY: "Due today", OVERDUE: "Late" } as const;

export default function PaymentCalculatorClient({
  role,
  actorName,
  staffAccountId,
  bookings,
  initialBookingId,
  expiresAt,
}: {
  role: StaffRole;
  actorName: string;
  staffAccountId: string;
  bookings: BookingOption[];
  initialBookingId: string | null;
  expiresAt: number;
}) {
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<CalculatorBookingView | null>(null);
  const [loading, setLoading] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = React.useState<"CALCULATE" | "RECORD">("RECORD");

  const [plotValue, setPlotValue] = React.useState("");
  const [factor, setFactor] = React.useState("");
  const [receiptFormula, setReceiptFormula] = React.useState("");
  const [receivedAmount, setReceivedAmount] = React.useState("");
  const [cumulativeAmount, setCumulativeAmount] = React.useState("");
  const [inputVersion, setInputVersion] = React.useState(0);
  const [percent, setPercent] = React.useState("");
  const [paidOn, setPaidOn] = React.useState(() => istDay(new Date()));
  const [reference, setReference] = React.useState("");
  const [claimId, setClaimId] = React.useState("");
  const [attested, setAttested] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [rejecting, setRejecting] = React.useState<{ id: string; reason: string } | null>(null);
  const key = React.useRef<string | null>(null);
  const wanted = React.useRef<string | null>(null);

  const clearPayment = React.useCallback(() => {
    setPlotValue("");
    setFactor("");
    setReceiptFormula("");
    setReceivedAmount("");
    setCumulativeAmount("");
    setInputVersion((version) => version + 1);
    setPercent("");
    setReference(`PV-${globalThis.crypto.randomUUID()}`);
    setClaimId("");
    setAttested(false);
    setPaidOn(istDay(new Date()));
    key.current = null;
  }, []);
  React.useEffect(() => {
    const lockIfExpired = () => {
      if (Date.now() >= expiresAt) {
        setView(null);
        clearPayment();
        window.location.replace("/dashboard");
      }
    };
    const timeout = window.setTimeout(lockIfExpired, Math.max(0, expiresAt - Date.now()));
    const restorePage = (event: PageTransitionEvent) => {
      if (event.persisted) clearPayment();
      lockIfExpired();
    };
    window.addEventListener("pagehide", clearPayment);
    window.addEventListener("pageshow", restorePage);
    document.addEventListener("visibilitychange", lockIfExpired);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("pagehide", clearPayment);
      window.removeEventListener("pageshow", restorePage);
      document.removeEventListener("visibilitychange", lockIfExpired);
    };
  }, [expiresAt, clearPayment]);

  async function load(id: string) {
    wanted.current = id;
    setLoading(id);
    try {
      const next = await loadCalculatorBookingAction(id);
      if (wanted.current !== id) return;
      setView(next);
      if (!next) setNotice({ ok: false, text: "That Booking no longer exists." });
    } catch {
      if (wanted.current !== id) return;
      // A signed-out or refused session leaves nothing private behind.
      clearPayment();
      setNotice({ ok: false, text: "The Booking could not be loaded. Check you are still signed in, then try again." });
    } finally {
      if (wanted.current === id) setLoading(null);
    }
  }

  function choose(id: string) {
    clearPayment();
    setNotice(null);
    setRejecting(null);
    setView(null);
    void load(id);
  }

  React.useEffect(() => {
    if (initialBookingId && bookings.some((b) => b.id === initialBookingId)) choose(initialBookingId);
    // Once, on arrival from a Booking's page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A changed figure is a new approval, never a replay of the last one, and needs confirming again.
  React.useEffect(() => {
    key.current = null;
    setAttested(false);
  }, [percent, receiptFormula, plotValue, factor, receivedAmount, cumulativeAmount, paidOn, reference, claimId]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? bookings.filter((b) => `${b.number} ${b.project} ${b.plot} ${b.customer} ${b.customerId ?? ""}`.toLowerCase().includes(q))
    : bookings;

  const rows: InstalmentRow[] = view ? instalmentRows(view.instalments) : [];
  const summary = view ? paymentSummary(rows, view.received) : null;
  const opening = view
    ? openingBalance(
        view.received,
        view.entries.filter((e) => e.status === "CONFIRMED" && !e.oldPlot).map((e) => e.percent)
      )
    : 0n;

  const plot = parseRupees(plotValue);
  const tokens = view?.tokens ?? ("paise" in plot ? worksheetPoints(factor, { TOTAL: plotValue.replace(/,/g, "") }, "TOTAL") : null);
  const byAmount = mode === "CALCULATE" && !view?.tokens && receivedAmount !== "";
  const conversion = (() => {
    if (!summary) return null;
    if (byAmount) {
      if ("error" in plot) return { ok: false as const, reason: "Enter a valid plot value first." };
      if (!tokens) return { ok: false as const, reason: "Check the Total and S.F formula." };
      const payment = parseRupees(receivedAmount);
      if ("error" in payment) return { ok: false as const, reason: payment.error };
      const total = summary.received === 0n ? payment : parseRupees(cumulativeAmount);
      if ("error" in total) return { ok: false as const, reason: "Enter the total confirmed amount, including this receipt." };
      return convertPayment({
        dealPaise: plot.paise,
        paymentPaise: payment.paise,
        cumulativePaise: total.paise,
        currentUnits: summary.received,
      });
    }
    if (view?.tokens && receiptFormula.trim()) {
      const cells: Record<string, string> = { PTS: view.tokens };
      if (percent) {
        if (!/^\d{1,3}(?:\.\d{1,8})?$/.test(percent) || toUnits(percent) > TOTAL_UNITS) {
          return { ok: false as const, reason: "Check Received (%)." };
        }
        cells.RECEIVED = tokensForPercent(view.tokens, toUnits(percent));
      }
      const points = worksheetPoints(receiptFormula, cells, "RECEIVED");
      if (!points) return { ok: false as const, reason: "Check S.F and its cell names." };
      const scaled = (v: string) => BigInt(v.split(".")[0] + (v.split(".")[1] ?? "").padEnd(4, "0"));
      const numerator = scaled(points) * TOTAL_UNITS;
      const basis = scaled(view.tokens);
      const deltaUnits = numerator / basis;
      if (deltaUnits === 0n || numerator > summary.outstanding * basis) {
        return { ok: false as const, reason: "Pts must fit the remaining balance." };
      }
      return { ok: true as const, deltaUnits };
    }
    if (!percent) return null;
    if (!/^\d{1,3}(?:\.\d{1,8})?$/.test(percent)) return { ok: false as const, reason: "Enter a percentage with up to 8 decimal places." };
    const deltaUnits = toUnits(percent);
    if (deltaUnits <= 0n || deltaUnits > summary.outstanding) return { ok: false as const, reason: "Enter a percentage above zero and within the remaining balance." };
    return { ok: true as const, deltaUnits };
  })();

  const blockedWhy = !view
    ? null
    : view.status !== "BOOKED"
      ? view.status === "PAYMENT_COMPLETED"
        ? "This Booking is 100% paid. No payment can be added."
        : `This Booking is ${human(view.status)}. Payments are approved only on a Booked Booking.`
      : view.activeProcess !== "NONE"
        ? `This Booking is under ${human(view.activeProcess)}. Decide that first.`
        : rows.length === 0
          ? "Payment plan not configured: set one up on the Booking (Revise Payment Schedule) before recording a payment."
          : null;

  async function saveTokens() {
    if (busy || !view || view.tokens || !tokens) return;
    setBusy(true);
    try {
      const result = await savePlotTokensAction(view.id, view.plotId, tokens);
      clearPayment();
      if (result.ok) setView({ ...view, tokens });
      else await load(view.id);
      setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    } catch {
      setNotice({ ok: false, text: "Could not confirm the save. Reopen the booking to check its tokens." });
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!canApprove || !view || !validReceipt) return;
    setBusy(true);
    setNotice(null);
    key.current ??= globalThis.crypto.randomUUID();
    const result = await approveVerifiedPaymentAction({
      bookingId: view.id,
      plotId: view.plotId,
      percent: fromUnits(validReceipt.deltaUnits),
      paidOn,
      reference,
      expectedReceived: view.received,
      requestId: claimId,
      idempotencyKey: key.current,
    }).catch(() => ({ ok: false as const, error: "The approval could not be sent. Nothing was saved; check your connection and try again." }));
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    if (result.ok) {
      clearPayment();
      await load(view.id);
    }
  }

  /** Owner review, 25 Nov 2026 — a whole payment taken back (a bounced cheque), its entry kept. */
  async function reverse(entryId: string, reason: string): Promise<boolean> {
    if (busy || !view) return false;
    setBusy(true);
    setNotice(null);
    const result = await reversePaymentAction(entryId, reason, globalThis.crypto.randomUUID()).catch(() => ({
      ok: false as const,
      error: "The reversal could not be sent. Nothing changed; try again.",
    }));
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    if (result.ok) await load(view.id);
    return result.ok;
  }

  async function reject() {
    if (busy || !rejecting || !view) return;
    setBusy(true);
    const result = await rejectPaymentClaimAction(rejecting.id, rejecting.reason, globalThis.crypto.randomUUID()).catch(() => ({
      ok: false as const,
      error: "The rejection could not be sent. Try again.",
    }));
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    if (result.ok) {
      setRejecting(null);
      if (claimId === rejecting.id) clearPayment();
      await load(view.id);
    }
  }

  const picker = React.useRef<HTMLDetailsElement>(null);
  const noPlot = !view || busy || !!loading;
  const locked = noPlot || (mode === "RECORD" && (!!blockedWhy || !view?.tokens));
  const validReceipt = conversion?.ok ? conversion : null;
  const canApprove = !!validReceipt && !locked && attested && receiptTrackingId(reference.trim()) && !!paidOn && paidOn <= istDay(new Date());
  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 print:hidden">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Private Payment Calculator · MD only</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Payment worksheet</h1>
          </div>
          <div role="group" aria-label="Calculator mode" className="inline-flex rounded-xl border bg-secondary p-1">
            {([["RECORD", "Entry"], ["CALCULATE", "Preview"]] as const).map(([value, label]) => (
              <button type="button" key={value} aria-pressed={mode === value} disabled={busy}
                onClick={() => setMode(value)}
                className={`rounded-lg px-3 py-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary ${mode === value ? "bg-card text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </header>

        {notice && <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.ok ? "border-border bg-secondary" : "border-destructive/40 text-destructive"}`}>{notice.text}</p>}

        <section aria-label="Payment entry sheet" className="grid min-w-0 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-4 [&_input]:rounded-sm [&_input]:tabular-nums" onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement) || event.target.type === "checkbox") return;
          const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled):not([readonly]), button:not(:disabled):not([aria-pressed]), select:not(:disabled)')).filter((field) => field.offsetParent !== null);
          const index = fields.indexOf(event.target);
          if (index >= 0 && fields[index + 1]) { event.preventDefault(); fields[index + 1].focus(); }
        }}>
          <SheetRow title="P.N">
            <details ref={picker} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-input px-3 py-2.5 text-sm font-medium hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
                <span>{loading ? "Loading plot…" : view ? `Plot ${view.plot} · ${view.project}` : "Select a plot"}</span>
                <span aria-hidden="true" className="text-muted-foreground group-open:rotate-180">▾</span>
              </summary>
              <div className="mt-2 rounded-lg border p-2">
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search plots" placeholder="Search plot, project, booking or customer" autoComplete="off" />
                <ul className="mt-1 max-h-48 divide-y overflow-y-auto">
                  {matches.map((b) => <li key={b.id}>
                    <button type="button" disabled={busy} onClick={() => {
                      if (picker.current) {
                        picker.current.open = false;
                        picker.current.querySelector("summary")?.focus();
                      }
                      setQuery("");
                      choose(b.id);
                    }} className="w-full rounded px-2 py-2 text-left text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
                      <strong>Plot {b.plot}</strong> · {b.project}
                      <span className="block text-xs text-muted-foreground">{b.number} · {b.customer} · {human(b.status)} · {pct(toUnits(b.received))} paid</span>
                    </button>
                  </li>)}
                  {!matches.length && <li className="p-3 text-sm">No matching plots.</li>}
                </ul>
              </div>
            </details>
            {view && <p className="mt-2 text-xs text-muted-foreground">{view.number} · {view.customer} · {human(view.status)}</p>}
            {view?.tokens && <p className="mt-1 text-sm">Pts · {view.tokens}</p>}
          </SheetRow>

          {view && !view.tokens && <SheetRow title="Setup" wide>
            <div key={inputVersion} className="grid gap-2 sm:grid-cols-3">
              <Field label="Total">
                <PasswordInput visibilityLabel="plot value" inputMode="decimal" autoComplete="off" disabled={noPlot}
                  value={plotValue} onChange={(e) => setPlotValue(formatRupeeTyping(e.target.value))} placeholder="5,00,000" />
              </Field>
              <Field label="S.F">
                <PasswordInput visibilityLabel="S.F" inputMode="text" placeholder="=TOTAL * 5%" autoComplete="off" disabled={noPlot}
                  value={factor} onChange={(e) => setFactor(e.target.value)} maxLength={160} />
              </Field>
              {tokens && <Field label="Pts">
                <PasswordInput visibilityLabel="plot tokens" autoComplete="off" disabled={noPlot} value={tokens} readOnly />
              </Field>}
            </div>
            {factor && plotValue && !tokens && <p role="status" className="text-xs text-destructive">Check Total and S.F.</p>}
            {mode === "RECORD" && <Button type="button" className="mt-2" disabled={!tokens || noPlot || view.status !== "BOOKED" || view.activeProcess !== "NONE"} onClick={saveTokens}>
              Save Pts
            </Button>}
          </SheetRow>}

          <SheetRow title="Payment">
            {mode === "RECORD" && !!view?.claims.length && <Field label="Staff payment claim">
              <select className={SELECT} disabled={locked} value={claimId} onChange={(e) => {
                const claim = view.claims.find((c) => c.id === e.target.value);
                setClaimId(e.target.value);
                setReference(claim?.reference ?? `PV-${globalThis.crypto.randomUUID()}`);
                setPaidOn(claim ? istDay(claim.claimedPaidOn) : istDay(new Date()));
              }}>
                <option value="">Manual receipt</option>
                {view.claims.map((c) => <option key={c.id} value={c.id}>{c.mode} · {c.reference} · {formatIst(c.claimedPaidOn)}</option>)}
              </select>
            </Field>}
            <div key={inputVersion} className="mt-2 grid gap-3 sm:grid-cols-2">
              {!view?.tokens && mode === "CALCULATE" && <Field label="Received amount (₹)">
                <PasswordInput visibilityLabel="received amount" inputMode="decimal" autoComplete="off" disabled={locked}
                  value={receivedAmount} onChange={(e) => setReceivedAmount(formatRupeeTyping(e.target.value))} placeholder="0" />
              </Field>}
              <Field label="Received (%)">
                <Input inputMode="decimal" autoComplete="off" disabled={locked} readOnly={byAmount}
                  value={byAmount ? (validReceipt ? fromUnits(validReceipt.deltaUnits) : "") : percent}
                  onChange={(e) => setPercent(e.target.value)} placeholder="0" />
              </Field>
              {view?.tokens && <Field label="S.F (optional)">
                <PasswordInput visibilityLabel="entry formula" autoComplete="off" disabled={locked} value={receiptFormula}
                  maxLength={160} placeholder="=RECEIVED * 2" onChange={(e) => setReceiptFormula(e.target.value)} />
              </Field>}
              {byAmount && summary && summary.received > 0n && <Field label="Total confirmed receipts, including this one (₹)">
                <PasswordInput visibilityLabel="total confirmed receipts" inputMode="decimal" autoComplete="off" disabled={locked}
                  value={cumulativeAmount} onChange={(e) => setCumulativeAmount(formatRupeeTyping(e.target.value))} placeholder="0" />
              </Field>}
            </div>
            {tokens && validReceipt && <p aria-live="polite" className="mt-2 text-sm">Credit {tokensForPercent(tokens, validReceipt.deltaUnits)} Pts · {pct(validReceipt.deltaUnits)}</p>}
            {mode === "RECORD" && blockedWhy && <p className="mt-2 text-xs">{blockedWhy}</p>}
            {conversion && !conversion.ok && <p role="status" className="mt-2 text-xs text-destructive">{conversion.reason}</p>}
          </SheetRow>

          {mode === "RECORD" && <SheetRow title="Receipt">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date"><Input type="date" disabled={locked} value={view ? paidOn : ""} max={istDay(new Date())} onChange={(e) => setPaidOn(e.target.value)} /></Field>
              <details className="self-end text-xs"><summary className="cursor-pointer py-2">Receipt ID</summary>
                <Input aria-label="Receipt ID" disabled={locked} value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" maxLength={39} readOnly={!!claimId} />
              </details>
            </div>
          </SheetRow>}

          <SheetRow title="Next instalment">
            {!summary ? <span className="text-sm text-muted-foreground">Select a plot to see its due date.</span> :
              validReceipt && view ? <Preview basis={tokens} rows={rows} received={summary.received} delta={validReceipt.deltaUnits} milestones={view.milestones} /> :
              summary.current ? <p className="text-sm">Instalment {summary.current.seq} · <strong>{day(summary.current.dueDay)}</strong>
                <span className="block text-xs text-muted-foreground">{tokenShare(tokens, summary.current.pending)} due</span>
              </p> : <p className="text-sm">{rows.length ? "All instalments paid." : "No payment schedule yet."}</p>}
          </SheetRow>
          {mode === "RECORD" && <footer className="col-span-full flex flex-wrap items-center justify-between gap-3 bg-secondary/50 px-4 py-3 sm:px-5">
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" disabled={!validReceipt || locked} checked={attested} onChange={(e) => setAttested(e.target.checked)} />
              <span>Receipt verified</span>
            </label>
            <Button disabled={!canApprove} onClick={approve}>{busy ? "Saving…" : "Record Payment"}</Button>
          </footer>}
        </section>

        {view && summary && <>
          <section aria-label="Booking balance" className="space-y-3">
            <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-4">
              <Stat label="Paid so far" value={tokenShare(tokens, summary.received)} />
              <Stat label="Balance left" value={tokenShare(tokens, summary.outstanding)} />
              <Stat label="Overdue" value={tokenShare(tokens, summary.overdue)} />
              <Stat label="Due today" value={tokenShare(tokens, summary.dueToday)} />
            </dl>
            <PaymentProgress units={summary.received} />
            {view.scheduleRevisionWaiting && <p className="text-xs">A payment schedule revision is awaiting approval.</p>}
          </section>
          <div key={view.id} className="min-w-0 divide-y rounded-xl border bg-card">
            <details className="min-w-0 p-4">
              <summary className="cursor-pointer text-sm font-semibold">Instalment schedule ({rows.length})</summary>
              <div className="mt-3"><Schedule basis={tokens} rows={rows} /></div>
            </details>
            <details className="min-w-0 p-4">
              <summary className="cursor-pointer text-sm font-semibold">Payment history ({view.entries.length + (opening !== 0n ? 1 : 0)})</summary>
              <div className="mt-3"><History basis={tokens} entries={view.entries} opening={opening} busy={busy}
                onReverse={["BOOKED", "PAYMENT_COMPLETED"].includes(view.status) && view.activeProcess === "NONE" ? reverse : null} /></div>
            </details>
          </div>
        </>}
        {view && view.claims.length > 0 && (
          <Section title="Staff say these customers paid — please check">
            <ul className="space-y-2 text-xs">
              {view.claims.map((c) => (
                <li key={c.id} className="rounded-lg border border-border/60 p-2">
                  <p>
                    <strong>{c.mode}</strong> · {c.reference} · paid {formatIst(c.claimedPaidOn)} · raised by {c.requestedByRef}
                  </p>
                  {rejecting?.id === c.id ? (
                    <div className="mt-2 flex gap-2">
                      <ReasonSelect label="Reason for rejecting" value={rejecting.reason}
                        onChange={(reason) => setRejecting({ id: c.id, reason })} />
                      <Button size="sm" variant="outline" disabled={busy || !rejecting.reason.trim()} onClick={reject}>
                        Mark not accepted
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setRejecting({ id: c.id, reason: "" })}>
                      Not accepted
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

      </div>
    </AppShell>
  );
}

function SheetRow({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`min-w-0 bg-card ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <h2 className="border-b bg-secondary/60 px-3 py-1 text-xs font-semibold">{title}</h2>
      <div className="min-w-0 px-3 py-2">{children}</div>
    </section>
  );
}

function ReasonSelect({ label, value, onChange }: { label: string; value: string; onChange: (reason: string) => void }) {
  return (
    <select aria-label={label} className={SELECT} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose a reason</option>
      {PAYMENT_DECISION_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
    </select>
  );
}

function Schedule({ rows, basis }: { rows: InstalmentRow[]; basis: string | null }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No payment plan yet. Set it up on the booking page.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b border-border/60">
          <tr>
            <th className={TH}>Instalment</th>
            <th className={TH}>Due date</th>
            <th className={TH}>Should pay</th>
            <th className={TH}>Paid</th>
            <th className={TH}>Left</th>
            <th className={TH}>Of this instalment</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r) => (
            <tr key={r.seq}>
              <td className={TD}>{r.seq}</td>
              <td className={TD}>{day(r.dueDay)}</td>
              <td className={TD}>{tokenShare(basis, r.target)}</td>
              <td className={TD}>{tokenShare(basis, r.received)}</td>
              <td className={TD}>{tokenShare(basis, r.pending)}</td>
              <td className={TD}>{shareOfInstalment(r.received, r.target)}</td>
              <td className={TD}>
                <Badge variant={PAYMENT_BADGE[r.payment]}>{PAYMENT_LABEL[r.payment]}</Badge>
                {r.due && <span className={`ml-1 text-[11px] ${r.due === "OVERDUE" ? "text-red-700" : "text-muted-foreground"}`}>{DUE_LABEL[r.due]}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted-foreground">
        % figures are of the full plot price; &ldquo;Of this instalment&rdquo; is how much of that one instalment is paid.
      </p>
    </div>
  );
}

function History({
  basis,
  entries,
  opening,
  busy,
  onReverse,
}: {
  basis: string | null;
  entries: CalculatorBookingView["entries"];
  opening: bigint;
  busy: boolean;
  /** Null where the Booking cannot take a reversal now (not live, or under a process). */
  onReverse: ((entryId: string, reason: string) => Promise<boolean>) | null;
}) {
  const [reversing, setReversing] = React.useState<{ id: string; reason: string } | null>(null);
  if (entries.length === 0 && opening === 0n) return <p className="text-xs text-muted-foreground">No verified payment yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b border-border/60">
          <tr>
            <th className={TH}>Date</th>
            <th className={TH}>Reference</th>
            <th className={TH}>Mode</th>
            <th className={TH}>Paid</th>
            <th className={TH}>Checked by</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {opening !== 0n && (
            <tr>
              <td className={TD}>—</td>
              <td className={TD} colSpan={2}>
                Paid earlier, carried over — no separate entries
              </td>
              <td className={TD}>{tokenShare(basis, opening)}</td>
              <td className={TD}>—</td>
              <td className={TD}>Carried</td>
            </tr>
          )}
          {entries.map((e) => {
            const struck = e.status !== "CONFIRMED";
            const units = toUnits(e.percent);
            // Before a Change Plot: at the old Plot's price, and inside the carried figure.
            const old = e.oldPlot && !struck;
            return (
              <React.Fragment key={e.id}>
                <tr className={struck ? "text-muted-foreground line-through" : old ? "text-muted-foreground" : undefined}>
                  <td className={TD}>{formatIst(e.paidOn)}</td>
                  <td className={TD}>{e.reference}</td>
                  <td className={TD}>{e.mode ?? "—"}</td>
                  <td className={TD}>{tokenShare(e.oldPlot ? null : basis, units)}</td>
                  <td className={TD}>{e.approvedBy}</td>
                  <td className={TD}>
                    {e.status === "REVERSED" ? "Reversed" : e.status === "SUPERSEDED" ? "Corrected" : old ? "Old plot — in the carried figure" : "Received"}
                    {!struck && !old && onReverse && reversing?.id !== e.id && (
                      <Button size="sm" variant="ghost" className="ml-2 h-6 px-2 text-[11px]" onClick={() => setReversing({ id: e.id, reason: "" })}>
                        Reverse
                      </Button>
                    )}
                  </td>
                </tr>
                {reversing?.id === e.id && onReverse && (
                  <tr>
                    <td className={TD} colSpan={6}>
                      <p className="mb-1 text-[11px] text-muted-foreground">
                        Take back the whole {tokenShare(basis, units)} — for a bounced cheque or a returned transfer. The entry stays here, crossed out.
                      </p>
                      <div className="flex gap-2">
                        <ReasonSelect label="Reason for reversing" value={reversing.reason}
                          onChange={(reason) => setReversing({ id: e.id, reason })} />
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy || !reversing.reason.trim()}
                          onClick={async () => {
                            if (await onReverse(e.id, reversing.reason)) setReversing(null);
                          }}
                        >
                          {busy ? "Reversing…" : "Reverse this payment"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReversing(null)}>
                          Keep
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Preview({
  basis,
  rows,
  received,
  delta,
  milestones,
}: {
  rows: InstalmentRow[];
  received: bigint;
  delta: bigint;
  basis: string | null;
  milestones: string[];
}) {
  const after = received + delta;
  const lands = allocateUnits(rows, delta);
  const nextDue = rows.find((row) => row.pending > (lands.find((part) => part.seq === row.seq)?.units ?? 0n));
  const reached = milestones.filter((m) => toUnits(m) > received && toUnits(m) <= after);
  return (
    <div className="space-y-1 text-xs tabular-nums" aria-live="polite">
      <p className="text-sm">
        {nextDue ? <>Instalment {nextDue.seq} · <strong>{day(nextDue.dueDay)}</strong> after this receipt</>
          : rows.length ? <strong>This receipt completes the schedule.</strong> : "No payment schedule yet."}
      </p>
      <p>Paid after this receipt <strong>{tokenShare(basis, after)}</strong> · Balance <strong>{tokenShare(basis, TOTAL_UNITS - after)}</strong></p>
      {lands.length > 0 && (
        <p className="mt-1">
          Goes to{" "}
          {lands.map((l, i) => {
            const row = rows.find((r) => r.seq === l.seq)!;
            const left = row.pending - l.units;
            return (
              <span key={l.seq}>
                {i > 0 && ", "}instalment {l.seq} (+{tokenShare(basis, l.units)}, {left === 0n ? "complete" : `${tokenShare(basis, left)} still left`})
              </span>
            );
          })}
          .
        </p>
      )}
      {reached.length > 0 && (
        <p className="mt-1 text-amber-800">
          This takes the booking to {reached.map((m) => pct(toUnits(m))).join(" and ")} — a commission step. The usual commission rules
          decide the rest.
        </p>
      )}
    </div>
  );
}
