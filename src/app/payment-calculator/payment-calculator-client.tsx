"use client";

// MD worksheet. Private amounts are used only for the in-browser calculation.

import React from "react";
import { ChevronDown, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyReceipt, pointsForAmount, prepareReceipts, type ReceiptDraft } from "./receipt-queue";
import { PasswordInput } from "@/components/ui/password-input";
import type { StaffRole } from "@/lib/security/permissions";
import { formatIst, istDay } from "@/lib/tasks";
import {
  formatRupeeTyping,
  fromUnits,
  instalmentRows,
  openingBalance,
  paymentSummary,
  PAYMENT_DECISION_REASONS,
  pct,
  tokensForPercent,
  toUnits,
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
  projectId: string;
  project: string;
  plot: string;
  plotType: string;
  status: string;
  customer: string;
  customerId: string | null;
};

const SELECT = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

const paymentValue = (basis: string | null, units: bigint) =>
  basis ? `${tokensForPercent(basis, units)} Pts` : pct(units);
const day = (d: string) => formatIst(`${d}T00:00:00+05:30`);

type Prepared = ReturnType<typeof prepareReceipts>[number];
const COLUMNS = ["Plot", "Amount (₹)", "Pts", "Date", "Record"];
const CELL = "border-r px-3 py-1 align-middle last:border-r-0 focus-within:bg-secondary/40";
const newReference = () => `PV-${crypto.randomUUID()}`;

