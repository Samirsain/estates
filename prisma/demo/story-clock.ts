// The demo's story clock — docs/superpowers/specs/2026-10-14-demo-dataset-design.md §4.
//
// While `at(db, day, work)` runs, `new Date()` and `Date.now()` read the story
// date (advancing with real time), so the services compute "now" — a Hold's
// expiry, a task's due date, the Booking date — in story time. The database
// stamps its own defaults with the real time; when the step ends, one DO block
// moves every timestamp written in that real-time window back by the offset.
import type { PrismaClient } from "@prisma/client";
import { retryTransient } from "@/lib/db-retry";

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
 * `byMs`, on rows the step wrote. Where a table has createdAt or updatedAt,
 * only a row with one of them in the window counts as written: another
 * record's future date (a Hold expiring right now) can fall in the window too,
 * and must keep its real value. The token ledger refuses UPDATEs; its trigger
 * is off only for this statement, and only a timestamp moves.
 */
export async function shiftWindow(db: PrismaClient, fromMs: number, toMs: number, byMs: number) {
  const by = Math.round(byMs);
  await db.$executeRawUnsafe(`DO $$
DECLARE
  t record;
  f text := '${sqlTime(fromMs)}';
  u text := '${sqlTime(toMs)}';
  iv text := '${by} milliseconds';
  sets text;
  hits text;
  written text;
BEGIN
  ALTER TABLE "TokenLedgerEntry" DISABLE TRIGGER token_ledger_append_only;
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type LIKE 'timestamp%' AND table_name <> '_prisma_migrations'
    GROUP BY table_name
  LOOP
    SELECT
      string_agg(format('%I = CASE WHEN %I BETWEEN %L AND %L THEN %I - %L::interval ELSE %I END', column_name, column_name, f, u, column_name, iv, column_name), ', '),
      string_agg(format('%I BETWEEN %L AND %L', column_name, f, u), ' OR '),
      string_agg(format('%I BETWEEN %L AND %L', column_name, f, u), ' OR ') FILTER (WHERE column_name IN ('createdAt', 'updatedAt'))
    INTO sets, hits, written
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t.table_name AND data_type LIKE 'timestamp%';
    EXECUTE format('UPDATE %I SET %s WHERE (%s)%s', t.table_name, sets, hits, CASE WHEN written IS NULL THEN '' ELSE ' AND (' || written || ')' END);
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
    // A rerun after a lost reply finds nothing left in the window, so retrying cannot shift twice.
    await retryTransient(() => shiftWindow(db, started + Math.min(0, skew) - SLACK_MS, finished + Math.max(0, skew) + SLACK_MS, started - storyMs));
  }
}
