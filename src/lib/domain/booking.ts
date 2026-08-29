// Booking Requests, ownership shares and Payment Received rules.
// PRD.md §9–§12, §24; DESIGN.md §10, §11; ARCHITECTURE.md §6.
// Exact decimal arithmetic only (ARCHITECTURE §3.4) — no binary float ever
// touches a 100% schedule check, a share total or payment progress.

import { Prisma } from "@prisma/client";
import { istDay } from "../tasks.ts";

const D = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const HUNDRED = new D(100);

/** Anything the exact-decimal helpers accept — a Prisma Decimal included. */
export type Numeric = string | number | Decimal;

/** A blocked action carries the reason the UI shows verbatim (DESIGN §5.4). */
export type Check = { ok: true } | { ok: false; reason: string };

const OK: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/* ------------------------------------------------------- payment schedule */

export type ScheduleLine = {
  seq: number;
  scheduledPercent: Numeric;
  dueDate: Date;
  /** Locked once above zero — a revision may not touch it (PRD §10.2). */
  receivedPercent?: Numeric | null;
};

const received = (line: ScheduleLine) => new D(line.receivedPercent ?? 0);
const scheduled = (line: ScheduleLine) => new D(line.scheduledPercent);
const bySeq = (lines: readonly ScheduleLine[]) => [...lines].sort((a, b) => a.seq - b.seq);

export function scheduleTotal(lines: readonly ScheduleLine[]): Decimal {
  return lines.reduce((sum, line) => sum.add(scheduled(line)), new D(0));
}

/**
 * PRD §11.4 — percentage only, totalling exactly 100%, due dates chronological
 * and never before the Booking Date.
 */
export function validateSchedule(lines: readonly ScheduleLine[], bookingDate: Date): Check {
  if (lines.length === 0) return fail("A payment schedule needs at least one instalment.");

  const seen = new Set<number>();
  let previousDue: Date | null = null;

  for (const line of bySeq(lines)) {
    if (seen.has(line.seq)) return fail(`Instalment ${line.seq} appears twice in the schedule.`);
    seen.add(line.seq);

    if (scheduled(line).lte(0)) return fail(`Instalment ${line.seq} must be greater than 0%.`);
    if (received(line).gt(scheduled(line))) {
      return fail(`Instalment ${line.seq} is credited beyond the percentage it schedules.`);
    }
    if (istDay(line.dueDate) < istDay(bookingDate)) {
      return fail(`Instalment ${line.seq} is due before the Booking Date.`);
    }
    if (previousDue && istDay(line.dueDate) <= istDay(previousDue)) {
      return fail(`Instalment ${line.seq} is due on or before the previous instalment. Due dates stay chronological.`);
    }
    previousDue = line.dueDate;
  }

  const total = scheduleTotal(lines);
  if (!total.eq(HUNDRED)) {
    return fail(`A payment schedule must total exactly 100%, found ${total.toFixed(4)}%.`);
  }
  return OK;
}

/**
 * PRD §10.2 — CRM may split, combine or move the unpaid percentage. Anything
 * already received is locked, and already received + revised unpaid must still
 * total exactly 100%.
 */
export function validateScheduleRevision(
  current: readonly ScheduleLine[],
  proposed: readonly ScheduleLine[],
  bookingDate: Date
): Check {
  const base = validateSchedule(proposed, bookingDate);
  if (!base.ok) return base;

  // What is locked is the received amount, not the whole instalment: the unpaid
  // remainder sitting inside a part-received instalment is exactly what CRM may
  // split, combine or move. `validateSchedule` already refuses to schedule less
  // than an instalment has received.
  let alreadyReceived = new D(0);
  for (const line of current) {
    const got = received(line);
    alreadyReceived = alreadyReceived.add(got);
    if (got.lte(0)) continue;

    const match = proposed.find((p) => p.seq === line.seq);
    if (!match) {
      return fail(`Instalment ${line.seq} already carries a received portion and cannot be removed.`);
    }
    if (!received(match).eq(got)) {
      return fail(`Instalment ${line.seq} carries a received portion that must be preserved.`);
    }
  }

  const carried = proposed.reduce((sum, line) => sum.add(received(line)), new D(0));
  if (!carried.eq(alreadyReceived)) {
    return fail(`The revision must preserve the ${alreadyReceived.toFixed(2)}% already received.`);
  }
  return OK;
}

/**
 * PRD §10.1 — the only visible instalment statuses. Received means Remaining is
 * zero; Overdue starts the day after the due date. There is no separate
 * Partially Received status.
 */
export type InstalmentStatus = "UPCOMING" | "RECEIVED" | "OVERDUE";

