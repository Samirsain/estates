// Holds and Member Hold Requests.
// prd-corrections.md §8; design.md §9. All times are Asia/Kolkata.

import { istDay, istInstant } from "../tasks.ts";

/** DESIGN §9.1 — expiry is system-calculated at 72 hours. */
export const HOLD_HOURS = 72;

export function holdExpiry(startsAt: Date): Date {
  return new Date(startsAt.getTime() + HOLD_HOURS * 3_600_000);
}

export function isHoldExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/* No limit on how many Plots one Customer holds, asks for or books: the
   three-open-position rule and its MD exception are gone (owner, 24 Nov 2026,
   CR-032). Each Plot is still protected on its own — canAllocate, the Plot
   lock and one_active_booking_per_plot. */

/* ---------------------------------------------------------- extensions */

/** PRD §8.5 — first extension is CRM's; any further extension needs MD. */
export function extensionRequiresMd(extensionCount: number): boolean {
  return extensionCount >= 1;
}

/** Owner 2 Nov — an extension is asked for in whole days, 1 to 7. Stored as hours. */
export const MAX_EXTENSION_DAYS = 7;

export function isValidExtensionHours(hours: number): boolean {
  return Number.isInteger(hours) && hours % 24 === 0 && hours >= 24 && hours <= MAX_EXTENSION_DAYS * 24;
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
