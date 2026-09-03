import { PrismaClient } from "@prisma/client";

// One client per process; Next's dev server re-imports modules on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Runs a batch of queries a few at a time instead of all at once.
 *
 * ponytail: bounded to four. `Promise.all` over twenty counts exhausted the
 * connection pool the first time the Dashboard and the reconciliation report ran
 * against a real database — `max clients reached in session mode, pool_size:
 * 15`. A page that races the rest of the application for connections is worse
 * than one that takes a few more milliseconds. Raise the width if the pool does.
 *
 * It lives here, beside the client, because the limit it respects belongs to the
 * connection and not to any one report.
 */
export async function inWaves<T>(
  thunks: readonly (() => Promise<T>)[],
  width = 4
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < thunks.length; i += width) {
    out.push(...(await Promise.all(thunks.slice(i, i + width).map((run) => run()))));
  }
  return out;
}