export function instalmentStatus(line: ScheduleLine, now: Date = new Date()): InstalmentStatus {
  if (scheduled(line).sub(received(line)).lte(0)) return "RECEIVED";
  return istDay(now) > istDay(line.dueDate) ? "OVERDUE" : "UPCOMING";
}

/* ------------------------------------------------------ payment allocation */

export type Allocation = { seq: number; percent: string };

/**
 * PRD §12.1, §12.2 — Payment Received This Time is incremental and fills the
 * oldest unpaid instalment first. A payment that outruns the schedule would put
 * progress above 100%, which the CRM never records (PRD §10.4).
 */
export function allocatePayment(
  lines: readonly ScheduleLine[],
  percent: Numeric
): { allocations: Allocation[] } {
  let left = new D(percent);
  if (left.lte(0)) throw new Error("Payment Received This Time must be greater than 0%.");

  const allocations: Allocation[] = [];
  for (const line of bySeq(lines)) {
    if (left.lte(0)) break;
    const remaining = scheduled(line).sub(received(line));
    if (remaining.lte(0)) continue;

    const take = remaining.lt(left) ? remaining : left;
    allocations.push({ seq: line.seq, percent: take.toFixed(4) });
    left = left.sub(take);
  }

  if (left.gt(0)) {
    throw new Error(
      `This payment exceeds the outstanding schedule by ${left.toFixed(4)}%. Payment Received ` +
        `progress cannot go above 100%, and the CRM records no Excess Receipt entry. ` +
        `Any surplus stays an external accounting matter.`
    );
  }
  return { allocations };
}

/** PRD §10.4 — cumulative progress can never exceed 100%. */
export function progressAfter(current: Numeric, delta: Numeric): Decimal {
  const next = new D(current).add(new D(delta));
  if (next.gt(HUNDRED)) {
    throw new Error(`Payment Received progress cannot go above 100%, this would reach ${next.toFixed(4)}%.`);
  }
  if (next.lt(0)) throw new Error("Payment Received progress cannot go below 0%.");
  return next;
}

export function isPaymentComplete(progress: Numeric): boolean {
  return new D(progress).eq(HUNDRED);
}

/* --------------------------------------------------------- ownership shares */

export type SharedParty = { personId: string; sharePercent?: Numeric | null };

/**
 * PRD §12.1 — one Primary Customer is required. A single buyer may omit the
 * share and is treated as 100%; with two or more buyers every share is
 * compulsory and the total is exactly 100%.
 */
export function validateShares(parties: readonly SharedParty[]): Check {
  if (parties.length === 0) return fail("One Primary Customer is required.");

  if (parties.length === 1) {
    const only = parties[0].sharePercent;
    if (only === null || only === undefined) return OK;
    return new D(only).eq(HUNDRED)
      ? OK
      : fail("A single buyer holds 100%. Leave the share blank or enter exactly 100%.");
  }

  const missing = parties.filter((p) => p.sharePercent === null || p.sharePercent === undefined);
  if (missing.length > 0) {
    return fail("Every buyer needs an ownership share when two or more buyers are on the Booking.");
  }

  const total = parties.reduce((sum, p) => sum.add(new D(p.sharePercent!)), new D(0));
  if (!total.eq(HUNDRED)) {
    return fail(`Ownership shares must total exactly 100%, found ${total.toFixed(4)}%.`);
  }
  return OK;
}

/* ------------------------------------------------------------ Accounts decision */

export type BookingRejectReason =
  | "PAYMENT_SCHEDULE_INCORRECT"
  | "INCOMPLETE_DETAILS"
  | "PAYMENT_NOT_RECEIVED"
  | "OTHER";

/**
 * PRD §9.4 — Accounts may approve at 0%, so Payment Not Received is not valid
 * merely because payment is zero. It applies only where the request claimed a
 * payment Accounts could not verify.
 */
export function validateRejectReason(
  reason: BookingRejectReason,
  requestClaimedPayment: boolean
): Check {
  if (reason === "PAYMENT_NOT_RECEIVED" && !requestClaimedPayment) {
    return fail(
      "Payment Not Received applies only where the request claimed a payment that could not be " +
        "verified. Accounts may approve at 0% Payment Received — use Incomplete Details or Other."
    );
  }
  return OK;
}

/* ----------------------------------------------------------- date validation */

/** PRD §10.5 — operator-entered action dates are never in the future. */
export function notFutureDated(label: string, at: Date, now: Date = new Date()): Check {
  return istDay(at) > istDay(now) ? fail(`${label} cannot be a future date.`) : OK;
}

/** PRD §11.4 — a backdated Booking Date is allowed, but never without a reason. */
export function validateBookingDate(
  bookingDate: Date,
  reason: string | null | undefined,
  now: Date = new Date()
): Check {
  const future = notFutureDated("Booking Date", bookingDate, now);
  if (!future.ok) return future;
  if (istDay(bookingDate) < istDay(now) && !reason?.trim()) {
    return fail("A backdated Booking Date requires a compulsory reason.");
  }
  return OK;
}

