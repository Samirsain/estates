// Holds, Member Hold Requests and the three-open-position limit.
// PRD.md §8; DESIGN.md §9. All times are Asia/Kolkata.

import { istDay, istInstant } from "../tasks.ts";

/** DESIGN §9.1 — expiry is system-calculated at 72 hours. */
export const HOLD_HOURS = 72;

export function holdExpiry(startsAt: Date): Date {
  return new Date(startsAt.getTime() + HOLD_HOURS * 3_600_000);
}

export function isHoldExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/* ------------------------------------------------- three open positions */

export const MAX_OPEN_POSITIONS = 3;

export type OpenPositions = {
  activeHolds: number;
  waitingBookingApproval: number;
  pendingHoldRequests: number;
};

/**
 * PRD §8.2 — maximum three open Plot positions per actual Person across all
 * Projects. Expired requests stop counting (PRD §8.4).
 */
export function openPositionCount(positions: OpenPositions): number {
  return positions.activeHolds + positions.waitingBookingApproval + positions.pendingHoldRequests;
}

export type PositionCheck = { ok: true } | { ok: false; reason: string };

export function checkOpenPositions(positions: OpenPositions): PositionCheck {
  const count = openPositionCount(positions);
  if (count < MAX_OPEN_POSITIONS) return { ok: true };
  return {
    ok: false,
    // DESIGN §5.4 — say what is blocked, why, and who can resolve it.
    reason:
      `Booking cannot proceed because the Customer already has ${count} open Plot positions ` +
      `(${positions.activeHolds} Hold, ${positions.waitingBookingApproval} Waiting for Booking Approval, ` +
      `${positions.pendingHoldRequests} Pending Hold Request). Review existing Holds/Requests or ` +
      `request an Admin/MD exception.`,
  };
}

/* ---------------------------------------------------------- extensions */

/** PRD §8.5 — first extension is CRM's; any further extension needs Admin. */
export function extensionRequiresAdmin(extensionCount: number): boolean {
  return extensionCount >= 1;
}

export type ExtensionDecision =
  | { outcome: "APPROVED"; newExpiresAt: Date }
  | { outcome: "REJECTED" }
  /** The Hold expired first — the old request can never revive it. */
  | { outcome: "EXPIRED"; reason: string };

/**
 * Submitting an extension request does not pause the Hold timer (PRD §8.5),
 * so the decision is evaluated against the live expiry.
 */
export function decideExtension(
  approve: boolean,
  currentExpiresAt: Date,
  requestedHours: number,
  now: Date = new Date()
): ExtensionDecision {
  if (isHoldExpired(currentExpiresAt, now)) {
    return {
      outcome: "EXPIRED",
      reason:
        "The Hold expired before this extension was decided. The request closes as Expired — " +
        "a new Hold is required.",
    };
  }
  if (!approve) return { outcome: "REJECTED" };
  if (requestedHours <= 0) throw new Error("Extension hours must be greater than zero.");
  return {
    outcome: "APPROVED",
    newExpiresAt: new Date(currentExpiresAt.getTime() + requestedHours * 3_600_000),
  };
}

/* ------------------------------------------ Member Hold Request expiry */

export type WorkingCalendar = {
  /** IST hour after which a request rolls to the next working day. */
  cutOffHour: number;
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: number[];
  /** IST calendar days (YYYY-MM-DD) that are not working days. */
  holidays: string[];
};

/**
 * Configured calendar (PRD §8.4 calls the cut-off "configured"). Defaults are
 * settings, not business rules — change them in one place when Admin confirms.
 */
export const DEFAULT_CALENDAR: WorkingCalendar = {
  cutOffHour: 17,
  weeklyOffDays: [0],
  holidays: [],
};

function istHour(at: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(at)
  );
}

function istWeekday(day: string): number {
  // day is an IST calendar date; midday UTC keeps it on the same date.
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function isWorkingDay(day: string, calendar: WorkingCalendar = DEFAULT_CALENDAR): boolean {
  return !calendar.weeklyOffDays.includes(istWeekday(day)) && !calendar.holidays.includes(day);
}

function nextWorkingDay(day: string, calendar: WorkingCalendar): string {
  let candidate = day;
  for (let i = 0; i < 30; i++) {
    candidate = new Date(Date.parse(`${candidate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    if (isWorkingDay(candidate, calendar)) return candidate;
  }
  throw new Error("No working day found within 30 days — check the holiday calendar.");
}

/**
 * PRD §8.4 — a Pending Member Hold Request expires at the end of the working
 * day when created before the cut-off, and at the end of the next working day
 * when created after it. "End of day" is 23:59 IST of that working day.
 */
export function holdRequestExpiry(
  createdAt: Date,
  calendar: WorkingCalendar = DEFAULT_CALENDAR
): Date {
  const createdDay = istDay(createdAt);
  let day = isWorkingDay(createdDay, calendar) ? createdDay : nextWorkingDay(createdDay, calendar);

  if (day === createdDay && istHour(createdAt) >= calendar.cutOffHour) {
    day = nextWorkingDay(day, calendar);
  }
  return new Date(istInstant(day, "23:59"));
}
