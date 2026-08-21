// Five-second connectivity check for both database URLs, so a credential or
// network problem is told apart from an application bug.
// Run: npm run db:ping
import { PrismaClient } from "@prisma/client";

async function ping(label: string, url: string | undefined) {
  if (!url) return console.log(`${label.padEnd(12)} not configured`);

  const host = url.split("@")[1]?.split("/")[0] ?? "?";
  const db = new PrismaClient({ datasources: { db: { url } } });
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    console.log(`${label.padEnd(12)} OK   ${Date.now() - startedAt}ms   ${host}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : String(error);
    console.log(`${label.padEnd(12)} FAIL ${host}`);
    console.log(`             ${message.slice(0, 200)}`);
    // The pooler closes the socket on a bad password, which Prisma reports as
    // "Can't reach database server" — the direct URL names the real cause.
    if (/reach database server/.test(message)) {
      console.log("             Check the direct URL below for the real reason.");
    }
  } finally {
    await db.$disconnect();
  }
}

await ping("pooler", process.env.DATABASE_URL);
await ping("direct", process.env.DIRECT_URL);