/* ------------------------------------------------------- external reference */

/**
 * PRD §10.3 — normalised for spaces and case before the duplicate check, so
 * "utr 4471" and "UTR4471" are the same reference. One active value is globally
 * unique across Payment Received and Payment Given.
 */
export function normaliseReference(raw: string): string {
  const key = raw.replace(/\s+/g, "").toUpperCase();
  if (!key) throw new Error("Payment Reference No. is required.");
  return key;
}

/* ----------------------------------------------------------- state machine */

export type BookingStatus =
  | "REQUEST_PENDING"
  | "REQUEST_REJECTED"
  | "REQUEST_CANCELLED"
  | "BOOKED"
  | "PAYMENT_COMPLETED"
  | "REFUND_PENDING"
  | "CANCELLED"
  | "DELIVERED"
  | "BUYBACK_COMPLETED";

/**
 * ARCHITECTURE §3.3 — every state change goes through this transition table,
 * never through a direct status edit.
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  REQUEST_PENDING: ["BOOKED", "REQUEST_REJECTED", "REQUEST_CANCELLED"],
  REQUEST_REJECTED: [],
  REQUEST_CANCELLED: [],
  // A reversal below 100% returns Payment Completed to Booked (PRD §12.7).
  // An approved Buyback closes the old sale from any live stage, including
  // Delivered — main-PRD §17.2 lists papers-legally-transferred as a Buyback
  // stage, and §17.9 makes the old Booking closed history.
  BOOKED: ["PAYMENT_COMPLETED", "REFUND_PENDING", "BUYBACK_COMPLETED"],
  PAYMENT_COMPLETED: ["BOOKED", "REFUND_PENDING", "DELIVERED", "BUYBACK_COMPLETED"],
  // Accounts rejection restores the exact previous state (PRD §15.4).
  REFUND_PENDING: ["CANCELLED", "BOOKED", "PAYMENT_COMPLETED"],
  CANCELLED: [],
  DELIVERED: ["BUYBACK_COMPLETED"],
  BUYBACK_COMPLETED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): Check {
  if (TRANSITIONS[from].includes(to)) return OK;
  return fail(`A Booking cannot move from ${label(from)} to ${label(to)}.`);
}

/** True while the Booking still holds its Plot as an active allocation. */
export function holdsAllocation(status: BookingStatus): boolean {
  // main-PRD §17.9 — an approved Buyback removes the previous Customer from the
  // active allocation, which is what frees the Plot for resale.
  return !["REQUEST_REJECTED", "REQUEST_CANCELLED", "CANCELLED", "BUYBACK_COMPLETED"].includes(
    status
  );
}

export type BookingProcess =
  | "NONE"
  | "REFUND_PENDING"
  | "CHANGE_PLOT_PENDING"
  | "BUYBACK_PENDING"
  | "PRIMARY_CUSTOMER_CHANGE_UNDER_REVIEW"
  | "SOLD_BY_CORRECTION_UNDER_REVIEW"
  | "MANAGEMENT_ACTION_REQUIRED";

/**
 * ARCHITECTURE §6.3 — only one major conflicting process may be active for a
 * Booking. The server rejects the transition even when the UI hid the button.
 */
export function assertProcessFree(active: BookingProcess, action: string): Check {
  if (active === "NONE") return OK;
  return fail(
    `${action} is blocked because this Booking is already under ${label(active)}. ` +
      `Complete or withdraw that process first.`
  );
}

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/* ----------------------------------------------------------- Hold freezing */

/**
 * PRD §10.5 — submitting a Booking Request freezes the remaining Hold time.
 * Accounts rejection restores exactly that remainder; approval ends the Hold.
 */
export function freezeHold(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

export function restoreHold(remainingMs: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + Math.max(0, remainingMs));
}

/* ---------------------------------------------------------- review snapshot */

/** PRD §9.1 — the fields frozen at submission. Changing any needs a new version. */
export const FROZEN_REVIEW_FIELDS = [
  "parties",
  "projectId",
  "plotId",
  "plcSnapshot",
  "soldByType",
  "soldByPersonId",
  "bookingDate",
  "customerType",
  "schedule",
  "remark",
] as const;

/**
 * Canonical, key-ordered payload so two identical submissions produce byte
 * identical snapshots — audit diffs and idempotency hashes stay comparable.
 */
export function canonicalSnapshot(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalSnapshot);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, canonicalSnapshot(v)])
    );
  }
  return value;
}

export function snapshotChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(canonicalSnapshot(previous)) !== JSON.stringify(canonicalSnapshot(next));
}