export default function PaymentCalculatorClient({ role, actorName, staffAccountId, bookings, initialBookingId, expiresAt }: {
  role: StaffRole; actorName: string; staffAccountId: string; bookings: BookingOption[]; initialBookingId: string | null; expiresAt: number;
}) {
  const initialBooking = bookings.find((booking) => booking.id === initialBookingId);
  const initialId = initialBooking?.id;
  const [projectId, setProjectId] = React.useState(initialBooking?.projectId ?? "");
  const [useFormula, setUseFormula] = React.useState(false);
  const [sf, setSf] = React.useState("");
  const [drafts, setDrafts] = React.useState(() => initialBooking ? [emptyReceipt(1, initialBooking.projectId, initialBooking.id)] : []);
  const [views, setViews] = React.useState<Record<string, CalculatorBookingView>>({});
  const [active, setActive] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [reloadErrors, setReloadErrors] = React.useState<Record<string, string>>({});
  const [rejecting, setRejecting] = React.useState<{ id: string; reason: string } | null>(null);
  const counter = React.useRef(1);
  const writing = React.useRef(false);
  const pendingFocus = React.useRef<number | null>(null);
  const addButton = React.useRef<HTMLButtonElement>(null);
  const table = React.useRef<HTMLTableElement>(null);
  const keys = React.useRef(new Map<number, { payload: string; key: string }>());
  const loads = React.useRef(new Map<string, number>());
  const projects = React.useMemo(() =>
    Array.from(new Map(bookings.map((booking) => [booking.projectId, booking.project])))
      .sort((a, b) => a[1].localeCompare(b[1])), [bookings]);
  const projectBookings = bookings.filter((booking) => booking.projectId === projectId);
  const projectDrafts = drafts.filter((draft) => draft.projectId === projectId);
  const formula = useFormula ? sf.trim() : null;
  const prepared = prepareReceipts(projectDrafts, views, formula);
  const ready = prepared.filter((row) => row.ready);
  const selected = projectDrafts.find((row) => row.id === active);
  const view = selected && views[selected.bookingId];

  const load = React.useCallback(async (id: string) => {
    const version = (loads.current.get(id) ?? 0) + 1;
    loads.current.set(id, version);
    try {
      const result = await loadCalculatorBookingAction(id);
      if (version !== loads.current.get(id)) return;
      if (!result) throw new Error();
      setViews((all) => ({ ...all, [id]: result }));
      setReloadErrors((all) => ({ ...all, [id]: "" }));
    } catch {
      if (version !== loads.current.get(id)) return;
      setViews((all) => { const next = { ...all }; delete next[id]; return next; });
      setReloadErrors((all) => ({ ...all, [id]: "Booking could not be loaded." }));
    }
  }, []);

  React.useEffect(() => {
    const reference = newReference();
    setDrafts((all) => all.map((row) => row.id === 1 && !row.reference ? { ...row, reference } : row));
    if (initialId) void load(initialId);
  }, [initialId, load]);

  React.useEffect(() => {
    function clear() {
      setViews({}); setDrafts([]); setNotice(""); setRejecting(null); setSf("");
      loads.current.clear(); keys.current.clear();
    }
    function expire() {
      if (Date.now() >= expiresAt) { clear(); window.location.replace("/dashboard"); }
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
      else expire();
    }
    const timer = window.setTimeout(expire, Math.max(0, expiresAt - Date.now()));
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", expire);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", expire);
    };
  }, [expiresAt]);

  React.useEffect(() => {
    if (pendingFocus.current === null) return;
    const row = table.current?.querySelector<HTMLTableRowElement>(`[data-row="${pendingFocus.current}"]`);
    (row?.querySelector<HTMLElement>("summary") ?? row)?.focus();
    pendingFocus.current = null;
  }, [drafts]);

  function change(id: number, patch: Partial<ReceiptDraft>) {
    setDrafts((all) => all.map((row) => row.id === id ? { ...row, message: "", ...patch } : row));
  }
  function appendRow(project: string, bookingId = "") {
    const id = ++counter.current;
    const row = { ...emptyReceipt(id, project, bookingId), reference: newReference() };
    pendingFocus.current = id;
    setDrafts((all) => [...all, row]);
    setActive(id);
    setNotice("");
  }
  function selectProject(id: string) {
    setProjectId(id);
    setNotice("");
    setRejecting(null);
    const first = drafts.find((row) => row.projectId === id);
    if (first) setActive(first.id);
    else appendRow(id);
  }
  function selectPlot(id: number, bookingId: string) {
    change(id, { ...emptyReceipt(id, projectId, bookingId), reference: newReference() });
    setActive(id);
    setRejecting(null);
    void load(bookingId);
  }
  function removeRow(id: number) {
    if (writing.current) return;
    const index = projectDrafts.findIndex((row) => row.id === id);
    if (index < 0) return;
    const rest = projectDrafts.filter((row) => row.id !== id);
    const next = rest[index] ?? rest[index - 1];
    setDrafts((all) => all.filter((row) => row.id !== id));
    keys.current.delete(id);
    setNotice(projectDrafts[index].saved ? "Row removed from the worksheet. The payment is in payment history." : "Row removed.");
    setRejecting(null);
    if (next) {
      setActive(next.id);
      pendingFocus.current = next.id;
    } else {
      addButton.current?.focus();
    }
  }

  async function record(list: Prepared[]) {
    if (writing.current || !list.length || list.some((r) => !r.ready)) return;
    writing.current = true;
    setBusy(true);
    setNotice("");
    const balances = new Map<string, string>();
    let saved = 0;
    try {
      for (const { draft, view: booking, units, points } of list) {
        const expectedReceived = balances.get(booking.id) ?? booking.received;
        const input = { bookingId: booking.id, plotId: booking.plotId, percent: fromUnits(units),
          expectedReceived, reference: draft.reference.trim(), paidOn: draft.date, requestId: draft.claimId };
        const payload = JSON.stringify(input);
        let attempt = keys.current.get(draft.id);
        if (!attempt || attempt.payload !== payload) {
          attempt = { payload, key: crypto.randomUUID() };
          keys.current.set(draft.id, attempt);
        }
        const result = await approveVerifiedPaymentAction({ ...input, idempotencyKey: attempt.key }).catch(() => ({
          ok: false as const, error: "Save could not be confirmed. Check payment history before retrying.",
        }));
        if (!result.ok) {
          change(draft.id, { message: result.error });
          break;
        }
        saved++;
        balances.set(booking.id, fromUnits(toUnits(expectedReceived) + units));
        change(draft.id, { saved: true, amount: "", recordedPoints: points, plotValue: "", message: result.message });
        keys.current.delete(draft.id);
      }
      await Promise.all([...new Set(list.map((row) => row.draft.bookingId))].map(load));
      if (saved) setNotice(`${saved} payment${saved === 1 ? "" : "s"} recorded.${saved < list.length ? " Remaining rows are still open." : ""}`);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  async function saveSetup(draft: ReceiptDraft, booking: CalculatorBookingView, points: string) {
    if (writing.current || !points) return;
    writing.current = true;
    setBusy(true);
    try {
      const result = await savePlotTokensAction(booking.id, booking.plotId, points);
      if (result.ok) {
        setDrafts((all) => all.map((r) => r.bookingId === booking.id ? { ...r, plotValue: "" } : r));
        setNotice(result.message);
      } else change(draft.id, { message: result.error });
      await load(booking.id);
    } catch { change(draft.id, { message: "Could not confirm setup. Select the plot again to check." }); }
    finally { setBusy(false); writing.current = false; }
  }

  async function decide(action: () => ReturnType<typeof reversePaymentAction>) {
    if (!view || writing.current) return false;
    writing.current = true;
    setBusy(true);
    try {
      const result = await action();
      setNotice(result.ok ? result.message : result.error);
      if (result.ok) { setRejecting(null); await load(view.id); }
      return result.ok;
    } catch { setNotice("Could not confirm the change. Check payment history."); return false; }
    finally { writing.current = false; setBusy(false); }
  }

  const schedule = view ? instalmentRows(view.instalments) : [];
  const summary = view && paymentSummary(schedule, view.received);
  const opening = view ? openingBalance(view.received, view.entries.filter((e) => e.status === "CONFIRMED" && !e.oldPlot).map((e) => e.percent)) : 0n;
  return (
    <AppShell role={role} actorName={actorName} staffAccountId={staffAccountId}>
      <div className="w-full min-w-0 space-y-4 print:hidden">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Payment worksheet</h1>
          <Button ref={addButton} disabled={busy || !projectId} onClick={() => appendRow(projectId, selected?.bookingId)}>Add row</Button>
        </header>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <label className="grid min-w-0 max-w-full gap-1 text-sm font-medium">Project
            <select className={SELECT} disabled={busy || !projects.length} value={projectId} onChange={(e) => selectProject(e.target.value)}>
              <option value="" disabled>{projects.length ? "Choose a project" : "No projects with bookings"}</option>
              {projects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <div className="flex min-h-10 items-center gap-2">
            <label className="flex items-center gap-2 whitespace-nowrap text-sm">
              <input type="checkbox" className="accent-primary" checked={useFormula} disabled={busy || !projectId} onChange={(e) => setUseFormula(e.target.checked)} />
              S.F.
            </label>
            {useFormula && <div className="w-44"><PasswordInput aria-label="S.F. formula" visibilityLabel="S.F." autoComplete="off"
              maxLength={160} disabled={busy} value={sf} onChange={(e) => setSf(e.target.value)} /></div>}
          </div>
        </div>
        {projectId && <div className="max-w-full overflow-x-auto rounded-lg border bg-card">
          <table ref={table} aria-label="Payment entries" className="w-full min-w-[42rem] table-fixed border-collapse text-left text-sm tabular-nums">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[23%]" />
              <col className="w-[10%]" />
              <col className="w-[21%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="bg-secondary/60 text-xs">
              <tr>{COLUMNS.map((title) => <th key={title} scope="col" className="whitespace-nowrap border-b border-r px-3 py-2 font-medium last:border-r-0">{title}</th>)}</tr>
            </thead>
            <tbody>{!projectDrafts.length && <tr><td colSpan={COLUMNS.length} className="px-3 py-4 text-sm text-muted-foreground">Use Add row to enter a receipt.</td></tr>}{prepared.map((row, index) => {
              const { draft, view: booking } = row;
              const locked = busy || draft.saved || booking?.status !== "BOOKED" || booking.activeProcess !== "NONE";
              const plot = projectBookings.find((option) => option.id === draft.bookingId);
              const setup = booking && !booking.tokens && booking.status === "BOOKED" && booking.activeProcess === "NONE" && !draft.saved;
              const plotPoints = setup ? pointsForAmount(draft.plotValue, formula) : null;
              return <React.Fragment key={draft.id}>
                <tr data-row={draft.id} aria-label={`Receipt row ${index + 1}`} tabIndex={draft.saved ? 0 : undefined} className="border-b" onClick={() => setActive(draft.id)} onFocus={() => setActive(draft.id)} onKeyDown={moveAcrossSheet}>
                  <td data-sheet-cell className={CELL}>
                    {draft.saved ? plot && <PlotLabel plot={plot} /> :
                      <PlotPicker bookings={projectBookings} selected={plot} busy={busy} choose={(id) => selectPlot(draft.id, id)} />}
                  </td>
                  <td data-sheet-cell className={CELL}>{!draft.saved && <div className="max-w-36">
                    <PasswordInput aria-label="Amount" visibilityLabel="amount" className="h-9" inputMode="decimal" autoComplete="off" value={draft.amount}
                      disabled={locked} onChange={(e) => change(draft.id, { amount: formatRupeeTyping(e.target.value) })} />
                  </div>}</td>
                  <td data-sheet-cell className={CELL}><output className="block break-all">{row.points || "—"}</output></td>
                  <td data-sheet-cell className={CELL}><Input aria-label="Receipt date" className="h-9 max-w-36" type="date" disabled={locked} value={draft.date} max={istDay(new Date())} onChange={(e) => change(draft.id, { date: e.target.value })} /></td>
                  <td data-sheet-cell className={`${CELL} relative`}>
                    <div className="pr-2">
                      {draft.saved ? <span className="block py-1 font-medium">Recorded</span> : <Button size="sm" className="px-2.5" disabled={!row.ready || busy} onClick={() => record([row])}>Record</Button>}
                    </div>
                    <button type="button" data-remove-row disabled={busy} aria-label={`Remove row ${index + 1}`} title="Remove row"
                      className="absolute right-0 top-0 grid size-6 place-items-center rounded hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      onClick={(event) => { event.stopPropagation(); removeRow(draft.id); }}>
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </td>
                </tr>
                {setup && <tr><td colSpan={COLUMNS.length} className="border-b bg-secondary/30 px-3 py-1.5">
                  <form aria-label="One-time plot setup" className="flex items-end gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    if (plotPoints) void saveSetup(draft, booking, plotPoints);
                  }}>
                    <div className="w-32">
                      <label htmlFor={`plot-total-${draft.id}`} className="block text-xs">Plot total (one time)</label>
                      <PasswordInput id={`plot-total-${draft.id}`} className="h-8" visibilityLabel="plot total" disabled={busy}
                        inputMode="decimal" autoComplete="off" value={draft.plotValue}
                        onChange={(e) => change(draft.id, { plotValue: formatRupeeTyping(e.target.value) })} />
                    </div>
                    <div className="w-28">
                      <span className="block text-xs">Plot Pts</span>
                      <output aria-label="Plot Pts" className="flex min-h-8 items-center break-all text-sm font-medium tabular-nums">
                        {plotPoints ?? "—"}
                      </output>
                    </div>
                    <Button type="submit" size="sm" aria-label="Save plot points" disabled={busy || !plotPoints}>Save</Button>
                  </form>
                  {draft.plotValue && !plotPoints && <p className="mt-1 text-xs text-destructive" role="status">
                    {formula === "" ? "Enter the S.F. above." : "Check the plot total and S.F."}
                  </p>}
                </td></tr>}
                {(row.error || draft.message || reloadErrors[draft.bookingId]) && !draft.saved && <tr><td colSpan={COLUMNS.length} className="border-b px-3 py-1.5 text-xs text-destructive" role="status">
                  Row {index + 1} · {draft.message || row.error || reloadErrors[draft.bookingId]}
                  {reloadErrors[draft.bookingId] && <button className="ml-2 underline" onClick={() => load(draft.bookingId)}>Retry</button>}
                </td></tr>}
              </React.Fragment>;
            })}</tbody>
          </table>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {selected && <details key={selected.id} className="min-w-0 text-xs">
            <summary className="cursor-pointer">Receipt details</summary>
            <div className="mt-2 space-y-2">
              {view && <p>{view.project} · {view.customer}</p>}
              {!!view?.claims.length && !selected.saved && <label className="block">Receipt source<select aria-label="Receipt source" className={SELECT} value={selected.claimId} disabled={busy} onChange={(e) => {
                const claim = view.claims.find((c) => c.id === e.target.value);
                change(selected.id, { claimId: claim?.id ?? "", reference: claim?.reference ?? newReference(), date: claim ? istDay(claim.claimedPaidOn) : istDay(new Date()) });
              }}><option value="">Manual receipt</option>{view.claims.map((c) => <option key={c.id} value={c.id}>{c.mode} · {c.reference}</option>)}</select></label>}
              <label className="block">Receipt ID<Input aria-label="Receipt ID" className="w-80 max-w-full" maxLength={39} disabled={busy || selected.saved || !!selected.claimId} value={selected.reference} onChange={(e) => change(selected.id, { reference: e.target.value })} /></label>
            </div>
          </details>}
          {ready.length > 1 && <Button size="sm" variant="outline" disabled={busy} onClick={() => record(ready)}>Record {ready.length} payments</Button>}
        </div>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {view && summary && <div key={view.id} className="divide-y border-y">
          <PaymentSection title="Booking details">
            <dl className="flex flex-wrap gap-x-8 gap-y-2 tabular-nums">
              <div><dt className="text-xs">Paid</dt><dd className="break-all font-medium">{paymentValue(view.tokens, summary.received)}</dd></div>
              <div><dt className="text-xs">Balance</dt><dd className="break-all font-medium">{paymentValue(view.tokens, summary.outstanding)}</dd></div>
            </dl>
          </PaymentSection>
          <PaymentSection title="Instalment schedule">
            {view.scheduleRevisionWaiting && <p className="mb-2 text-xs">Schedule revision awaiting approval.</p>}
            <Schedule basis={view.tokens} rows={schedule} />
          </PaymentSection>
          <PaymentSection title="Payment history">
            <History basis={view.tokens} entries={view.entries} opening={opening} busy={busy} onReverse={["BOOKED","PAYMENT_COMPLETED"].includes(view.status) && view.activeProcess === "NONE" ?
              (id, reason) => decide(() => reversePaymentAction(id, reason, crypto.randomUUID())) : null} />
          </PaymentSection>
          {!!view.claims.length && <PaymentSection title={`Staff payment claims (${view.claims.length})`}>
            <ul className="divide-y">
              {view.claims.map((claim) => <li key={claim.id} className="py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="tabular-nums">{formatIst(claim.claimedPaidOn)} · {claim.mode}</p>
                    <p className="break-all text-xs">{claim.reference}</p>
                  </div>
                  {rejecting?.id !== claim.id && <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => setRejecting({ id: claim.id, reason: "" })}>Reject</Button>}
                </div>
                {rejecting?.id === claim.id && <PaymentDecision action="Reject claim" reason={rejecting.reason} busy={busy}
                  onChange={(reason) => setRejecting({ id: claim.id, reason })}
                  onCancel={() => setRejecting(null)}
                  onConfirm={() => decide(() => rejectPaymentClaimAction(claim.id, rejecting.reason, crypto.randomUUID()))} />}
              </li>)}
            </ul>
          </PaymentSection>}
        </div>}
      </div>
    </AppShell>
  );
}

