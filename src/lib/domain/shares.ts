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

/** The running total, rounded the way a percentage field is read. */
export const shareSum = (rows: readonly ShareRow[]): number =>
  round2(rows.reduce((sum, r) => sum + (Number(r.sharePercent) || 0), 0));

/** What one row may still take — the other rows' shares subtracted from 100. */
export const shareRoom = (rows: readonly ShareRow[], index: number): number =>
  Math.max(round2(100 - shareSum(rows.filter((_, i) => i !== index))), 0);

/**
 * A typed share, capped at what the other buyers have left: typing 80 where 60
 * is already spoken for lands on 40, not on a 140% form. Blank stays blank —
 * a sole buyer leaves the field empty and is treated as 100%.
 */
export function capShare(rows: readonly ShareRow[], index: number, typed: string): string {
  if (typed.trim() === "") return "";
  const value = Number(typed);
  if (!Number.isFinite(value)) return "";
  return String(Math.max(0, Math.min(value, shareRoom(rows, index))));
}
