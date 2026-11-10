// How a Payment Schedule behaves while it is being typed — shared by the
// Booking editor and the Acquisition one, which had a copy of each rule.
//
// PRD §11 — a schedule is percentages that total 100 and dates that only move
// forward. The rules here keep both true *as the person types*, so a schedule
// the server would refuse is never on screen in the first place. The running
// total comes from shares.ts, which is where a column of percentage inputs is
// already added up without float noise.

// Four places, as stored (Decimal(7,4)): two rounded a received 33.3333 to 33.33.
import { percentSum, round4 } from "./shares";

export type ScheduleRow = { seq: number; percent: string; dueDate: string };

const value = (percent: string) => Math.max(0, Number(percent) || 0);

export const scheduleTotal = (rows: readonly ScheduleRow[]) =>
  percentSum(rows.map((r) => r.percent));

/**
 * 100 is a ceiling, not a warning. A row takes at most what the rows above it
 * leave, so a first instalment of 100 leaves the second nothing to take: typing
 * 50 into it lands as 0. The rows above rather than every other row, because
 * the last row is the balancer below and would otherwise cap the row being
 * typed against a number it is about to give up. What was typed is kept exactly
 * as typed whenever it fits — the string is rewritten only when it would break
 * the 100.
 */
function capToHundred<T extends ScheduleRow>(rows: T[]): T[] {
  let used = 0;
  return rows.map((row) => {
    const typed = value(row.percent);
    const headroom = round4(Math.max(0, 100 - used));
    used = round4(used + Math.min(typed, headroom));
    return typed <= headroom ? row : { ...row, percent: String(headroom) };
  });
}

/**
 * The percentages fill forward. Every row keeps what was typed, and the last
 * row carries whatever is left of the 100 — type 30 into the first and the
 * second reads 70 on its own. Type into the last row as well and the shortfall
 * shows as Remaining, which the next instalment added picks up.
 */
export function fillForward<T extends ScheduleRow>(rows: T[], typedIndex = -1): T[] {
  const out = capToHundred(rows.map((r, i) => ({ ...r, seq: i + 1 })));
  const last = out.length - 1;
  if (last < 1 || typedIndex === last) return out;
  const others = out.reduce((sum, r, i) => (i === last ? sum : sum + value(r.percent)), 0);
  out[last] = { ...out[last], percent: String(Math.max(0, round4(100 - others))) };
  return out;
}

/**
 * Removing an instalment gives its percentage to the row above it, rather than
 * leaving a hole for someone to notice and close by hand. The first row has no
 * row above, so its share goes to the row that takes its place.
 *
 * A row that cannot take more — on Revise, a fully received instalment, shown
 * as text — is passed over for the nearest row above that can, else below.
 * If none can, the share is left for the Short-by total to show.
 */
export function removeRow<T extends ScheduleRow>(
  rows: T[],
  index: number,
  canTake: (row: T) => boolean = () => true
): T[] {
  const freed = value(rows[index]?.percent ?? "0");
  const out = rows.filter((_, i) => i !== index);
  const above = out.slice(0, index).findLastIndex(canTake);
  const below = out.findIndex((row, i) => i >= index && canTake(row));
  const target = above >= 0 ? above : below;
  if (target < 0) return out.map((r, i) => ({ ...r, seq: i + 1 }));
  out[target] = { ...out[target], percent: String(round4(value(out[target].percent) + freed)) };
  return fillForward(out, target);
}

/** YYYY-MM-DD plus N calendar days — done in UTC so it never drifts across a DST edge. */
export function addDays(date: string, days: number): string {
  // A cleared date field is "": toISOString of an Invalid Date threw and took
  // the whole schedule editor down. Nothing to add to is nothing back.
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

/**
 * Due dates fill forward too (PRD §11.4 — chronological, never before the one
 * before it): editing an earlier row so it lands after a later one carries that
 * later row's date up to match, rather than leaving the schedule invalid for a
 * validation message to catch later.
 */
export function fillDatesForward<T extends ScheduleRow>(rows: T[], changedIndex: number): T[] {
  const out = rows.map((r) => ({ ...r }));
  for (let i = changedIndex + 1; i < out.length; i++) {
    if (out[i - 1].dueDate && out[i].dueDate <= out[i - 1].dueDate) {
      out[i] = { ...out[i], dueDate: addDays(out[i - 1].dueDate, 1) };
    }
  }
  return out;
}
