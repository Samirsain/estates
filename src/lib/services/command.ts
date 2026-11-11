// One entry point for every state-changing command.
// PRD §19 / ARCHITECTURE §8: critical commands carry an idempotency key, run
// inside a database transaction, and a repeated key returns the original result.

import { Prisma } from "@prisma/client";
import { retryTransient } from "@/lib/db-retry";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/security/audit";
import { redactForAudit } from "@/lib/security/identity";
import {
  expiryFrom,
  legacyRequestHash,
  requestHash,
  resolveIdempotency,
} from "@/lib/security/idempotency";

export type Tx = Prisma.TransactionClient;

/**
 * A Booking submission runs ~25 statements in one transaction. Against a
 * co-located database that is a few milliseconds; against a remote one it is
 * bounded by round-trip latency, so the ceiling is tunable per environment
 * rather than hardcoded to a number that only suits one deployment.
 */
const COMMAND_TIMEOUT_MS = Number(process.env.COMMAND_TIMEOUT_MS ?? 20_000);
const COMMAND_MAX_WAIT_MS = Number(process.env.COMMAND_MAX_WAIT_MS ?? 10_000);

export class CommandError extends Error {
  code: "BLOCKED" | "CONFLICT" | "NOT_FOUND";

  constructor(code: CommandError["code"], message: string) {
    super(message);
    this.name = "CommandError";
    this.code = code;
  }
}

/** Blocked action with a reason the UI can show verbatim (DESIGN §5.4). */
export function blocked(reason: string): never {
  throw new CommandError("BLOCKED", reason);
}

/**
 * Deferred constraint triggers — the ownership-share and payment-schedule
 * totals — normally fire on COMMIT, and Prisma resolves the transaction promise
 * even when that COMMIT is rejected. The write is rolled back but the caller is
 * told it succeeded. Forcing the checks immediate while the transaction is
 * still open turns the violation back into a normal error.
 *
 * Call this as the last statement of every transaction that writes protected
 * data, so nothing can report a lost write as a success.
 */
export async function settleConstraints(tx: Tx): Promise<void> {
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
}

export type CommandContext = {
  /** Client-supplied or server-issued. Same key + same input = same result. */
  idempotencyKey: string;
  operation: string;
  actorRef: string;
  actorRole?: string;
  payload: unknown;
};

/**
 * Runs `work` once per idempotency key. The audit entry is written inside the
 * same transaction, so a command and its audit trail never diverge. A dropped
 * connection is tried again (db-retry): the transaction rolled back whole, and
 * the key replays anything that had already committed.
 */
export function runCommand<T>(
  ctx: CommandContext,
  work: Work<T>,
): Promise<T> {
  return retryTransient(() =>
    runCommandOnce(ctx, work).catch((error) => {
      // A concurrent writer took the same max+1 reference or created the same
      // find-then-create row first. This run rolled back whole, so one fresh
      // try sees the winner's row: it reuses it, or refuses in words.
      if (!isUniqueConflict(error)) throw error;
      return runCommandOnce(ctx, work).catch((again) => {
        if (!isUniqueConflict(again)) throw again;
        throw new CommandError(
          "CONFLICT",
          "This could not be saved because the same record was just saved by someone else. Refresh, check it, and try again.",
        );
      });
    }),
  );
}

type Work<T> = (tx: Tx) => Promise<{
  result: T;
  audit: Omit<Parameters<typeof recordAudit>[0], "actorRef" | "actorRole">;
}>;

const isUniqueConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function runCommandOnce<T>(ctx: CommandContext, work: Work<T>): Promise<T> {
  const hash = requestHash(ctx.operation, ctx.payload);
  const legacyHash = legacyRequestHash(ctx.operation, ctx.payload);
  const now = new Date();

  return db.$transaction(
    async (tx) => {
      // Checked under a lock on the key, inside the transaction: checked before
      // it, a double-click's two requests both found no record and both ran.
      await lockKey(tx, `idempotency:${ctx.idempotencyKey}`);
      const existing = await tx.idempotencyRecord.findUnique({
        where: { key: ctx.idempotencyKey },
      });
      const resolution = resolveIdempotency(existing, ctx.operation, hash, now, legacyHash);
      if (resolution.status === "REPLAY") return resolution.result as T;
      if (resolution.status === "CONFLICT") {
        throw new CommandError(
          "CONFLICT",
          "This request key was already used for different details. Start the action again.",
        );
      }

      const { result, audit } = await work(tx);

      await tx.auditEvent.create({
        data: {
          actorRef: ctx.actorRef,
          actorRole: ctx.actorRole,
          entity: audit.entity,
          entityId: audit.entityId,
          action: audit.action,
          // Redacted here once, as recordAudit does: masking used to depend on
          // every caller remembering, and full mobiles reached these columns.
          beforeMasked:
            audit.before === undefined ? undefined : (redactForAudit(audit.before) as never),
          afterMasked:
            audit.after === undefined ? undefined : (redactForAudit(audit.after) as never),
          reason: audit.reason,
          correlationId: ctx.idempotencyKey,
        },
      });

      // An expired record is replaced: left as it was, every later retry of
      // its key ran the command again instead of replaying.
      const record = {
        actorRef: ctx.actorRef,
        operation: ctx.operation,
        requestHash: hash,
        resultJson: result as never,
        expiresAt: expiryFrom(now),
      };
      await tx.idempotencyRecord.upsert({
        where: { key: ctx.idempotencyKey },
        create: { key: ctx.idempotencyKey, ...record },
        update: record,
      });

      await settleConstraints(tx);

      return result;
    },
    // A contested command waits on SELECT … FOR UPDATE, so the loser needs
    // room to acquire the lock and then fail its own state check.
    { maxWait: COMMAND_MAX_WAIT_MS, timeout: COMMAND_TIMEOUT_MS },
  );
}

