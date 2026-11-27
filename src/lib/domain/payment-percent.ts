// Confidential Payment & Instalment Management — local trial (revised brief,
// 25 Nov 2026). Percentages are the only unit: a Booking is 100% of its agreed
// value. The private calculator stores its encrypted plot tokens separately. The canonical
// figures stay PaymentReceivedEntry.percent, PaymentInstalment.receivedPercent
// and Booking.paymentReceivedPercent, all Decimal(11,8) since the owner review.
//
// Everything here is exact integer arithmetic (BigInt), so it runs the same in
// the browser and on the server and no binary float touches a threshold. A
// percentage is held in "units" of 0.00000001 percentage point. Rupees exist only
// as BigInt paise in the MD's browser and are never sent to the server.

import { istDay, remainingPercent } from "../tasks.ts";

/** As stored: payment progress is Decimal(11,8) (owner review, 25 Nov 2026). */
export const PLACES = 8;
const SCALE = 10n ** BigInt(PLACES);
/** 100%, in units of 0.00000001 percentage point. */
export const TOTAL_UNITS = 100n * SCALE;

/* ----------------------------------------------------------- percentages */

const PERCENT = /^\d{1,3}(\.\d{1,8})?$/;

/** "12.5" → 1250000000n. Throws on anything but a plain number with ≤ 8 places. */
export function toUnits(percent: string): bigint {
  const t = percent.trim();
  if (!PERCENT.test(t)) throw new Error(`"${percent}" is not a percentage with at most ${PLACES} decimal places.`);
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(PLACES, "0"));
}

/** 438000n → "43.8". Trailing zeros go; never rounded. */
export function fromUnits(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const u = units < 0n ? -units : units;
  const frac = (u % SCALE).toString().padStart(PLACES, "0").replace(/0+$/, "");
  return `${sign}${u / SCALE}${frac ? `.${frac}` : ""}`;
}

/** "43.8%" — exact, for MD's calculator. */
export const pct = (units: bigint) => `${fromUnits(units)}%`;

/** A stored percentage as the database hands it back ("1e-8" included) → units. */
export function unitsOf(value: string): bigint {
  const s = value.trim();
  return toUnits(/e/i.test(s) ? Number(s).toFixed(PLACES) : s);
}

const HUNDREDTH = 10n ** BigInt(PLACES - 2);
/**
 * Staff read at most two places (owner review, 25 Nov 2026). A paid figure
 * rounds down and a figure still due rounds up, so 24.99999999% paid reads
 * 24.99% (never 25%) and its balance reads 75.01% — the two still add to 100.
 */
export const paidPct = (units: bigint) => `${fromUnits((units / HUNDREDTH) * HUNDREDTH)}%`;
export const duePct = (units: bigint) => `${fromUnits(((units + HUNDREDTH - 1n) / HUNDREDTH) * HUNDREDTH)}%`;
/** Progress saved before the owner review kept four places; one such step. */
const LEGACY_STEP = 10n ** BigInt(PLACES - 4);

/**
 * How much of one instalment is satisfied, as a share of that instalment —
 * 12 points received towards a 25% instalment is 48% of it. Floored to two
 * places, so a nearly-paid instalment never reads as 100%.
 */
export function shareOfInstalment(received: bigint, target: bigint): string {
  if (target <= 0n) return "0%";
  const hundredths = (received * 10000n) / target;
  return `${fromUnits(hundredths * HUNDREDTH)}%`;
}

/* ---------------------------------------------------------------- rupees */

/** Rupees as typed: digits, with or without grouping commas, at most 2 places. */
const RUPEES = /^\d{1,13}(\.\d{1,2})?$/;

/** "50,000" → 5000000n paise, or the reason it cannot be read. Positive only. */
export function parseRupees(text: string): { paise: bigint } | { error: string } {
  const t = text.trim().replace(/^₹/, "").replace(/[,\s]/g, "");
  if (!t) return { error: "Enter an amount." };
  if (!RUPEES.test(t)) return { error: "Type the amount in rupees, like 50000 or 3400.50." };
  const [whole, frac = ""] = t.split(".");
  const paise = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  if (paise <= 0n) return { error: "The amount must be more than zero." };
  return { paise };
}

