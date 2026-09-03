// Ownership shares as a form has to handle them, while they are still strings
// in inputs and not yet the exact decimals `validateShares` and
// `validateFinalBuyers` judge them by.
//
// Those two remain the authority: nothing here decides whether a Booking is
// valid. This only stops a form from building a total the server would refuse
// after every other field had already been filled in — and keeps the running
// total off the float noise that prints 100 as 99.99999999999999.
//
// Plain numbers rather than Decimal on purpose: this is what a percentage
// input can hold, and it must not drag Prisma into the client bundle.

export type ShareRow = { sharePercent: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/*
 * A column of percentage inputs that has to add up to 100 — ownership shares,
 * a payment schedule — behaves the same way whatever the rows are called, so
 * the rule lives once here on the plain strings and the named helpers below
 * are the shapes that read them.
 */

/** The running total, rounded the way a percentage field is read. */
export const percentSum = (values: readonly string[]): number =>
  round2(values.reduce((sum, v) => sum + (Number(v) || 0), 0));

/** What one field may still take — the others subtracted from 100. */
export const percentRoom = (values: readonly string[], index: number): number =>
  Math.max(round2(100 - percentSum(values.filter((_, i) => i !== index))), 0);

/**
 * A typed percentage, capped at what the other fields have left: typing 80
 * where 60 is already spoken for lands on 40, not on a 140% form. Blank stays
 * blank — a sole buyer leaves the share empty and is treated as 100%.
 */
export function capPercent(values: readonly string[], index: number, typed: string): string {
  if (typed.trim() === "") return "";
  const value = Number(typed);
  if (!Number.isFinite(value)) return "";
  return String(Math.max(0, Math.min(value, percentRoom(values, index))));
}

const shares = (rows: readonly ShareRow[]) => rows.map((r) => r.sharePercent);

export const shareSum = (rows: readonly ShareRow[]): number => percentSum(shares(rows));

export const shareRoom = (rows: readonly ShareRow[], index: number): number =>
  percentRoom(shares(rows), index);

export const capShare = (rows: readonly ShareRow[], index: number, typed: string): string =>
  capPercent(shares(rows), index, typed);