function PlotLabel({ plot }: { plot: BookingOption }) {
  return <span className="block">
    <span className="block break-words"><strong>{plot.plot}</strong> {plot.plotType}</span>
    <span className="block break-words text-xs font-normal">{plot.project}</span>
  </span>;
}

function PlotPicker({ bookings, selected, busy, choose }: { bookings: BookingOption[]; selected?: BookingOption; busy: boolean; choose: (id: string) => void }) {
  const [query, setQuery] = React.useState("");
  const picker = React.useRef<HTMLDetailsElement>(null);
  const matches = bookings.filter((b) => `${b.plot} ${b.plotType} ${b.project} ${b.customer} ${b.customerId ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const counts = new Map<string, number>();
  for (const plot of bookings) counts.set(plot.plot, (counts.get(plot.plot) ?? 0) + 1);
  return <details ref={picker} className="group">
    <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
      {selected ? <PlotLabel plot={selected} /> : "Select plot"}
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
    </summary>
    <Input aria-label="Search plots" type="search" placeholder="Plot or customer" value={query} onChange={(e) => setQuery(e.target.value)} />
    <ul className="max-h-48 overflow-y-auto">{matches.map((b) => <li key={b.id}>
      <button type="button" disabled={busy} className="w-full rounded-md px-2 py-1 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" onClick={() => {
        if (picker.current) { picker.current.open = false; picker.current.querySelector("summary")?.focus(); }
        setQuery(""); choose(b.id);
      }}><PlotLabel plot={b} />{(counts.get(b.plot) ?? 0) > 1 &&
        <span className="block text-xs text-muted-foreground">{b.customer} · {b.status}</span>}</button>
    </li>)}{!matches.length && <li>No matching plots.</li>}</ul>
  </details>;
}

function moveAcrossSheet(event: React.KeyboardEvent<HTMLTableRowElement>) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const cell = target.closest<HTMLElement>("[data-sheet-cell]");
  if (!cell || target.closest("details[open]")) return;
  const enter = event.key === "Enter" && target instanceof HTMLInputElement;
  const arrow = event.key === "ArrowRight" || event.key === "ArrowLeft";
  if (!enter && !arrow) return;

  const forward = event.key !== "ArrowLeft";
  if (arrow && !event.altKey) {
    // Keep native date/select editing and text selection inside a cell.
    if (target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLInputElement && target.type !== "checkbox") {
      const edge = forward ? target.value.length : 0;
      if (target.selectionStart !== edge || target.selectionEnd !== edge) return;
    }
  }
  const cells = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-sheet-cell]"));
  const step = forward ? 1 : -1;
  for (let i = cells.indexOf(cell) + step; i >= 0 && i < cells.length; i += step) {
    const field = cells[i].querySelector<HTMLElement>("summary, input:not(:disabled):not([readonly]), select:not(:disabled), button:not(:disabled):not([aria-pressed]):not([data-remove-row])");
    if (field) {
      event.preventDefault();
      field.focus();
      return;
    }
  }
}

function PaymentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-2 text-sm font-medium hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
      </summary>
      <div className="px-2 pb-2 pt-1 text-sm">{children}</div>
    </details>
  );
}

function PaymentDecision({ action, reason, busy, onChange, onCancel, onConfirm }: {
  action: string;
  reason: string;
  busy: boolean;
  onChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select aria-label={`Reason to ${action.toLowerCase()}`} className={`${SELECT} max-w-56`} disabled={busy} value={reason} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a reason</option>
        {PAYMENT_DECISION_REASONS.map((item) => <option key={item}>{item}</option>)}
      </select>
      <Button size="sm" variant="destructive" disabled={busy || !reason} onClick={onConfirm}>{action}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function Schedule({ rows, basis }: { rows: InstalmentRow[]; basis: string | null }) {
  if (!rows.length) return <p className="text-xs">No instalment schedule.</p>;

  return (
    <table aria-label="Instalment schedule" className="w-full max-w-2xl text-left text-xs tabular-nums">
      <thead className="border-b">
        <tr>
          <th scope="col" className="pb-1 font-medium">Due date</th>
          <th scope="col" className="px-2 pb-1 text-right font-medium">Scheduled</th>
          <th scope="col" className="pb-1 text-right font-medium">Left</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row) => (
          <tr key={row.seq}>
            <td className="py-1.5">
              <span className="whitespace-nowrap">{day(row.dueDay)}</span>
              {row.payment === "COMPLETE" && <span className="block">Paid</span>}
              {row.due === "OVERDUE" && <span className="block text-destructive">Overdue</span>}
              {row.due === "DUE_TODAY" && <span className="block">Due today</span>}
            </td>
            <td className="break-all px-2 text-right">{paymentValue(basis, row.target)}</td>
            <td className="break-all text-right">{paymentValue(basis, row.pending)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function History({ basis, entries, opening, busy, onReverse }: {
  basis: string | null;
  entries: CalculatorBookingView["entries"];
  opening: bigint;
  busy: boolean;
  onReverse: ((entryId: string, reason: string) => Promise<boolean>) | null;
}) {
  const [reversing, setReversing] = React.useState<{ id: string; reason: string } | null>(null);
  if (!entries.length && !opening) return <p className="text-xs">No payments recorded.</p>;

  return (
    <ul className="divide-y tabular-nums">
      {entries.map((entry) => {
        const canReverse = entry.status === "CONFIRMED" && !entry.oldPlot && !!onReverse;
        const status = entry.status === "REVERSED" ? "Reversed" : entry.status === "SUPERSEDED" ? "Corrected" : entry.oldPlot ? "Previous plot" : "";
        const value = paymentValue(entry.oldPlot ? null : basis, toUnits(entry.percent));
        return (
          <li key={entry.id} className="py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p>{formatIst(entry.paidOn)} · <strong>{value}</strong>{status && ` · ${status}`}</p>
                <p className="break-all text-xs">{entry.reference}</p>
              </div>
              {canReverse && reversing?.id !== entry.id && <Button size="sm" variant="ghost" disabled={busy}
                onClick={() => setReversing({ id: entry.id, reason: "" })}>Reverse</Button>}
            </div>
            {onReverse && canReverse && reversing?.id === entry.id && <PaymentDecision action="Reverse payment" reason={reversing.reason} busy={busy}
              onChange={(reason) => setReversing({ id: entry.id, reason })}
              onCancel={() => setReversing(null)}
              onConfirm={async () => { if (await onReverse(entry.id, reversing.reason)) setReversing(null); }} />}
          </li>
        );
      })}
      {opening !== 0n && <li className="flex justify-between gap-2 py-1.5">
        <span>Carried forward</span><strong>{paymentValue(basis, opening)}</strong>
      </li>}
    </ul>
  );
}