/**
 * Cleans a rupee figure as it is typed (owner, 25 Nov 2026): digits only, one
 * ".", at most two paise digits, and Indian grouping commas put in for you.
 * "abc500000.567" → "5,00,000.56". Letters and symbols simply do not appear.
 */
export function formatRupeeTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const whole = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, "").slice(0, 13);
  const grouped = whole.replace(/(\d)(?=(\d\d)+\d$)/g, "$1,");
  if (dot === -1) return grouped;
  const paise = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${grouped || "0"}.${paise}`;
}

/** One-time conversion in the browser. Amount is in paise, factor in plain
 * decimal units. Round the resulting quantity to the nearest 0.0001 token. */
export function plotTokens(paise: bigint, factorText: string): string | null {
  if (paise <= 0n || !/^\d{1,13}(?:\.\d{1,4})?$/.test(factorText)) return null;
  const [whole, fraction = ""] = factorText.split(".");
  const factor = BigInt(whole + fraction.padEnd(4, "0"));
  if (!factor) return null;
  const scaled = (paise * 1_000_000n + factor / 2n) / factor;
  if (!scaled) return null;
  const tail = (scaled % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return (scaled / 10000n).toString() + (tail ? "." + tail : "");
}

export function validPlotTokens(value: string): boolean {
  return /^(0|[1-9]\d{0,16})(\.\d{0,3}[1-9])?$/.test(value) && value !== "0";
}

/** Display token shares to four decimal places (half up), using token units throughout. */
export function tokensForPercent(tokens: string, units: bigint): string {
  const [whole, fraction = ""] = tokens.split(".");
  const basis = BigInt(whole + fraction.padEnd(4, "0"));
  const product = basis * units;
  const magnitude = product < 0n ? -product : product;
  const rounded = (magnitude + TOTAL_UNITS / 2n) / TOTAL_UNITS;
  const decimals = (rounded % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return (product < 0n && rounded ? "-" : "") + (rounded / 10000n).toString() + (decimals ? "." + decimals : "");
}

/** Rupee equivalent of a percentage of `dealPaise`, to the nearest paisa (half up). */
export function rupeesOf(dealPaise: bigint, units: bigint): bigint {
  const negative = units < 0n;
  const u = negative ? -units : units;
  const paise = (dealPaise * u * 2n + TOTAL_UNITS) / (TOTAL_UNITS * 2n);
  return negative ? -paise : paise;
}

/** 1850000n → "₹18,500.00" (Indian grouping). */
export function formatPaise(paise: bigint): string {
  const negative = paise < 0n;
  const p = negative ? -paise : paise;
  const rupees = (p / 100n).toString().replace(/(\d)(?=(\d\d)+\d$)/g, "$1,");
  return `${negative ? "-" : ""}₹${rupees}.${(p % 100n).toString().padStart(2, "0")}`;
}

/* --------------------------------------------------- payment → percentage */

export type Conversion =
  | { ok: true; deltaUnits: bigint; exact: boolean }
  | { ok: false; needsCumulative?: true; reason: string };

/**
 * Revised brief §6.1. The new credit is the standalone conversion when that is
 * exact at eight places. When it is not, the cumulative verified receipts from
 * official accounts set the target instead, so rounding never piles up:
 * target = floor(cumulative × 100 / deal), delta = target − current. Floored,
 * so a near-threshold payment never reads as reaching 25 / 50 / 100%.
 */
export function convertPayment(args: {
  dealPaise: bigint;
  paymentPaise: bigint;
  cumulativePaise?: bigint | null;
  currentUnits: bigint;
}): Conversion {
  const { dealPaise, paymentPaise, currentUnits } = args;
  if (dealPaise <= 0n) return { ok: false, reason: "Enter the deal value first." };
  if (paymentPaise <= 0n) return { ok: false, reason: "The payment must be more than zero." };

  const scaled = paymentPaise * TOTAL_UNITS;
  const standalone = scaled / dealPaise;
  const exact = scaled % dealPaise === 0n;

  let delta = standalone;
  if (args.cumulativePaise != null) {
    const cumulative = args.cumulativePaise;
    if (cumulative < paymentPaise) {
      return { ok: false, reason: "Total paid till now can't be less than this payment." };
    }
    delta = (cumulative * TOTAL_UNITS) / dealPaise - currentUnits;
    // Earlier payments' rounding: one unit at eight places, or one 0.0001 step
    // for a payment saved before the owner review, when progress kept four.
    const gap = delta - standalone;
    if (gap > LEGACY_STEP || gap < -LEGACY_STEP) {
      return {
        ok: false,
        reason:
          "The total from the accounts doesn't match the % already saved at this price. " +
          "Please check the price and the earlier payments with the accounts team before saving.",
      };
    }
  } else if (!exact) {
    return {
      ok: false,
      needsCumulative: true,
      reason:
        "This payment doesn't give an exact %. Please also type the total paid till now (from the accounts) " +
        "so the % stays correct.",
    };
  }

  if (delta <= 0n) {
    return {
      ok: false,
      reason: "This payment is too small to show as a % of this price. Please check it with the accounts team.",
    };
  }
  if (currentUnits + delta > TOTAL_UNITS) {
    return {
      ok: false,
      reason:
        `This is more than the balance left (${pct(TOTAL_UNITS - currentUnits)}). Nothing will be saved — ` +
        "please check the extra amount with the accounts team.",
    };
  }
  return { ok: true, deltaUnits: delta, exact };
}

/* -------------------------------------------------------------- instalments */

export type InstalmentIn = { seq: number; scheduled: string; received: string; dueDate: string | Date };

export type PaymentState = "UNPAID" | "PARTIAL" | "COMPLETE";
export type DueState = "UPCOMING" | "DUE_TODAY" | "OVERDUE";

/** Every figure is a percentage of the whole Booking, in units. */
export type InstalmentRow = {
  seq: number;
  dueDay: string;
  target: bigint;
  received: bigint;
  pending: bigint;
  payment: PaymentState;
  /** Null once complete: a paid instalment is never "overdue". */
  due: DueState | null;
};

/**
 * Payment state and due state, kept apart (revised brief §6.2). Dates compare
 * as Asia/Kolkata calendar days: overdue strictly after the due day, due today on it.
 */
export function instalmentRows(instalments: readonly InstalmentIn[], now: Date = new Date()): InstalmentRow[] {
  const today = istDay(now);
  return [...instalments]
    .sort((a, b) => a.seq - b.seq)
    .map((i) => {
      const target = unitsOf(i.scheduled);
      const received = unitsOf(i.received);
      const pending = target > received ? target - received : 0n;
      const dueDay = istDay(i.dueDate);
      const payment: PaymentState = pending === 0n ? "COMPLETE" : received > 0n ? "PARTIAL" : "UNPAID";
      const due: DueState | null =
        payment === "COMPLETE" ? null : dueDay < today ? "OVERDUE" : dueDay === today ? "DUE_TODAY" : "UPCOMING";
      return { seq: i.seq, dueDay, target, received, pending, payment, due };
    });
}

export type PaymentSummary = {
  received: bigint;
  outstanding: bigint;
  overdue: bigint;
  dueToday: bigint;
  /** The first instalment not yet complete, or null when all are. */
  current: InstalmentRow | null;
};

/** `receivedTotal` is the Booking's own verified total — never re-added from rows. */
export function paymentSummary(rows: readonly InstalmentRow[], receivedTotal: string): PaymentSummary {
  const received = unitsOf(receivedTotal);
  const sum = (state: DueState) => rows.filter((r) => r.due === state).reduce((s, r) => s + r.pending, 0n);
  return {
    received,
    outstanding: TOTAL_UNITS - received,
    overdue: sum("OVERDUE"),
    dueToday: sum("DUE_TODAY"),
    current: rows.find((r) => r.payment !== "COMPLETE") ?? null,
  };
}

export type NextAction = { tone: "done" | "wait" | "urgent" | "normal"; text: string };

/**
 * The one thing staff should do next on a Booking's collection, in plain words
 * (audit point 5). Order matters: a finished or stopped Booking first, then a
 * claim MD must verify, then money already overdue, then today, then the next
 * due date. `promisedOn` and `today` are Asia/Kolkata days (YYYY-MM-DD).
 */
export function nextAction(args: {
  status: string;
  summary: PaymentSummary;
  hasPlan: boolean;
  claimsWaiting: number;
  promisedOn?: string | null;
  today: string;
}): NextAction {
  const { summary } = args;
  const cur = summary.current;
  const day = (d: string) => d.split("-").reverse().join("/");
  if (args.status === "PAYMENT_COMPLETED" || summary.outstanding <= 0n) {
    return { tone: "done", text: "Nothing to do — this booking is fully paid." };
  }
  if (args.status !== "BOOKED") return { tone: "done", text: "Nothing to collect — this booking is not active." };
  if (!args.hasPlan || !cur) return { tone: "normal", text: "No payment plan yet — ask MD to set it up." };
  if (args.claimsWaiting > 0) {
    return { tone: "wait", text: "The customer says they paid. Wait — MD is checking it with the bank." };
  }
  if (summary.overdue > 0n) {
    if (args.promisedOn && args.promisedOn >= args.today) {
      return { tone: "normal", text: `Customer promised to pay by ${day(args.promisedOn)}. Call again on that day if nothing comes.` };
    }
    return { tone: "urgent", text: `Call the customer — ${duePct(summary.overdue)} is late. Ask them to pay instalment ${cur.seq}. If they ask the rupee amount, ask MD.` };
  }
  if (summary.dueToday > 0n) return { tone: "urgent", text: `Call the customer — ${duePct(summary.dueToday)} is due today (instalment ${cur.seq}).` };
  return { tone: "normal", text: `Remind the customer: ${duePct(cur.pending)} of instalment ${cur.seq} is due on ${day(cur.dueDay)}.` };
}

/**
 * Revised brief §6.3 — verified progress with no individual payment behind it
 * (a Change Plot carries the applied percentage across; an old Booking may hold
 * only its total). Shown as a labelled opening balance, never as invented entries.
 */
export function openingBalance(receivedTotal: string, confirmedEntries: readonly string[]): bigint {
  return unitsOf(receivedTotal) - confirmedEntries.reduce((s, p) => s + unitsOf(p), 0n);
}

/** Where a new credit lands: the oldest unpaid instalment first, as allocatePayment does. */
export function allocateUnits(rows: readonly InstalmentRow[], units: bigint): { seq: number; units: bigint }[] {
  let left = units;
  const out: { seq: number; units: bigint }[] = [];
  for (const r of rows) {
    if (left <= 0n) break;
    if (r.pending <= 0n) continue;
    const take = r.pending < left ? r.pending : left;
    out.push({ seq: r.seq, units: take });
    left -= take;
  }
  return out;
}

/** Independent reference issued by the private accounts workbook. */
export function receiptTrackingId(text: string): boolean {
  return /^PV-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

export const PAYMENT_DECISION_REASONS = ["Receipt not verified", "Wrong booking", "Duplicate receipt", "Bank returned the payment", "Correction needed"] as const;
export const LEGACY_PAYMENT_REASON = "Reconcile in the private accounts ledger";

export function privateReceiptEvent(action: string): boolean {
  return paymentTrialEnabled() && /^(PAYMENT_RECEIVED|PAYMENT_CLAIM|PAYMENT_APPROVAL)/.test(action);
}

export function shownReceiptEventReason(action: string, reason: string | null): string | null {
  if (!privateReceiptEvent(action)) return reason;
  return PAYMENT_DECISION_REASONS.some((item) => item === reason) || reason === LEGACY_PAYMENT_REASON ? reason : null;
}

/** Existing bank references remain in the ledger for reconciliation. */
export function shownReceiptTrackingId(reference: string | null | undefined, id: string): string {
  return reference && receiptTrackingId(reference) ? reference : `PV-${id}`;
}

/* --------------------------------------------------- the approval request */

export type ApprovalInput = {
  plotId: string;
  bookingId: string;
  percent: string;
  paidOn: string;
  reference: string;
  expectedReceived: string;
  requestId: string | null;
  idempotencyKey: string;
};

const APPROVAL_FIELDS = ["plotId", "bookingId", "percent", "paidOn", "reference", "expectedReceived", "requestId", "idempotencyKey"];

/**
 * Revised brief §8 — the only shape an approval may take. Any other field (a
 * price, an amount) refuses the whole request; its value is never echoed or logged.
 */
export function readApproval(input: unknown): { ok: true; value: ApprovalInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Nothing was saved: the request was not readable." };
  if (Object.keys(input).some((k) => !APPROVAL_FIELDS.includes(k))) {
    return { ok: false, error: "Nothing was saved: the request carried fields this screen never sends." };
  }
  const v = input as Record<string, unknown>;
  const text = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const value: ApprovalInput = {
    plotId: text("plotId"),
    bookingId: text("bookingId"),
    percent: text("percent"),
    paidOn: text("paidOn"),
    reference: text("reference"),
    expectedReceived: text("expectedReceived"),
    requestId: text("requestId") || null,
    idempotencyKey: text("idempotencyKey"),
  };
  try {
    if (toUnits(value.percent) <= 0n) throw new Error();
    toUnits(value.expectedReceived);
  } catch {
    return { ok: false, error: `Nothing was saved: the percentage must be more than 0 with at most ${PLACES} decimal places.` };
  }
  const paymentDay = new Date(value.paidOn + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.paidOn) || !Number.isFinite(paymentDay.getTime()) || paymentDay.toISOString().slice(0, 10) !== value.paidOn) {
    return { ok: false, error: "Enter a valid payment date." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(value.idempotencyKey)) return { ok: false, error: "Nothing was saved: start the approval again." };
  if (!value.plotId) return { ok: false, error: "Reopen the booking and select the plot again." };
  if (!value.bookingId) return { ok: false, error: "Nothing was saved: choose the Booking again." };
  return { ok: true, value };
}

/* ------------------------------------------------------- free-text guard */

/**
 * Revised brief §8 — notes, reasons and outcomes for this feature carry no
 * rupee amount. Catches the usual ways one is written; a plain reference
 * number (a UTR is all digits) is left alone.
 */
export function monetaryText(text: string): boolean {
  return /₹|\binr\b|\brs\.?\s*\d|\brupees?\b|\d\s*\/-|\d\s*(k|lakhs?|lacs?|crores?|cr)\b|\b(lakhs?|lacs?|crores?)\b|\b\d{1,3}(,\d{2})*,\d{3}\b/i.test(
    text
  );
}

export const MONETARY_TEXT_REFUSAL =
  "Please don't write any rupee amount. Write only the date, how they paid and the reference — MD checks the amount.";

/** The calculator, claims and their actions exist only where the trial flag is on. */
export function paymentTrialEnabled(): boolean {
  return process.env.PERCENTAGE_PAYMENT_TRIAL_ENABLED === "true";
}

/**
 * Payment Received as the staff screens show it (server only — reads the flag):
 * two places in the trial (paid rounds down, left rounds up), as stored otherwise.
 */
export function shownPaid(stored: string): { paid: string; left: string } {
  if (paymentTrialEnabled()) {
    const units = unitsOf(stored);
    return { paid: paidPct(units), left: duePct(TOTAL_UNITS - units) };
  }
  return { paid: `${stored}%`, left: `${Number(remainingPercent(stored))}%` };
}