/**
 * Row lock for a contested record (ARCHITECTURE §7). Two concurrent Hold
 * attempts on one Plot serialise here, and the loser fails the state check.
 */
export async function lockPlot(tx: Tx, plotId: string): Promise<void> {
  // Plot.id is a text column (Prisma String @default(uuid())), so no cast.
  await tx.$queryRaw`SELECT id FROM "Plot" WHERE id = ${plotId} FOR UPDATE`;
}

/**
 * Row lock for a Booking (ARCHITECTURE §7). Payment confirmation, corrections
 * and decisions on one Booking serialise here.
 */
export async function lockBooking(tx: Tx, bookingId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
}

/**
 * Serialises everything that contends for one logical key, for a contest that
 * has no single row to lock — such as "the Invite entitlement of this Member",
 * which lives across many rows. Held until the transaction ends.
 */
export async function lockKey(tx: Tx, key: string): Promise<void> {
  // The lock function returns void, which Prisma cannot deserialise, so it is
  // taken inside a subquery and an int is returned instead.
  await tx.$queryRaw`SELECT 1::int AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS taken`;
}

/**
 * The next reference in a zero-padded series, e.g. ENQ-000123.
 *
 * Derived from the highest value already issued, never from a row count: a
 * count silently reissues a number the moment anything is removed or a gap
 * exists, and a Booking Number is permanent and must never be reused
 * (PRD §5.2). Concurrent issuers can still pick the same value, but the unique
 * constraint rejects the loser rather than letting a duplicate through.
 *
 * A series with a `sequence` takes its number from that Postgres sequence
 * instead. Tasks need it: two unrelated Bookings crossing a milestone at the
 * same instant each create tasks in their own transaction, so they never see
 * each other's row and max-plus-one hands both the same number. A sequence
 * cannot collide. It can leave gaps when a transaction rolls back, which is
 * fine for a task number and is why the Booking Number does not use one.
 *
 * ponytail: max-plus-one elsewhere. Move another series to a sequence only if
 * its contention ever becomes visible to users.
 */
// Owner, 11 Nov 2026 — the four IDs people read aloud carry no dash and a
// short number: MM0011, CUS046, ENQ005, BKG0023. Every other series keeps
// PREFIX-000123. A number past the width simply grows (CUS1000).
const SERIES = {
  Enquiry: { table: "Enquiry", column: "enquiryNo", dash: false, width: 3 },
  Task: { table: "Task", column: "taskNo", sequence: "task_no_seq" },
  BookingRequest: { table: "Booking", column: "requestNo" },
  BookingNumber: { table: "Booking", column: "bookingNumber", dash: false, width: 4 },
  Customer: { table: "CustomerProfile", column: "customerId", dash: false, width: 3 },
  Member: { table: "MemberProfile", column: "memberId", dash: false, width: 4 },
  Acquisition: { table: "Acquisition", column: "acquisitionNo" },
  Recovery: { table: "Recovery", column: "recoveryNo" },
  PotentialInvestor: { table: "PotentialInvestor", column: "investorNo" },
  // Land Inquiry spec §6 — a sequence, never MAX+1: two people taking a land
  // call at the same moment must not be handed the same Inquiry No.
  LandInquiry: { table: "LandInquiry", column: "inquiryNo", sequence: "land_inquiry_no_seq" },
} as const;

export async function nextReference(
  tx: Tx,
  prefix: string,
  series: keyof typeof SERIES,
): Promise<string> {
  const entry: { table: string; column: string; sequence?: string; dash?: boolean; width?: number } =
    SERIES[series];
  const { table, column } = entry;
  const head = entry.dash === false ? prefix : `${prefix}-`;
  const width = entry.width ?? 6;

  if (entry.sequence) {
    // Identifiers come from the closed table above, never from caller input.
    const issued = await tx.$queryRawUnsafe<Array<{ next: number }>>(
      `SELECT nextval('${entry.sequence}')::int AS next`
    );
    return `${head}${String(issued[0].next).padStart(width, "0")}`;
  }

  // The trailing digits are compared as a number, not as text: series written
  // at different widths ("CUS-3390" beside "CUS-003391") would otherwise sort
  // wrongly and reissue a value that already exists. Identifiers come from the
  // closed table above, never from caller input.
  const rows = await tx.$queryRawUnsafe<Array<{ max: number | null }>>(
    `SELECT COALESCE(MAX(CAST(substring("${column}" FROM '[0-9]+$') AS INTEGER)), 0) AS max
       FROM "${table}"
      WHERE "${column}" LIKE $1`,
    `${head}%`,
  );

  const next = Number(rows[0]?.max ?? 0) + 1;
  if (!Number.isFinite(next)) throw new Error(`Cannot continue the ${prefix} series.`);
  return `${head}${String(next).padStart(width, "0")}`;
}