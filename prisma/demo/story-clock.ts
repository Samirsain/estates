// The demo's story clock — docs/superpowers/specs/2026-10-14-demo-dataset-design.md §4.
//
// While `at(db, day, work)` runs, `new Date()` and `Date.now()` read the story
// date (advancing with real time), so the services compute "now" — a Hold's
// expiry, a task's due date, the Booking date — in story time. The database
// stamps its own defaults with the real time; when the step ends, one DO block
// moves every timestamp written in that real-time window back by the offset.
import type { PrismaClient } from "@prisma/client";

const RealDate = Date;
let offsetMs = 0;

class StoryDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...(args as ConstructorParameters<DateConstructor>));
  }
  static now() {
    return RealDate.now() + offsetMs;
  }
}

/** Once, before any service runs. */
export function installStoryClock() {
  globalThis.Date = StoryDate as unknown as DateConstructor;
}

export const realNow = () => new RealDate(RealDate.now());

/** Slack around a step's window, on top of the measured database clock skew. */
const SLACK_MS = 2_000;
let skewMs: number | null = null;
/** The database clock minus ours, measured once (its defaults stamp with its clock). */
async function databaseSkew(db: PrismaClient) {
  if (skewMs === null) {
    const sent = RealDate.now();
    const [{ at }] = await db.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    skewMs = at.getTime() - (sent + RealDate.now()) / 2;
  }
  return skewMs;
}
/** UTC text the way a `timestamp(3) without time zone` column holds it. */
const sqlTime = (ms: number) => new RealDate(ms).toISOString().replace("T", " ").replace("Z", "");

/**
 * Moves every timestamp in every public table that lies in [from, to] back by
 * `byMs`. The token ledger refuses UPDATEs; its trigger is off only for this
 * statement, and only a timestamp moves.
 */
export async function shiftWindow(db: PrismaClient, fromMs: number, toMs: number, byMs: number) {
  const by = Math.round(byMs);
  await db.$executeRawUnsafe(`DO $$
DECLARE r record;
BEGIN
  ALTER TABLE "TokenLedgerEntry" DISABLE TRIGGER token_ledger_append_only;
  FOR r IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type LIKE 'timestamp%' AND table_name <> '_prisma_migrations'
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = %I - interval ''${by} milliseconds'' WHERE %I BETWEEN %L AND %L',
      r.table_name, r.column_name, r.column_name, r.column_name, '${sqlTime(fromMs)}', '${sqlTime(toMs)}'
    );
  END LOOP;
  ALTER TABLE "TokenLedgerEntry" ENABLE TRIGGER token_ledger_append_only;
END $$;`);
}

/** Runs `work` at `day` `time` IST in story time, then moves what the database stamped. */
export async function at<T>(db: PrismaClient, day: string, work: () => Promise<T>, time = "11:00"): Promise<T> {
  const storyMs = RealDate.parse(`${day}T${time}:00+05:30`);
  if (Number.isNaN(storyMs)) throw new Error(`Not a story date: ${day} ${time}`);
  const skew = await databaseSkew(db);
  const started = RealDate.now();
  if (storyMs > started) throw new Error(`Story date ${day} ${time} is in the future`);
  offsetMs = storyMs - started;
  try {
    return await work();
  } finally {
    offsetMs = 0;
    const finished = RealDate.now();
    await shiftWindow(db, started + Math.min(0, skew) - SLACK_MS, finished + Math.max(0, skew) + SLACK_MS, started - storyMs);
  }
}
