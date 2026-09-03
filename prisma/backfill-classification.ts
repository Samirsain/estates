// AC-01 — the classification backfill runner.
//
//   npm run backfill:classification              dry run, writes nothing
//   npm run backfill:classification -- --confirm applies it
//   npm run backfill:classification > report.txt the copy that gets kept
//
// Dry run is the default because this writes a field that decides which
// commission rules an approved Booking is read under. Look at the report first.
//
// Safe to re-run: it only ever touches approved Bookings whose classification is
// still null, and it re-checks that inside the transaction.
//
// Exits non-zero when any exception is open, so an unresolved row cannot be
// signed off as a completed backfill.
import { db } from "@/lib/db";
import {
  backfillClassification,
  formatBackfillReport,
} from "@/lib/migration/backfill-classification";

const apply = process.argv.includes("--confirm");

const report = await backfillClassification({ apply });
console.log(formatBackfillReport(report));
await db.$disconnect();

if (report.exceptions.length > 0) process.exit(1);
